"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Mail, Send, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

type Incoming = { id: string; depositCents: number; limitCents: number | null; otherUsername: string };
type Outgoing = { id: string; status: string; sessionId: string | null; depositCents: number; limitCents: number | null; otherUsername: string };

export default function InvitationList({ userId, initialIncoming, initialOutgoing }: { userId: string; initialIncoming: Incoming[]; initialOutgoing: Outgoing[] }) {
  const router = useRouter();
  const [responding, setResponding] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`invitations:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations', filter: `invitee_id=eq.${userId}` }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations', filter: `inviter_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
            <span className="player-name"><b>{invite.otherUsername}</b> wants to play — deposit {money(invite.depositCents)}{invite.limitCents ? `, limit ${money(invite.limitCents)}` : ''}</span>
            <div className="btc-bet-actions">
              <button className="gold-button" disabled={responding === invite.id} onClick={() => respond(invite.id, true)}><Check size={16} /> Accept</button>
              <button className="undo-button" disabled={responding === invite.id} onClick={() => respond(invite.id, false)}><X size={16} /> Decline</button>
            </div>
          </div>
        ))}
      </div>

      <p className="muted small" style={{ marginTop: 20 }}><Send size={14} /> Sent</p>
      {initialOutgoing.length === 0 && <p className="muted small">You haven&apos;t sent any invites yet.</p>}
      <div className="roster">
        {initialOutgoing.map(invite => (
          <div key={invite.id} className="player-row">
            <span className="player-name">To <b>{invite.otherUsername}</b> — deposit {money(invite.depositCents)}{invite.limitCents ? `, limit ${money(invite.limitCents)}` : ''}</span>
            {invite.status === 'accepted' && invite.sessionId
              ? <a className="gold-button" href={`/table/${invite.sessionId}`}>Join table</a>
              : <span className="turn-badge">Waiting for response</span>}
          </div>
        ))}
      </div>
    </aside>
  );
}
