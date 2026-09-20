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
      .select('id, status, deposit_amount_cents, limit_amount_cents, created_at, session_id, inviter:profiles!invitations_inviter_id_fkey(username)')
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('invitations')
      .select('id, status, deposit_amount_cents, limit_amount_cents, created_at, session_id, invitee:profiles!invitations_invitee_id_fkey(username)')
      .eq('inviter_id', user.id)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false }),
  ]);

  const incoming = (incomingRaw ?? []).map(row => ({
    id: row.id,
    depositCents: row.deposit_amount_cents,
    limitCents: row.limit_amount_cents,
    otherUsername: (row.inviter as unknown as { username: string } | null)?.username ?? 'Unknown',
  }));
  const outgoing = (outgoingRaw ?? []).map(row => ({
    id: row.id,
    status: row.status,
    sessionId: row.session_id as string | null,
    depositCents: row.deposit_amount_cents,
    limitCents: row.limit_amount_cents,
    otherUsername: (row.invitee as unknown as { username: string } | null)?.username ?? 'Unknown',
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
        <div className="page-heading"><div><p className="eyebrow">YOUR LOBBY</p><h1>Invite someone to play.</h1><p className="muted">Set the deposit and the money limit, then send the invite. The game starts once they accept.</p></div></div>
        <div className="setup-grid">
          <InviteForm />
          <InvitationList userId={user.id} initialIncoming={incoming} initialOutgoing={outgoing} />
        </div>
      </main>
      <footer className="page-footer"><span><Spade size={13} /> POOLROOM</span><span>Keep the game fair. Keep the numbers clear.</span></footer>
    </div>
  );
}
