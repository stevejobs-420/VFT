# 05 — Annex C R32 mapping

## Context

Step 5 of `ARCHITECTURE.md` "Scaffolding order". The bracket-derivation pipeline (`ARCHITECTURE.md` "Tournament Structure → R32 bracket pairings") needs a deterministic way to seed the R32 once a user's group-stage predictions resolve which 8 of the 12 third-placed teams advance. FIFA defines this in **Annex C** of the 2026 Competition Regulations — **495 = C(12, 8)** possible rows.

PR 06 (bracket engine) will plug the lookup into the pipeline. PR 03's seed already wrote 32 placeholder knockout rows; this PR just delivers the data + helper. No DB writes, no UI.

**Source confirmed.** The official PDF lives at `https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf` (Annex C, pp. 81–95). `pdftotext -layout` extracts all 495 rows cleanly — verified, no transcription needed.

**Table structure** (from §12.6 + Annex C of the regs):

- **Columns:** the 8 R32 matches whose "Team B" is a best-third-placed team — `M74, M77, M79, M80, M81, M82, M85, M87`, hosted by group winners `1E, 1I, 1A, 1L, 1D, 1G, 1B, 1K` respectively.
- **Rows:** option 1..495, each cell is a slot label like `3E` (i.e. the 3rd-placed team from group E goes to that match's away slot).
- The remaining 8 R32 matches (`M73, M75, M76, M78, M83, M84, M86, M88`) are static (winner-vs-runner-up only) and live in code, not in the JSON.

## Approach

**One-shot extraction script + JSON artifact + thin TS loader.** The PDF is the canonical source; we run the extractor once, commit the resulting JSON, and never re-parse at runtime.

### 1. Extraction script — `scripts/extract-annex-c.ts`

- Reads `tmp/fwc2026_regs.txt` (produced by `pdftotext -layout fwc2026_regs.pdf` — README documents the prep step). Does **not** download the PDF at runtime; the script is a build-time tool, not a cron.
- Regex per row: `/^\s*(\d{1,3})\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s*$/m` — yields the 8 group letters in column order (M74, M77, M79, M80, M81, M82, M85, M87).
- For each row build:
  ```ts
  {
    option: number,              // 1..495
    qualifyingGroups: string,    // sorted 8-char key, e.g. "CDEFGHJK"
    slots: { M74, M77, M79, M80, M81, M82, M85, M87: "A".."L" }
  }
  ```
  `qualifyingGroups` is the union of all 8 group letters in the row, sorted — the lookup key.
- Writes `data/annex-c.json` (a plain object keyed by `qualifyingGroups` → option entry).
- **Asserts in the script itself**, before writing the file:
  - Exactly 495 rows parsed.
  - All 495 `qualifyingGroups` keys are distinct (no two FIFA options share the same set of qualifying groups — verifiable invariant from C(12,8) = 495).
  - For every row, the 8 slot values are exactly the 8 letters in `qualifyingGroups` (set equality).
  - For every row, no R32 pairing puts two teams from the same group together (see §2 for the static pairing list — host group letter must differ from assigned 3rd-place group letter, **and** must differ from both static-pairing host groups it shares a same-group constraint with — practically: just check host ≠ assigned).
- Fails loud and exits non-zero on any assertion miss.

### 2. Static R32 pairings — `lib/annex-c-matches.ts`

Hand-encoded constant from `ARCHITECTURE.md` + §12.6 of the regs. The 16 R32 matches in order:

```ts
export const R32_MATCHES = [
  // M73 — static
  { match: 73, home: "2A", away: "2B" },
  // M74 — 3rd-place slot (key M74)
  { match: 74, home: "1E", awayThirdSlot: "M74" },
  { match: 75, home: "1F", away: "2C" },
  { match: 76, home: "1C", away: "2F" },
  { match: 77, home: "1I", awayThirdSlot: "M77" },
  { match: 78, home: "2E", away: "2I" },
  { match: 79, home: "1A", awayThirdSlot: "M79" },
  { match: 80, home: "1L", awayThirdSlot: "M80" },
  { match: 81, home: "1D", awayThirdSlot: "M81" },
  { match: 82, home: "1G", awayThirdSlot: "M82" },
  { match: 83, home: "2K", away: "2L" },
  { match: 84, home: "1H", away: "2J" },
  { match: 85, home: "1B", awayThirdSlot: "M85" },
  { match: 86, home: "1J", away: "2H" },
  { match: 87, home: "1K", awayThirdSlot: "M87" },
  { match: 88, home: "2D", away: "2G" },
] as const;
```

Slot strings (`"1A"`, `"2B"`, `"3E"`) are the same dialect already used in `home_slot_label` / `away_slot_label` from PR 03's seed — keep them consistent.

### 3. Runtime loader — `lib/annex-c.ts`

```ts
import annexC from "../data/annex-c.json";

export type R32SlotKey = "M74" | "M77" | "M79" | "M80" | "M81" | "M82" | "M85" | "M87";
export type GroupLetter = "A" | "B" | ... | "L";

export type AnnexCEntry = {
  option: number;
  qualifyingGroups: string; // 8-char sorted key
  slots: Record<R32SlotKey, GroupLetter>;
};

export function getR32Layout(qualifyingGroups: GroupLetter[]): AnnexCEntry {
  if (qualifyingGroups.length !== 8) throw new Error(`expected 8 groups, got ${qualifyingGroups.length}`);
  const key = [...new Set(qualifyingGroups)].sort().join("");
  if (key.length !== 8) throw new Error("duplicate group letters in qualifyingGroups");
  const entry = (annexC as Record<string, AnnexCEntry>)[key];
  if (!entry) throw new Error(`no Annex C entry for key ${key}`);
  return entry;
}
```

PR 06's bracket engine consumes this to fill the 8 dynamic `away_slot_label` rows in `matches`.

### 4. Tests — `lib/annex-c.test.ts`

Vitest (add as devDep — first test in the repo, so wire `npm run test` → `vitest`). Cases:

- `getR32Layout` returns option 1 for `["A","B","D","E","G","I","K","L"]` → maps to slots `M74=E, M77=H` … wait, option 1's qualifying groups are `{E, J, I, F, H, G, L, K}` (from `1A→3E, 1B→3J, 1D→3I, 1E→3F, 1G→3H, 1I→3G, 1K→3L, 1L→3K`). Test with the real option 1 input: key `EFGHIJKL`, expect slots `{M74:F, M77:H, M79:E, M80:H→...}` — finalised at implementation time by reading row 1 directly from the JSON. (The point is the test pins one known row end-to-end.)
- Throws on wrong length, duplicate letters, unknown key.
- Snapshot test: total entries === 495.
- Invariant test: for every entry, the host group of the R32 match (from `R32_MATCHES`) is never equal to the assigned 3rd-place group — i.e. no team meets another from its own group in R32.

## Files

**Create:**
- `/projects/VFT/scripts/extract-annex-c.ts` — one-shot extractor with built-in assertions.
- `/projects/VFT/data/annex-c.json` — committed output, 495 entries keyed by sorted 8-letter combo.
- `/projects/VFT/lib/annex-c.ts` — typed loader with `getR32Layout()`.
- `/projects/VFT/lib/annex-c-matches.ts` — `R32_MATCHES` static constant.
- `/projects/VFT/lib/annex-c.test.ts` — vitest suite.
- `/projects/VFT/vitest.config.ts` — minimal config.

**Modify:**
- `/projects/VFT/package.json` — add `vitest` devDep, `"test": "vitest run"`, `"extract-annex-c": "tsx scripts/extract-annex-c.ts"`.
- `/projects/VFT/README.md` — short "Regenerating Annex C" section: download PDF → `pdftotext -layout … tmp/fwc2026_regs.txt` → `npm run extract-annex-c`. Note that the JSON is committed; the script only needs to run if FIFA amends the regulations.
- `/projects/VFT/.gitignore` — ensure `tmp/` is ignored.

## Verification

1. `pdftotext -layout fwc2026_regs.pdf tmp/fwc2026_regs.txt` then `npm run extract-annex-c` → exits 0, writes `data/annex-c.json` with exactly 495 keys.
2. `npm run test` — all assertions pass: 495 entries, distinct keys, no same-group R32 pairings, key spot-check against option 1.
3. `npm run build` + `npm run lint` clean. `npx tsc --noEmit` clean.
4. Hand-trace: import `getR32Layout` from a temporary scratch file with `["E","F","G","H","I","J","K","L"]` → returns the entry whose `option === 1`. Slots match row 1 of the PDF.

## Out of scope

- Group-standings derivation + FIFA tiebreaker pipeline → PR 06.
- Third-placed ranking (which 8 of 12 advance) → PR 06.
- Writing resolved team ids into `matches.home_team_id` / `away_team_id` after group stage → PR 06 (in-memory per user) + PR 08 (DB-level once real results land).
- Czech UI labels for R32 slot display ("3. místo skupiny E") → PR 07 (`/predict` page).
