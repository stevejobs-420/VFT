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
| Football data | football-data.org (free tier) | WC schedule + live results — WC 2026 confirmed in free tier (10 req/min, 12 competitions) |
| Hosting | Vercel (free tier) | Native Next.js support, serverless, cron jobs |
| Domain | Subdomain via active24.cz | CNAME → Vercel |

---

## Authentication

- **Primary:** Magic link (email) — user enters email, clicks link, session persists for the duration of the tournament
- **Secondary:** Google OAuth — one-click alternative
- Sessions managed entirely by Supabase, stored in browser
- Public signups disabled — users are manually added or invited by admin (exact admin flow TBD — likely via Supabase dashboard for MVP)
- No passwords anywhere
- **SMTP provider:** Resend (free tier, 100/day · 3000/month). Sender domain verified — emails come from `info@vft.vojtechsykora.cz`. Supabase's built-in SMTP is unreliable for Czech inboxes; Resend with proper SPF/DKIM solves seznam.cz / gmail filtering. See README "SMTP — Resend" for setup steps.

---

## Tournament Structure (WC 2026)

- **48 teams**, divided into **12 groups of 4** (A–L)
- **104 total matches:** 72 group + 32 knockout (R32 → R16 → QF → SF → 3rd-place playoff + Final)
  - Note: the 3rd-place playoff exists. Decide whether to include it in predictions — current spec says "32 knockout matches" which excludes it. Keep excluded for MVP simplicity.
- **Advancement to R32:** top 2 from each group (24 teams) + the **8 best third-placed teams** across all groups (32 total).

### FIFA group-stage tiebreaker order (for deriving predicted standings)
When two or more teams in a group are tied on points, apply in order:
1. Points in head-to-head matches among tied teams
2. Goal difference in head-to-head matches among tied teams
3. Goals scored in head-to-head matches among tied teams
4. Goal difference across all group matches
5. Goals scored across all group matches
6. Fair-play (disciplinary) score across all group matches
7. FIFA world ranking

Steps 6 and 7 are not derivable from score predictions alone. **For MVP, stop at step 5** and break any remaining ties by alphabetical team name (deterministic, transparent to users). Document this choice clearly in the UI.

### Third-placed-team ranking (across all 12 groups)
Used to pick the 8 best 3rd-placed teams that advance to R32. Order: points → GD → goals scored → fair play → FIFA ranking. Same MVP shortcut: stop at goals scored, break ties alphabetically.

### R32 bracket pairings
FIFA defines the R32 slot map in **Annex C** of the tournament regulations — there are **495 possible bracket layouts** depending on which 8 of the 12 third-placed teams qualify. Final official pairings lock on **June 27, 2026** (after the group stage).

**Implication for our app:** the user's R32 bracket cannot be auto-seeded purely from their group-stage scores until the third-placed-team logic resolves which 8 of their predicted 3rd-placed teams advance, and the matching Annex C layout is selected. The bracket-derivation pipeline is:

1. Derive each group's 1st/2nd/3rd/4th from user's 72 score predictions (FIFA tiebreakers).
2. Rank all 12 third-placed teams; take top 8.
3. Look up the matching Annex C layout for which 8 groups produced 3rd-placed qualifiers.
4. Fill R32 slots → user then predicts knockout scores from R32 onward.

The Annex C table will need to be stored in the app (likely a static JSON keyed by the set of qualifying 3rd-place group letters).

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
stage           text        -- 'group', 'r32', 'r16', 'qf', 'sf', 'final'
home_team_id    uuid → teams   -- nullable: knockout teams unknown until prior round finishes
away_team_id    uuid → teams   -- nullable: knockout teams unknown until prior round finishes
home_slot_label text        -- e.g. "Winner Group A", "Winner M49" — used until team_id is resolved
away_slot_label text
kickoff_at      timestamptz
home_score      int         -- null until played
away_score      int         -- null until played
status          text        -- 'scheduled', 'live', 'finished'
api_match_id    text        -- ID from football-data.org
```

Knockout matches are pre-seeded with `home_slot_label` / `away_slot_label` (e.g. "Winner Group A"). The cron resolves team IDs as prior-round results come in.

### `predictions`
```
id                      uuid
user_id                 uuid → auth.users
match_id                uuid → matches
predicted_home_team_id  uuid → teams   -- null for group stage (teams already known)
predicted_away_team_id  uuid → teams   -- null for group stage (teams already known)
home_score              int
away_score              int
submitted_at            timestamptz
locked                  bool           -- true once tournament starts
```

### `points`
```
id              uuid
user_id         uuid → auth.users
match_id        uuid → matches
points          int
reason          text    -- 'exact_score', 'goal_difference', 'correct_result',
                        --  'correct_advancement_r32', 'correct_advancement_r16',
                        --  'correct_advancement_qf', 'correct_advancement_sf',
                        --  'correct_advancement_final', 'correct_champion',
                        --  'group_winner', 'correct_top2', 'correct_full_standings'
