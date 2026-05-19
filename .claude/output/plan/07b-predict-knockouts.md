# 07b — /predict knockout half

## Context

PR 07a (commit `7ee3e1b`) shipped the group-stage form: `GroupStageSection`, `GroupCard`, `MatchRow`, `StandingsPreview`, `savePrediction` Server Action, two-/one-column layout. The knockout slot in `components/predict/PredictForm.tsx` is still a single-line placeholder ("Vyřazovací část se odemkne…"). This PR adds the second half so users can complete the full bracket — R32 → R16 → QF → SF → Final → champion — and so `/predict` becomes end-to-end functional ahead of the **June 11, 2026** kickoff.

The upstream bracket engine is in place: `lib/bracket.ts deriveBracket` produces `r32: KnockoutSlot[]` from 72 group predictions, and `lib/bracket-matches.ts` defines R16→Final feeder edges. `savePrediction(matchId, h, a)` is match-agnostic and already works for knockout rows via RLS. See `ARCHITECTURE.md` "Pages & Features → /predict" for the two-phase UX and edit-cascade caveat.

## Approach

Keep all knockout state client-side. `PredictForm` adds a second piece of in-memory state — a `Map<matchKey, {home, away}>` for M73–M104 (excluding M103) — recomputes `advanceBracket()` in a `useMemo`, and persists each edit via the same `savePrediction` action. No server-side bracket re-derivation per save; the client owns the derivation, the server owns the row.

### mxx ↔ match_id mapping — Option A (new migration `0002_match_keys.sql`)

