# 06 — Bracket derivation engine

## Context

Step 6 of `ARCHITECTURE.md` "Scaffolding order". The `/predict` page (PR 07) needs a deterministic function that turns a user's 72 group-stage score predictions into a fully resolved knockout bracket so they can fill knockout scores. The pipeline is documented in `ARCHITECTURE.md` "Tournament Structure → R32 bracket pairings": per-group standings (FIFA tiebreakers, MVP-truncated) → rank 3rd-placed teams → Annex C lookup → fill R32 slots → progress the bracket through R16/QF/SF/Final.

PR 05 already delivered `lib/annex-c.ts` (`getR32Layout`) and `lib/annex-c-matches.ts` (`R32_MATCHES`, `DYNAMIC_HOST_GROUP`, `DYNAMIC_R32_MATCH_KEYS`). PR 03's seed populated `matches` with `home_slot_label` / `away_slot_label` for all knockout rows, so the DB side is wired. This PR is **pure logic + tests** — no DB writes, no UI.

The R16/QF/SF/Final progression is in `tmp/fwc2026_regs.txt` §12.7–12.11 (lines 896–998); the layout is fixed (not draw-dependent), so we hard-code it.

## Approach

One pure entry point: `deriveBracket(input) → DerivedBracket`. Inputs are DB-agnostic — the function takes structured prediction rows, not Supabase rows directly. The caller in PR 07 will adapt DB shapes to this input.

### Input shape — `lib/bracket.ts`

```ts
export type GroupLetter = "A"|"B"|"C"|"D"|"E"|"F"|"G"|"H"|"I"|"J"|"K"|"L";

export type GroupMatchPrediction = {
  group: GroupLetter;
  homeTeam: string;        // canonical Czech team name — stable key
  awayTeam: string;
  homeScore: number;
  awayScore: number;
};

export type DeriveInput = {
  /** All 72 group-stage predictions. Order irrelevant. */
  groupPredictions: GroupMatchPrediction[];
  /** Optional override; defaults to all 12 groups A–L from input. */
  teamsByGroup?: Record<GroupLetter, string[]>;
};
```

We key teams by **canonical Czech name** (not `team_id`) so tests can write fixtures without UUIDs. PR 07's adapter resolves `team_id` ↔ name once.

### Output shape

```ts
export type GroupStanding = {
  team: string;
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number;
  points: number;
  position: 1 | 2 | 3 | 4;
};

export type ThirdPlaceRanking = {
  team: string;
  group: GroupLetter;
  /** rank 1..12; top 8 advance */
  rank: number;
  qualifies: boolean;
};

export type KnockoutSlot = {
  matchKey: string;        // "M73".."M104"
  round: "r32" | "r16" | "qf" | "sf" | "final";
  homeTeam: string | null; // null only if upstream slot can't resolve (shouldn't happen for R32)
  awayTeam: string | null;
  /** Original slot label, kept for UI fallback. */
  homeSlotLabel: string;
  awaySlotLabel: string;
};

export type DerivedBracket = {
  groupStandings: Record<GroupLetter, GroupStanding[]>; // length 4, sorted 1→4
  thirdPlaceRanking: ThirdPlaceRanking[];               // length 12, sorted by rank
  annexCOption: number;
  /** All 16 R32 matches with teams filled in. */
  r32: KnockoutSlot[];
};

export function deriveBracket(input: DeriveInput): DerivedBracket;
```

**R32 only in the output.** R16/QF/SF/Final teams depend on the user's *knockout* predictions (collected in PR 07), so the engine can't pre-fill them. PR 07 will call a separate helper `advanceBracket(r32, knockoutPicks) → fullBracket` — kept out of scope here, see Out of scope.

### Tiebreaker pipeline (code)

`rankGroup(teams: GroupStanding[], matches: GroupMatchPrediction[]): GroupStanding[]`:

1. Sort by `points` desc.
2. Find runs of teams tied on points. For each run of size ≥ 2:
   - Build a head-to-head sub-table from `matches` restricted to fixtures where both teams are in the tied run.
   - Recompute pts / GD / GF on that sub-table.
   - Re-sort the run by: h2h points → h2h GD → h2h GF.
   - If a sub-run is still tied after h2h, fall through.
