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

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit: suit.key, label: rank.label, value: rank.value, id: `${rank.label}${suit.key}` });
  return deck;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
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

export type Phase = 'select' | 'dealing' | 'ready' | 'dead' | 'placed' | 'revealing' | 'result';
const IDLE_PHASES: Phase[] = ['select', 'result', 'dead'];

export type State = Snapshot & {
  history: Snapshot[];
  error: string;
  resultFlash: ResultFlash | null;
  round: Round | null;
  phase: Phase;
  revealed1: boolean;
  revealed2: boolean;
  revealed3: boolean;
  activeBet: number | null;
};

export const initialState: State = {
  started: false, opponents: [], selected: '', bet: '', deposit: '', message: '',
  history: [], error: '', resultFlash: null,
  round: null, phase: 'select', revealed1: false, revealed2: false, revealed3: false, activeBet: null,
};

export const poolOf = (opponents: Opponent[]) => -opponents.reduce((sum, p) => sum + p.balance, 0) || 0;

export function evenShares(pool: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(pool / count);
  const remainder = pool - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function parseMoney(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

type Action =
  | { type: 'start'; opponents: Opponent[] }
  | { type: 'input'; field: 'bet' | 'deposit'; value: string }
  | { type: 'select'; id: string }
  | { type: 'deposit' }
  | { type: 'split' }
  | { type: 'deal' }
  | { type: 'revealFirst' }
  | { type: 'revealSecond' }
  | { type: 'placeBet' }
  | { type: 'pass' }
  | { type: 'revealThird' }
  | { type: 'resolve' }
  | { type: 'undo' }
  | { type: 'clearFlash' };

export function reducer(state: State, action: Action): State {
  if (action.type === 'start') return action.opponents.length ? { ...initialState, started: true, opponents: action.opponents.map(p => ({ ...p, balance: 0 })) } : state;
  if (action.type === 'input') return { ...state, [action.field]: action.value, error: '' };
  if (action.type === 'select') return IDLE_PHASES.includes(state.phase) ? { ...state, selected: action.id, error: '' } : state;
  if (action.type === 'undo') {
    const previous = state.history.at(-1);
    return previous ? { ...previous, history: state.history.slice(0, -1), error: '', resultFlash: null, round: null, phase: 'select', revealed1: false, revealed2: false, revealed3: false, activeBet: null } : state;
  }
  if (action.type === 'clearFlash') return state.resultFlash ? { ...state, resultFlash: null } : state;
  if (!state.started) return state;

  const { started, opponents, selected, bet: betInput, deposit, message }: Snapshot = state;
  const snapshot: Snapshot = { started, opponents, selected, bet: betInput, deposit, message };
  const commit = (nextOpponents: Opponent[], nextMessage: string) => {
    if (!nextOpponents.every(p => Number.isSafeInteger(p.balance)) || !Number.isSafeInteger(nextOpponents.reduce((sum, p) => sum + Math.abs(p.balance), 0))) return { ...state, error: 'This amount is too large. Enter a smaller amount.' };
    return { ...state, opponents: nextOpponents, message: nextMessage, error: '', history: [...state.history, snapshot] };
  };

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
    return { ...state, revealed2: true, phase: state.round.dead ? 'dead' : 'ready' };
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
    return { ...state, phase: 'select', round: null, revealed1: false, revealed2: false, revealed3: false, bet: '', activeBet: null, error: '', message: 'Passed — no money changed hands.', resultFlash: null };
  }
  if (action.type === 'revealThird') return state.phase === 'placed' ? { ...state, phase: 'revealing' } : state;
  if (action.type === 'resolve') {
    if (state.phase !== 'revealing' || !state.round || state.activeBet === null) return state;
    const player = state.opponents.find(p => p.id === state.selected);
    if (!player) return state;
    const win = isWin(state.round);
    const bet = state.activeBet;
    const next = commit(state.opponents.map(p => p.id === player.id ? { ...p, balance: p.balance + (win ? bet : -bet) } : p), `${player.name} ${win ? 'won' : 'lost'} ${bet / 100}.`);
    if (next.error) return { ...next, revealed3: true, phase: 'result' };
    return { ...next, revealed3: true, phase: 'result', resultFlash: { token: Date.now() + Math.random(), outcome: win ? 'win' : 'lose', playerName: player.name, amount: bet } };
  }
  return state;
}
