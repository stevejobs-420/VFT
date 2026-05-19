# VFT — World Cup 2026 Prediction Game

## What it is
A web app where a closed group of friends each fill out the complete tournament bracket before it starts, predicting **exact scores** for every match. Points are awarded based on accuracy. No betting, no fantasy league mechanics — just fun among friends.

## Deadline
FIFA World Cup 2026 starts **June 11, 2026**. MVP must be live before then.

## Git / SSH Setup
- GitHub repo: `https://github.com/stevejobs-420/VFT`
- GitHub account: `stevejobs-420`, email `vojtech.sykora7@gmail.com`
- SSH key: `~/.ssh/id_github_personal` with host alias `github-personal`
- Remote: `git@github-personal:stevejobs-420/VFT.git`
- Branch: `master`
- Note: global git config is a separate GitLab account — GitHub identity is set locally in this repo only

## Tech Stack
- **Next.js** (App Router) — full-stack, frontend + API routes
- **Supabase** — auth (email/password + Google), PostgreSQL, free tier
- **Tailwind CSS** — styling
- **football-data.org** — free tier API for WC schedule and live results

## Prediction Format
- Users predict **exact scores** for every match (all 104 matches in WC 2026)
- Predictions locked before tournament / each match kicks off

## Points System (not fully decided)
- Correct result (win/draw/loss): 2 pts
- Correct exact score: 5 pts
- Group stage standings bonus: TBD
- Knockout stage progression: escalating points, TBD
- Open question: are knockout bracket predictions locked upfront, or filled in dynamically as teams progress?

## Core Data Model (draft)
```
users → predictions → matches → results (from API) → points (calculated)
```

## Future / Nice-to-haves
- Stats (user trends, most predicted scores, leaderboard history)
- Real-time leaderboard updates as results come in

## Status
- Repo initialized, README pushed
- Stack decided, SSH configured
- **Next step:** finalize points system, scaffold Next.js + Supabase project
