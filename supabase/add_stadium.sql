-- Adds stadium info to games (populated by sync_schedule.R from nflverse).
-- Run once in the Supabase SQL editor, then re-run the Sync schedule
-- workflow to fill it in for the real season.
alter table public.games add column if not exists stadium text;
