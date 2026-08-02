-- New-member tracking — run once in the Supabase SQL editor.
-- welcomed_at is stamped by the automated welcome email; profiles
-- where it is NULL are "new members who haven't been welcomed yet".
alter table public.profiles add column if not exists welcomed_at timestamptz;
