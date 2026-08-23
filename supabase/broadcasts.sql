-- =============================================================
-- Pool-wide broadcast emails — run once in the Supabase SQL editor
-- (AFTER admin_upgrade.sql, which defines is_admin()).
-- Admin composes in the app -> row lands here -> the "Send broadcast"
-- GitHub workflow emails all active players from pool@wapitismith.com
-- and stamps sent_at. Re-runnable.
-- =============================================================

create table if not exists public.broadcasts (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  subject    text not null check (char_length(subject) between 1 and 200),
  body       text not null check (char_length(body) between 1 and 10000),
  sent_at    timestamptz
);

alter table public.broadcasts enable row level security;

-- Admins only, from the app. The R sender uses the service key (bypasses RLS).
drop policy if exists broadcasts_admin_all on public.broadcasts;
create policy broadcasts_admin_all on public.broadcasts
  for all using (public.is_admin()) with check (public.is_admin());
