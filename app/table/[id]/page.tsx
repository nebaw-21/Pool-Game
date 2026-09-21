import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { State } from '@/app/game';
import TableClient from './table-client';

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: session } = await supabase
    .from('game_sessions')
    .select('id, state, status')
    .eq('id', id)
    .maybeSingle();

  // RLS hides this row once you're no longer a participant (e.g. you left
  // the game, or it never existed / wasn't yours) -- either way, back to
  // the lobby rather than a bare 404.
  if (!session) redirect('/lobby');

  // A game that ended by someone leaving has no table page any more. One that
  // ended on the money limit stays open so everyone can read the result and
  // quit when they're ready.
  const state = session.state as State;
  if (session.status === 'ended' && !state.gameOver) redirect('/lobby');

  return <TableClient sessionId={session.id} userId={user.id} initialState={state} initialStatus={session.status} />;
}
