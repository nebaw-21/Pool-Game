import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reducer, type Action, type State } from '@/app/game';

// Actions a player may only take when it's their turn (state.selected === them).
const TURN_GATED_ACTIONS = new Set<Action['type']>(['deal', 'placeBet', 'pass']);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { sessionId?: string; action?: Action } | null;
  if (!body?.sessionId || !body.action) return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });

  const admin = createAdminClient();

  const { data: session } = await admin
    .from('game_sessions')
    .select('id, player1_id, player2_id, status, state')
    .eq('id', body.sessionId)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Game session not found.' }, { status: 404 });
  if (user.id !== session.player1_id && user.id !== session.player2_id) {
    return NextResponse.json({ error: 'You’re not a player in this game.' }, { status: 403 });
  }
  if (session.status !== 'active') return NextResponse.json({ error: 'This game has ended.' }, { status: 409 });

  const state = session.state as State;

  if (TURN_GATED_ACTIONS.has(body.action.type) && state.selected !== user.id) {
    return NextResponse.json({ error: 'It’s not your turn.' }, { status: 409 });
  }

  // Actions with no server-authoritative meaning in the two-player flow.
  if (body.action.type === 'start' || body.action.type === 'addOpponent') {
    return NextResponse.json({ error: 'This action isn’t available online.' }, { status: 400 });
  }

  const nextState = reducer(state, body.action);

  const { error: updateError } = await admin
    .from('game_sessions')
    .update({ state: nextState })
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

  return NextResponse.json({ state: nextState });
}
