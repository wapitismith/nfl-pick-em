-- =============================================================
-- NFL Pick-Em — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.
-- =============================================================

-- ---------- profiles (one row per participant) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email       text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up via magic link.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- games (synced from nflverse / ESPN by R scripts) ----------
create table if not exists public.games (
  game_id     text primary key,          -- nflverse id, e.g. 2026_01_KC_BUF
  season      int  not null,
  week        int  not null,
  game_type   text not null default 'REG',
  kickoff     timestamptz not null,      -- stored UTC; app displays local
  home_team   text not null,             -- team abbreviation
  away_team   text not null,
  home_score  int,
  away_score  int,
  status      text not null default 'scheduled',  -- scheduled | in_progress | final
  winner      text,                      -- team abbr, or 'TIE'
  espn_event_id text,                    -- cached mapping to ESPN scoreboard
  updated_at  timestamptz not null default now()
);

create index if not exists games_season_week_idx on public.games (season, week);

-- ---------- picks ----------
create table if not exists public.picks (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null references public.games (game_id) on delete cascade,
  picked_team text not null,
  confidence  int,                       -- 1..(games that week); null until assigned
  updated_at  timestamptz not null default now(),
  unique (user_id, game_id)
);

create index if not exists picks_user_idx on public.picks (user_id);
create index if not exists picks_game_idx on public.picks (game_id);

-- Validate picks server-side: team must be playing in that game,
-- and confidence values may not repeat within a user's week.
create or replace function public.validate_pick()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  g public.games%rowtype;
begin
  select * into g from public.games where game_id = new.game_id;
  if not found then
    raise exception 'unknown game %', new.game_id;
  end if;
  if new.picked_team not in (g.home_team, g.away_team) then
    raise exception 'team % is not playing in game %', new.picked_team, new.game_id;
  end if;
  if new.confidence is not null then
    if new.confidence < 1 then
      raise exception 'confidence must be >= 1';
    end if;
    if exists (
      select 1
      from public.picks p
      join public.games pg on pg.game_id = p.game_id
      where p.user_id = new.user_id
        and pg.season = g.season
        and pg.week   = g.week
        and p.confidence = new.confidence
        and p.game_id <> new.game_id
    ) then
      raise exception 'confidence % already used this week', new.confidence;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists picks_validate on public.picks;
create trigger picks_validate
  before insert or update on public.picks
  for each row execute function public.validate_pick();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.games    enable row level security;
alter table public.picks    enable row level security;

-- profiles: everyone in the pool can see names (needed for standings);
-- users can update only their own row.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid());

-- games: readable by everyone signed in. Writes come only from the
-- service-role key (R scripts), which bypasses RLS — no insert/update
-- policies needed for regular users.
drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select to authenticated using (true);

-- picks:
--   * you can always see your own picks
--   * you can see other people's picks only after that game kicks off
drop policy if exists picks_select on public.picks;
create policy picks_select on public.picks
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.games g
               where g.game_id = picks.game_id and g.kickoff <= now())
  );

--   * you can create/change/delete only your own picks, only before kickoff
drop policy if exists picks_insert_own on public.picks;
create policy picks_insert_own on public.picks
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.games g
                where g.game_id = picks.game_id and now() < g.kickoff)
  );

drop policy if exists picks_update_own on public.picks;
create policy picks_update_own on public.picks
  for update to authenticated using (
    user_id = auth.uid()
    and exists (select 1 from public.games g
                where g.game_id = picks.game_id and now() < g.kickoff)
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.games g
                where g.game_id = picks.game_id and now() < g.kickoff)
  );

drop policy if exists picks_delete_own on public.picks;
create policy picks_delete_own on public.picks
  for delete to authenticated using (
    user_id = auth.uid()
    and exists (select 1 from public.games g
                where g.game_id = picks.game_id and now() < g.kickoff)
  );

-- ---------- Standings views ----------
-- security_invoker makes the views respect RLS (so hidden picks stay hidden).

create or replace view public.pick_results
  with (security_invoker = true) as
select
  p.user_id,
  pr.display_name,
  p.game_id,
  g.season,
  g.week,
  g.kickoff,
  g.status,
  g.home_team, g.away_team, g.home_score, g.away_score,
  p.picked_team,
  p.confidence,
  case when g.status = 'final' then p.picked_team = g.winner end as correct,
  case when g.status = 'final' and p.picked_team = g.winner
       then coalesce(p.confidence, 0) else 0 end as points
from public.picks p
join public.games g   on g.game_id = p.game_id
join public.profiles pr on pr.id = p.user_id;

create or replace view public.weekly_standings
  with (security_invoker = true) as
select
  season, week, user_id, display_name,
  count(*) filter (where correct)                as wins,
  count(*) filter (where correct is not null)    as graded,
  sum(points)::int                               as confidence_points
from public.pick_results
group by season, week, user_id, display_name;

create or replace view public.season_standings
  with (security_invoker = true) as
select
  season, user_id, display_name,
  sum(wins)::int              as wins,
  sum(graded)::int            as graded,
  sum(confidence_points)::int as confidence_points,
  count(*) filter (where wins is not null) as weeks_played
from public.weekly_standings
group by season, user_id, display_name;

-- Who hasn't finished their picks (used by the reminder script via service role)
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
  and (p.id is null or p.confidence is null)
group by pr.id, pr.display_name, pr.email, g.season, g.week;

-- Grants (PostgREST roles)
grant select on public.pick_results, public.weekly_standings,
                public.season_standings to authenticated;
