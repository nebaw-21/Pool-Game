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

  // A finished game has no table page any more.
  if (session.status === 'ended') redirect('/lobby');

  return <TableClient sessionId={session.id} userId={user.id} initialState={session.state as State} initialStatus={session.status} />;
}
