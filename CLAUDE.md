# VFT — World Cup 2026 Prediction Game

@AGENTS.md

## What it is
A closed web app where a group of friends each fill out the complete tournament bracket before it starts, predicting **exact scores** for every match. Points are awarded based on accuracy. No betting, no fantasy mechanics — just fun among friends.

**Deadline:** FIFA World Cup 2026 starts **June 11, 2026**. MVP must be live before then.

## Git
- GitHub repo: `https://github.com/stevejobs-420/VFT`
- GitHub account: `stevejobs-420`, email `vojtech.sykora7@gmail.com`
- Remote: `git@github-personal:stevejobs-420/VFT.git` (uses `github-personal` SSH alias)
- Branch: `master`
- Global git config is a separate GitLab account — GitHub identity is set locally in this repo only

## Tech Stack
- **Next.js** (App Router) — full-stack, frontend + API routes
- **Supabase** — auth (magic link + Google OAuth) + PostgreSQL, free tier
- **CSS Modules** — plain CSS scoped per component, no Tailwind
- **football-data.org** — free tier API for WC schedule and live results
- **Vercel** — hosting, free tier, built-in cron jobs for result syncing
- **Subdomain** via active24.cz → Vercel CNAME

## Language
- **All user-facing UI text in Czech.** Buttons, labels, headings, error messages, emails — everything the user reads.
- Code, identifiers, comments, commit messages, and docs stay in English.
- Tone: informal ("ty" / "tvůj"), since this is a friends-only app — not formal "vy".
- No i18n framework for MVP. Write Czech strings inline in components, or centralize in a single `lib/strings.ts` if a string is reused across pages.
- Team names: use the canonical Czech form where it exists, preferring the short common form ("Německo", "Španělsko", "USA", "DR Kongo"). Source the list at seeding time; the mapping lives in `lib/teams-cs.ts`.

## Planning convention

Before starting a non-trivial PR (multi-file, architectural, or a step in `ARCHITECTURE.md` "Scaffolding order"), invoke the `planner` subagent. It writes a plan to `.claude/output/plan/NN-{slug}.md` with sections: Context, Approach, Files, Verification, Out of scope. Plans are committed to the repo so future sessions can pick up cold.

**Auto-invoke planner when:**
- Starting a new PR from `ARCHITECTURE.md` scaffolding order.
- User says "keep going" / "what's next" after a commit lands.
- A task spans multiple files or has architectural implications.

**Skip planner for:** single-line / single-file edits, config or dotfile tweaks, questions and explanations.

## Tournament Format (WC 2026)
- 48 teams, 12 groups of 4 (A–L), 104 matches total (72 group + 32 knockout)
- Top 2 from each group + 8 best 3rd-placed teams advance to R32
- 3rd-place playoff exists but is **excluded** from our prediction pool
- See `ARCHITECTURE.md` for the FIFA tiebreaker order and Annex C R32 mapping details

## Prediction Format
- Users predict **exact scores** for every match — all 72 group stage + all 32 knockout matches
- Everything locked before the tournament starts, no changes allowed after
- Bracket flows from group stage predictions:
  - App derives predicted group standings from user's 72 score predictions (using FIFA tiebreakers; MVP truncates the rule chain at "goals scored" and falls back to alphabetical order)
  - App ranks all 12 predicted 3rd-placed teams; top 8 advance
  - App auto-seeds the R32 bracket via FIFA's Annex C layout (495 possible permutations, indexed by which 8 groups produced 3rd-placed qualifiers)
  - User fills in exact scores for all knockout rounds (R32 → Final)
  - Points awarded based on **team** (not slot)

## Points System (finalised)

**Per match — mutually exclusive tiers (applies to all 104 matches):**
| Accuracy | Points |
|---|---|
| Wrong result | 0 |
| Correct result (win/draw/loss) | 2 |
| Correct goal difference, not exact score (e.g. predicted 3-2, ended 2-1) | 3 |
| Correct exact score | 5 |

