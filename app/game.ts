export type Opponent = { id: string; name: string; balance: number };
export type ResultFlash = { token: number; outcome: 'win' | 'lose'; playerName: string; amount: number };

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Card = { suit: Suit; label: string; value: number; id: string };

const SUITS: { key: Suit; symbol: string }[] = [
  { key: 'S', symbol: '♠' },
  { key: 'H', symbol: '♥' },
  { key: 'D', symbol: '♦' },
  { key: 'C', symbol: '♣' },
];

const RANKS: { label: string; value: number }[] = [
  { label: 'A', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
  { label: '8', value: 8 },
  { label: '9', value: 9 },
  { label: '10', value: 10 },
  { label: 'J', value: 11 },
  { label: 'K', value: 12 },
  { label: 'Q', value: 13 },
];

export const suitSymbol = (suit: Suit) => SUITS.find(s => s.key === suit)!.symbol;
export const isRed = (suit: Suit) => suit === 'H' || suit === 'D';

const DECK_COUNT = 3;

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit: suit.key, label: rank.label, value: rank.value, id: `${rank.label}${suit.key}-${d}` });
  }
  return deck;
}

function randomInt(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let pass = 0; pass < 7; pass++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  return arr;
}

export type Round = { card1: Card; card2: Card; card3: Card; low: number; high: number; dead: boolean; matchCount: number; oddsOf: number };

export function dealRound(): Round {
  const deck = shuffle(buildDeck());
  const [card1, card2, card3] = deck;
  const low = Math.min(card1.value, card2.value);
  const high = Math.max(card1.value, card2.value);
  const dead = low === high;
  const remaining = deck.slice(2);
  const matchCount = remaining.filter(c => c.value > low && c.value < high).length;
  return { card1, card2, card3, low, high, dead, matchCount, oddsOf: remaining.length };
}

export const isWin = (round: Round) => round.card3.value > round.low && round.card3.value < round.high;

type Snapshot = { started: boolean; opponents: Opponent[]; selected: string; bet: string; deposit: string; message: string };

export type Phase = 'select' | 'dealing' | 'ready' | 'placed' | 'revealing' | 'result';
const IDLE_PHASES: Phase[] = ['select', 'result'];

export type State = Snapshot & {
  error: string;
  resultFlash: ResultFlash | null;
  round: Round | null;
  phase: Phase;
  revealed1: boolean;
  revealed2: boolean;
  revealed3: boolean;
  activeBet: number | null;
  limit: string;
  limitAmount: number | null;
  gameOver: boolean;
  opponentName: string;
  streak: boolean;
  leaveRequest: { by: string } | null;
  sessionEnded: boolean;
};

export const initialState: State = {
  started: false, opponents: [], selected: '', bet: '', deposit: '', message: '',
  error: '', resultFlash: null,
  round: null, phase: 'select', revealed1: false, revealed2: false, revealed3: false, activeBet: null,
  limit: '', limitAmount: null, gameOver: false, opponentName: '', streak: false,
  leaveRequest: null, sessionEnded: false,
};

export const poolOf = (opponents: Opponent[]) => -opponents.reduce((sum, p) => sum + p.balance, 0) || 0;