3. Within any still-tied sub-run, sort by: overall GD → overall GF → alphabetical (Czech locale, `team.localeCompare(other, "cs")`).
4. Assign `position` 1..4 in final order.

The pipeline lives in `lib/bracket-tiebreak.ts` and is imported by `bracket.ts`. Exported standalone so tests can hit it directly.

### Third-place ranking

`rankThirdPlaced(standings): ThirdPlaceRanking[]`:

Take each group's `position === 3` team, sort by: points → GD → GF → alphabetical (`cs` collation). Top 8 get `qualifies: true`.

### R32 slot filling

For each entry in `R32_MATCHES` (from `lib/annex-c-matches.ts`):

- `home` slot string like `"1A"` → `groupStandings.A[0].team`.
- Static `away` slot string like `"2B"` → `groupStandings.B[1].team`.
- Dynamic `awayThirdSlot: "M74"` → use `getR32Layout(qualifyingGroups).slots.M74` to get the source group letter, then `groupStandings[letter][2].team`.
- Keep the seed's existing `homeSlotLabel` / `awaySlotLabel` strings (e.g. `"Vítěz skupiny A"`) passed through — PR 07 needs them for the fallback UI.

A small `resolveSlot(slot: R32Slot, standings): string` helper handles the 1/2/3 + letter parsing.

### Knockout progression metadata — `lib/bracket-matches.ts`

Hard-coded from §12.7–12.11. Companion to `lib/annex-c-matches.ts`. Not used by `deriveBracket` itself, but lives next to it and will be the canonical source PR 07 / PR 09 import:

```ts
export type KnockoutMatch = {
  matchKey: string;     // "M89" .. "M104"
  round: "r16" | "qf" | "sf" | "final";
  /** Match key whose winner fills this match's home/away slot. */
  homeFrom: string;     // e.g. "M74"
  awayFrom: string;     // e.g. "M77"
};

export const R16_MATCHES: KnockoutMatch[] = [
  { matchKey: "M89", round: "r16", homeFrom: "M74", awayFrom: "M77" },
  { matchKey: "M90", round: "r16", homeFrom: "M73", awayFrom: "M75" },
  { matchKey: "M91", round: "r16", homeFrom: "M76", awayFrom: "M78" },
  { matchKey: "M92", round: "r16", homeFrom: "M79", awayFrom: "M80" },
  { matchKey: "M93", round: "r16", homeFrom: "M83", awayFrom: "M84" },
  { matchKey: "M94", round: "r16", homeFrom: "M81", awayFrom: "M82" },
  { matchKey: "M95", round: "r16", homeFrom: "M86", awayFrom: "M88" },
  { matchKey: "M96", round: "r16", homeFrom: "M85", awayFrom: "M87" },
];
export const QF_MATCHES: KnockoutMatch[] = [
  { matchKey: "M97",  round: "qf", homeFrom: "M89", awayFrom: "M90" },
  { matchKey: "M98",  round: "qf", homeFrom: "M93", awayFrom: "M94" },
  { matchKey: "M99",  round: "qf", homeFrom: "M91", awayFrom: "M92" },
  { matchKey: "M100", round: "qf", homeFrom: "M95", awayFrom: "M96" },
];
export const SF_MATCHES: KnockoutMatch[] = [
  { matchKey: "M101", round: "sf", homeFrom: "M97", awayFrom: "M98" },
  { matchKey: "M102", round: "sf", homeFrom: "M99", awayFrom: "M100" },
];
export const FINAL_MATCH: KnockoutMatch =
  { matchKey: "M104", round: "final", homeFrom: "M101", awayFrom: "M102" };
// M103 (3rd-place playoff) intentionally omitted — out of scope per CLAUDE.md.
```

### Test strategy — `lib/bracket.test.ts`

Vitest is already wired (`npm run test`). A helper `buildGroup(group, teams, results)` generates the 6 `GroupMatchPrediction` rows from a 4-team round-robin given per-fixture scores — cuts fixture noise. Test cases:

