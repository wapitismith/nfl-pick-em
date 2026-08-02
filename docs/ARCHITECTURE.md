# NFL Pick-Em System — Architecture

## Overview

A mobile-friendly web app where 20–75 participants make weekly NFL picks
(straight-up winners + confidence points), with automatic live scoring,
pick reminders, and a weekly recap. R remains the automation engine —
the same nflverse tooling from last year's pool now feeds a cloud database.

```
┌─────────────────┐     magic-link auth,      ┌──────────────────────┐
│  Participants    │     picks, standings      │  Supabase (free)     │
│  phone/tablet/PC │ ◄———————————————————————► │  Postgres + Auth +   │
│  (React web app) │      supabase-js          │  auto REST API + RLS │
└─────────────────┘                            └──────────▲───────────┘
                                                          │ REST upserts
                                               ┌──────────┴───────────┐
                                               │  GitHub Actions (R)  │
                                               │  · sync schedule     │
                                               │  · live score update │
                                               │  · pick reminders    │
                                               │  · weekly recap      │
                                               └──────────▲───────────┘
                                                          │
                                     nflreadr (schedule, finals, 5-min cadence)
                                     ESPN scoreboard JSON (live in-game scores)
```

## Components

### 1. Database & API — Supabase (free tier)
- **Postgres** holds `profiles`, `games`, `picks`; views compute standings.
- **Auth**: email magic links — no passwords to manage for a friends pool.
- **PostgREST**: the database is automatically exposed as a REST API, which
  both the web app (via `supabase-js`) and the R scripts (via `httr2`) use.
- **Row Level Security** enforces the rules that matter in a pool:
  - You can only write *your own* picks.
  - Picks lock per-game at kickoff (`now() < games.kickoff`), enforced in
    the database — not just the UI — so nobody can sneak a late pick.
  - Other people's picks are hidden until that game kicks off.
- Free tier: 500 MB DB, 50k monthly auth users, unlimited API requests.
  A season of this pool uses well under 1% of that.

### 2. Web app — React + Vite (static, free hosting)
- Single-page app, mobile-first CSS. Host on Netlify / Vercel / GitHub Pages.
- Screens: **Login** (magic link) → **Picks** (tap a team, assign confidence
  1–N from remaining values) → **Standings** (weekly + season, auto-refreshes
  every 60 s during games).
- Talks directly to Supabase; there is no server to run or pay for.

### 3. Automation — R scripts on GitHub Actions cron
| Script | Schedule (UTC cron) | What it does |
|---|---|---|
| `R/sync_schedule.R` | Tue 10:00 + manual | Upsert season schedule/kickoffs from `nflreadr::load_schedules()` |
| `R/update_scores.R` | every 10 min, Thu/Sun/Mon game windows | Pull ESPN scoreboard JSON for live scores; nflreadr confirms finals; upsert into `games` — standings views update instantly |
| `R/send_reminders.R` | Thu 17:00, Sat 16:00, Sun 14:00 UTC | Email anyone missing picks for games kicking off in the next ~8 h |
| `R/weekly_recap.R` | Tue 12:00 UTC | Weekly results summary emailed to the whole pool |

- GitHub Actions is free (public repo) or 2,000 min/month free (private) —
  this schedule uses roughly 400–600 min/month in-season, so a private repo
  fits if the cache of R packages is used (workflows do use caching).
- Email goes through the Resend API (simple HTTP; swappable — see README).

## Data flow for scoring
1. `update_scores.R` writes `home_score`, `away_score`, `status`, `winner`
   into `games`.
2. SQL views (`pick_results`, `weekly_standings`, `season_standings`) derive
   everything else — no scoring code in the frontend, no batch rescoring.
   A game flipping to `final` instantly changes every leaderboard read.
3. Scoring rules:
   - **Straight-up**: 1 win per correct pick.
   - **Confidence**: sum of confidence values on correct picks. Both are
     columns in the same standings views; the app shows both.

## Key design decisions
- **Locks enforced in the database, not the app.** RLS checks kickoff time
  server-side; the UI graying out a game is just courtesy.
- **Per-game locking** (not whole-week) so Thursday-night mistakes don't
  block Sunday picks. Change to week-locking by editing one RLS predicate.
- **ESPN for live, nflverse for truth.** ESPN's public scoreboard JSON gives
  in-progress scores every 10 minutes; nflreadr's 5-minute schedule feed
  confirms finals and is the system of record.
- **R stays the brain.** All automation is R + httr2 + nflreadr, so last
  year's scoring logic and your own skills carry straight over.

## Costs
| Item | Cost |
|---|---|
| Supabase free tier | $0 |
| Static hosting (Netlify/Vercel/GH Pages) | $0 |
| GitHub Actions | $0 |
| Resend email free tier (with a domain you own) | $0–$10/yr for a domain |
| **Total** | **~$0/season** |

## Season-over-season
Everything is keyed by `season`, so next year is: run `sync_schedule.R`
for the new season and everyone's accounts, history, and the app carry over.
