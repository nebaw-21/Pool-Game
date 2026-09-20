"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Spade, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) return setError('Username must be 3-20 characters: letters, numbers, underscores.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: cleanUsername } },
    });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/lobby');
    router.refresh();
  };

  return (
    <div className="app-shell">
      <header className="topbar"><Link href="/" className="brand"><Spade size={25} fill="currentColor" /> POOLROOM<span>.</span></Link></header>
      <main>
        <section className="panel setup-panel" style={{ maxWidth: 420, margin: '40px auto' }}>
          <div className="section-heading"><div><p className="eyebrow">JOIN THE TABLE</p><h2>Create an account</h2></div><UserPlus className="gold" size={25} /></div>
          <form onSubmit={onSubmit}>
            <label htmlFor="username">Username</label>
            <div className="input-row"><input id="username" required maxLength={20} value={username} onChange={e => setUsername(e.target.value)} /></div>
            <label htmlFor="email">Email</label>
            <div className="input-row"><input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <label htmlFor="password">Password</label>
            <div className="input-row"><input id="password" type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="gold-button start-button" type="submit" disabled={loading}>Create account <ArrowRight size={19} /></button>
          </form>
          <p className="footnote">Already have an account? <Link href="/login">Sign in</Link></p>
        </section>
      </main>
    </div>
  );
}
