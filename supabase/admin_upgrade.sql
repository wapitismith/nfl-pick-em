-- =============================================================
-- Admin portal upgrade — run once in the Supabase SQL editor
-- (after schema.sql). Safe to re-run.
-- =============================================================

-- Players can be deactivated (dropped out) without deleting history
alter table public.profiles add column if not exists active boolean not null default true;

-- Helper: is the calling user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Tighten a hole: missing_picks exposes emails; only the R scripts
-- (service role) should read it, not signed-in players.
revoke select on public.missing_picks from anon, authenticated;

-- Reminders skip deactivated players
create or replace view public.missing_picks as
select
  pr.id as user_id, pr.display_name, pr.email,
  g.season, g.week,
  count(*) as games_unpicked,
  min(g.kickoff) as next_kickoff
from public.profiles pr
cross join public.games g
left join public.picks p on p.game_id = g.game_id and p.user_id = pr.id
where g.kickoff > now()
  and pr.active
  and (p.id is null or p.confidence is null)
group by pr.id, pr.display_name, pr.email, g.season, g.week;

-- ---------- Admin powers (additive policies) ----------
-- Admins can see everyone's picks (even before kickoff) . . .
drop policy if exists picks_admin_select on public.picks;
create policy picks_admin_select on public.picks
  for select to authenticated using (public.is_admin());

-- . . . and create/edit/delete any pick, even after lock
drop policy if exists picks_admin_write on public.picks;
create policy picks_admin_write on public.picks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admins can correct game scores / status / winner
drop policy if exists games_admin_update on public.games;
create policy games_admin_update on public.games
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admins can rename / deactivate / promote players
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Make yourself commissioner ----------
-- NOTE: your profile row is created the first time you sign in to the
-- app. If this UPDATE reports "0 rows", sign in first, then re-run it.
update public.profiles set is_admin = true
where email = 'wapitismith@gmail.com';
