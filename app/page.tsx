"use client";
import { useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Coins, Eye, Frown, PartyPopper, PieChart, Plus, RotateCcw, SkipForward, Spade, Users, X } from 'lucide-react';
import { initialState, reducer, poolOf, evenShares, parseMoney, suitSymbol, isRed, type Opponent, type Card } from './game';
const money = (cents: number) => (cents < 0 ? '−' : '') + (Math.abs(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const initials = (name: string) => name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
const rankLabel = (value: number) => (value === 1 ? 'Ace' : value === 11 ? 'Jack' : value === 12 ? 'King' : value === 13 ? 'Queen' : String(value));
const IDLE_PHASES = ['select', 'result', 'dead'];

function PlayingCard({ card, revealed, pending, size = 'lg' }: { card: Card | null; revealed: boolean; pending?: boolean; size?: 'lg' | 'sm' }) {
 return (
  <div className={`btc-card btc-card-${size} ${revealed ? 'revealed' : ''} ${pending ? 'pending' : ''}`}>
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

export default function Home() {
 const [state, dispatch] = useReducer(reducer, initialState);
 const [opponents, setOpponents] = useState<Opponent[]>([]);
 const [name, setName] = useState(''); const [nameError, setNameError] = useState('');
 const flash = state.resultFlash;
 const { round, phase, revealed1, revealed2, revealed3 } = state;
 const pool = poolOf(state.opponents), needsDeposit = pool === 0;
 const bet = parseMoney(state.bet), deposit = parseMoney(state.deposit);
 const player = state.opponents.find(p => p.id === state.selected);
 const canPlaceBet = phase === 'ready' && bet !== null && bet > 0 && bet <= pool;
 const shares = evenShares(pool, state.opponents.length);
 const oddsPct = round && round.oddsOf ? Math.round((round.matchCount / round.oddsOf) * 100) : 0;
 const addOpponent = (event: React.FormEvent) => { event.preventDefault(); const clean = name.trim(); if (!clean) return setNameError('Enter an opponent’s name.'); if (opponents.some(p => p.name.toLowerCase() === clean.toLowerCase())) return setNameError('That name is already at the table.'); setOpponents([...opponents, { id: crypto.randomUUID(), name: clean, balance: 0 }]); setName(''); setNameError(''); };

 useEffect(() => {
  if (phase !== 'dealing') return;
  const t1 = setTimeout(() => dispatch({ type: 'revealFirst' }), 650);
  const t2 = setTimeout(() => dispatch({ type: 'revealSecond' }), 1500);
  return () => { clearTimeout(t1); clearTimeout(t2); };
 }, [phase, round]);

 useEffect(() => {
  if (phase !== 'revealing') return;
  const t = setTimeout(() => dispatch({ type: 'resolve' }), 1350);
  return () => clearTimeout(t);
 }, [phase]);
 return <div className={`app-shell ${flash?.outcome === 'lose' ? 'shake' : ''}`}>
 {flash && <div className={`result-flash ${flash.outcome}`} key={flash.token} role="status" aria-live="assertive" onAnimationEnd={() => dispatch({ type: 'clearFlash' })}>
  <div className="result-flash-card">
   {flash.outcome === 'win' ? <PartyPopper size={40}/> : <Frown size={40}/>}
   <strong>{flash.playerName} {flash.outcome === 'win' ? 'wins' : 'loses'}!</strong>
   <span>{flash.outcome === 'win' ? '+' : '−'}{money(flash.amount)}</span>
  </div>
  {flash.outcome === 'win' && <div className="confetti" aria-hidden="true">{Array.from({ length: 16 }).map((_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties}/>)}</div>}
 </div>}
 <header className="topbar"><Link href="/" className="brand"><Spade size={25} fill="currentColor"/> POOLROOM<span>.</span></Link><div className="header-note">THE GAME. ALL ACCOUNTED FOR.</div><span className="session-label">{state.started ? 'Table in session' : 'New table'}</span></header>
 <main><div className="page-heading"><div><p className="eyebrow">YOUR TABLE, YOUR GAME</p><h1>{state.started ? 'Let’s play.' : 'Bring your opponents.'}</h1><p className="muted">{state.started ? 'Pick a player. Place a bet. Keep the balance.' : 'Add everyone at the table, then get the game going.'}</p></div><div className="step-indicator"><span className={!state.started ? 'current' : 'complete'}>{state.started ? <Check size={14}/> : '1'}</span> Setup <i/><span className={state.started ? 'current' : ''}>2</span> Play</div></div>
 {!state.started ? <div className="setup-grid"><section className="panel setup-panel"><div className="section-heading"><div><p className="eyebrow">01 / THE LINEUP</p><h2>Who’s playing?</h2></div><Users className="gold" size={25}/></div><form onSubmit={addOpponent}><label htmlFor="opponent-name">Opponent name</label><div className="input-row"><input id="opponent-name" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="e.g. James" autoComplete="off"/><button className="gold-button" type="submit"><Plus size={18}/> Add</button></div></form>{nameError && <p className="error" role="alert">{nameError}</p>}<div className="lineup-heading"><span>OPPONENTS <b>{opponents.length}</b></span><span>STARTING BALANCE</span></div><div className="setup-list">{opponents.length ? opponents.map((p,i) => <div className="setup-person" key={p.id}><span className={`avatar color-${i%4}`}>{initials(p.name)}</span><strong>{p.name}</strong><span className="balance">0</span><button className="icon-button" onClick={() => setOpponents(opponents.filter(o => o.id !== p.id))} aria-label={`Remove ${p.name}`}><X size={17}/></button></div>) : <div className="empty-lineup"><Users size={30}/><p>The table is open.</p><span>Add your first opponent above.</span></div>}</div><button className="gold-button start-button" disabled={!opponents.length} onClick={() => dispatch({ type:'start', opponents })}>Start game <ArrowRight size={19}/></button><p className="footnote">Everyone starts at 0. Collect the first deposit next.</p></section><aside className="setup-art"><div className="felt-ring"><span className="corner-suit">♠</span><div className="chip chip-back"/><div className="chip chip-front"><Spade size={44} fill="currentColor"/></div><p className="table-wordmark">A SEAT AT THE TABLE</p><h2>Good company.<br/>A great game.</h2><div className="suits">♠ <span>♥</span> ♣ <span>♦</span></div></div><p>One pool. Every player. Every move.</p></aside></div> :
 <><div className="game-layout"><aside className="panel opponents-panel"><div className="section-heading"><h2>Opponents</h2><span className="count">{state.opponents.length}</span></div><p className="muted small">Select who’s playing this turn.</p><div className="roster-labels"><span>PLAYER</span><span>BALANCE</span></div><div className="roster">{state.opponents.map((p,i) => <button key={p.id} className={`player-row ${state.selected === p.id ? 'selected' : ''}`} disabled={!IDLE_PHASES.includes(phase)} onClick={() => dispatch({ type:'select', id:p.id })} aria-pressed={state.selected === p.id}><span className={`avatar color-${i%4}`}>{initials(p.name)}</span><span className="player-name">{p.name}{state.selected === p.id && <small>Playing this turn</small>}</span><strong className={p.balance < 0 ? 'negative' : p.balance > 0 ? 'positive' : ''}>{p.balance > 0 ? '+' : ''}{money(p.balance)}</strong></button>)}</div><div className="balance-total"><span>Total player balance</span><strong>{money(-pool)}</strong></div><p className="footnote">Player balances + pool = 0</p></aside><div className="table-column"><section className="pool-card"><div className="pool-top"><span><Coins size={17}/> THE POOL</span><span className="pool-status">{needsDeposit ? 'Awaiting deposits' : 'Ready to play'}</span></div><div className="pool-value" aria-live="polite">{money(pool)}</div><p>Current money available</p><div className="pool-decoration" aria-hidden="true">♠</div><div className="pool-bottom"><span>{state.opponents.length} opponents at the table</span><span>♠ &nbsp; ♥ &nbsp; ♣ &nbsp; ♦</span></div></section>
 <section className={`panel deposit-panel ${needsDeposit ? 'deposit-required' : ''}`}><div><h2>Bet Deposit</h2><p className="muted small">{needsDeposit ? 'Collect from every opponent to open the pool.' : 'Add the same amount from every opponent.'}</p></div><form onSubmit={e => {e.preventDefault();dispatch({type:'deposit'});}}><label className="sr-only" htmlFor="deposit">Bet Deposit per opponent</label><div className="input-row"><input id="deposit" inputMode="decimal" value={state.deposit} placeholder="Amount per player" onChange={e => dispatch({type:'input',field:'deposit',value:e.target.value})}/><button className="gold-button" disabled={deposit === null || deposit <= 0}><Plus size={17}/>Add</button></div></form></section>
 <section className="panel play-panel">
  <div className="section-heading"><div><p className="eyebrow">THE NEXT MOVE</p><h2>Between the Cards</h2></div><span className="turn-badge">{needsDeposit ? 'Deposit required' : phase === 'select' ? 'Choose your opponent' : phase === 'dealing' ? 'Dealing…' : phase === 'ready' ? 'Place your bet' : phase === 'dead' ? 'Push — redraw' : phase === 'placed' ? 'Ready to reveal' : phase === 'revealing' ? 'Drawing…' : 'Round complete'}</span></div>

  {phase === 'select' && (
   <>
    <p className="muted small">{player ? <>Playing for <b>{player.name}</b>. Deal two cards to set the range.</> : 'Select an opponent from the roster to begin.'}</p>
    <button className="gold-button start-button" disabled={needsDeposit || !player} onClick={() => dispatch({ type: 'deal' })}>Deal Cards <ArrowRight size={19}/></button>
   </>
  )}

  {phase !== 'select' && round && (
   <>
    <div className="btc-pair">
     <div className="btc-pair-top">
      <PlayingCard card={round.card1} revealed={revealed1} pending={!revealed1} />
      <span className="btc-versus">to</span>
      <PlayingCard card={round.card2} revealed={revealed2} pending={revealed1 && !revealed2} />
     </div>
     <div className="btc-pair-third">
      <PlayingCard card={round.card3} revealed={revealed3} pending={phase === 'revealing'} size="sm" />
     </div>
    </div>

    {revealed2 && !round.dead && (
     <div className="btc-range">
      <span>Range</span>
      <strong>{rankLabel(round.low)} <ArrowRight size={14}/> {rankLabel(round.high)}</strong>
      <span className="btc-odds">{round.matchCount} of {round.oddsOf} remaining cards win · {oddsPct}% odds</span>
     </div>
    )}

    {phase === 'dead' && (
     <div className="btc-range btc-dead">
      <span>Push — matching values</span>
      <strong>{rankLabel(round.low)} &amp; {rankLabel(round.high)}</strong>
      <span className="btc-odds">No card can land strictly between two equal values.</span>
      <button className="gold-button" onClick={() => dispatch({ type: 'deal' })}><RotateCcw size={16}/> Redraw Pair</button>
     </div>
    )}

    {(phase === 'ready' || phase === 'placed') && (
     <div className="bet-fields btc-bet-fields">
      <div><label htmlFor="bet">Bet Amount <span>Max {money(pool)}</span></label><input id="bet" inputMode="decimal" placeholder="0.00" disabled={phase !== 'ready'} value={state.bet} onChange={e => dispatch({type:'input',field:'bet',value:e.target.value})}/></div>
      <div className="btc-bet-actions">
       <button className="gold-button" disabled={!canPlaceBet} onClick={() => dispatch({type:'placeBet'})}>Place Bet</button>
       <button className="win-button btc-reveal-button" disabled={phase !== 'placed'} onClick={() => dispatch({type:'revealThird'})}><Eye size={18}/> Reveal Third Card</button>
       {phase === 'ready' && <button className="btc-pass-button" onClick={() => dispatch({type:'pass'})}><em><SkipForward size={17}/> Pass</em><span>no money moves</span></button>}
      </div>
     </div>
    )}

    {phase === 'result' && (
     <>
      <p className="btc-result-line">{round.card3.label}{suitSymbol(round.card3.suit)} was {flash?.outcome === 'win' ? 'strictly between' : 'not between'} the range — {player?.name} {flash?.outcome === 'win' ? 'won' : 'lost'} <b>{money(flash?.amount ?? 0)}</b>.</p>
      <button className="gold-button start-button" disabled={needsDeposit} onClick={() => dispatch({ type: 'deal' })}>Deal Again <ArrowRight size={19}/></button>
     </>
    )}
   </>
  )}

  <div className="action-footer"><p role="status">{state.error || state.message || 'The table is ready for its first deposit.'}</p><button className="undo-button" disabled={!state.history.length} onClick={() => dispatch({type:'undo'})}><RotateCcw size={16}/> Undo</button></div>
 </section></div></div>
 <section className="panel settlement-panel"><div className="section-heading"><div><p className="eyebrow">SPLIT IT UP</p><h2>Settlement preview</h2></div><PieChart className="gold" size={24}/></div><p className="muted small">See what happens if the current pool were split evenly across every opponent right now.</p><div className="settlement-table-wrap"><table className="settlement-table"><thead><tr><th>Opponent</th><th>Current balance</th><th>Even share of pool</th><th>Balance after split</th></tr></thead><tbody>{state.opponents.map((p,i) => <tr key={p.id} className={state.selected === p.id ? 'selected' : ''}><td><span className={`avatar tiny color-${i%4}`}>{initials(p.name)}</span>{p.name}</td><td className={p.balance < 0 ? 'negative' : p.balance > 0 ? 'positive' : ''}>{p.balance > 0 ? '+' : ''}{money(p.balance)}</td><td className="positive">+{money(shares[i] ?? 0)}</td><td className={(p.balance + (shares[i] ?? 0)) < 0 ? 'negative' : (p.balance + (shares[i] ?? 0)) > 0 ? 'positive' : ''}>{(p.balance + (shares[i] ?? 0)) > 0 ? '+' : ''}{money(p.balance + (shares[i] ?? 0))}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td>{money(-pool)}</td><td className="positive">+{money(pool)}</td><td>{money(0)}</td></tr></tfoot></table></div><div className="settlement-footer"><p className="muted small">{needsDeposit ? 'The pool is empty — nothing to split yet.' : `Splitting divides ${money(pool)} into ${state.opponents.length} even shares.`}</p><button className="gold-button" disabled={needsDeposit} onClick={() => dispatch({type:'split'})}><PieChart size={17}/> Split pool evenly</button></div></section></>}
 <footer className="page-footer"><span><Spade size={13}/> POOLROOM</span><span>Keep the game fair. Keep the numbers clear.</span></footer></main></div>;
}
