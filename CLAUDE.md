# VFT — World Cup 2026 Prediction Game

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

## Prediction Format
- Users predict **exact scores** for every match — all 72 group stage + all 32 knockout matches
- Everything locked before the tournament starts, no changes allowed after
- Bracket flows from group stage predictions:
  - App derives predicted group standings from user's 72 score predictions (using FIFA tiebreaker rules)
  - App auto-seeds the R32 bracket from those standings
  - User fills in exact scores for all knockout rounds
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
| Final | 10 |

## Status
- Repo initialized, full architecture documented in `ARCHITECTURE.md`
- All decisions finalised — ready to scaffold
- **Next step:** scaffold Next.js + Supabase project
