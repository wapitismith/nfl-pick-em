-- =============================================================
-- Weekly tiebreaker — run once in the Supabase SQL editor.
--
-- Rule: each week's tiebreaker game is the LAST game of the week
-- (latest kickoff — normally the late Monday Night game). Players
-- predict the combined final score on that game's card; closest
-- guess wins any weekly tie. Guesses are stored on the pick row,
-- so the same lock-at-kickoff and hidden-until-kickoff rules apply.
-- =============================================================

alter table public.picks
  add column if not exists tiebreaker_guess int
  check (tiebreaker_guess is null or tiebreaker_guess between 0 and 200);

-- The designated tiebreaker game per week (+ actual total once final)
create or replace view public.tiebreak_games
  with (security_invoker = true) as
select distinct on (season, week)
  season, week, game_id,
  case when status = 'final' then home_score + away_score end as actual_total
from public.games
order by season, week, kickoff desc;

-- Everyone's guesses + distance from the actual total (RLS on picks
-- keeps other players' guesses hidden until the game kicks off).
create or replace view public.weekly_tiebreaks
  with (security_invoker = true) as
select
  tb.season, tb.week, p.user_id,
  p.tiebreaker_guess,
  tb.actual_total,
  case when tb.actual_total is not null and p.tiebreaker_guess is not null
       then abs(p.tiebreaker_guess - tb.actual_total) end as tiebreak_diff
from public.tiebreak_games tb
join public.picks p on p.game_id = tb.game_id
where p.tiebreaker_guess is not null;

grant select on public.tiebreak_games, public.weekly_tiebreaks to authenticated;