export function evenShares(pool: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(pool / count);
  const remainder = pool - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function afterSplitBalances(opponents: Opponent[]): number[] {
  const shares = evenShares(poolOf(opponents), opponents.length);
  return opponents.map((p, i) => p.balance + shares[i]);
}

export const positiveAfterSplitSum = (opponents: Opponent[]) => afterSplitBalances(opponents).reduce((sum, v) => sum + Math.max(v, 0), 0);

// The money limit (and the split preview) are only evaluated once the pool is
// empty; while money is still in the pool nothing is calculated.
export const limitReached = (opponents: Opponent[], limitAmount: number | null) =>
  limitAmount !== null && poolOf(opponents) === 0 && positiveAfterSplitSum(opponents) >= limitAmount;

function nextOpponentId(opponents: Opponent[], currentId: string): string {
  if (!opponents.length) return '';
  const index = opponents.findIndex(o => o.id === currentId);
  return opponents[index === -1 ? 0 : (index + 1) % opponents.length].id;
}

export function parseMoney(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export type Action =
  | { type: 'start'; opponents: Opponent[] }
  | { type: 'input'; field: 'bet' | 'deposit' | 'limit' | 'opponentName'; value: string }
  | { type: 'addOpponent' }
  | { type: 'deposit' }
  | { type: 'split' }
  | { type: 'setLimit' }
  | { type: 'clearLimit' }
  | { type: 'deal' }
  | { type: 'revealFirst' }
  | { type: 'revealSecond' }
  | { type: 'placeBet' }
  | { type: 'pass' }
  | { type: 'revealThird' }
  | { type: 'resolve' }
  | { type: 'next' }
  | { type: 'clearFlash' }
  | { type: 'requestLeave'; by: string }
  | { type: 'respondLeave'; accept: boolean };

export function reducer(state: State, action: Action): State {
  if (action.type === 'start') return action.opponents.length ? { ...initialState, started: true, opponents: action.opponents.map(p => ({ ...p, balance: 0 })), selected: action.opponents[0].id } : state;
  if (action.type === 'input') return { ...state, [action.field]: action.value, error: '' };
  if (action.type === 'clearFlash') return state.resultFlash ? { ...state, resultFlash: null } : state;
  if (action.type === 'setLimit') {
    const amount = parseMoney(state.limit);
    if (amount === null || amount <= 0) return { ...state, error: 'Enter a positive limit amount.' };
    const reachedLimit = limitReached(state.opponents, amount);
    return { ...state, limitAmount: amount, error: '', gameOver: reachedLimit, sessionEnded: state.sessionEnded || reachedLimit, message: reachedLimit ? `Game over — the ${amount / 100} limit was already reached. This session is now closed. See the settlement preview for the final payout.` : state.message };
  }
  if (action.type === 'clearLimit') return { ...state, limitAmount: null, limit: '', error: '', gameOver: false };
  if (!state.started) return state;

  if (action.type === 'requestLeave') {
    if (state.sessionEnded) return state;
    if (action.by === state.opponents[0]?.id) return { ...state, error: 'The host can’t request to leave.' };
    if (state.leaveRequest) return { ...state, error: 'There is already a pending request to leave.' };
    const requester = state.opponents.find(p => p.id === action.by);
    return { ...state, leaveRequest: { by: action.by }, error: '', message: `${requester?.name ?? 'A player'} asked to leave the game. Waiting for the host to respond.` };
  }
  if (action.type === 'respondLeave') {
    if (!state.leaveRequest) return state;
    if (!action.accept) return { ...state, leaveRequest: null, error: '', message: 'The request to leave was declined.' };

    const leavingId = state.leaveRequest.by;
    const leaving = state.opponents.find(p => p.id === leavingId);
    const remaining = state.opponents.filter(p => p.id !== leavingId);
    // Only the host is left — there's no one to play against, so the whole
    // session ends. Otherwise the remaining opponents keep playing.
    const wholeGameOver = remaining.length <= 1;
    const reselected = state.selected === leavingId ? nextOpponentId(state.opponents, leavingId) : state.selected;

    return {
      ...state,
      opponents: remaining,
      leaveRequest: null,
      selected: wholeGameOver ? state.selected : reselected,
      sessionEnded: wholeGameOver,
      // gameOver stays reserved for "the money limit was reached" so the
      // client can tell a results-then-quit ending from a leave ending.
      round: null, phase: 'select', revealed1: false, revealed2: false, revealed3: false, activeBet: null, bet: '', streak: false,
      error: '',
      message: wholeGameOver
        ? `${leaving?.name ?? 'A player'} left and no opponents remain. This session is now closed.`
        : `${leaving?.name ?? 'A player'} left the game. Play continues with ${remaining.length} opponent${remaining.length === 1 ? '' : 's'}.`,
    };
  }

  if (state.gameOver && ['deposit', 'split', 'deal', 'placeBet', 'pass', 'revealThird', 'resolve'].includes(action.type)) {
    return { ...state, error: 'Game over — the money limit was reached and this session is closed.' };
  }

  const commit = (nextOpponents: Opponent[], nextMessage: string) => {
    if (!nextOpponents.every(p => Number.isSafeInteger(p.balance)) || !Number.isSafeInteger(nextOpponents.reduce((sum, p) => sum + Math.abs(p.balance), 0))) return { ...state, error: 'This amount is too large. Enter a smaller amount.' };
    const reachedLimit = limitReached(nextOpponents, state.limitAmount);
    return {
      ...state,
      opponents: nextOpponents,
      message: reachedLimit ? `Game over — the ${state.limitAmount! / 100} limit was reached. This session is now closed. See the settlement preview for the final payout.` : nextMessage,
      error: '',
      gameOver: state.gameOver || reachedLimit,
      sessionEnded: state.sessionEnded || reachedLimit,
    };
  };

  if (action.type === 'addOpponent') {
    const pool = poolOf(state.opponents);
    if (pool !== 0) return { ...state, error: 'You can only add a player while the pool is empty, right before a deposit.' };
    const clean = state.opponentName.trim();
    if (!clean) return { ...state, error: 'Enter the new player’s name.' };
    if (state.opponents.some(p => p.name.toLowerCase() === clean.toLowerCase())) return { ...state, error: 'That name is already at the table.' };
    const newOpponent: Opponent = { id: crypto.randomUUID(), name: clean, balance: 0 };
    return { ...commit([...state.opponents, newOpponent], `${clean} joined the table.`), opponentName: '', selected: state.selected || newOpponent.id };
  }
  if (action.type === 'deposit') {
    if (!IDLE_PHASES.includes(state.phase)) return { ...state, error: 'Finish the current round before collecting a deposit.' };
    const amount = parseMoney(state.deposit);
    if (amount === null || amount <= 0) return { ...state, error: 'Enter a positive deposit with up to two decimal places.' };
    return { ...commit(state.opponents.map(p => ({ ...p, balance: p.balance - amount })), `Deposit of ${amount / 100} collected from each opponent.`), resultFlash: null, phase: 'select', round: null, revealed1: false, revealed2: false, revealed3: false, activeBet: null };
  }
  if (action.type === 'split') {
    if (!IDLE_PHASES.includes(state.phase)) return { ...state, error: 'Finish the current round before splitting the pool.' };
    const pool = poolOf(state.opponents);
    if (!state.opponents.length || pool <= 0) return { ...state, error: 'There’s no pool money to split yet.' };
    const shares = evenShares(pool, state.opponents.length);
    return { ...commit(state.opponents.map((p, i) => ({ ...p, balance: p.balance + shares[i] })), `Pool of ${pool / 100} split evenly across ${state.opponents.length} opponents.`), resultFlash: null, phase: 'select', round: null, revealed1: false, revealed2: false, revealed3: false, activeBet: null };
  }
  if (action.type === 'deal') {
    if (!IDLE_PHASES.includes(state.phase)) return state;
    const player = state.opponents.find(p => p.id === state.selected);
    const pool = poolOf(state.opponents);
    if (!player) return { ...state, error: 'Select an opponent before dealing.' };
    if (pool <= 0) return { ...state, error: 'The pool is empty. Collect a new deposit first.' };
    return { ...state, round: dealRound(), phase: 'dealing', revealed1: false, revealed2: false, revealed3: false, bet: '', activeBet: null, error: '', message: '', resultFlash: null };
  }
  if (action.type === 'revealFirst') return state.phase === 'dealing' ? { ...state, revealed1: true } : state;
  if (action.type === 'revealSecond') {
    if (state.phase !== 'dealing' || !state.round) return state;
    return { ...state, revealed2: true, phase: 'ready' };
  }
  if (action.type === 'placeBet') {
    if (state.phase !== 'ready') return state;
    const pool = poolOf(state.opponents);
    const amount = parseMoney(state.bet);
    if (amount === null || amount <= 0 || amount > pool) return { ...state, error: 'Enter a positive bet no greater than the pool.' };
    return { ...state, activeBet: amount, phase: 'placed', error: '' };
  }
  if (action.type === 'pass') {
    if (state.phase !== 'ready') return state;
    return { ...state, phase: 'select', round: null, revealed1: false, revealed2: false, revealed3: false, bet: '', activeBet: null, error: '', message: 'Passed — no money changed hands.', resultFlash: null, selected: nextOpponentId(state.opponents, state.selected), streak: false };
  }
  if (action.type === 'revealThird') return state.phase === 'placed' ? { ...state, phase: 'revealing' } : state;
  if (action.type === 'resolve') {
    if (state.phase !== 'revealing' || !state.round || state.activeBet === null) return state;
    const player = state.opponents.find(p => p.id === state.selected);
    if (!player) return state;
    const win = isWin(state.round);
    const bet = state.activeBet;
    const currentPool = poolOf(state.opponents);

    if (state.streak && win) {
      const payout = currentPool;
      const next = commit(state.opponents.map(p => p.id === player.id ? { ...p, balance: p.balance + payout } : p), `${player.name} won again and swept the whole pool!`);
      if (next.error) return { ...next, revealed3: true, phase: 'result' };
      return { ...next, revealed3: true, phase: 'result', selected: player.id, streak: true, resultFlash: { token: Date.now() + Math.random(), outcome: 'win', playerName: player.name, amount: payout } };
    }
    if (state.streak) {
      const next = commit(state.opponents.map(p => p.id === player.id ? { ...p, balance: p.balance - bet } : p), `${player.name} lost ${bet / 100} — the streak ends.`);
      if (next.error) return { ...next, revealed3: true, phase: 'result' };
      return { ...next, revealed3: true, phase: 'result', selected: nextOpponentId(state.opponents, player.id), streak: false, resultFlash: { token: Date.now() + Math.random(), outcome: 'lose', playerName: player.name, amount: bet } };
    }

    const wonWholePool = win && bet === currentPool;
    const upNext = wonWholePool ? player.id : nextOpponentId(state.opponents, player.id);
    const next = commit(state.opponents.map(p => p.id === player.id ? { ...p, balance: p.balance + (win ? bet : -bet) } : p), `${player.name} ${win ? 'won' : 'lost'} ${bet / 100}.${wonWholePool ? ` ${player.name} swept the pool and plays again — any win now takes the whole pool!` : ''}`);
    if (next.error) return { ...next, revealed3: true, phase: 'result' };
    return { ...next, revealed3: true, phase: 'result', selected: upNext, streak: wonWholePool, resultFlash: { token: Date.now() + Math.random(), outcome: win ? 'win' : 'lose', playerName: player.name, amount: bet } };
  }
  if (action.type === 'next') {
    return state.phase === 'result' ? { ...state, phase: 'select', round: null, revealed1: false, revealed2: false, revealed3: false, bet: '', activeBet: null, error: '' } : state;
  }
  return state;
}
