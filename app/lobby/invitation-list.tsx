"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Mail, Send, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

type Incoming = { id: string; depositCents: number; limitCents: number | null; otherUsername: string; accepted: boolean; sessionId: string | null };
type OutgoingInvitee = { username: string; status: string };
type Outgoing = { id: string; sessionId: string | null; depositCents: number; limitCents: number | null; invitees: OutgoingInvitee[] };

export default function InvitationList({ userId, initialIncoming, initialOutgoing }: { userId: string; initialIncoming: Incoming[]; initialOutgoing: Outgoing[] }) {
  const router = useRouter();
  const [responding, setResponding] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Realtime is the fast path, but WebSocket delivery isn't guaranteed the
  // instant it happens. Refresh on subscribe-confirmed, on tab focus, and on
  // a short poll so invites and batch updates always show up promptly.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`invitations:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations', filter: `invitee_id=eq.${userId}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invite_batches', filter: `inviter_id=eq.${userId}` }, () => router.refresh())
      // A batch's session starting/ending doesn't touch my own invitation
      // row, and an invitee can't be filtered on invite_batches directly, so
      // also listen broadly for game_sessions changes and let the poll below
      // cover the rest.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, () => router.refresh())
      .subscribe(status => {
        if (status === 'SUBSCRIBED') router.refresh();
      });

    const onFocus = () => router.refresh();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    const poll = setInterval(() => router.refresh(), 4000);

    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const respond = async (invitationId: string, accept: boolean) => {
    setResponding(invitationId);
    setError('');
    const res = await fetch('/api/respond-to-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationId, accept }),
    });
    const body = await res.json();
    setResponding(null);
    if (!res.ok) return setError(body.error ?? 'Could not respond to the invitation.');
    if (accept && body.sessionId) router.push(`/table/${body.sessionId}`);
    else router.refresh();
  };

  return (
    <aside className="panel opponents-panel">
      <div className="section-heading"><h2>Invitations</h2></div>
      {error && <p className="error" role="alert">{error}</p>}

      <p className="muted small"><Mail size={14} /> Incoming</p>
      {initialIncoming.length === 0 && <p className="muted small">No pending invites right now.</p>}
      <div className="roster">
        {initialIncoming.map(invite => (
          <div key={invite.id} className="player-row">
            <span className="player-name">
              <b>{invite.otherUsername}</b> invited you — deposit {money(invite.depositCents)}{invite.limitCents ? `, limit ${money(invite.limitCents)}` : ''}
              {invite.accepted && !invite.sessionId && <small>Waiting for other invited players to respond…</small>}
            </span>
            {invite.sessionId
              ? <a className="gold-button" href={`/table/${invite.sessionId}`}>Join table</a>
              : invite.accepted
                ? <span className="turn-badge">Accepted</span>
                : <div className="btc-bet-actions">
                  <button className="gold-button" disabled={responding === invite.id} onClick={() => respond(invite.id, true)}><Check size={16} /> Accept</button>
                  <button className="undo-button" disabled={responding === invite.id} onClick={() => respond(invite.id, false)}><X size={16} /> Decline</button>
                </div>}
          </div>
        ))}
      </div>

      <p className="muted small" style={{ marginTop: 20 }}><Send size={14} /> Sent</p>
      {initialOutgoing.length === 0 && <p className="muted small">You haven&apos;t sent any invites yet.</p>}
      <div className="roster">
        {initialOutgoing.map(batch => (
          <div key={batch.id} className="player-row">
            <span className="player-name">
              To <b>{batch.invitees.map(i => i.username).join(', ')}</b> — deposit {money(batch.depositCents)}{batch.limitCents ? `, limit ${money(batch.limitCents)}` : ''}
              <small>{batch.invitees.map(i => `${i.username}: ${i.status}`).join(' · ')}</small>
            </span>
            {batch.sessionId
              ? <a className="gold-button" href={`/table/${batch.sessionId}`}>Join table</a>
              : <span className="turn-badge">Waiting for responses</span>}
          </div>
        ))}
      </div>
    </aside>
  );
}
