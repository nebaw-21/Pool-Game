import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reducer, type Action, type State } from '@/app/game';

// Actions a player may only take when it's their turn (state.selected === them).
const TURN_GATED_ACTIONS = new Set<Action['type']>(['deal', 'placeBet', 'pass']);

// Only the player who sent the invitation (session.host_id) configures the
// table's stakes.
const INVITER_ONLY_ACTIONS = new Set<Action['type']>(['deposit', 'setLimit', 'clearLimit']);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { sessionId?: string; action?: Action } | null;
  if (!body?.sessionId || !body.action) return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });

  const admin = createAdminClient();

  const { data: session } = await admin
    .from('game_sessions')
    .select('id, host_id, status, state')
    .eq('id', body.sessionId)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Game session not found.' }, { status: 404 });

  const state = session.state as State;

  if (!state.opponents.some(o => o.id === user.id)) {
    return NextResponse.json({ error: 'You’re not a player in this game.' }, { status: 403 });
  }
  if (session.status !== 'active') return NextResponse.json({ error: 'This game has ended.' }, { status: 409 });

  if (TURN_GATED_ACTIONS.has(body.action.type) && state.selected !== user.id) {
    return NextResponse.json({ error: 'It’s not your turn.' }, { status: 409 });
  }
  if (INVITER_ONLY_ACTIONS.has(body.action.type) && user.id !== session.host_id) {
    return NextResponse.json({ error: 'Only the player who sent the invite can set the deposit or the money limit.' }, { status: 403 });
  }

  // Actions with no server-authoritative meaning in the online flow.
  if (body.action.type === 'start' || body.action.type === 'addOpponent') {
    return NextResponse.json({ error: 'This action isn’t available online.' }, { status: 400 });
  }

  // The requester's identity is derived from their session, never trusted
  // from the client. The host can't request to leave, and only the host may
  // approve or decline someone else's request.
  let action: Action = body.action;
  if (action.type === 'requestLeave') {
    if (user.id === session.host_id) return NextResponse.json({ error: 'The host can’t request to leave.' }, { status: 403 });
    action = { type: 'requestLeave', by: user.id };
  }
  if (action.type === 'respondLeave') {
    if (user.id !== session.host_id) return NextResponse.json({ error: 'Only the host can respond to a request to leave.' }, { status: 403 });
    if (!state.leaveRequest) return NextResponse.json({ error: 'There’s no pending request to respond to.' }, { status: 409 });
  }

  const leavingId = action.type === 'respondLeave' && action.accept ? state.leaveRequest?.by ?? null : null;

  const nextState = reducer(state, action);

  const { error: updateError } = await admin
    .from('game_sessions')
    .update({ state: nextState, status: nextState.sessionEnded ? 'ended' : session.status })
    .eq('id', session.id);
  if (updateError) return NextResponse.json({ error: 'Could not save the game state.' }, { status: 500 });

  await Promise.all(
    nextState.opponents.map(opponent =>
      admin
        .from('session_participants')
        .update({ balance_cents: opponent.balance })
        .eq('session_id', session.id)
        .eq('user_id', opponent.id),
    ),
  );

  // The leaving player is removed from the roster entirely -- including
  // their own read access, since the session_participants row is what the
  // RLS policies on game_sessions/session_participants key off of.
  if (leavingId) {
    await admin.from('session_participants').delete().eq('session_id', session.id).eq('user_id', leavingId);
  }

  return NextResponse.json({ state: nextState });
}
