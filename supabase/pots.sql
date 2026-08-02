-- =============================================================
-- Prize pots — run once in the Supabase SQL editor (after payments.sql).
--
-- Rules encoded here: each player pays $5 per week they play.
-- Half of each week's pot goes to that week's winner; the other
-- half rolls into the season pot for the overall winner at the
-- end of regular-season play.
--
-- NOTE: intentionally NOT security_invoker — it exposes only
-- per-week head-counts (no individual picks), and needs to count
-- players whose picks are still hidden pre-kickoff.
-- =============================================================

create or replace view public.week_pots as
select
  g.season,
  g.week,
  count(distinct p.user_id)                        as players,
  count(distinct p.user_id) * 5                    as pot,
  round(count(distinct p.user_id) * 5 / 2.0, 2)    as weekly_prize,
  round(count(distinct p.user_id) * 5 / 2.0, 2)    as to_season_pot
from public.picks p
join public.games g on g.game_id = p.game_id
where g.week > 0
group by g.season, g.week;

grant select on public.week_pots to authenticated;
