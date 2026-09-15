export type Opponent = { id: string; name: string; balance: number };
export type ResultFlash = { token: number; outcome: 'win' | 'lose'; playerName: string; amount: number };
type Snapshot = { started: boolean; opponents: Opponent[]; selected: string; bet: string; deposit: string; message: string };
export type State = Snapshot & { history: Snapshot[]; error: string; resultFlash: ResultFlash | null };
type Action = { type: 'start'; opponents: Opponent[] } | { type: 'input'; field: 'bet' | 'deposit'; value: string } | { type: 'select'; id: string } | { type: 'deposit' } | { type: 'result'; outcome: 'win' | 'lose' } | { type: 'split' } | { type: 'undo' } | { type: 'clearFlash' };
export const initialState: State = { started: false, opponents: [], selected: '', bet: '', deposit: '', message: '', history: [], error: '', resultFlash: null };
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
export function reducer(state: State, action: Action): State {
  if (action.type === 'start') return action.opponents.length ? { ...initialState, started: true, opponents: action.opponents.map(p => ({ ...p, balance: 0 })) } : state;
  if (action.type === 'input') return { ...state, [action.field]: action.value, error: '' };
  if (action.type === 'select') return { ...state, selected: action.id, error: '' };
  if (action.type === 'undo') { const previous = state.history.at(-1); return previous ? { ...previous, history: state.history.slice(0, -1), error: '', resultFlash: null } : state; }
  if (action.type === 'clearFlash') return state.resultFlash ? { ...state, resultFlash: null } : state;
  if (!state.started) return state;
  const { started, opponents, selected, bet: betInput, deposit, message }: Snapshot = state;
  const snapshot: Snapshot = { started, opponents, selected, bet: betInput, deposit, message };
  const commit = (opponents: Opponent[], message: string) => {
    if (!opponents.every(p => Number.isSafeInteger(p.balance)) || !Number.isSafeInteger(opponents.reduce((sum, p) => sum + Math.abs(p.balance), 0))) return { ...state, error: 'This amount is too large. Enter a smaller amount.' };
    return { ...state, opponents, message, error: '', history: [...state.history, snapshot] };
  };
  if (action.type === 'deposit') {
    const amount = parseMoney(state.deposit);
    if (amount === null || amount <= 0) return { ...state, error: 'Enter a positive deposit with up to two decimal places.' };
    return { ...commit(state.opponents.map(p => ({ ...p, balance: p.balance - amount })), `Deposit of ${amount / 100} collected from each opponent.`), resultFlash: null };
  }
  if (action.type === 'split') {
    const pool = poolOf(state.opponents);
    if (!state.opponents.length || pool <= 0) return { ...state, error: 'There’s no pool money to split yet.' };
    const shares = evenShares(pool, state.opponents.length);
    return { ...commit(state.opponents.map((p, i) => ({ ...p, balance: p.balance + shares[i] })), `Pool of ${pool / 100} split evenly across ${state.opponents.length} opponents.`), resultFlash: null };
  }
  const bet = parseMoney(state.bet), pool = poolOf(state.opponents);
  const player = state.opponents.find(p => p.id === state.selected);
  if (pool === 0) return { ...state, error: 'The pool is empty. Collect a new deposit first.' };
  if (!player || bet === null || bet <= 0 || bet > pool) return { ...state, error: 'Select an opponent and enter a positive bet no greater than the pool.' };
  const next = commit(state.opponents.map(p => p.id === player.id ? { ...p, balance: p.balance + (action.outcome === 'win' ? bet : -bet) } : p), `${player.name} ${action.outcome === 'win' ? 'won' : 'lost'} ${bet / 100}.`);
  if (next.error) return { ...next, resultFlash: null };
  return { ...next, resultFlash: { token: Date.now() + Math.random(), outcome: action.outcome, playerName: player.name, amount: bet } };
}
