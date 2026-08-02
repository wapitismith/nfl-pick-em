-- =============================================================
-- Payments / dues tracking — run once in the Supabase SQL editor.
--
-- Model: dues accrue $5 for each week a player has made any pick
-- (test week 0 excluded). Payments are a simple ledger of dollar
-- amounts, so weekly $5s, multi-week chunks, and season prepays all
-- work — the balance view nets it out. Record a NEGATIVE amount to
-- correct a mistake. Change the fee by editing the "* 5" below.
-- =============================================================

create table if not exists public.payments (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  season      int  not null,
  amount      numeric(8,2) not null,
  method      text,          -- venmo / cash / check / ...
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.payments enable row level security;

-- Players can see their own payment history; admins see everything.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Only admins record/edit/delete payments.
drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Balance per player (all-time, so prepays and credits carry over):
--   owed = $5 x weeks with at least one pick (week 0 test games excluded)
create or replace view public.player_balances
  with (security_invoker = true) as
select
  pr.id           as user_id,
  pr.display_name,
  pr.active,
  coalesce(d.weeks_played, 0)                          as weeks_played,
  coalesce(d.weeks_played, 0) * 5                      as owed,
  coalesce(pay.paid, 0)                                as paid,
  coalesce(pay.paid, 0) - coalesce(d.weeks_played, 0) * 5 as balance
from public.profiles pr
left join (
  select p.user_id, count(distinct (g.season, g.week)) as weeks_played
  from public.picks p
  join public.games g on g.game_id = p.game_id
  where g.week > 0
  group by p.user_id
) d on d.user_id = pr.id
left join (
  select user_id, sum(amount) as paid
  from public.payments
  group by user_id
) pay on pay.user_id = pr.id;

grant select on public.player_balances to authenticated;
