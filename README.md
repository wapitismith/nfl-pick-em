# 🏈 NFL Pick-Em Pool

A self-hosted pick-em system: participants make weekly picks (straight-up
winners + confidence points) from any phone/tablet/desktop, and R scripts on
a schedule keep scores, standings, reminders, and recaps updating
automatically. Total running cost: ~$0.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit.

```
supabase/schema.sql       database schema, security rules, standings views
R/                        automation (nflverse + ESPN → Supabase)
.github/workflows/        cron schedules that run the R scripts
web/                      React app participants use to pick
```

## One-time setup (roughly 1 evening)

### 1. Supabase (database + login)
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in all of `supabase/schema.sql`, run it.
3. In **Authentication → Sign In / Up**, make sure Email is enabled
   (magic links are on by default).
4. In **Authentication → URL Configuration**, set the Site URL to where the
   app will live (see step 3) so magic links redirect correctly.
5. Grab from **Settings → API**: the project URL, the `anon` public key
   (for the web app), and the `service_role` key (for the R scripts —
   keep this one secret, it bypasses all security rules).

### 2. GitHub repo (automation)
1. Push this folder to a GitHub repo.
2. In **Settings → Secrets and variables → Actions**, add secrets:
   - `SUPABASE_URL` — your project URL
   - `SUPABASE_SERVICE_KEY` — the service_role key
   - `RESEND_API_KEY` — from [resend.com](https://resend.com) (email; free
     tier is fine, verify a domain to send to the whole pool)
3. Add repository **variables**:
   - `APP_URL` — the web app URL (used in reminder emails)
   - `MAIL_FROM` — e.g. `Pick-Em Pool <pool@yourdomain.com>`
4. Run the **Sync schedule** workflow manually (Actions tab →
   Sync schedule → Run workflow). Your `games` table now has the season.

### 3. Web app (what everyone uses) — cPanel deploy
Deployed at **https://wapitismith.com/pickem/** (same cPanel host as
fire-map, milepost, etc.). It's a static build — no server-side code needed.

1. `cd web && cp .env.example .env` — fill in the Supabase URL + anon key.
2. `npm install && npm run dev` to try it locally.
3. `npm run build` — the site is emitted to `web/dist/` (already configured
   with `base: '/pickem/'` in `vite.config.js`).
4. Upload the **contents** of `web/dist/` to
   `/home/colomtnd/wapitismith/pickem/` via cPanel File Manager or FTP
   (so `index.html` sits at `/home/colomtnd/wapitismith/pickem/index.html`).
5. In Supabase **Authentication → URL Configuration**, set the Site URL to
   `https://wapitismith.com/pickem/` so magic links redirect there.
6. Send the pool the link. They sign in with a magic link — no passwords,
   no account setup for you to manage.

To update the app later: `npm run build` and re-upload `dist/`. (The
`VITE_*` values are baked in at build time, so rebuild after changing them.)

### Email notes
Reminders/recaps use [Resend](https://resend.com)'s HTTP API via
`send_email()` in `R/helpers.R`. To send to the whole pool you'll need to
verify a domain you own (a $10/yr domain works). Prefer something else?
That one function is the only place email happens — swap in `blastula`
(Gmail SMTP), Mailgun, Brevo, etc.

## What runs when (all times UTC in the workflow files)

| When | What |
|---|---|
| Every 10 min during Thu/Sun/Mon game windows | Live scores from ESPN → standings update |
| Tue 10:00 | Re-sync schedule from nflverse (flex moves, final confirmations) |
| Thu/Sat/Sun before games | Email anyone with unfinished picks |
| Tue 12:00 | Weekly recap email to the pool |

Everything can also be run on demand from the GitHub **Actions** tab, or
locally: `Rscript R/update_scores.R` (with the env vars in `R/helpers.R` set).

## Pool rules encoded in the database
- Picks lock **per game at kickoff** — enforced server-side, not just in the UI.
- Nobody can see your picks until each game kicks off.
- Confidence values can't repeat within a week (also enforced server-side).
- Scoring: 1 win per correct pick; confidence points = sum of the numbers
  you put on your correct picks. Standings show both.

## Season rollover
Next year: run **Sync schedule** with the new season year. Accounts,
history, and the app all carry over. Set `VITE_SEASON` in the web host and
`SEASON` (optional) in workflows if you want to pin a season explicitly.

## Local development
- Web: `cd web && npm install && npm run dev`
- R: scripts expect `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` env vars;
  packages: `httr2`, `dplyr`, `purrr`, `jsonlite`, `nflreadr`.
