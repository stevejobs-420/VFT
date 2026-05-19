# 08 — Results sync cron

## Context

Step 8 of `ARCHITECTURE.md` "Scaffolding order" and the "Result Syncing (Vercel Cron)" section. The tournament starts **June 11, 2026** — we need a server-side job that pulls live scores from football-data.org, updates the `matches` table, resolves knockout teams as prior rounds finish, and locks each user's predictions once the match kicks off. Points recompute is wired in PR 09; this PR only updates results + locks predictions and leaves a TODO hook.

What exists today:
- `matches` table seeded with all 104 rows including `api_match_id` (text unique) and `match_key` (M1..M104).
- `predictions` table has a `locked` boolean column (default false). RLS allows users to write only their own; the cron uses the service-role client to bypass RLS.
- `lib/supabase/admin.ts` — `createAdminClient()` factory.
- `scripts/seed.ts` already maps the football-data.org payload to our enum (`STAGE_MAP`, status mapping, slot labels). The cron reuses the same shape but writes to live rows.
- `FOOTBALL_DATA_API_KEY` in `.env.local`. No `app/api/` folder yet — first route handler in the project.

## Approach

### Route handler — `app/api/results/route.ts` (GET)

Single GET handler that Vercel Cron invokes hourly. Signature: `export async function GET(req: Request): Promise<Response>`.

1. **Auth gate.** Read `Authorization` header. Require `Bearer ${process.env.CRON_SECRET}`. If missing or mismatched → `401 { error: "unauthorized" }`. Vercel Cron sends this header automatically when `CRON_SECRET` is set in project env.
2. **Fetch upstream.** `GET https://api.football-data.org/v4/competitions/WC/matches` with `X-Auth-Token: FOOTBALL_DATA_API_KEY`. On non-2xx, return `502 { error, updated: 0, locked: 0 }`. On network error, same — never throw past the handler boundary.
3. **Build team-id lookup.** Select `id, api_team_id` from `teams` once. Map `api_team_id (number) → uuid`.
4. **Map each API match to a row update.** Reuse the helpers extracted into `lib/results-sync.ts` (pure module, see below):
   - `mapApiStatus(apiStatus, kickoffAt, now)` → `'scheduled' | 'live' | 'finished'`. `FINISHED`/`AWARDED` → `finished`; `IN_PLAY`/`LIVE`/`PAUSED` → `live`; `POSTPONED`/`SUSPENDED`/`CANCELLED` → `scheduled` (treat as unfinished — preserve `kickoff_at`). Everything else (`TIMED`/`SCHEDULED`) → `scheduled`.
   - `resolveTeams(apiMatch, teamIdByApiId)` → `{ home_team_id, away_team_id, home_slot_label, away_slot_label }`. When the API now has a real team id where seed wrote a placeholder, set the team id **and** null out the slot label.
   - `extractScores(apiMatch)` → `{ home_score, away_score }` (both nullable, copied from `score.fullTime`).
5. **Bulk upsert.** Build one row per API match keyed by `api_match_id`. Use `supabase.from("matches").upsert(rows, { onConflict: "api_match_id" })`. One round-trip for all 104 rows. Capture errors but continue.
6. **Lock predictions on kickoff** — by **time**, not API status (safer; the API can lag or be down). After the matches upsert, run a single SQL update:

   ```sql
   update predictions p
   set locked = true
   from matches m
   where p.match_id = m.id
     and p.locked = false
     and m.kickoff_at <= now();
   ```

   In Supabase JS this is two steps: `select id from matches where kickoff_at <= now()` → `update predictions set locked = true where match_id in (...) and locked = false`. Returns `count` of rows newly locked. Idempotent — `locked = false` predicate makes it set-true-only.

