-- Fixes "infinite recursion detected in policy" errors introduced by 0002:
--   * invite_batches' policy queried invitations, whose policy queried
--     invite_batches (a loop)
--   * session_participants' policy queried session_participants itself
--   * game_sessions' policy queried session_participants (which then looped)
-- Any query hitting these tables as a signed-in user failed, so the lobby and
-- the table page came back empty.
--
-- The membership checks move into SECURITY DEFINER helpers, which read the
-- tables without re-triggering RLS, and the policies call those helpers.

create or replace function public.is_batch_inviter(p_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invite_batches b
    where b.id = p_batch_id and b.inviter_id = auth.uid()
  );
$$;

create or replace function public.is_batch_invitee(p_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.invitations i
    where i.batch_id = p_batch_id and i.invitee_id = auth.uid()
  );
$$;

create or replace function public.is_session_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_participants sp
    where sp.session_id = p_session_id and sp.user_id = auth.uid()
  );
$$;

grant execute on function public.is_batch_inviter(uuid) to authenticated;
grant execute on function public.is_batch_invitee(uuid) to authenticated;
grant execute on function public.is_session_participant(uuid) to authenticated;

drop policy if exists "batch participants can read their batch" on public.invite_batches;
create policy "batch participants can read their batch"
  on public.invite_batches for select
  to authenticated
  using (auth.uid() = inviter_id or public.is_batch_invitee(id));

drop policy if exists "participants can read their invitations" on public.invitations;
create policy "participants can read their invitations"
  on public.invitations for select
  to authenticated
  using (auth.uid() = invitee_id or public.is_batch_inviter(batch_id));

drop policy if exists "participants can read their sessions" on public.game_sessions;
create policy "participants can read their sessions"
  on public.game_sessions for select
  to authenticated
  using (public.is_session_participant(id));

drop policy if exists "participants can read their session rows" on public.session_participants;
create policy "participants can read their session rows"
  on public.session_participants for select
  to authenticated
  using (user_id = auth.uid() or public.is_session_participant(session_id));