```

---

## Points System

### Per match — mutually exclusive tiers (group stage + knockout)
| Accuracy | Points |
|---|---|
| Wrong result | 0 |
| Correct result (win/draw/loss) | 2 |
| Correct goal difference, not exact score (e.g. predicted 3-2, ended 2-1) | 3 |
| Correct exact score | 5 |

### Group standings (per group, after group stage completes)
| | Points |
|---|---|
| Correct group winner | 3 |
| Correct top 2 (both teams, any order) | 2 |
| Correct full group standings (all 4 positions) | 5 bonus |

### Knockout stage — team advancement (awarded when correct team appears in that round)
| Round | Points for correct team |
|---|---|
| R32 | 2 |
| R16 | 4 |
| QF | 5 |
| SF | 7 |
| Final | 10 |

Team advancement points stack on top of match result points. **Final advancement (10 pts) is awarded per finalist** — predicting both finalists correctly = 20 pts of advancement points (in addition to the 30-pt champion bonus and the match-result points for the Final itself).

### Tournament champion
| | Points |
|---|---|
| Correct champion (team that wins the Final) | 30 |

Stacks on top of everything else. Max payout for nailing the champion + exact final score = **30 (champion) + 10 (Final advancement) + 5 (exact score) = 45 pts** on the final match alone.

### Knockout bracket approach
- **Option A:** bracket flows from group stage predictions
- App derives user's predicted group standings from their 72 score predictions (see Tournament Structure section for the FIFA tiebreaker pipeline + Annex C R32 mapping)
- App auto-seeds their R32 bracket based on those standings
- User fills in winners + exact scores for each subsequent round (R32 → Final)
- Points awarded **based on team** (not slot) — if user predicted Brazil wins the SF and Brazil wins the SF, points awarded regardless of which path they took
- Exact scores required for all knockout matches

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
| `/predict` | Fill in exact scores for all 104 matches. **Two-phase UX:** (1) user fills out all 72 group-stage scores; knockout stage is locked until group stage is 100% complete. (2) Once group stage is complete, the app derives standings + R32 layout (via Annex C) and unlocks the knockout bracket for the user to fill. **Pin a "Your champion: 🇧🇷 Brazil — 30 pts" banner** prominently once the Final winner is filled in, so the high-stakes pick feels weighty. **Edit-cascade caveat:** if the user goes back and edits a group score after starting knockouts, the bracket may reshape. Knockout picks are stored by team (not slot), so points logic is unaffected, but the bracket *visual* will shift — show a warning before letting them edit a locked-in group score. |
| `/dashboard` | Leaderboard — all users ranked by total points. Show each user's predicted champion alongside their row. |
| `/matches` | Full schedule with results and your prediction next to each |

---

## Language

All user-facing UI text is in **Czech** (buttons, labels, headings, error messages, emails). Code, comments, identifiers, and these docs stay in English. Tone is informal — "ty" / "tvůj" — since it's a friends-only app.

No i18n framework needed for MVP — write Czech strings inline. If a string is reused across pages, lift it into `lib/strings.ts`. Team names use canonical Czech forms, preferring short common variants (Německo, Španělsko, USA, DR Kongo); source the list during the team-seeding step.

---

## Out of Scope (MVP)
- 3rd-place playoff predictions (the match exists, but excluded from our prediction pool for simplicity)
- Stats and trends (post-MVP)
- Push notifications
- Live score updates (polling on refresh is fine)
- Mobile app

---

## Scaffolding order (recommended first PRs)

1. **Next.js + TypeScript init** (App Router, CSS Modules, no Tailwind). Empty pages for `/`, `/predict`, `/dashboard`, `/matches`.
2. **Supabase project + schema migration.** Tables: `teams`, `matches`, `predictions`, `points`, optional `profiles`. RLS policies: users read all, write only their own predictions.
3. **Seed data.** Populate `teams` (48 teams + group letters) and `matches` (72 group matches with kickoff times + 32 knockout placeholders with `home_slot_label`/`away_slot_label`). Source: football-data.org once draw is final, or hand-loaded JSON if API lags.
4. **Auth.** Supabase magic link + Google OAuth. Session provider in root layout. Admin user provisioning via Supabase dashboard.
5. **Annex C R32 mapping.** Static JSON: keyed by sorted tuple of qualifying 3rd-place group letters → R32 slot assignments. Source: FIFA tournament regulations Annex C (495 entries).
6. **Bracket derivation engine** (`lib/bracket.ts`). Pure function: `(predictions[]) → { groupStandings, r32Layout, knockoutSlots }`. Heavily unit-tested.
7. **`/predict` page.** Group-stage form → live-derived standings preview → R32 auto-seed → knockout score inputs → champion banner.
8. **Results sync cron** (`/api/results`). Hourly during tournament, lock predictions on kickoff.
9. **Points engine** (`/api/points`). Idempotent recompute keyed by `match_id`. Reasons enumerated in the `points.reason` column.
10. **`/dashboard` + `/matches` pages.** Read-only views over computed points.

---

## Open questions / decisions deferred
- **Admin user provisioning:** currently planned via Supabase dashboard. Decide if a CLI script or in-app admin UI is needed.
- **FIFA tiebreaker steps 6–7** (fair play, world ranking) aren't derivable from score predictions — MVP truncates at goals scored + alphabetical fallback. Confirm UX-wise this is acceptable.
- **Champion-pick re-vote if final teams differ from group-stage derivation?** Decided: no — user's bracket is whatever flows from their predictions, no overrides.
- **Late joiners after tournament starts:** spec says no — all locked at kickoff of first match. Reaffirm if anyone asks.
