"use client";
import { useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Coins, Crown, Eye, Flag, Flame, Frown, PartyPopper, PieChart, Plus, RotateCcw, RotateCw, SkipForward, Spade, Trophy, Users, X } from 'lucide-react';
import { initialState, reducer, poolOf, evenShares, positiveAfterSplitSum, parseMoney, suitSymbol, isRed, type Opponent, type Card } from './game';
import { playDeal, playReveal, playWin, playLose, playLimitReached } from './sounds';
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
 const limitInput = parseMoney(state.limit);
 const progress = positiveAfterSplitSum(state.opponents);
 const addOpponent = (event: React.FormEvent) => { event.preventDefault(); const clean = name.trim(); if (!clean) return setNameError('Enter an opponent’s name.'); if (opponents.some(p => p.name.toLowerCase() === clean.toLowerCase())) return setNameError('That name is already at the table.'); setOpponents([...opponents, { id: crypto.randomUUID(), name: clean, balance: 0 }]); setName(''); setNameError(''); };

 useEffect(() => {
  if (phase !== 'dealing') return;
  playDeal();
  const t1 = setTimeout(() => { playReveal(); dispatch({ type: 'revealFirst' }); }, 650);
  const t2 = setTimeout(() => { playReveal(); dispatch({ type: 'revealSecond' }); }, 1500);
  return () => { clearTimeout(t1); clearTimeout(t2); };
 }, [phase, round]);

 useEffect(() => {
  if (phase !== 'revealing') return;
  playDeal();
  const t = setTimeout(() => { playReveal(); dispatch({ type: 'resolve' }); }, 1350);
  return () => clearTimeout(t);
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
 <><div className="game-layout"><aside className="panel opponents-panel"><div className="section-heading"><h2>Opponents</h2><span className="count">{state.opponents.length}</span></div><p className="muted small">Turns rotate automatically — the highlighted player is up now.</p><div className="roster-labels"><span>PLAYER</span><span>BALANCE</span></div><div className="roster">{state.opponents.map((p,i) => <div key={p.id} className={`player-row ${state.selected === p.id ? 'selected' : ''}`}><span className={`avatar color-${i%4}`}>{initials(p.name)}</span><span className="player-name">{p.name}{state.selected === p.id && <small><Crown size={12}/> Now playing</small>}</span><strong className={p.balance < 0 ? 'negative' : p.balance > 0 ? 'positive' : ''}>{p.balance > 0 ? '+' : ''}{money(p.balance)}</strong></div>)}</div><div className="balance-total"><span>Total player balance</span><strong>{money(-pool)}</strong></div><p className="footnote">Player balances + pool = 0</p><div className="add-opponent"><form onSubmit={e => { e.preventDefault(); dispatch({ type: 'addOpponent' }); }}><label className="sr-only" htmlFor="new-opponent">Add a player</label><div className="input-row"><input id="new-opponent" value={state.opponentName} maxLength={40} placeholder="Add a player…" disabled={pool !== 0} onChange={e => dispatch({ type: 'input', field: 'opponentName', value: e.target.value })}/><button className="gold-button" type="submit" disabled={pool !== 0 || !state.opponentName.trim()}><Plus size={16}/></button></div></form><p className="muted small">{pool === 0 ? 'The pool is empty — safe to add a new player now.' : 'Wait until the pool is 0 (right before the next deposit) to add someone.'}</p></div></aside><div className="table-column"><section className="pool-card"><div className="pool-top"><span><Coins size={17}/> THE POOL</span><span className="pool-status">{needsDeposit ? 'Awaiting deposits' : 'Ready to play'}</span></div><div className="pool-value" aria-live="polite">{money(pool)}</div><p>Current money available</p><div className="pool-decoration" aria-hidden="true">♠</div><div className="pool-bottom"><span>{state.opponents.length} opponents at the table</span><span>♠ &nbsp; ♥ &nbsp; ♣ &nbsp; ♦</span></div></section>
 <div className="status-row">
 <section className={`panel limit-panel ${state.gameOver ? 'limit-reached' : ''}`}>
  <div className="section-heading"><div><p className="eyebrow">SESSION CAP</p><h2>Money limit</h2></div><Flag className="gold" size={22}/></div>
  {state.limitAmount === null
   ? <>
      <p className="muted small">End the game automatically once opponents’ combined winnings (after an even split) reach this amount.</p>
      <form onSubmit={e => { e.preventDefault(); dispatch({ type: 'setLimit' }); }}><label className="sr-only" htmlFor="limit">Money limit</label><div className="input-row"><input id="limit" inputMode="decimal" value={state.limit} placeholder="e.g. 1000" onChange={e => dispatch({ type: 'input', field: 'limit', value: e.target.value })}/><button className="gold-button" disabled={limitInput === null || limitInput <= 0}><Flag size={16}/> Set Limit</button></div></form>
     </>
   : <>
      <div className="limit-progress">
       <div className="limit-progress-bar"><div className="limit-progress-fill" style={{ width: `${Math.min(100, (progress / state.limitAmount) * 100)}%` }}/></div>
       <span>{money(progress)} of {money(state.limitAmount)} reached</span>
      </div>
      {state.gameOver
       ? <p className="btc-result-line"><Trophy size={16}/> Limit reached — the game has ended. See the settlement preview below.</p>
       : <p className="muted small">The table will lock once winnings after a split reach {money(state.limitAmount)}.</p>}
      <button className="undo-button" onClick={() => dispatch({ type: 'clearLimit' })}><X size={15}/> Remove limit</button>
     </>}
 </section>
 <section className={`panel deposit-panel ${needsDeposit ? 'deposit-required' : ''}`}><div><h2>Bet Deposit</h2><p className="muted small">{needsDeposit ? 'Collect from every opponent to open the pool.' : 'Add the same amount from every opponent.'}</p></div><form onSubmit={e => {e.preventDefault();dispatch({type:'deposit'});}}><label className="sr-only" htmlFor="deposit">Bet Deposit per opponent</label><div className="input-row"><input id="deposit" inputMode="decimal" value={state.deposit} placeholder="Amount per player" onChange={e => dispatch({type:'input',field:'deposit',value:e.target.value})}/><button className="gold-button" disabled={deposit === null || deposit <= 0}><Plus size={17}/>Add</button></div></form></section>
 </div>
 <section className="panel play-panel">
  <div className="section-heading"><div><p className="eyebrow">THE NEXT MOVE</p><h2>Between the Cards</h2></div><span className="turn-badge">{state.gameOver ? 'Game over' : needsDeposit ? 'Deposit required' : phase === 'select' ? 'Choose your opponent' : phase === 'dealing' ? 'Dealing…' : phase === 'ready' ? 'Place your bet' : phase === 'placed' ? 'Ready to reveal' : phase === 'revealing' ? 'Drawing…' : 'Round complete'}</span></div>

  {state.gameOver && (
   <div className="btc-gameover">
    <Trophy size={34}/>
    <h3>Game over</h3>
    <p className="muted small">The {money(state.limitAmount ?? 0)} money limit was reached. Betting is locked — scroll down to the settlement preview to see who’s up and who’s down. Undo or remove the limit if you want to keep playing.</p>
   </div>
  )}

  {!state.gameOver && state.streak && (
   <div className="btc-streak"><Flame size={16}/> {player?.name} is on a streak — any win now sweeps the whole pool!</div>
  )}

  {!state.gameOver && phase === 'select' && (
   <>
    <p className="muted small">It’s <b>{player?.name}</b>’s turn. Deal two cards to set the range.</p>
    <button className="gold-button start-button" disabled={needsDeposit || !player} onClick={() => dispatch({ type: 'deal' })}>Deal Cards <ArrowRight size={19}/></button>
   </>
  )}

  {!state.gameOver && phase !== 'select' && round && (
   <>
    <div className="btc-dealer-area">
     <div className="btc-deck" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => <div key={i} className="btc-deck-card" style={{ '--i': i } as React.CSSProperties}/>)}
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
        : <div className="btc-card btc-card-sm btc-card-parked" aria-hidden="true"/>}
      </div>
     </div>
    </div>

    {revealed2 && (
     <div className={`btc-range ${round.matchCount === 0 ? 'btc-dead' : ''}`}>
      <span>{round.low === round.high ? 'Matching values' : 'Range'}</span>
      <strong>{round.low === round.high ? <>{rankLabel(round.low)} &amp; {rankLabel(round.high)}</> : <>{rankLabel(round.low)} <ArrowRight size={14}/> {rankLabel(round.high)}</>}</strong>
      <span className="btc-odds">{round.matchCount === 0 ? 'No card can land strictly between them — any bet is a guaranteed loss.' : `${round.matchCount} of ${round.oddsOf} remaining cards win`}</span>
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
      <p className="btc-result-line">{round.card3.label}{suitSymbol(round.card3.suit)} was {flash?.outcome === 'win' ? 'strictly between' : 'not between'} the range — {flash?.playerName} {flash?.outcome === 'win' ? 'won' : 'lost'} <b>{money(flash?.amount ?? 0)}</b>.</p>
      <button className="gold-button start-button" onClick={() => dispatch({ type: 'next' })}>Continue — {player?.name}’s turn <ArrowRight size={19}/></button>
     </>
    )}
   </>
  )}

  <div className="action-footer"><p role="status">{state.error || state.message || 'The table is ready for its first deposit.'}</p><div className="btc-history-actions"><button className="undo-button" disabled={!state.history.length} onClick={() => dispatch({type:'undo'})}><RotateCcw size={16}/> Undo</button><button className="undo-button" disabled={!state.future.length} onClick={() => dispatch({type:'redo'})}><RotateCw size={16}/> Redo</button></div></div>
 </section></div></div>
 <section className={`panel settlement-panel ${state.gameOver ? 'settlement-final' : ''}`}><div className="section-heading"><div><p className="eyebrow">{state.gameOver ? 'FINAL RESULT' : 'SPLIT IT UP'}</p><h2>{state.gameOver ? 'Final settlement' : 'Settlement preview'}</h2></div>{state.gameOver ? <Trophy className="gold" size={24}/> : <PieChart className="gold" size={24}/>}</div><p className="muted small">{state.gameOver ? 'The game has ended. Here’s who walked away up and who walked away down.' : 'See what happens if the current pool were split evenly across every opponent right now.'}</p><div className="settlement-table-wrap"><table className="settlement-table"><thead><tr><th>Opponent</th><th>Current balance</th><th>Even share of pool</th><th>Balance after split</th>{state.gameOver && <th>Result</th>}</tr></thead><tbody>{state.opponents.map((p,i) => { const after = p.balance + (shares[i] ?? 0); return <tr key={p.id} className={state.selected === p.id ? 'selected' : ''}><td><span className={`avatar tiny color-${i%4}`}>{initials(p.name)}</span>{p.name}</td><td className={p.balance < 0 ? 'negative' : p.balance > 0 ? 'positive' : ''}>{p.balance > 0 ? '+' : ''}{money(p.balance)}</td><td className="positive">+{money(shares[i] ?? 0)}</td><td className={after < 0 ? 'negative' : after > 0 ? 'positive' : ''}>{after > 0 ? '+' : ''}{money(after)}</td>{state.gameOver && <td><span className={`settlement-badge ${after > 0 ? 'win' : after < 0 ? 'lose' : 'even'}`}>{after > 0 ? 'Won money' : after < 0 ? 'Lost money' : 'Broke even'}</span></td>}</tr>; })}</tbody><tfoot><tr><td>Total</td><td>{money(-pool)}</td><td className="positive">+{money(pool)}</td><td>{money(0)}</td>{state.gameOver && <td/>}</tr></tfoot></table></div><div className="settlement-footer"><p className="muted small">{needsDeposit ? 'The pool is empty — nothing to split yet.' : `Splitting divides ${money(pool)} into ${state.opponents.length} even shares.`}</p><button className="gold-button" disabled={needsDeposit} onClick={() => dispatch({type:'split'})}><PieChart size={17}/> Split pool evenly</button></div></section></>}
 <footer className="page-footer"><span><Spade size={13}/> POOLROOM</span><span>Keep the game fair. Keep the numbers clear.</span></footer></main></div>;
}
