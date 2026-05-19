# 03 — Seed teams + matches from football-data.org

## Context

Step 3 of `ARCHITECTURE.md` "Scaffolding order". The Supabase schema landed in PR 02 (commit `4af6a51`) but has zero rows. The user provided a football-data.org API key on 2026-05-19, so we pull live data instead of hand-rolling JSON.

The WC endpoint (verified with the user's key, 2026-05-19):
- `/v4/competitions/WC/teams` → 48 teams: `{ id, name, tla, crest, area: { code, flag } }`. No group info on team objects.
- `/v4/competitions/WC/matches` → 104 matches with `{ id, utcDate, stage, group, homeTeam, awayTeam, score }`. Stages: `GROUP_STAGE` (72), `LAST_32` (16), `LAST_16` (8), `QUARTER_FINALS` (4), `SEMI_FINALS` (2), `THIRD_PLACE` (1), `FINAL` (1). Group info (`GROUP_A` … `GROUP_L`) only on group-stage matches — that's how we derive each team's group.
- Knockout matches return `homeTeam.name = null` until prior round resolves; we backfill via slot labels.

Two mismatches with the PR 02 schema to fix (migration 0001 is unapplied, amend in place):
1. **Stage CHECK missing `third_place`.** The 3rd-place match is excluded from predictions but kept in DB for the `/matches` page and uniform result sync.
2. **`teams` missing `api_team_id`.** Needed to join API ids back to our uuids when seeding match rows.

## Approach

1. **Amend `supabase/migrations/0001_initial_schema.sql`:**
   - Add `api_team_id int unique` to `teams`.
   - Add `'third_place'` to the `stage` CHECK.

2. **`lib/teams-cs.ts`** — Czech translation map. Hardcoded `Record<string, string>` keyed by exact English `name` from football-data.org → canonical Czech form. All 48 teams. Examples: `Mexico → Mexiko`, `United States → Spojené státy`, `Ivory Coast → Pobřeží slonoviny`, `DR Congo → Demokratická republika Kongo`, `Bosnia-Herzegovina → Bosna a Hercegovina`, `Saudi Arabia → Saúdská Arábie`, `South Korea → Jižní Korea`, `South Africa → Jihoafrická republika`.

3. **`scripts/seed.ts`** — fetch + upsert:
   - Reads `FOOTBALL_DATA_API_KEY` from env; aborts with a clear Czech-friendly error if missing.
   - Fetches `/competitions/WC/teams` and `/competitions/WC/matches` with `X-Auth-Token` header.
   - Builds per-team group lookup by scanning group-stage matches (each team appears in exactly one `group: GROUP_X` row).
   - Upserts each team: `{ name: czechName, group_letter, flag_url, api_team_id }` keyed by `api_team_id`.
   - Upserts each match: maps stage → our enum, resolves home/away team ids via `api_team_id` lookup. For null knockout teams, sets slot labels in Czech (`"R32 zápas N"`, `"R16 zápas N"`, `"Čtvrtfinále N"`, `"Semifinále N"`, `"O 3. místo"`, `"Finále"`). Upserts on `api_match_id`.
   - Uses `lib/supabase/admin.ts` — service role, bypasses RLS.

4. **`tsx` as devDep** so `scripts/seed.ts` runs without a build step. Add `"seed": "tsx scripts/seed.ts"` to `package.json`.

5. **README update** — document `npm run seed` after `.env.local` is populated with `FOOTBALL_DATA_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY`. Note idempotence (safe to re-run).

## Czech team names (final list)

A: Mexiko · Jihoafrická republika · Jižní Korea · Česko
B: Kanada · Bosna a Hercegovina · Katar · Švýcarsko
C: Brazílie · Maroko · Haiti · Skotsko
D: Spojené státy · Paraguay · Austrálie · Turecko
E: Německo · Curaçao · Pobřeží slonoviny · Ekvádor
F: Nizozemsko · Japonsko · Švédsko · Tunisko
G: Belgie · Egypt · Írán · Nový Zéland
H: Španělsko · Kapverdy · Saúdská Arábie · Uruguay
I: Francie · Senegal · Irák · Norsko
J: Argentina · Alžírsko · Rakousko · Jordánsko
K: Portugalsko · Demokratická republika Kongo · Uzbekistán · Kolumbie
L: Anglie · Chorvatsko · Ghana · Panama

## Files

**Modify:**
- `/projects/VFT/supabase/migrations/0001_initial_schema.sql` — add `api_team_id`, add `third_place` to stage CHECK.
- `/projects/VFT/package.json` — `tsx` devDep, `seed` script.
- `/projects/VFT/README.md` — document seed step.

**Create:**
- `/projects/VFT/lib/teams-cs.ts` — Czech name map.
- `/projects/VFT/scripts/seed.ts` — fetch + upsert.

## Verification

1. `npm run build` + `npm run lint` — clean.
2. `npx tsc --noEmit` — types compile (including the script).
3. Hand-trace slot-label logic for one R32 match + the Final — no NULL constraint violations.
4. **End-to-end DB test deferred** until the user provisions a Supabase project and applies the amended migration. Expected on run: 48 rows in `teams`, 104 rows in `matches` (72 group + 16 R32 + 8 R16 + 4 QF + 2 SF + 1 third_place + 1 final).

## Out of scope

- Resolving R32/R16/etc. slot labels from Annex C → PR 05 / 06.
- Live results sync (cron) → PR 08.
