-- =============================================================
-- Remove the TEST WEEK (run when the real season is about to start).
-- Deletes the week-0 games; everyone's test picks are removed
-- automatically (foreign key cascade). Standings recompute
-- instantly — week 0 simply disappears from the app.
-- The regular schedule sync never touches week 0, so this is the
-- only cleanup step needed.
-- =============================================================

delete from public.games where season = 2026 and week = 0;
