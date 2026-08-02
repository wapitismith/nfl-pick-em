-- =============================================================
-- TEST WEEK — six fake games as "Week 0" (the real schedule
-- never uses week 0, so this can't collide with nflverse data).
--
-- Run in the Supabase SQL editor to create it. Re-running RESETS
-- the test week (clears scores, un-finals games, restarts the
-- kickoff clock) so you can test repeatedly.
--
-- Kickoffs are staggered from "now" so you can watch a game lock
-- ~45 minutes after you run this, while others stay pickable.
--
-- Remove it any time with remove_test_week.sql (picks on these
-- games are deleted automatically with the games).
-- =============================================================

insert into public.games
  (game_id, season, week, game_type, kickoff, home_team, away_team, stadium, status)
values
  ('2026_00_KC_DEN',  2026, 0, 'REG', now() + interval '45 minutes', 'DEN', 'KC',  'Empower Field at Mile High', 'scheduled'),
  ('2026_00_BUF_PHI', 2026, 0, 'REG', now() + interval '2 hours',    'PHI', 'BUF', 'Lincoln Financial Field',    'scheduled'),
  ('2026_00_DAL_GB',  2026, 0, 'REG', now() + interval '5 hours',    'GB',  'DAL', 'Lambeau Field',              'scheduled'),
  ('2026_00_MIN_CHI', 2026, 0, 'REG', now() + interval '1 day',      'CHI', 'MIN', 'Soldier Field',              'scheduled'),
  ('2026_00_SF_SEA',  2026, 0, 'REG', now() + interval '2 days',     'SEA', 'SF',  'Lumen Field',                'scheduled'),
  ('2026_00_LAC_LV',  2026, 0, 'REG', now() + interval '3 days',     'LV',  'LAC', 'Allegiant Stadium',          'scheduled')
on conflict (game_id) do update set
  kickoff    = excluded.kickoff,
  stadium    = excluded.stadium,
  status     = 'scheduled',
  home_score = null,
  away_score = null,
  winner     = null;
