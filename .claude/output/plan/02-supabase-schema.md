# 02 — Supabase schema + clients

**Shipped:** commit `4af6a51` (2026-05-19) — retrospective doc.

## Context

Step 2 of `ARCHITECTURE.md` "Scaffolding order". The Next.js app from PR 01 has nowhere to read from / write to. Needed DB tables + JS clients before any data-aware UI can land.

## What shipped

- **Schema migration** at `supabase/migrations/0001_initial_schema.sql`:
  - Tables: `teams`, `matches`, `predictions`, `points`, `profiles`.
  - **Knockout-friendly matches:** nullable `home_team_id`/`away_team_id` + `home_slot_label`/`away_slot_label` with a CHECK constraint requiring at least one of each pair. Supports pre-seeding before the bracket resolves.
  - **`points.reason`** CHECK enum includes `correct_champion` (per the 30-pt champion bonus).
  - **Composite uniques** for idempotent recompute: `predictions(user_id, match_id)` and `points(user_id, match_id, reason, context)`.
  - **RLS** on all tables. Authenticated users read all rows; users insert/update only their own predictions while `locked = false`; `points` writes restricted to service role.
  - `updated_at` trigger on `matches` and `profiles`.
- **JS clients** under `lib/supabase/`:
  - `client.ts` — browser client via `@supabase/ssr` `createBrowserClient`.
  - `server.ts` — App Router Server Component client with cookie wiring (`getAll`/`setAll`, try/catch around `setAll` for non-middleware calls).
  - `admin.ts` — service-role client via `@supabase/supabase-js`; bypasses RLS. Server-side only — anything importing this is intentionally side-stepping RLS.
- **`.env.local.example`** documents `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FOOTBALL_DATA_API_KEY`.
- **`.gitignore`** updated with `!.env*.example` so the template stays tracked (default `.env*` pattern swallows it).
- **README** updated with Supabase setup steps (dashboard or CLI paths).
- **Deps added:** `@supabase/supabase-js`, `@supabase/ssr`.

## Key decisions

- **`group_letter`, not `group`** as the teams column name — `group` is reserved in SQL.
- **`points.reason` is a CHECK constraint, not a Postgres `ENUM` type.** Easier to amend in future migrations than `ALTER TYPE`.
- **Service-role client kept in its own file** (`admin.ts`) to make it grep-able and obvious.
- **`api_team_id` deferred to PR 03** — added when the seed script needs it to join API ids back to our uuids. Migration 0001 amended in place since it hasn't been applied anywhere.

## Verification (then)

- `npm run build` ✓ — clients tree-shake correctly; no SSR errors.
- `npm run lint` ✓.
- Migration **not yet applied** — lives only in the .sql file. Applied during PR 03 prep.

## Followup (open)

- Apply migration to a real Supabase project (manual user step before PR 03 seed can run).
- Add `api_team_id` to `teams` and `third_place` to `matches.stage` CHECK (both handled in PR 03's amendment).
