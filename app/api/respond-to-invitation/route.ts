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
    .select('id, inviter_id, invitee_id, status, deposit_amount_cents, limit_amount_cents')
    .eq('id', body.invitationId)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  if (invitation.invitee_id !== user.id) return NextResponse.json({ error: 'This invitation isn’t yours to respond to.' }, { status: 403 });
  if (invitation.status !== 'pending') return NextResponse.json({ error: 'This invitation has already been responded to.' }, { status: 409 });

  if (!body.accept) {
    await admin.from('invitations').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', invitation.id);
    return NextResponse.json({ declined: true });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('id', [invitation.inviter_id, invitation.invitee_id]);
  const inviter = profiles?.find(p => p.id === invitation.inviter_id);
  const invitee = profiles?.find(p => p.id === invitation.invitee_id);
  if (!inviter || !invitee) return NextResponse.json({ error: 'Could not load player profiles.' }, { status: 500 });

  const state = {
    ...initialState,
    started: true,
    opponents: [
      { id: inviter.id, name: inviter.username, balance: 0 },
      { id: invitee.id, name: invitee.username, balance: 0 },
    ],
    selected: inviter.id,
  };

  const { data: session, error: sessionError } = await admin
    .from('game_sessions')
    .insert({
      invitation_id: invitation.id,
      player1_id: invitation.inviter_id,
      player2_id: invitation.invitee_id,
      deposit_amount_cents: invitation.deposit_amount_cents,
      limit_amount_cents: invitation.limit_amount_cents,
      state,
    })
    .select('id')
    .single();

  if (sessionError || !session) return NextResponse.json({ error: 'Could not create the game session.' }, { status: 500 });

  const { error: participantsError } = await admin.from('session_participants').insert([
    { session_id: session.id, user_id: invitation.inviter_id, balance_cents: 0, seat: 0 },
    { session_id: session.id, user_id: invitation.invitee_id, balance_cents: 0, seat: 1 },
  ]);
  if (participantsError) return NextResponse.json({ error: 'Could not seat the players.' }, { status: 500 });

  await admin.from('invitations').update({ status: 'accepted', responded_at: new Date().toISOString(), session_id: session.id }).eq('id', invitation.id);

  return NextResponse.json({ sessionId: session.id });
}
