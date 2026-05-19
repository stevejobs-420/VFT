# VFT — Architecture & Scaffolding Plan

## Overview
A closed web app for a group of friends to predict exact scores for every match of the FIFA World Cup 2026 before the tournament starts. Points are awarded based on prediction accuracy. No betting, no fantasy mechanics.

**Deadline:** FIFA World Cup 2026 starts June 11, 2026.

---

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend + Backend | Next.js (App Router) | Single repo, React frontend + API routes |
| Styling | CSS Modules | Plain CSS scoped per component, no framework |
| Auth + Database | Supabase | Managed PostgreSQL + magic link / Google auth |
| Football data | football-data.org (free tier) | WC schedule + live results |
| Hosting | Vercel (free tier) | Native Next.js support, serverless, cron jobs |
| Domain | Subdomain via active24.cz | CNAME → Vercel |

---

## Authentication

- **Primary:** Magic link (email) — user enters email, clicks link, session persists for the duration of the tournament
- **Secondary:** Google OAuth — one-click alternative
- Sessions managed entirely by Supabase, stored in browser
- Public signups disabled — users are manually added or invited by admin
- No passwords anywhere

---

## Project Structure

```
/vft
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout, session provider
│   ├── page.tsx                # Landing / login page
│   ├── dashboard/
│   │   └── page.tsx            # Leaderboard overview
│   ├── predict/
│   │   └── page.tsx            # Fill out all predictions
│   ├── matches/
│   │   └── page.tsx            # Match schedule + results
│   └── api/
│       ├── results/
│       │   └── route.ts        # Cron: fetch results from football-data.org
│       └── points/
│           └── route.ts        # Recalculate points after results update
├── components/                 # Reusable UI components
├── lib/
│   ├── supabase.ts             # Supabase client
│   └── football-api.ts        # football-data.org client
├── styles/                     # CSS Modules
└── CLAUDE.md
```

---

## Database Schema (Supabase / PostgreSQL)

### `users`
Managed by Supabase Auth — no custom table needed for basic info. Extended via a `profiles` table if needed (display name, etc.).

### `teams`
```
id          uuid
name        text
group       text        -- e.g. "A", "B", ... "L"
flag_url    text
```

### `matches`
```
id              uuid
stage           text        -- 'group', 'r32', 'qf', 'sf', 'final'
home_team_id    uuid → teams
away_team_id    uuid → teams
kickoff_at      timestamptz
home_score      int         -- null until played
away_score      int         -- null until played
status          text        -- 'scheduled', 'live', 'finished'
api_match_id    text        -- ID from football-data.org
```

### `predictions`
```
id              uuid
user_id         uuid → auth.users
match_id        uuid → matches
home_score      int
away_score      int
submitted_at    timestamptz
locked          bool        -- true once match kicks off
```

### `points`
```
id              uuid
user_id         uuid → auth.users
match_id        uuid → matches
points          int
reason          text        -- 'exact_score', 'correct_result', etc.
```

---

## Points System (to be finalised)

| Prediction | Points |
|---|---|
| Correct exact score | 5 |
| Correct result (win/draw/loss) | 2 |
| Group stage position (TBD) | TBD |
| Knockout stage advancement (TBD) | TBD |

**Open question:** Do users predict knockout bracket upfront (who wins each QF/SF/Final), or does the bracket fill in dynamically as teams qualify? This affects the schema.

---

## Result Syncing (Vercel Cron)

- A cron job runs every hour during the tournament
- Calls `/api/results` which fetches latest scores from football-data.org
- Updates `matches` table with scores and status
- Triggers `/api/points` to recalculate points for affected matches
- Predictions are locked (`locked = true`) once a match kicks off

---

## Auth Flow (Supabase)

```
User visits app
    ↓
Not logged in → Login page
    ↓
Enter email → Supabase sends magic link
    OR
Click "Sign in with Google" → OAuth flow
    ↓
Session created, stored in browser (1 week default)
    ↓
Every subsequent visit → automatically logged in
```

---

## Deployment

1. Push to `master` on GitHub
2. Vercel auto-deploys on every push
3. Environment variables stored in Vercel dashboard (never in code):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FOOTBALL_DATA_API_KEY`
4. Custom subdomain via CNAME record at active24.cz → Vercel

---

## Pages & Features (MVP)

| Page | Description |
|---|---|
| `/` | Login (magic link + Google) |
| `/predict` | Fill in exact scores for all 104 matches |
| `/dashboard` | Leaderboard — all users ranked by total points |
| `/matches` | Full schedule with results and your prediction next to each |

---

## Out of Scope (MVP)
- Stats and trends (post-MVP)
- Push notifications
- Live score updates (polling on refresh is fine)
- Mobile app
