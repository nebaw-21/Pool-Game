-- Generalizes invitations and game sessions beyond a fixed 1-vs-1 pair: a
-- host can now invite several opponents in one batch, and the game starts
-- once everyone invited has responded, seating the host plus whoever
-- accepted (as long as at least one person did).
--
-- This drops and rebuilds the `invitations` table -- any existing rows from
-- 1-vs-1 development/testing are not migrated.

-- ---------------------------------------------------------------------------
-- Drop policies that reference columns/tables this migration changes.
-- ---------------------------------------------------------------------------
drop policy if exists "participants can read their sessions" on public.game_sessions;
drop policy if exists "participants can read their invitations" on public.invitations;
drop policy if exists "participants can read their session rows" on public.session_participants;

drop table if exists public.invitations cascade;

-- ---------------------------------------------------------------------------
-- game_sessions: replace the fixed player1_id/player2_id pair with a
-- generic host_id (session_participants already models N players).
-- ---------------------------------------------------------------------------
alter table public.game_sessions drop constraint if exists game_sessions_invitation_id_fkey;
alter table public.game_sessions drop column if exists invitation_id;
alter table public.game_sessions drop column if exists player1_id;
alter table public.game_sessions drop column if exists player2_id;
alter table public.game_sessions add column host_id uuid references public.profiles (id);
alter table public.game_sessions add column batch_id uuid;

-- ---------------------------------------------------------------------------
-- invite_batches: one row per "send invite(s)" action by a host. The game
-- starts (a game_sessions row is created and linked back here) once every
-- invitation in the batch has been accepted or declined, as long as at
-- least one person accepted; otherwise the batch is cancelled.
-- ---------------------------------------------------------------------------
create table public.invite_batches (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id),
  deposit_amount_cents bigint not null check (deposit_amount_cents > 0),
  limit_amount_cents bigint check (limit_amount_cents is null or limit_amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'started', 'cancelled')),
  session_id uuid references public.game_sessions (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- invitations: one row per invited person within a batch.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.invite_batches (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, invitee_id)
);

alter table public.game_sessions
  add constraint game_sessions_batch_id_fkey
  foreign key (batch_id) references public.invite_batches (id);

-- ---------------------------------------------------------------------------
-- RLS (all tables now exist, so policies referencing each other can bind).
-- ---------------------------------------------------------------------------
alter table public.invite_batches enable row level security;

create policy "batch participants can read their batch"
  on public.invite_batches for select
  to authenticated
  using (
    auth.uid() = inviter_id
    or exists (
      select 1 from public.invitations i
      where i.batch_id = invite_batches.id and i.invitee_id = auth.uid()
    )
  );

alter table public.invitations enable row level security;

create policy "participants can read their invitations"
  on public.invitations for select
  to authenticated
  using (
    auth.uid() = invitee_id
    or exists (
      select 1 from public.invite_batches b
      where b.id = invitations.batch_id and b.inviter_id = auth.uid()
    )
  );

create policy "participants can read their sessions"
  on public.game_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.session_participants sp
      where sp.session_id = game_sessions.id and sp.user_id = auth.uid()
    )
  );

-- session_participants: allow any number of seats, not just 0/1.
alter table public.session_participants drop constraint if exists session_participants_seat_check;
alter table public.session_participants add constraint session_participants_seat_check check (seat >= 0);

create policy "participants can read their session rows"
  on public.session_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.session_participants me
      where me.session_id = session_participants.session_id and me.user_id = auth.uid()
    )
  );

-- No insert/update grants for `authenticated` on any of these tables --
-- every write happens through route handlers using the service-role key.

-- ---------------------------------------------------------------------------
-- Realtime for the new table.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.invite_batches;
