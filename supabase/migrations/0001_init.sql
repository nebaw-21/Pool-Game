-- Poolroom online multiplayer schema.
-- Run this against your Supabase project (SQL editor, or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

-- Derive a username from signup metadata (see app/(auth)/register), falling
-- back to the email local-part (+ a short suffix on collision) if omitted.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(new.email, '@', 1)
  );
  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, email)
  values (new.id, final_username, new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- game_sessions (created before invitations references it, invitations
-- before game_sessions references it back -- break the cycle with a
-- deferred FK added after both tables exist)
-- ---------------------------------------------------------------------------
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  player1_id uuid not null references public.profiles (id),
  player2_id uuid not null references public.profiles (id),
  deposit_amount_cents bigint not null,
  limit_amount_cents bigint,
  state jsonb not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_sessions enable row level security;

create policy "participants can read their sessions"
  on public.game_sessions for select
  to authenticated
  using (auth.uid() in (player1_id, player2_id));

-- No insert/update/delete grants for `authenticated` -- all writes happen
-- through route handlers using the service-role key.

create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger game_sessions_touch_updated_at
  before update on public.game_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id),
  invitee_id uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  deposit_amount_cents bigint not null check (deposit_amount_cents > 0),
  limit_amount_cents bigint check (limit_amount_cents is null or limit_amount_cents > 0),
  session_id uuid references public.game_sessions (id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint invitations_not_self check (inviter_id <> invitee_id)
);

alter table public.game_sessions
  add constraint game_sessions_invitation_id_fkey
  foreign key (invitation_id) references public.invitations (id);

-- Only one pending invite at a time between a given inviter/invitee pair.
create unique index invitations_one_pending_pair
  on public.invitations (inviter_id, invitee_id)
  where status = 'pending';

alter table public.invitations enable row level security;

create policy "participants can read their invitations"
  on public.invitations for select
  to authenticated
  using (auth.uid() in (inviter_id, invitee_id));

-- No insert/update grants for `authenticated` -- handled by route handlers.

-- ---------------------------------------------------------------------------
-- session_participants
-- ---------------------------------------------------------------------------
create table public.session_participants (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  balance_cents bigint not null default 0,
  seat int not null check (seat in (0, 1)),
  primary key (session_id, user_id)
);

alter table public.session_participants enable row level security;

create policy "participants can read their session rows"
  on public.session_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.game_sessions gs
      where gs.id = session_id and auth.uid() in (gs.player1_id, gs.player2_id)
    )
  );

-- No insert/update grants for `authenticated` -- handled by route handlers.

-- ---------------------------------------------------------------------------
-- Realtime: enable postgres_changes for the tables clients subscribe to.
-- (Also do this via Dashboard -> Database -> Replication if this fails
-- because the publication doesn't exist yet in your project.)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.invitations;
