import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { initialState } from '@/app/game';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { invitationId?: string; accept?: boolean } | null;
  if (!body?.invitationId || typeof body.accept !== 'boolean') return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });

  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from('invitations')
    .select('id, batch_id, invitee_id, status')
    .eq('id', body.invitationId)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  if (invitation.invitee_id !== user.id) return NextResponse.json({ error: 'This invitation isn’t yours to respond to.' }, { status: 403 });
  if (invitation.status !== 'pending') return NextResponse.json({ error: 'This invitation has already been responded to.' }, { status: 409 });

  const { error: respondError } = await admin
    .from('invitations')
    .update({ status: body.accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', invitation.id);
  if (respondError) return NextResponse.json({ error: 'Could not record your response.' }, { status: 500 });

  const { data: batch } = await admin
    .from('invite_batches')
    .select('id, inviter_id, deposit_amount_cents, limit_amount_cents, status, session_id')
    .eq('id', invitation.batch_id)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: 'Could not load the invitation batch.' }, { status: 500 });

  const { data: allInvitations } = await admin
    .from('invitations')
    .select('invitee_id, status')
    .eq('batch_id', invitation.batch_id);

  const stillPending = (allInvitations ?? []).some(i => i.status === 'pending');
  if (stillPending || batch.status !== 'pending') {
    // Either more people still need to respond, or another request already
    // resolved this batch (accepting/declining races land here too).
    return NextResponse.json({ waiting: true, sessionId: batch.session_id });
  }

  const acceptedIds = (allInvitations ?? []).filter(i => i.status === 'accepted').map(i => i.invitee_id);

  if (!acceptedIds.length) {
    // Everyone declined -- claim cancellation (compare-and-swap on status so
    // a concurrent responder can't also try to start/cancel this batch).
    await admin.from('invite_batches').update({ status: 'cancelled' }).eq('id', batch.id).eq('status', 'pending');
    return NextResponse.json({ cancelled: true });
  }

  // Claim starting the game -- only the request that wins this compare-and-
  // swap actually creates the session; a concurrent responder just reads
  // back the session id the winner created.
  const { data: claimed } = await admin
    .from('invite_batches')
    .update({ status: 'started' })
    .eq('id', batch.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!claimed) {
    const { data: refreshed } = await admin.from('invite_batches').select('session_id').eq('id', batch.id).single();
    return NextResponse.json({ waiting: !refreshed?.session_id, sessionId: refreshed?.session_id ?? null });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', [batch.inviter_id, ...acceptedIds]);
  const byId = new Map((profiles ?? []).map(p => [p.id, p]));
  const host = byId.get(batch.inviter_id);
  if (!host) return NextResponse.json({ error: 'Could not load the host’s profile.' }, { status: 500 });

  const opponents = [host, ...acceptedIds.map(id => byId.get(id)!)].map(p => ({ id: p.id, name: p.username, balance: 0 }));

  const state = { ...initialState, started: true, opponents, selected: host.id };

  const { data: session, error: sessionError } = await admin
    .from('game_sessions')
    .insert({
      host_id: batch.inviter_id,
      batch_id: batch.id,
      deposit_amount_cents: batch.deposit_amount_cents,
      limit_amount_cents: batch.limit_amount_cents,
      state,
    })
    .select('id')
    .single();
  if (sessionError || !session) return NextResponse.json({ error: 'Could not create the game session.' }, { status: 500 });

  const { error: participantsError } = await admin.from('session_participants').insert(
    opponents.map((p, seat) => ({ session_id: session.id, user_id: p.id, balance_cents: 0, seat })),
  );
  if (participantsError) return NextResponse.json({ error: 'Could not seat the players.' }, { status: 500 });

  await admin.from('invite_batches').update({ session_id: session.id }).eq('id', batch.id);

  return NextResponse.json({ sessionId: session.id });
}
