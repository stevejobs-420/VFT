/**
 * The 16 R32 matches in fixed slot order, exactly as specified in FIFA's
 * 2026 Competition Regulations §12.6 ("Round of 32" bracket).
 *
 * Eight matches are STATIC — winner-vs-runner-up pairings that never change.
 * Eight matches are DYNAMIC — the away slot is filled by one of the 12
 * third-placed teams once group standings + Annex C lookup resolve.
 *
 * Slot strings ("1A", "2B", "3E") match the dialect already used in
 * matches.home_slot_label / away_slot_label from PR 03's seed.
 */

export type R32Slot = `${"1" | "2" | "3"}${
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
  | "L"}`;

export type StaticR32Match = {
  match: number;
  home: R32Slot;
  away: R32Slot;
};

export type DynamicR32Match = {
  match: number;
  home: R32Slot;
  /** The Annex C column whose lookup fills this match's away slot. */
  awayThirdSlot: DynamicR32MatchKey;
};

/** The 8 dynamic R32 matches, in Annex C's column order. */
export const DYNAMIC_R32_MATCH_KEYS = [
  "M79", // 1A vs 3?
  "M85", // 1B vs 3?
  "M81", // 1D vs 3?
  "M74", // 1E vs 3?
  "M82", // 1G vs 3?
  "M77", // 1I vs 3?
  "M87", // 1K vs 3?
  "M80", // 1L vs 3?
] as const;

export type DynamicR32MatchKey = (typeof DYNAMIC_R32_MATCH_KEYS)[number];

export const R32_MATCHES: ReadonlyArray<StaticR32Match | DynamicR32Match> = [
  { match: 73, home: "2A", away: "2B" },
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

/** Host group letter ("A".."L") of each dynamic R32 match. */
export const DYNAMIC_HOST_GROUP: Record<DynamicR32MatchKey, string> = {
  M79: "A",
  M85: "B",
  M81: "D",
  M74: "E",
  M82: "G",
  M77: "I",
  M87: "K",
  M80: "L",
};