**Group standings (per group):**
| | Points |
|---|---|
| Correct group winner | 3 |
| Correct top 2 (both teams, any order) | 2 |
| Correct full standings (all 4 positions) | 5 bonus |

**Knockout team advancement (stacks on top of match points):**
| Round | Points |
|---|---|
| R32 | 2 |
| R16 | 4 |
| QF | 5 |
| SF | 7 |
| Final | 10 (per finalist — predicting both finalists correctly = 20 pts) |

**Tournament champion (stacks on top of everything else):**
| | Points |
|---|---|
| Correct champion | 30 |

Maximum possible payout for nailing the champion + exact final score: **30 (champion) + 10 (Final advancement) + 5 (exact score) = 45 pts** on the final match alone.

## Status

**Done (committed to master):**
1. ✅ Next.js + TypeScript + CSS Modules scaffold with Czech page stubs
2. ✅ Supabase schema + clients (migration 0001) — `teams`, `matches`, `predictions`, `points`, `profiles` with RLS
3. ✅ Seed teams + matches from football-data.org (`npm run seed`) — 48 teams + 104 matches, idempotent
4. ✅ Supabase auth (magic link + Google OAuth) with Resend SMTP — sender `info@vft.vojtechsykora.cz`
5. ✅ Annex C R32 mapping (`data/annex-c.json`, 495 entries) + extractor (`npm run extract-annex-c`)
6. ✅ Bracket derivation engine (`lib/bracket.ts` `deriveBracket`) — pure function, full tiebreaker chain, unit-tested
7. ✅ `/predict` page — group form (PR 07a) + knockouts (PR 07b) with derived bracket, champion banner, edit-cascade dialog, light/dark theme toggle, layout toggle, third-place table with stats. Cookie-based UI prefs (no FOUC)
8. ✅ Results sync cron (`/api/results`) — auth via `CRON_SECRET`, time-based prediction locking, idempotent UPDATE-per-row. `vercel.json` schedules hourly (Hobby tier downgrades to daily — see README for cron-job.org fallback)
9. ✅ Demo data — `npm run demo-predictions -- N` creates N demo users (Czech names) with random predictions for all 103 prediction-eligible matches. Idempotent, `--reset` flag for cleanup

**Currently in DB (Supabase project `gwfymtxglmhbsdomuivs`):**
- 48 teams · 104 matches · 10 demo users · ~1030 demo predictions
- Migration 0002 (match_key column M1..M104) applied
- Real admin user (`petr.ptac3k@seznam.cz`) for testing the magic-link flow

**Next steps (in scaffolding order):**
- **PR 09 — Points engine** (`/api/points`): consume the cron's `recomputeQueue` TODO hook from `app/api/results/route.ts`, walk every prediction × actual match result, write to `points` table (already created in PR 02 schema). Use the demo data for end-to-end validation — should produce a varied leaderboard.
- **PR 10 — `/dashboard` + `/matches` pages**: render leaderboard from `points`, render schedule + own-prediction vs result. Both pages currently stubs.
- **Future** — homepage with rules + tiebreaker explanation (FIFA Article 13: h2h before overall GD, opposite of UEFA — surprised one user already); SMTP polish; mobile bracket-tree visual.

See `.claude/output/plan/01..08-*.md` for the full plan archive (one per PR). When picking up a non-trivial chunk, invoke the `planner` subagent per the convention above.

**Useful dev commands:**
```
npm run dev                          # localhost:3000
npm run test                         # vitest (36 tests across bracket, advance-bracket, bracket-diff, annex-c, results-sync)
npm run lint                         # eslint
npm run build                        # production build
npm run seed                         # reseed teams + matches from football-data.org
npm run demo-predictions -- 10       # create/refresh 10 demo users
npm run magic-link -- some@email.cz  # generate a sign-in URL bypassing email
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/results  # manually trigger results sync
```