7. **Response.** `200 { updated: <rows upserted>, locked: <newly-locked predictions>, errors: string[] }`. The `errors` array carries non-fatal items (e.g. an API match whose home_team api id isn't in our `teams` table — log and skip that row).

8. **TODO hook for PR 09.** Right before the response, leave a literal `// TODO(PR-09): trigger /api/points recompute for matches whose status flipped to 'finished' this run.` Track those match ids in a `recomputeQueue: string[]` so PR 09 just has to consume it.

### Pure helpers — `lib/results-sync.ts`

Extract the three functions above plus the API stage map. Keep `app/api/results/route.ts` thin (env, fetch, db calls); put the mapping logic here so it's unit-testable without mocking Supabase or fetch.

```ts
export type ApiMatch = { /* same shape as scripts/seed.ts */ };
export type MatchRowUpdate = {
  api_match_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_slot_label: string | null;
  away_slot_label: string | null;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "live" | "finished";
};

export function mapApiStatus(apiStatus: string): "scheduled" | "live" | "finished";
export function buildMatchRowUpdate(
  apiMatch: ApiMatch,
  teamIdByApiId: Map<number, string>,
): { row: MatchRowUpdate; warnings: string[] };
```

### Vercel Cron — `vercel.json`

```json
{
  "crons": [
    { "path": "/api/results", "schedule": "0 * * * *" }
  ]
}
```

Every hour at minute 0. **Hobby tier only supports daily crons**; hourly requires Pro. README documents the fallback: schedule `0 12 * * *` on hobby, or point a free `cron-job.org` job at `https://<domain>/api/results` with the same Bearer header. Vercel injects `CRON_SECRET` into the auth header automatically when set in project env.

### Env additions

- `CRON_SECRET` — generate via `openssl rand -hex 32`. Add to `.env.local` and Vercel project env (Production + Preview). The route refuses to start without it (returns 500 on missing env, not 401, so misconfig is obvious).

### Error handling strategy

- API down / non-2xx → return 502 with what we did so far (0 updates). Don't throw.
- Single bad row in the API payload (team api id missing from our `teams` table) → skip, push to `warnings`, continue with the rest.
- DB upsert failure → return 500 with `{ updated: 0, locked: 0, errors: [pgError.message] }`. Re-run on next cron tick is safe (everything is upsert/idempotent).
- Locking step DB failure → return 200 with the matches-upsert result and lock error in `errors[]` so we don't lose visibility but still report the success.

### Idempotency invariants

- Match upsert keyed on `api_match_id` — re-running is a no-op when nothing changed.
- Lock update has `where locked = false` — re-running locks no new rows.
- No deletes anywhere.
- `match_key` is **not touched** by the cron (seed owns it; preserves the M1..M104 mapping).

## Files

**Create:**
- `/projects/VFT/app/api/results/route.ts` — GET handler. Force-dynamic (`export const dynamic = "force-dynamic"`; `export const runtime = "nodejs"`).
- `/projects/VFT/lib/results-sync.ts` — pure helpers: `mapApiStatus`, `buildMatchRowUpdate`, types.
- `/projects/VFT/lib/results-sync.test.ts` — vitest suite (see Verification).
- `/projects/VFT/vercel.json` — cron schedule.

**Modify:**
- `/projects/VFT/README.md` — Czech-friendly section "Cron — synchronizace výsledků": how to generate `CRON_SECRET`, where to set it (Vercel env), manual trigger via `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/results`, and the Pro-vs-Hobby cron caveat with the cron-job.org fallback.
- `/projects/VFT/.env.local` — add `CRON_SECRET=...` (user runs `openssl rand -hex 32`; documented in README, not committed).

**Not touched:**
- `scripts/seed.ts` — already covers initial seeding; the cron is a runtime update path.
- `lib/supabase/admin.ts` — reused as-is.
- `predictions` schema — `locked` column already exists from PR 02.

## Verification

1. `npm run lint && npx tsc --noEmit && npm run build` — clean. Build must compile the new route as a server function.
2. `npm run test` — `lib/results-sync.test.ts` covers:
   - `mapApiStatus`: `FINISHED` → `finished`, `AWARDED` → `finished`, `IN_PLAY`/`LIVE`/`PAUSED` → `live`, `TIMED`/`SCHEDULED`/`POSTPONED`/`SUSPENDED`/`CANCELLED` → `scheduled`, unknown → `scheduled`.
   - `buildMatchRowUpdate` group-stage finished row: scores filled, status `finished`, team ids resolved, slot labels null.
   - `buildMatchRowUpdate` R32 row where API now has real team ids: team ids set, slot labels nulled out.
   - `buildMatchRowUpdate` R32 row where API still returns null teams: team ids null, slot labels preserved from seed (i.e. we don't overwrite with null — re-fetch existing label or just pass null; spec: cron only nulls a slot label when it has a team id to put in its place, otherwise leaves the row's existing label alone via partial upsert — confirm via test).
   - Unknown API team id → row's `home_team_id` null, warning emitted, no throw.
3. Manual smoke against deployed Supabase (or local docker):
   - Seed first (`npm run seed`), confirm 104 matches with `status = 'scheduled'`.
   - `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/results` → `200 { updated: 104, locked: 0, errors: [] }`.
   - Without the header → `401`.
   - Manually set one match's `kickoff_at` to `now() - 1 hour` and insert a fake prediction for that match. Re-run cron → `locked: 1`.
   - Re-run again → `locked: 0` (idempotent).
   - Manually set one match's `status` to `'scheduled'`, `home_score` to null, then re-run cron with a fixture/mocked API response that says the match is `FINISHED` 2-1 → row updates accordingly. (Verify by SQL.)
4. Vercel deploy check: `vercel.json` parses (deploy preview shows "Cron Jobs (1)" in dashboard). Don't trigger the actual scheduled run during off-tournament time — manual invocation only.

## Out of scope

- Points recompute — PR 09 (`/api/points`). The TODO hook + `recomputeQueue` is left in place.
- Backfilling knockout match `home_slot_label`/`away_slot_label` from Annex C — the seed wrote generic Czech labels (e.g. "R32 zápas 1 (domácí)"); the cron replaces them with real teams as rounds resolve. Per-user Annex C labels are derived client-side in `/predict` (PR 07b) and never persisted on `matches`.
- Live-score polling on the client during matches — out of MVP scope; the cron's hourly tick is sufficient (refresh `/matches` to see updates).
- Admin UI to trigger a manual sync — use curl with the bearer, documented in README.
- Rate-limit handling beyond a single 502 retry-on-next-tick — football-data.org free tier is 10 req/min; one call per hour is comfortable.
