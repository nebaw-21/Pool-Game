"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Coins, Crown, DoorOpen, Eye, Flag, Flame, Frown, Handshake, Lock, PartyPopper, PieChart, SkipForward, Spade, Trophy, X } from 'lucide-react';
import { poolOf, evenShares, positiveAfterSplitSum, parseMoney, suitSymbol, isRed, type State, type Action, type Card } from '@/app/game';
import { playDeal, playReveal, playWin, playLose, playLimitReached } from '@/app/sounds';
import { createClient } from '@/lib/supabase/client';

const money = (cents: number) => (cents < 0 ? '−' : '') + (Math.abs(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const initials = (name: string) => name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
const rankLabel = (value: number) => (value === 1 ? 'Ace' : value === 11 ? 'Jack' : value === 12 ? 'King' : value === 13 ? 'Queen' : String(value));

function PlayingCard({ card, revealed, pending, size = 'lg', dealClass = '' }: { card: Card | null; revealed: boolean; pending?: boolean; size?: 'lg' | 'sm'; dealClass?: string }) {
  return (
    <div className={`btc-card btc-card-${size} ${revealed ? 'revealed' : ''} ${pending ? 'pending' : ''} ${dealClass}`}>
      <div className="btc-card-ratio">
        <div className="btc-card-inner">
          <div className="btc-card-face btc-card-back"><Spade size={size === 'lg' ? 30 : 20} /></div>
          <div className={`btc-card-face btc-card-front ${card && isRed(card.suit) ? 'red' : 'black'}`}>
            {card && <>
              <span className="btc-card-corner top">{card.label}<small>{suitSymbol(card.suit)}</small></span>
              <span className="btc-card-suit">{suitSymbol(card.suit)}</span>
              <span className="btc-card-corner bottom">{card.label}<small>{suitSymbol(card.suit)}</small></span>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TableClient({ sessionId, userId, initialState, initialStatus }: { sessionId: string; userId: string; initialState: State; initialStatus: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>(initialState);
  const [status, setStatus] = useState(initialStatus);
  const [removed, setRemoved] = useState(false);
  const [betText, setBetText] = useState('');
  const [depositText, setDepositText] = useState('');
  const [limitText, setLimitText] = useState('');

  const flash = state.resultFlash;
  const { round, phase, revealed1, revealed2, revealed3 } = state;
  const pool = poolOf(state.opponents), needsDeposit = pool === 0;
  const bet = parseMoney(betText), deposit = parseMoney(depositText);
  const player = state.opponents.find(p => p.id === state.selected);
  const myTurn = state.selected === userId;
  const canPlaceBet = phase === 'ready' && myTurn && bet !== null && bet > 0 && bet <= pool;
  const shares = evenShares(pool, state.opponents.length);
  const limitInput = parseMoney(limitText);
  // The limit progress and the split preview are only calculated once the pool is empty.
  const progress = needsDeposit ? positiveAfterSplitSum(state.opponents) : null;
  // The inviter (host) is always seated first — see respond-to-invitation.
  const host = state.opponents[0];
  const isInviter = host?.id === userId;
  const iRequestedLeave = state.leaveRequest?.by === userId;
  const theyRequestedLeave = state.leaveRequest !== null && state.leaveRequest.by !== userId;
  const leavingPlayer = state.leaveRequest ? state.opponents.find(p => p.id === state.leaveRequest!.by) : undefined;
  const iAmStillSeated = !removed && state.opponents.some(p => p.id === userId);
  const finished = status === 'ended';
  // A limit-reached ending keeps everyone on the results page (with a Quit button);
  // leave endings and removed players are sent back to the lobby.
  const redirecting = (finished && !state.gameOver) || !iAmStillSeated;

  async function sendAction(action: Action) {
    const res = await fetch('/api/game-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, action }),
    });
    const body = await res.json();
    if (res.ok) setState(body.state);
    else setState(s => ({ ...s, error: body.error ?? 'Something went wrong.' }));
  }

  async function submitWithInput(field: 'bet' | 'deposit' | 'limit', value: string, action: Action) {
    await sendAction({ type: 'input', field, value });
    await sendAction(action);
  }

  // Realtime is the fast path, but WebSocket delivery can be missed (a
  // subscription that isn't fully established yet, a backgrounded tab that
  // throttles the socket, a brief reconnect). A cheap poll-on-focus plus a
  // slow background poll makes sure both players converge on the true state
  // even if a postgres_changes event never arrives.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refetch = async () => {
      const { data, error } = await supabase.from('game_sessions').select('state, status').eq('id', sessionId).maybeSingle();
      if (cancelled) return;
      if (data) { setState(data.state as State); setStatus(data.status); }
      // No row and no error means RLS now hides this session from us: we were
      // removed from it (e.g. the host approved our request to leave).
      else if (!error) setRemoved(true);
    };

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, payload => {
        setState(payload.new.state as State);
        setStatus(payload.new.status as string);
      })
      .subscribe(subscribeStatus => {
        // Catch any change that landed in the gap between page load and the
        // subscription actually going live.
        if (subscribeStatus === 'SUBSCRIBED') refetch();
      });

    const onFocus = () => refetch();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    const poll = setInterval(refetch, 4000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    if (phase !== 'dealing') return;
    playDeal();
    const t1 = setTimeout(() => { playReveal(); sendAction({ type: 'revealFirst' }); }, 650);
    const t2 = setTimeout(() => { playReveal(); sendAction({ type: 'revealSecond' }); }, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);

  useEffect(() => {
    if (phase !== 'revealing') return;
    playDeal();
    const t = setTimeout(() => { playReveal(); sendAction({ type: 'resolve' }); }, 1350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (!flash) return;
    if (flash.outcome === 'win') playWin(); else playLose();
  }, [flash]);

  const wasGameOver = useRef(false);
  useEffect(() => {
    if (state.gameOver && !wasGameOver.current) playLimitReached();
    wasGameOver.current = state.gameOver;
  }, [state.gameOver]);

  useEffect(() => {
    if (!redirecting) return;
    const t = setTimeout(() => { router.push('/lobby'); router.refresh(); }, 2200);
    return () => clearTimeout(t);
  }, [redirecting, router]);

  if (redirecting) {
    return <div className="app-shell">
      <header className="topbar"><Link href="/lobby" className="brand"><Spade size={25} fill="currentColor" /> POOLROOM<span>.</span></Link></header>
      <main>
        <section className="panel setup-panel" style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center' }}>
          <DoorOpen className="gold" size={40} style={{ margin: '0 auto 12px' }} />
          <h2>{iAmStillSeated ? 'Game ended' : 'You left the game'}</h2>
          <p className="muted small">{iAmStillSeated ? 'This game session is now closed.' : 'The host approved your request to leave this game.'} Taking you back to the lobby…</p>
        </section>
      </main>
    </div>;
  }

  return <div className={`app-shell ${flash?.outcome === 'lose' ? 'shake' : ''}`}>
    {flash && <div className={`result-flash ${flash.outcome}`} key={flash.token} role="status" aria-live="assertive" onAnimationEnd={() => sendAction({ type: 'clearFlash' })}>
      <div className="result-flash-card">
        {flash.outcome === 'win' ? <PartyPopper size={40} /> : <Frown size={40} />}
        <strong>{flash.playerName} {flash.outcome === 'win' ? 'wins' : 'loses'}!</strong>
        <span>{flash.outcome === 'win' ? '+' : '−'}{money(flash.amount)}</span>
      </div>
      {flash.outcome === 'win' && <div className="confetti" aria-hidden="true">{Array.from({ length: 16 }).map((_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>}
    </div>}
    <header className="topbar"><Link href="/lobby" className="brand"><Spade size={25} fill="currentColor" /> POOLROOM<span>.</span></Link><div className="header-note">THE GAME. ALL ACCOUNTED FOR.</div><span className="session-label">Table in session</span></header>
    <main>
      <div className="game-layout">
        <aside className="panel opponents-panel">
          <div className="section-heading"><h2>Opponents</h2><span className="count">{state.opponents.length}</span></div>
          <p className="muted small">{myTurn ? 'It’s your turn.' : `Waiting on ${player?.name}.`}</p>
          <div className="roster-labels"><span>PLAYER</span><span>BALANCE</span></div>
          <div className="roster">
            {state.opponents.map((p, i) => <div key={p.id} className={`player-row ${state.selected === p.id ? 'selected' : ''}`}>
              <span className={`avatar color-${i % 4}`}>{initials(p.name)}</span>
              <span className="player-name">{p.name}{p.id === userId ? ' (you)' : ''}{state.selected === p.id && <small><Crown size={12} /> Now playing</small>}</span>
              <strong className={p.balance < 0 ? 'negative' : p.balance > 0 ? 'positive' : ''}>{p.balance > 0 ? '+' : ''}{money(p.balance)}</strong>
            </div>)}
          </div>
          <div className="balance-total"><span>Total player balance</span><strong>{money(-pool)}</strong></div>
          <p className="footnote">Player balances + pool = 0</p>
        </aside>
        <div className="table-column">
          <section className="pool-card">
            <div className="pool-top"><span><Coins size={17} /> THE POOL</span><span className="pool-status">{needsDeposit ? 'Awaiting deposits' : 'Ready to play'}</span></div>
            <div className="pool-value" aria-live="polite">{money(pool)}</div>
            <p>Current money available</p>
            <div className="pool-decoration" aria-hidden="true">♠</div>
            <div className="pool-bottom"><span>{state.opponents.length} opponents at the table</span><span>♠ &nbsp; ♥ &nbsp; ♣ &nbsp; ♦</span></div>
          </section>
          <div className="status-row">
            <section className={`panel limit-panel ${state.gameOver ? 'limit-reached' : ''}`}>
              <div className="section-heading"><div><p className="eyebrow">SESSION CAP</p><h2>Money limit</h2></div><Flag className="gold" size={22} /></div>
              {state.limitAmount === null
                ? isInviter && !finished
                  ? <>
                    <p className="muted small">End the game automatically once opponents&apos; combined winnings reach this amount. It&apos;s only checked when the pool reaches zero.</p>
                    <form onSubmit={e => { e.preventDefault(); submitWithInput('limit', limitText, { type: 'setLimit' }); }}>
                      <label className="sr-only" htmlFor="limit">Money limit</label>
                      <div className="input-row"><input id="limit" inputMode="decimal" value={limitText} placeholder="e.g. 1000" onChange={e => setLimitText(e.target.value)} /><button className="gold-button" disabled={limitInput === null || limitInput <= 0}><Flag size={16} /> Set Limit</button></div>
                    </form>
                  </>
                  : <p className="muted small"><Lock size={13} /> {finished ? 'No money limit was set.' : <>No money limit has been set. Only {host?.name ?? 'the host'} can set one.</>}</p>
                : <>
                  {progress !== null && (
                    <div className="limit-progress">
                      <div className="limit-progress-bar"><div className="limit-progress-fill" style={{ width: `${Math.min(100, (progress / state.limitAmount) * 100)}%` }} /></div>
                      <span>{money(progress)} of {money(state.limitAmount)} reached</span>
                    </div>
                  )}
                  {state.gameOver
                    ? <p className="btc-result-line"><Trophy size={16} /> Limit reached — the game has ended. See the final result below.</p>
                    : progress === null
                      ? <p className="muted small">Limit: {money(state.limitAmount)}. It&apos;s only checked once the pool reaches zero.</p>
                      : <p className="muted small">The game ends once winnings reach {money(state.limitAmount)}.</p>}
                  {finished
                    ? null
                    : isInviter
                    ? <button className="undo-button" onClick={() => sendAction({ type: 'clearLimit' })}><X size={15} /> Remove limit</button>
                    : <p className="muted small"><Lock size={13} /> Only {host?.name ?? 'the host'} can remove the limit.</p>}
                </>}
            </section>
            <section className={`panel deposit-panel ${needsDeposit ? 'deposit-required' : ''}`}>
              <div><h2>Bet Deposit</h2><p className="muted small">{needsDeposit ? 'Collect from every opponent to open the pool.' : 'Add the same amount from every opponent.'}</p></div>
              {finished
                ? <p className="muted small"><Lock size={13} /> This session is closed.</p>
                : isInviter
                ? <form onSubmit={e => { e.preventDefault(); submitWithInput('deposit', depositText, { type: 'deposit' }); setDepositText(''); }}>
                  <label className="sr-only" htmlFor="deposit">Bet Deposit per opponent</label>
                  <div className="input-row"><input id="deposit" inputMode="decimal" value={depositText} placeholder="Amount per player" onChange={e => setDepositText(e.target.value)} /><button className="gold-button" disabled={deposit === null || deposit <= 0}><Coins size={17} />Add</button></div>
                </form>
                : <p className="muted small"><Lock size={13} /> Only {host?.name ?? 'the host'}, who sent the invite, can collect a deposit.</p>}
            </section>
          </div>
          <section className="panel play-panel">
            <div className="section-heading"><div><p className="eyebrow">THE NEXT MOVE</p><h2>Between the Cards</h2></div><span className="turn-badge">{state.gameOver ? 'Game over' : needsDeposit ? 'Deposit required' : phase === 'select' ? (myTurn ? 'Your turn' : `${player?.name}'s turn`) : phase === 'dealing' ? 'Dealing…' : phase === 'ready' ? 'Place your bet' : phase === 'placed' ? 'Ready to reveal' : phase === 'revealing' ? 'Drawing…' : 'Round complete'}</span></div>

            {state.gameOver && (
              <div className="btc-gameover">
                <Trophy size={34} />
                <h3>Game over</h3>
                <p className="muted small">The {money(state.limitAmount ?? 0)} money limit was reached and this session is closed. Take your time — scroll down to see who&apos;s up and who&apos;s down, then quit when you&apos;re ready.</p>
                <button className="gold-button start-button" onClick={() => { router.push('/lobby'); router.refresh(); }}><DoorOpen size={18} /> Quit game</button>
              </div>
            )}

            {!state.gameOver && state.streak && (
              <div className="btc-streak"><Flame size={16} /> {player?.name} is on a streak — any win now sweeps the whole pool!</div>
            )}

            {!state.gameOver && phase === 'select' && (
              <>
                <p className="muted small">It&apos;s <b>{player?.name}</b>&apos;s turn. Deal two cards to set the range.</p>
                <button className="gold-button start-button" disabled={needsDeposit || !player || !myTurn} onClick={() => sendAction({ type: 'deal' })}>Deal Cards <ArrowRight size={19} /></button>
                {!myTurn && !needsDeposit && <p className="muted small">Waiting for {player?.name} to deal.</p>}
              </>
            )}

            {!state.gameOver && phase !== 'select' && round && (
              <>
                <div className="btc-dealer-area">
                  <div className="btc-deck" aria-hidden="true">
                    {Array.from({ length: 10 }).map((_, i) => <div key={i} className="btc-deck-card" style={{ '--i': i } as React.CSSProperties} />)}
                    <span className="btc-deck-count">156</span>
                  </div>
                  <div className="btc-pair" key={`${round.card1.id}-${round.card2.id}`}>
                    <div className="btc-pair-top">
                      <PlayingCard card={round.card1} revealed={revealed1} pending={!revealed1} dealClass="btc-deal-1" />
                      <span className="btc-versus">to</span>
                      <PlayingCard card={round.card2} revealed={revealed2} pending={revealed1 && !revealed2} dealClass="btc-deal-2" />
                    </div>
                    <div className="btc-pair-third">
                      {(phase === 'revealing' || phase === 'result')
                        ? <PlayingCard key={round.card3.id} card={round.card3} revealed={revealed3} pending={phase === 'revealing'} size="sm" dealClass="btc-deal-3" />
                        : <div className="btc-card btc-card-sm btc-card-parked" aria-hidden="true" />}
                    </div>
                  </div>
                </div>

                {revealed2 && (
                  <div className={`btc-range ${round.matchCount === 0 ? 'btc-dead' : ''}`}>
                    <span>{round.low === round.high ? 'Matching values' : 'Range'}</span>
                    <strong>{round.low === round.high ? <>{rankLabel(round.low)} &amp; {rankLabel(round.high)}</> : <>{rankLabel(round.low)} <ArrowRight size={14} /> {rankLabel(round.high)}</>}</strong>
                    <span className="btc-odds">{round.matchCount === 0 ? 'No card can land strictly between them — any bet is a guaranteed loss.' : `${round.matchCount} of ${round.oddsOf} remaining cards win`}</span>
                  </div>
                )}

                {(phase === 'ready' || phase === 'placed') && (
                  <div className="bet-fields btc-bet-fields">
                    <div><label htmlFor="bet">Bet Amount <span>Max {money(pool)}</span></label><input id="bet" inputMode="decimal" placeholder="0.00" disabled={phase !== 'ready' || !myTurn} value={betText} onChange={e => setBetText(e.target.value)} /></div>
                    <div className="btc-bet-actions">
                      <button className="gold-button" disabled={!canPlaceBet} onClick={() => submitWithInput('bet', betText, { type: 'placeBet' })}>Place Bet</button>
                      <button className="win-button btc-reveal-button" disabled={phase !== 'placed'} onClick={() => sendAction({ type: 'revealThird' })}><Eye size={18} /> Reveal Third Card</button>
                      {phase === 'ready' && <button className="btc-pass-button" disabled={!myTurn} onClick={() => sendAction({ type: 'pass' })}><em><SkipForward size={17} /> Pass</em><span>no money moves</span></button>}
                    </div>
                  </div>
                )}

                {phase === 'result' && (
                  <>
                    <p className="btc-result-line">{round.card3.label}{suitSymbol(round.card3.suit)} was {flash?.outcome === 'win' ? 'strictly between' : 'not between'} the range — {flash?.playerName} {flash?.outcome === 'win' ? 'won' : 'lost'} <b>{money(flash?.amount ?? 0)}</b>.</p>
                    <button className="gold-button start-button" onClick={() => sendAction({ type: 'next' })}>Continue — {player?.name}&apos;s turn <ArrowRight size={19} /></button>
                  </>
                )}
              </>
            )}

            <div className="action-footer"><p role="status">{state.error || state.message || 'The table is ready for its first deposit.'}</p></div>

            {!finished && <div className="btc-end-game">
              {isInviter
                ? theyRequestedLeave
                  ? <>
                    <p className="muted small"><Handshake size={15} /> {leavingPlayer?.name ?? 'A player'} asked to leave the game.</p>
                    <div className="btc-bet-actions">
                      <button className="gold-button" onClick={() => sendAction({ type: 'respondLeave', accept: true })}><Check size={16} /> Approve{state.opponents.length <= 2 ? ' & end game' : ''}</button>
                      <button className="undo-button" onClick={() => sendAction({ type: 'respondLeave', accept: false })}><X size={16} /> Decline</button>
                    </div>
                  </>
                  : <p className="muted small"><Lock size={13} /> As the host, you&apos;ll be asked to approve if an opponent wants to leave.</p>
                : iRequestedLeave
                  ? <p className="muted small"><DoorOpen size={15} /> Waiting for {host?.name ?? 'the host'} to approve your request to leave.</p>
                  : <button className="undo-button" onClick={() => sendAction({ type: 'requestLeave', by: userId })}><DoorOpen size={15} /> Ask to leave the game</button>}
            </div>}
          </section>
        </div>
      </div>
      <section className={`panel settlement-panel ${state.gameOver ? 'settlement-final' : ''}`}>
        <div className="section-heading"><div><p className="eyebrow">{state.gameOver ? 'FINAL RESULT' : 'SPLIT IT UP'}</p><h2>{state.gameOver ? 'Final settlement' : 'Settlement preview'}</h2></div>{state.gameOver ? <Trophy className="gold" size={24} /> : <PieChart className="gold" size={24} />}</div>
        <p className="muted small">{state.gameOver ? 'The game has ended. Here’s who walked away up and who walked away down.' : needsDeposit ? 'The pool is empty, so these balances are final.' : 'The split preview is calculated once the pool reaches zero.'}</p>
        <div className="settlement-table-wrap">
          <table className="settlement-table">
            <thead><tr><th>Opponent</th><th>Current balance</th><th>Even share of pool</th><th>Balance after split</th>{state.gameOver && <th>Result</th>}</tr></thead>
            <tbody>{state.opponents.map((p, i) => { const after = p.balance + (shares[i] ?? 0); return <tr key={p.id} className={state.selected === p.id ? 'selected' : ''}><td><span className={`avatar tiny color-${i % 4}`}>{initials(p.name)}</span>{p.name}</td><td className={p.balance < 0 ? 'negative' : p.balance > 0 ? 'positive' : ''}>{p.balance > 0 ? '+' : ''}{money(p.balance)}</td>{needsDeposit ? <><td className="positive">+{money(shares[i] ?? 0)}</td><td className={after < 0 ? 'negative' : after > 0 ? 'positive' : ''}>{after > 0 ? '+' : ''}{money(after)}</td></> : <><td>—</td><td>—</td></>}{state.gameOver && <td><span className={`settlement-badge ${after > 0 ? 'win' : after < 0 ? 'lose' : 'even'}`}>{after > 0 ? 'Won money' : after < 0 ? 'Lost money' : 'Broke even'}</span></td>}</tr>; })}</tbody>
            <tfoot><tr><td>Total</td><td>{money(-pool)}</td>{needsDeposit ? <><td className="positive">+{money(pool)}</td><td>{money(0)}</td></> : <><td>—</td><td>—</td></>}{state.gameOver && <td />}</tr></tfoot>
          </table>
        </div>
        <div className="settlement-footer"><p className="muted small">{needsDeposit ? 'The pool is empty — nothing to split yet.' : `Splitting divides ${money(pool)} into ${state.opponents.length} even shares.`}</p><button className="gold-button" disabled={needsDeposit || finished} onClick={() => sendAction({ type: 'split' })}><PieChart size={17} /> Split pool evenly</button></div>
      </section>
    </main>
  </div>;
}
