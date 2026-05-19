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
- Team names: use the canonical Czech form where it exists (e.g. "Německo", "Španělsko", "Spojené státy"). Source the list at seeding time.

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
- Repo initialized, full architecture documented in `ARCHITECTURE.md`
- All design decisions finalised — ready to scaffold
- football-data.org confirmed: WC 2026 included in free tier (10 req/min)
- **Next step:** start coding in VS Code. See `ARCHITECTURE.md` → "Scaffolding order" for the recommended PR sequence (Next.js init → Supabase schema → seed data → auth → Annex C JSON → bracket engine → predict page → results cron → points engine → dashboard).
