-- =============================================================
-- Partner email — run once in the Supabase SQL editor.
-- For two-person entries (e.g. Mike & Brian sharing one entry):
-- the account itself stays single (one entry, one login shared via
-- password), but reminders and recaps also go to the partner.
-- Set it per player from the Admin tab.
-- =============================================================

alter table public.profiles add column if not exists partner_email text;

-- Recreate missing_picks with partner_email appended (service-role only;
-- SELECT was revoked from clients in admin_upgrade.sql and stays revoked).
create or replace view public.missing_picks as
select
  pr.id as user_id, pr.display_name, pr.email,
  g.season, g.week,
  count(*) as games_unpicked,
  min(g.kickoff) as next_kickoff,
  pr.partner_email
from public.profiles pr
cross join public.games g
left join public.picks p on p.game_id = g.game_id and p.user_id = pr.id
where g.kickoff > now()
  and pr.active
  and (p.id is null or p.confidence is null)
group by pr.id, pr.display_name, pr.email, pr.partner_email, g.season, g.week;