1. **Clean group** — Group A: Argentina 9 pts, Mexiko 6, Saudská Arábie 3, Polsko 0 (decisive wins all round). Expect positions 1→4 in that exact order; no tiebreaker invoked.
2. **Head-to-head tiebreaker** — three teams in Group B tied on 6 pts; Brazílie beat Švýcarsko, Švýcarsko beat Kamerun, Brazílie beat Kamerun (mini round-robin). H2H points: Brazílie 6, Švýcarsko 3, Kamerun 0 → ranks 1/2/3. Asserts the sub-table is built only from h2h fixtures.
3. **Three-way tie falling through to alphabetical** — three teams tied on points AND identical h2h (e.g. all draws against each other) AND identical overall GD AND identical GF. Final ranks decided by Czech alphabetical sort (`Belgie` < `Chorvatsko` < `Dánsko`). Pins the deterministic fallback.
4. **Third-place ranking** — full 12-group fixture; assert exactly 8 `qualifies: true`, ranking respects pts→GD→GF→alpha, and edge case where 9th and 8th teams are tied except alphabetically.
5. **End-to-end Annex C wiring** — construct 12 groups whose 3rd-placed qualifiers are groups `E F G H I J K L` (Annex C option 1's `qualifyingGroups`). Assert `annexCOption === 1` and `r32` entries match: e.g. `M74.home === groupStandings.E[0].team`, `M74.away === groupStandings.F[2].team` (or whichever letter row 1 of `data/annex-c.json` actually maps — pin to the JSON at implementation time).
6. **Input validation** — fewer than 72 predictions → throws; duplicate fixture (same home/away pair twice in a group) → throws; team referenced in match not in `teamsByGroup` → throws.

## Files

**Create:**
- `/projects/VFT/lib/bracket.ts` — `deriveBracket()`, types, slot resolver. Re-exports types PR 07 needs.
- `/projects/VFT/lib/bracket-tiebreak.ts` — `rankGroup()`, `rankThirdPlaced()`. Standalone for direct testing.
- `/projects/VFT/lib/bracket-matches.ts` — `R16_MATCHES`, `QF_MATCHES`, `SF_MATCHES`, `FINAL_MATCH` constants from §12.7–12.11.
- `/projects/VFT/lib/bracket.test.ts` — vitest suite covering the 6 cases above.
- `/projects/VFT/lib/bracket-tiebreak.test.ts` — focused unit tests for the tiebreaker chain (cases 1–3 above isolated to `rankGroup`).
- `/projects/VFT/lib/test-fixtures/groups.ts` — `buildGroup()` helper + canonical 12-group fixture used across tests.

**Modify:**
- None. PR 05's files are imported as-is; schema is untouched.

## Verification

1. `npm run test` — all suites green, including the 6 cases above. At least one test per round of the tiebreaker chain.
2. `npx tsc --noEmit` clean. `npm run lint` clean. `npm run build` clean.
3. Hand-trace: from a scratch `tsx` repl, call `deriveBracket` with the test fixture and `console.log(JSON.stringify(result.r32, null, 2))`. Confirm 16 entries, all `homeTeam`/`awayTeam` non-null, no team appears twice across R32.
4. Cross-check `annexCOption` for the end-to-end fixture against row 1 of `data/annex-c.json` directly.
5. Invariant assertion inside `deriveBracket` (dev mode only, via `if (process.env.NODE_ENV !== "production")`): the 32 R32 participants are all distinct.

## Out of scope

- `/predict` UI, live-derived standings preview, and the DB → engine adapter → **PR 07**.
- `advanceBracket(r32, knockoutPicks)` for filling R16→Final after the user enters knockout scores → **PR 07** (lives in `lib/bracket.ts`, separate function).
- Persisting derived bracket back into `matches.home_team_id` / `away_team_id` once real results land → **PR 08** (results cron).
- Points engine consuming the derived bracket → **PR 09**.
- 3rd-place playoff (M103) — excluded from predictions per CLAUDE.md.
- FIFA tiebreaker steps 6 (fair play) and 7 (world ranking) — MVP truncation already documented in `ARCHITECTURE.md`; not derivable from score predictions.
