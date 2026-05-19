# 07 — /predict page

## Context

Step 7 of `ARCHITECTURE.md` "Scaffolding order" and the largest single PR of the project. This is the page where each player fills out their entire bracket — 72 group scores, then 32 knockout scores — before the tournament kicks off on **June 11, 2026**. Without this, the rest of the app (results cron, points engine, dashboard) has nothing to score against.

The pipeline is already in place upstream: `lib/bracket.ts` derives standings + R32 from 72 group predictions, `lib/bracket-matches.ts` defines R16→Final progression, and the DB schema + RLS policies in `supabase/migrations/0001_initial_schema.sql` already restrict writes to the authenticated user's own un-locked predictions. The current `app/predict/page.tsx` is a 13-line stub.

UX is two-phase as locked in by `ARCHITECTURE.md` "Pages & Features" /predict row: group stage first, knockouts unlocked only once all 72 group scores are filled. Knockout picks are stored **by team**, not by slot, so a late group-score edit reshapes the bracket visually but doesn't lose the user's knockout team picks — the points engine in PR 09 will score by team appearance.

## Approach

**Ship as one PR**, not 7a/b/c/d. The page is one coherent feature and splitting it across PRs would mean shipping a half-functional /predict to master — the user can't usefully submit predictions until the knockout side works. We keep the diff manageable by tight component boundaries (see Files) and by leaning on Server Components for data fetching + a small set of Client Components for inputs.

### Page architecture

`app/predict/page.tsx` (Server Component):
1. `requireUser()` → redirect to `/` if signed out.
2. Single batched read: all 104 matches (with team joins) + this user's existing predictions, in two parallel `supabase.from(...).select(...)` calls.
3. Build a `PredictPageData` view-model: `{ groups: GroupView[], existingPredictions: Map<matchId, {home, away, locked}>, teams: Map<teamId, Team> }`.
4. Run `deriveBracket()` server-side **if** the user already has 72 group predictions filled — otherwise pass a `null` derived bracket. Cheap (<5ms).
5. Render `<PredictForm initialData={...} />` (Client Component).

Derivation happens on initial render and is **recomputed client-side** after each save (see "Live derivation" below). Server-side derivation on every render would require a round-trip per keystroke; client-side gives instant feedback.

### Data flow — saves

A single Server Action `savePrediction(matchId, homeScore, awayScore)` in `app/actions/predictions.ts`:

```ts
"use server";
export async function savePrediction(
  matchId: string,
  homeScore: number | null,
  awayScore: number | null,
): Promise<{ ok: true } | { ok: false; error: string }>
```

- Validates: both scores are non-negative integers or both null (clear). Rejects negative / non-integer / NaN.
- Calls `supabase.from("predictions").upsert({ user_id: auth.uid(), match_id, home_score, away_score }, { onConflict: "user_id,match_id" })`. RLS does the user_id check; we still pass it explicitly for clarity.
- If both scores are `null`, **delete** the row instead so "vyplněno X z 72" stays honest.
- Returns the canonical row (or error) so the client can reconcile optimistic state.
- Rejects when `locked = true` — RLS will do this too, but we add an early check for a friendlier Czech error string.

**Debouncing:** client-side, `useDebouncedCallback` (300ms) per match input. On blur, flush immediately. Optimistic UI: update local state first, fire the action, on error revert + toast in Czech ("Uložení selhalo, zkus to znovu").

### Component breakdown

All in `components/predict/`:

