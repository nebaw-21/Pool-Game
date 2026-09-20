"use client";
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LogIn, Spade } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push(searchParams.get('redirect') || '/lobby');
    router.refresh();
  };

  return (
    <section className="panel setup-panel" style={{ maxWidth: 420, margin: '40px auto' }}>
      <div className="section-heading"><div><p className="eyebrow">WELCOME BACK</p><h2>Sign in</h2></div><LogIn className="gold" size={25} /></div>
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <div className="input-row"><input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <label htmlFor="password">Password</label>
        <div className="input-row"><input id="password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="gold-button start-button" type="submit" disabled={loading}>Sign in <ArrowRight size={19} /></button>
      </form>
      <p className="footnote">No account yet? <Link href="/register">Register</Link></p>
    </section>
  );
}

export default function LoginPage() {
  return (
    <div className="app-shell">
      <header className="topbar"><Link href="/" className="brand"><Spade size={25} fill="currentColor" /> POOLROOM<span>.</span></Link></header>
      <main>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
