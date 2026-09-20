import Link from 'next/link';
import { ArrowRight, Spade } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="app-shell">
      <header className="topbar"><Link href="/" className="brand"><Spade size={25} fill="currentColor" /> POOLROOM<span>.</span></Link><div className="header-note">THE GAME. ALL ACCOUNTED FOR.</div></header>
      <main>
        <div className="setup-grid">
          <section className="panel setup-panel">
            <div className="section-heading"><div><p className="eyebrow">YOUR TABLE, YOUR GAME</p><h1>Between the Cards.</h1></div></div>
            <p className="muted">Deal two cards, bet that the third lands strictly between them, and win or lose against a shared pool. Invite a registered player, agree on the deposit and the limit, and go head-to-head online.</p>
            {user
              ? <Link className="gold-button start-button" href="/lobby">Go to your lobby <ArrowRight size={19} /></Link>
              : <div className="btc-bet-actions">
                  <Link className="gold-button start-button" href="/register">Create account <ArrowRight size={19} /></Link>
                  <Link className="win-button btc-reveal-button" href="/login">Sign in</Link>
                </div>}
          </section>
          <aside className="setup-art">
            <div className="felt-ring">
              <span className="corner-suit">♠</span>
              <div className="chip chip-back" />
              <div className="chip chip-front"><Spade size={44} fill="currentColor" /></div>
              <p className="table-wordmark">A SEAT AT THE TABLE</p>
              <h2>Good company.<br />A great game.</h2>
              <div className="suits">♠ <span>♥</span> ♣ <span>♦</span></div>
            </div>
            <p>One pool. Every player. Every move.</p>
          </aside>
        </div>
      </main>
      <footer className="page-footer"><span><Spade size={13} /> POOLROOM</span><span>Keep the game fair. Keep the numbers clear.</span></footer>
    </div>
  );
}