- `PredictForm.tsx` (Client) — top-level. Owns the in-memory `predictions: Map<matchId, {home, away}>` state. Calls `deriveBracket` from a `useMemo` whenever group predictions complete.
- `GroupStageSection.tsx` — wraps 12 `<GroupCard>` children + the "Vyplněno X z 72 zápasů" progress.
- `GroupCard.tsx` — one group (A–L). Header "Skupina A", 6 `<MatchRow>` children, plus a live `<StandingsPreview>` (4-row mini-table) below.
- `MatchRow.tsx` — one match. Two score inputs, team names + flags, kickoff datetime in Czech (`Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })`). Save status pill: "Uloženo" / "Ukládám..." / "Chyba".
- `StandingsPreview.tsx` — derived from the 6 group fixtures. Pending state ("Doplň všech 6 zápasů ve skupině") if any fixture is incomplete; full ranked table otherwise.
- `KnockoutSection.tsx` — locked banner if `groupComplete=false` ("Doplň nejdřív všech 72 zápasů ve skupinách"). Otherwise renders 5 rounds.
- `BracketRound.tsx` — one round (R32 / R16 / QF / SF / Final). Receives `KnockoutSlot[]` from the in-memory bracket and renders `<KnockoutMatch>` rows.
- `KnockoutMatch.tsx` — like `MatchRow` but with a computed-winner footer: "Vítěz: Brazílie" or "Musíš zvolit vítěze" (on tie). For matches whose feeder is unresolved: greyed input + "Čekám na vítěze předchozího kola".
- `ChampionBanner.tsx` — pinned sticky element at the top of `KnockoutSection`. Visible only when Final has a determinable winner. Renders "Tvůj šampion: 🇧🇷 Brazílie — 30 bodů" with prominent styling.
- `EditWarningDialog.tsx` — modal triggered when user focuses a group-stage input while knockout predictions exist. Czech copy: "Upravit skóre? Tvůj bracket se může přeskupit. Tipy na vítěze v knockoutech zůstanou (uloženy podle týmu), ale jejich pozice v bracketu se mohou změnit." Buttons: "Pokračovat" / "Zrušit". Suppressible per-session via `sessionStorage`.

CSS Modules colocated: each component gets its `.module.css` sibling.

### Live derivation (client-side)

`PredictForm` recomputes `deriveBracket(predictions)` inside a `useMemo`. To run it client-side we import from `lib/bracket.ts` — which transitively pulls `lib/annex-c.ts` and `data/annex-c.json` (~117 KB raw / 6.7 KB gzipped). Acceptable for /predict; we accept the client-bundle cost. Alternative routes (Server Action per change) are slower and break optimistic UI.

### `advanceBracket` helper — `lib/advance-bracket.ts`

New pure function next to the bracket engine:

```ts
import type { KnockoutSlot } from "./bracket";
import type { KnockoutRound } from "./bracket-matches";

export type KnockoutPrediction = {
  matchKey: string;        // "M73".."M104" (M103 excluded)
  homeScore: number | null;
  awayScore: number | null;
};

export type FullKnockoutMatch = {
  matchKey: string;
  round: "r32" | "r16" | "qf" | "sf" | "final";
  homeTeam: string | null;  // null → upstream winner not yet determined
  awayTeam: string | null;
  homeSlotLabel: string;    // "Vítěz M74" or carried R32 label
  awaySlotLabel: string;
};

export function advanceBracket(
  r32: KnockoutSlot[],
  predictions: Map<string /* matchKey */, KnockoutPrediction>,
): {
  r32: FullKnockoutMatch[];
  r16: FullKnockoutMatch[];
  qf: FullKnockoutMatch[];
  sf: FullKnockoutMatch[];
  final: FullKnockoutMatch;
  champion: string | null;  // team name; null if Final is tied or unfilled
};
```

Winner rule: `home if home_score > away_score, away if away_score > home_score, null otherwise`. Predictions with `null` scores or with a tie produce `null` winners; downstream slots fill `homeTeam: null` and the UI shows the "čekám na vítěze" placeholder. No knockout-stage extra-time / penalties in MVP (the user is forced to predict a non-tie).

### Champion banner condition

`champion !== null` from `advanceBracket`. Banner uses the team's flag emoji from `lib/teams-cs.ts` (already wired in seed) and the string "Tvůj šampion: {flag} {name} — 30 bodů". When Final is filled but tied → no banner, just the "Musíš zvolit vítěze" hint on the Final row.

### Locking

The seed sets `locked = false` everywhere. RLS already forbids updates to locked rows. The page reads `predictions.locked` and renders inputs as read-only (greyed) for any locked match — this is dead code today but ready for PR 08's cron to flip the flag.

## Files

