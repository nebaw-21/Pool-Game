"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Flag, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function InviteForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
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
      if (!cancelled) setSuggestions((data ?? []).map(row => row.username));
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [username]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError('');
    const res = await fetch('/api/create-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, deposit, limit: limit || undefined }),
    });
    const body = await res.json();
    setSending(false);
    if (!res.ok) return setError(body.error ?? 'Could not send the invitation.');
    setUsername(''); setDeposit(''); setLimit('');
    router.refresh();
  };

  return (
    <section className="panel setup-panel">
      <div className="section-heading"><div><p className="eyebrow">NEW GAME</p><h2>Invite a player</h2></div><Users className="gold" size={25} /></div>
      <form onSubmit={onSubmit}>
        <label htmlFor="invite-username">Their username</label>
        <div className="input-row autocomplete-row">
          <input
            id="invite-username"
            required
            value={username}
            onChange={e => { setUsername(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Start typing a username…"
            autoComplete="off"
          />
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="autocomplete-list">
            {suggestions.map(name => (
              <li key={name}>
                <button type="button" onMouseDown={() => { setUsername(name); setShowSuggestions(false); }}>{name}</button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor="invite-deposit">Bet deposit per player</label>
        <div className="input-row"><input id="invite-deposit" inputMode="decimal" required value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="e.g. 25.00" /></div>
        <label htmlFor="invite-limit">Money limit (optional)</label>
        <div className="input-row"><input id="invite-limit" inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} placeholder="e.g. 200.00" /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="gold-button start-button" type="submit" disabled={sending}><Flag size={17} /> Send invite <ArrowRight size={19} /></button>
      </form>
      <p className="footnote">They must have a Poolroom account already. They&rsquo;ll see your invite in their lobby and can accept or decline it.</p>
    </section>
  );
}
