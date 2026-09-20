import { redirect, notFound } from 'next/navigation';
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
    .select('id, player1_id, player2_id, state, status')
    .eq('id', id)
    .maybeSingle();

  if (!session) return notFound();
  if (user.id !== session.player1_id && user.id !== session.player2_id) return notFound();

  return <TableClient sessionId={session.id} userId={user.id} initialState={session.state as State} initialStatus={session.status} />;
}