**Create:**
- `/projects/VFT/app/predict/page.tsx` — replace stub. Server Component, fetches data + initial derivation.
- `/projects/VFT/app/predict/predict.module.css` — page-level layout (two-column on desktop, stacked on mobile).
- `/projects/VFT/app/actions/predictions.ts` — `savePrediction` server action.
- `/projects/VFT/lib/advance-bracket.ts` — pure helper described above.
- `/projects/VFT/lib/advance-bracket.test.ts` — unit tests (see Verification).
- `/projects/VFT/components/predict/PredictForm.tsx` (+ `.module.css`) — client root.
- `/projects/VFT/components/predict/GroupStageSection.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/GroupCard.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/MatchRow.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/StandingsPreview.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/KnockoutSection.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/BracketRound.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/KnockoutMatch.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/ChampionBanner.tsx` (+ `.module.css`)
- `/projects/VFT/components/predict/EditWarningDialog.tsx` (+ `.module.css`)
- `/projects/VFT/lib/predict-data.ts` — server-side query helpers (`loadPredictPageData(userId)` returns the view-model). Keeps `page.tsx` thin.
- `/projects/VFT/lib/predict-types.ts` — shared types between server load + client components (`MatchView`, `GroupView`, `PredictPageData`, `SaveStatus`).

**Modify:**
- `/projects/VFT/lib/strings.ts` — add reused Czech strings ("Vyplněno X z 72 zápasů", "Tvůj šampion", "Uloženo", "Ukládám…", "Uložení selhalo, zkus to znovu", edit-warning copy, locked-row label). Create the file if it doesn't exist.

**Not touched:**
- `lib/bracket.ts`, `lib/bracket-matches.ts`, schema migrations, seed scripts.

## Verification

1. `npm run lint && npx tsc --noEmit && npm run build` — clean.
2. `npm run test` — `lib/advance-bracket.test.ts` covers:
   - All R32 winners filled → R16 home/away populated from correct feeders per `R16_MATCHES`.
   - One R32 tied → its downstream R16 match has `homeTeam: null` (or `awayTeam: null` depending on slot); other R16 matches unaffected.
   - Full bracket filled to a Final with a winner → `champion` === that team.
   - Final tied → `champion: null`.
   - Cascade: edit an R32 score so a different team wins → downstream R16/QF/SF/Final teams update accordingly.
3. **No UI unit tests for the page itself.** Per the prompt's scope decision, the page layer is exercised by manual smoke; advanceBracket is the load-bearing logic and gets the unit tests.
4. Manual smoke test (against local Supabase + the seeded user):
   - Sign in, visit `/predict`. Group A renders 6 rows with Czech team names + kickoff times.
   - Type "2" / "1" into Argentina vs Mexiko, blur. Pill shows "Ukládám…" → "Uloženo". Reload page — values persist.
   - Standings preview for Group A shows "Doplň všech 6 zápasů" until row 6 filled, then ranks 1→4.
   - Knockout section shows lock banner until 72/72 filled. Progress counter increments.
   - Fill all 72 (use a fixture script `scripts/seed-test-predictions.ts` — optional, see Out of scope). Knockout section unlocks, "Tvůj bracket" tag shows Annex C option number.
   - Fill R32 winners → R16 home/away fields populate with the winning team names. Repeat through Final.
   - Final score 3-2 for Brazílie → champion banner pins at top: "Tvůj šampion: 🇧🇷 Brazílie — 30 bodů". Change to 2-2 → banner disappears, Final row shows "Musíš zvolit vítěze".
   - Go back to a Group A row, edit the score → edit warning dialog appears. Confirm → bracket reshapes; previously picked knockout teams that still appear in R32 keep their downstream picks.
5. RLS sanity: open browser devtools, attempt `supabase.from("predictions").update({...}).eq("user_id", OTHER_USER_ID)` → rejected. (No code change needed, just verify.)
6. Network throttling (Chrome DevTools "Slow 3G") + force a save error (block the request) → toast "Uložení selhalo, zkus to znovu" appears, input reverts to last server value.

## Out of scope

- **Locking on kickoff** — `predictions.locked = true` is set by PR 08 (results cron). This PR just respects the flag (renders inputs read-only when locked).
- **Points display on /predict** — leaderboard + per-match earned points live on `/dashboard` and `/matches` (PR 10).
- **Group-stage tiebreaker UI explanation** — a small "Jak se počítá pořadí?" tooltip explaining the MVP truncation is deferred to PR 10 or a polish pass.
- **3rd-place playoff (M103)** — excluded entirely, per CLAUDE.md.
- **Test fixture script** (`scripts/seed-test-predictions.ts`) to one-shot fill all 72 group scores during dev — handy but not blocking. If trivial, do it inside this PR; otherwise defer.
- **Submit / confirm step** — there is no separate "submit" button. Each save is a save. A "Tournament starts in N days" countdown banner can land in PR 10.
- **Mobile bracket layout polish** — basic responsive stacking only; a true bracket-tree visual is a post-MVP nice-to-have.
