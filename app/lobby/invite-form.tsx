"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Flag, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function InviteForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [deposit, setDeposit] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const selfId = useRef<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => { selfId.current = data.user?.id ?? null; });
  }, []);

  useEffect(() => {
    const term = username.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      if (!term) { setSuggestions([]); return; }
      const supabase = createClient();
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .ilike('username', `${term}%`)
        .neq('id', selfId.current ?? '')
        .order('username')
        .limit(8);
      const already = new Set(invitees.map(i => i.toLowerCase()));
      if (!cancelled) setSuggestions((data ?? []).map(row => row.username).filter(name => !already.has(name.toLowerCase())));
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const addInvitee = (name: string) => {
    const clean = name.trim();
    if (!clean || invitees.some(i => i.toLowerCase() === clean.toLowerCase())) return;
    setInvitees([...invitees, clean]);
    setUsername('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const onUsernameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addInvitee(username);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const usernames = [...invitees, ...(username.trim() ? [username.trim()] : [])];
    if (!usernames.length) return setError('Add at least one username to invite.');
    setSending(true);
    setError('');
    const res = await fetch('/api/create-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames, deposit, limit: limit || undefined }),
    });
    const body = await res.json();
    setSending(false);
    if (!res.ok) return setError(body.error ?? 'Could not send the invitation.');
    setInvitees([]); setUsername(''); setDeposit(''); setLimit('');
    router.refresh();
  };

  return (
    <section className="panel setup-panel">
      <div className="section-heading"><div><p className="eyebrow">NEW GAME</p><h2>Invite players</h2></div><Users className="gold" size={25} /></div>
      <form onSubmit={onSubmit}>
        <label htmlFor="invite-username">Usernames</label>
        {invitees.length > 0 && (
          <div className="invitee-chips">
            {invitees.map(name => (
              <span key={name} className="invitee-chip">{name}<button type="button" onClick={() => setInvitees(invitees.filter(i => i !== name))} aria-label={`Remove ${name}`}><X size={13} /></button></span>
            ))}
          </div>
        )}
        <div className="input-row autocomplete-row">
          <input
            id="invite-username"
            value={username}
            onChange={e => { setUsername(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={onUsernameKeyDown}
            placeholder={invitees.length ? 'Add another…' : 'Start typing a username…'}
            autoComplete="off"
          />
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="autocomplete-list">
            {suggestions.map(name => (
              <li key={name}>
                <button type="button" onMouseDown={() => addInvitee(name)}>{name}</button>
              </li>
            ))}
          </ul>
        )}
        <p className="footnote" style={{ marginTop: 0 }}>Press Enter after each username to invite more than one person to the same game.</p>
        <label htmlFor="invite-deposit">Bet deposit per player</label>
        <div className="input-row"><input id="invite-deposit" inputMode="decimal" required value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="e.g. 25.00" /></div>
        <label htmlFor="invite-limit">Money limit (optional)</label>
        <div className="input-row"><input id="invite-limit" inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} placeholder="e.g. 200.00" /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="gold-button start-button" type="submit" disabled={sending}><Flag size={17} /> Send invite{invitees.length > 1 ? 's' : ''} <ArrowRight size={19} /></button>
      </form>
      <p className="footnote">They must have a Poolroom account already. The game starts once everyone invited has responded, seating you plus whoever accepted.</p>
    </section>
  );
}