Add a non-null `match_key text unique` column to `matches` (values `M1`…`M104`, M103 included for completeness even though we don't predict it). Backfill during the migration by sorting by `(stage_rank, kickoff_at, api_match_id)` with `stage_rank` `group < r32 < r16 < qf < sf < third_place < final`. Update `scripts/seed.ts` to write `match_key` on upsert (idempotent — same value re-derived from the same sort). Rationale: Option B (runtime sort) couples the page to the seed's incidental row ordering, breaks the day football-data.org changes a kickoff time, and forces every consumer (predict page, points engine in PR 09, results cron in PR 08) to re-derive the same mapping. A 6-line migration once is cheaper. The column is also useful for `/matches` (PR 10) to render "M89" badges.

### Data loader extension — `lib/predict-data.ts`

`loadPredictPageData` drops the `.eq("stage", "group")` filter and returns both groups (unchanged) and a new `knockoutMatchesByKey: Record<string, KnockoutMatchRow>` where the row has `{ matchId, matchKey, stage, kickoffAt, homeSlotLabel, awaySlotLabel, locked }`. Predictions query is unchanged (it's already user-wide). `PredictPageData` gains `knockoutMatchesByKey` plus a `matchIdByKey: Record<string, string>` lookup for the save path.

### New types — `lib/predict-types.ts`

```ts
export type KnockoutMatchView = {
  matchId: string;
  matchKey: string;        // "M73".."M104"
  stage: "r32" | "r16" | "qf" | "sf" | "final";
  kickoffAt: string;
  homeSlotLabel: string;   // seed-written placeholder, only shown when team unresolved
  awaySlotLabel: string;
  locked: boolean;
};
```

`PredictPageData` extends with `knockoutMatchesByKey` and `matchIdByKey`. `GroupMatchView` is unchanged.

### `lib/advance-bracket.ts` — pure function

```ts
import type { KnockoutSlot } from "./bracket";

export type KnockoutScorePrediction = {
  homeScore: number | null;
  awayScore: number | null;
};

export type ResolvedKnockoutMatch = {
  matchKey: string;
  round: "r32" | "r16" | "qf" | "sf" | "final";
  homeTeam: string | null;       // null = upstream winner not yet determined
  awayTeam: string | null;
  homeSlotLabel: string;         // "Vítěz M74" for r16+, original R32 label for r32
  awaySlotLabel: string;
  prediction: KnockoutScorePrediction | null;  // null = user hasn't entered scores yet
  winner: string | null;         // null = tie / unfilled / unresolved teams
};

export function advanceBracket(
  r32: KnockoutSlot[],                                          // from deriveBracket
  predictionsByKey: Map<string, KnockoutScorePrediction>,       // keyed by matchKey
): {
  r32: ResolvedKnockoutMatch[];
  r16: ResolvedKnockoutMatch[];
  qf: ResolvedKnockoutMatch[];
  sf: ResolvedKnockoutMatch[];
  final: ResolvedKnockoutMatch;
  champion: string | null;
};
```

Winner rule: `home > away → homeTeam`, `away > home → awayTeam`, else `null`. If either team is null (upstream unresolved), winner is `null` regardless of scores. Round labels for r16+ derived from `R16_MATCHES`/`QF_MATCHES`/`SF_MATCHES`/`FINAL_MATCH` `homeFrom`/`awayFrom` → `"Vítěz {homeFrom}"`.

**Storage stays match-keyed**, but the edit-cascade is smart: when a group edit changes the team in a knockout slot, that slot's prediction is **explicitly wiped**, not silently reattributed. The effect is "stored-by-team" without the orphan-tracking complexity.

**Edit-cascade algorithm** (in PredictForm, before saving a group change):

1. Compute old bracket: `oldBracket = deriveBracket(currentGroupPredictions)`.
2. Compute new bracket: `newBracket = deriveBracket(groupPredictions with the edit applied)`.
3. Diff: build `affected: Set<matchKey>` = R32 matches where `homeTeam` or `awayTeam` differs between old and new. Walk forward — for each R32 match in `affected`, mark any R16 match whose `homeFrom`/`awayFrom` references it (use `R16_MATCHES` from `bracket-matches.ts`). Recursively walk into QF/SF/Final.
4. Intersect with `knockoutPredictionsByKey` — only matches the user *predicted* are "affected" in the user-visible sense.
5. **If `affected.size === 0`**: save the group change, no warning needed.
6. **If `affected.size > 0`**: show modal listing the affected match keys with a "Pokračovat / Zrušit" prompt. On confirm: save the group change, fire `deletePrediction(matchId)` for each affected match (Server Action — see below).
7. After re-render, attach a CSS class `slotChanged` for 2 seconds to each affected `<KnockoutMatch>` to flash-highlight the change.

This sidesteps the "is Brazílie 3–1 still my prediction after reshuffle?" UX confusion: if the teams change, the prediction is gone and the user re-enters it.

Edge cases handled:
- R32 prediction missing → r16 feeder's homeTeam/awayTeam null.
- R32 tie → same; downstream waits.
- Final tied → `champion: null`.
- M103 ignored (third-place playoff).

### Component breakdown — all in `components/predict/`

- `KnockoutSection.tsx` (+ `.module.css`) — replaces the placeholder paragraph in `PredictForm`. Renders a locked banner ("Doplň nejdřív všech 72 zápasů ve skupinách — {filled}/72") while `groupComplete === false`; otherwise renders `<ChampionBanner>` + 5 `<BracketRound>` children.
- `BracketRound.tsx` (+ `.module.css`) — props: `{ title: string; matches: ResolvedKnockoutMatch[]; ... }`. Renders the round header ("Osmifinále", "Čtvrtfinále", "Semifinále", "Finále"; R32 header: "Osmifinále" is R16 in Czech — use **"Šestnáctifinále"** for R32, "Osmifinále" for R16, "Čtvrtfinále" QF, "Semifinále" SF, "Finále" Final) and a vertical stack of `<KnockoutMatch>` rows.
- `KnockoutMatch.tsx` (+ `.module.css`) — like `MatchRow` but team names come from `ResolvedKnockoutMatch`. Three render states:
  1. Both teams resolved: standard two score inputs + "Uloženo / Ukládám… / Chyba" pill (reuses the `SaveStatus` pattern from MatchRow). Footer: `winner ? "Vítěz: {flag} {name}"` : on a tie with both scores filled: `"Musíš zvolit vítěze"`; otherwise no footer.
  2. Either team `null` (feeder unresolved): inputs disabled, opacity 0.4, footer "Čekám na vítěze předchozího kola". Show feeder slot labels in greyed text.
  3. `locked === true`: inputs read-only, no save pill.
- `ChampionBanner.tsx` (+ `.module.css`) — sticky-top (`position: sticky; top: 0`) inside `KnockoutSection`. Renders only when `champion !== null`. Czech copy: `"Tvůj šampion: {flag} {name} — 30 bodů"`. Uses `getFlagEmoji(name)` from `lib/teams-cs.ts` (see below).
- `EditCascadeDialog.tsx` (+ `.module.css`) — modal `<dialog>` element. Triggered AFTER the user changes a group score, only when the diff above reports `affected.size > 0`. Czech body: `"Tato změna ovlivní {N} zápas{ů} ve vyřazovací části:"` followed by a bullet list of affected match keys with a short label (e.g. `"M74 — Osmifinále, dříve Brazílie vs 3F"`). Buttons: `"Pokračovat a smazat tipy"` (saves group change + deletes affected predictions) / `"Zrušit"` (reverts the input).

### `PredictForm.tsx` modifications

- Add second state map `knockoutPredictionsByKey: Map<string, KnockoutScorePrediction>` hydrated from `initialData.knockoutMatchesByKey` ∪ `initialData.predictionsByMatch`.
- `groupComplete = useMemo(() => count of filled group predictions === 72)`.
- `derived = useMemo(() => groupComplete ? deriveBracket(groupPredictions) : null, [groupPredictions])`.
- `advanced = useMemo(() => derived ? advanceBracket(derived.r32, knockoutPredictionsByKey) : null, [derived, knockoutPredictionsByKey])`.
- New `onKnockoutScoreChange(matchKey, h, a)` → look up `matchId` via `initialData.matchIdByKey[matchKey]`, then reuse the existing `onScoreChange` save path (optimistic UI, error pill).
- **Edit-cascade wiring**: replace the existing `onScoreChange` in `GroupStageSection` with `onGroupScoreChange(matchId, h, a)`:
  - If `knockoutPredictionsByKey` is empty OR `!groupComplete`, save immediately (no diff needed).
  - Otherwise: tentatively compute the new bracket, diff vs old, intersect with predicted knockout matches. If `affected.size === 0`, save immediately. Else show `<EditCascadeDialog>` listing affected matches; on confirm, save the group change AND fire `deletePrediction(matchId)` for each affected match. Also set `recentlyChanged: Set<matchKey>` for 2s to drive the highlight CSS.
- Add a `deletePrediction(matchId)` Server Action to `app/actions/predictions.ts` (or extend the existing one — `savePrediction(matchId, null, null)` already deletes; just call that). Bulk delete by mapping over affected keys.
- Render `<KnockoutSection groupComplete={...} advanced={...} recentlyChanged={recentlyChanged} ... />` after `<GroupStageSection>`.

### `lib/teams-cs.ts` flag emoji helper

Add a `FLAG_EMOJI: Record<string /* Czech name */, string>` map covering all 48 teams (e.g. `"Brazílie": "🇧🇷"`, `"Německo": "🇩🇪"`) and `export function getFlagEmoji(czechName: string): string` that returns the flag or empty string with a `console.warn` for missing entries (non-throwing — the banner shouldn't crash if seed adds a new team). Reuse the existing team list in `TEAMS_CS` as the source of truth for which 48 names to cover.

### Performance

72 group + 31 knockout = ~103 inputs, well under any DOM threshold. `advanceBracket` is O(31) per re-render; `deriveBracket` already runs in <5ms. Annex C JSON (~6.7 KB gzipped) is already in the client bundle from PR 07a.

## Files

**Create:**
- `/projects/VFT/supabase/migrations/0002_match_keys.sql` — add `match_key text unique not null` to `matches`, backfill via ordered window function, add index.
- `/projects/VFT/lib/advance-bracket.ts` — pure function above.
- `/projects/VFT/lib/advance-bracket.test.ts` — vitest suite (see Verification).
- `/projects/VFT/components/predict/KnockoutSection.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/BracketRound.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/KnockoutMatch.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/ChampionBanner.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/EditCascadeDialog.tsx` (+ `.module.css`)
- `/projects/VFT/lib/bracket-diff.ts` — pure helper: `diffBracket(oldDerived, newDerived, knockoutPredictionsByKey) → { affected: Set<matchKey> }`. Walks R32 diff + downstream feeders. Unit-tested in `lib/bracket-diff.test.ts`.

**Modify:**
- `/projects/VFT/lib/predict-types.ts` — add `KnockoutMatchView`, extend `PredictPageData` with `knockoutMatchesByKey` + `matchIdByKey`.
- `/projects/VFT/lib/predict-data.ts` — drop group-only filter, hydrate knockout rows from DB, build `matchIdByKey`.
- `/projects/VFT/lib/teams-cs.ts` — add `FLAG_EMOJI` map + `getFlagEmoji()` helper for all 48 teams.
- `/projects/VFT/components/predict/PredictForm.tsx` — add knockout state, derive + advance memos, edit-warning wiring, render `<KnockoutSection>`. Remove the placeholder `<p>`.
- `/projects/VFT/components/predict/MatchRow.tsx` — unchanged (the cascade dialog is owned by `PredictForm` and triggered post-save-attempt; no per-row hook needed). Add an optional `flashChanged?: boolean` prop only for `KnockoutMatch` reuse (no-op for `MatchRow`).
- `/projects/VFT/scripts/seed.ts` — write `match_key` per row (sort + index per the migration backfill rule); idempotent on re-run.

**Not touched:**
- `app/actions/predictions.ts` — already match-id agnostic.
- `lib/bracket.ts`, `lib/bracket-matches.ts`, `lib/annex-c-matches.ts` — pure imports.

## Verification

1. `npm run lint && npx tsc --noEmit && npm run build` — clean.
2. `npm run test` — covers:
   - `advance-bracket.test.ts`:
     - All 16 R32 winners filled → R16 home/away populate per `R16_MATCHES` feeders.
     - One R32 tied (1–1) → downstream R16 feeder side null; siblings unaffected.
     - Full bracket through Final 3-2 for Brazílie → `champion === "Brazílie"`.
     - Final tied 2-2 → `champion === null`.
     - Missing R32 prediction → downstream feeder null.
   - `bracket-diff.test.ts`:
     - No group change → `affected.size === 0`.
     - Swap 1st/2nd in group A → affected = {M73, M79} (the 2A/1A slots).
     - Change group A 3rd-place team (still qualifies) → affected = the one R32 match whose Annex C slot pulls from group A.
     - Change pushes a different group's 3rd-placed team out of top 8 → Annex C option changes → affected = all 8 dynamic R32 matches (intersected with what the user predicted).
     - Walk-forward: if R16 M89's feeder M74 is in `affected` and the user predicted M89, M89 is in `affected`.
3. Migration: `psql … -f supabase/migrations/0002_match_keys.sql` on a clone of the seeded DB → 104 rows have non-null `match_key` `M1..M104`, unique. Re-running `scripts/seed.ts` is a no-op on `match_key`.
4. Manual smoke (against local Supabase, seeded user):
   - Sign in, visit `/predict`. Group section unchanged.
   - Fill 71/72 group scores → knockout still locked. Fill the 72nd → lock banner disappears, R32 renders 16 rows with derived team names (no placeholder labels).
   - Enter scores for M73, blur — pill "Ukládám…" → "Uloženo"; M90's home slot (feeder M73) populates with the winning team; KnockoutMatch footer shows "Vítěz: {flag} {name}".
   - Enter a 1-1 in M74 → M89's home slot greys out, footer "Čekám na vítěze předchozího kola"; M74's own footer reads "Musíš zvolit vítěze".
   - Fill the entire bracket through Final 3-1 → champion banner pins to top: "Tvůj šampion: 🇧🇷 Brazílie — 30 bodů". Change Final to 1-1 → banner disappears.
   - Edit a Group A match score so 1st/2nd swap, knockouts already predicted → cascade dialog lists exactly the affected match keys (e.g. "M73, M79"). Click "Zrušit" → score reverts. Edit again, click "Pokračovat a smazat tipy" → group save succeeds, those two knockout predictions disappear from the UI, slots flash a brief highlight, bracket re-renders with the new teams.
   - Edit a group score that doesn't affect bracket order at all (e.g. tweak a 1-0 to a 2-0 without changing 1st place) → no dialog, change just saves.
   - Reload page → all knockout scores persisted; bracket re-derives identically.
5. RLS sanity: knockout `savePrediction` rejected for `locked = true` rows — manual via SQL `update predictions set locked = true where match_id = (select id from matches where match_key = 'M73')` then re-edit M73 → Czech error toast.

## Out of scope

- Bracket-tree visual layout (radial / horizontal tree) — MVP renders vertical stacks per round. Post-MVP polish.
- Locking on kickoff — set by PR 08 (results cron). This PR only respects the flag.
- 3rd-place playoff (M103) — excluded; `KnockoutSection` filters it out even though it exists in the DB.
- Test fixture script to bulk-fill 72 group + 31 knockout scores for dev — defer; trivial to add if it bites.
- Mobile bracket polish — basic stacking only.
- Points-display sidebar showing per-round running totals — lives on `/dashboard` (PR 10).
