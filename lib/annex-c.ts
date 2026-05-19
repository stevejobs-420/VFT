/**
 * Typed loader for Annex C — the 495 possible R32 bracket layouts based on
 * which 8 of the 12 third-placed teams qualify. Source: data/annex-c.json,
 * produced by scripts/extract-annex-c.ts from FIFA's 2026 Competition
 * Regulations (see ARCHITECTURE.md "Tournament Structure → R32 bracket
 * pairings").
 */

import annexC from "../data/annex-c.json";
import type { DynamicR32MatchKey } from "./annex-c-matches";

export type GroupLetter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L";

export type AnnexCEntry = {
  option: number;
  qualifyingGroups: string;
  slots: Record<DynamicR32MatchKey, GroupLetter>;
};

const TABLE = annexC as Record<string, AnnexCEntry>;

/**
 * Look up the R32 layout for a given set of 8 qualifying 3rd-placed groups.
 *
 * Input: any 8 distinct group letters representing the groups whose
 * 3rd-placed teams advance to R32 (order doesn't matter).
 *
 * Returns the Annex C entry: option number + per-match slot assignments
 * keyed by DynamicR32MatchKey ("M74", "M77", ..., "M87").
 *
 * Throws if input has the wrong length, contains duplicates, or no Annex C
 * entry exists for the combination.
 */
export function getR32Layout(qualifyingGroups: GroupLetter[]): AnnexCEntry {
  if (qualifyingGroups.length !== 8) {
    throw new Error(`expected 8 groups, got ${qualifyingGroups.length}`);
  }
  const distinct = [...new Set(qualifyingGroups)];
  if (distinct.length !== 8) {
    throw new Error("duplicate group letters in qualifyingGroups");
  }
  const key = distinct.sort().join("");
  const entry = TABLE[key];
  if (!entry) {
    throw new Error(`no Annex C entry for key ${key}`);
  }
  return entry;
}

/** All 495 entries, indexed by sorted 8-letter key. */
export function getAllEntries(): Readonly<Record<string, AnnexCEntry>> {
  return TABLE;
}
