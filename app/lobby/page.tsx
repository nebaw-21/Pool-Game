import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Spade } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import InviteForm from './invite-form';
import InvitationList from './invitation-list';
import SignOutButton from './sign-out-button';

export default async function LobbyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single();

  const [{ data: incomingRaw }, { data: outgoingRaw }] = await Promise.all([
    supabase
      .from('invitations')
      .select('id, status, batch:invite_batches(id, deposit_amount_cents, limit_amount_cents, session_id, inviter:profiles(username), session:game_sessions!invite_batches_session_id_fkey(status))')
      .eq('invitee_id', user.id)
      .neq('status', 'declined')
      .order('created_at', { ascending: false }),
    supabase
      .from('invite_batches')
      .select('id, deposit_amount_cents, limit_amount_cents, session_id, created_at, invitations(status, invitee:profiles(username)), session:game_sessions!invite_batches_session_id_fkey(status)')
      .eq('inviter_id', user.id)
      .in('status', ['pending', 'started'])
      .order('created_at', { ascending: false }),
  ]);

  type BatchEmbed = { id: string; deposit_amount_cents: number; limit_amount_cents: number | null; session_id: string | null; inviter: { username: string } | null; session: { status: string } | null };

  const incoming = (incomingRaw ?? [])
    .map(row => ({ id: row.id, status: row.status, batch: row.batch as unknown as BatchEmbed | null }))
    .filter(row => row.batch && row.batch.session?.status !== 'ended')
    .map(row => ({
      id: row.id,
      depositCents: row.batch!.deposit_amount_cents,
      limitCents: row.batch!.limit_amount_cents,
      otherUsername: row.batch!.inviter?.username ?? 'Unknown',
      accepted: row.status === 'accepted',
      sessionId: row.batch!.session_id,
    }));

  const outgoing = (outgoingRaw ?? [])
    .filter(batch => (batch.session as unknown as { status: string } | null)?.status !== 'ended')
    .map(batch => ({
      id: batch.id,
      sessionId: batch.session_id as string | null,
      depositCents: batch.deposit_amount_cents,
      limitCents: batch.limit_amount_cents,
      invitees: (batch.invitations as unknown as { status: string; invitee: { username: string } | null }[]).map(i => ({
        username: i.invitee?.username ?? 'Unknown',
        status: i.status,
      })),
    }));

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand"><Spade size={25} fill="currentColor" /> POOLROOM<span>.</span></Link>
        <div className="header-note">THE GAME. ALL ACCOUNTED FOR.</div>
        <span className="session-label">Signed in as {profile?.username}</span>
        <SignOutButton />
      </header>
      <main>
        <div className="page-heading"><div><p className="eyebrow">YOUR LOBBY</p><h1>Invite someone to play.</h1><p className="muted">Set the deposit and the money limit, then send the invite(s). The game starts once everyone invited has responded.</p></div></div>
        <div className="setup-grid">
          <InviteForm />
          <InvitationList userId={user.id} initialIncoming={incoming} initialOutgoing={outgoing} />
        </div>
      </main>
      <footer className="page-footer"><span><Spade size={13} /> POOLROOM</span><span>Keep the game fair. Keep the numbers clear.</span></footer>
    </div>
  );
}
