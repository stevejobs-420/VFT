/**
 * R16 → Final bracket progression, hard-coded from FIFA's 2026 Competition
 * Regulations §12.7–12.11. Verified against the published bracket on
 * 2026-05-19 by reading tmp/fwc2026_regs.txt.
 *
 * Companion to lib/annex-c-matches.ts (which covers R32). M103 (3rd-place
 * playoff) is intentionally omitted — out of scope per CLAUDE.md.
 */

export type KnockoutRound = "r16" | "qf" | "sf" | "final";

export type KnockoutMatch = {
  matchKey: string;
  round: KnockoutRound;
  /** Match key whose winner fills this match's home slot. */
  homeFrom: string;
  /** Match key whose winner fills this match's away slot. */
  awayFrom: string;
};

export const R16_MATCHES: readonly KnockoutMatch[] = [
  { matchKey: "M89", round: "r16", homeFrom: "M74", awayFrom: "M77" },
  { matchKey: "M90", round: "r16", homeFrom: "M73", awayFrom: "M75" },
  { matchKey: "M91", round: "r16", homeFrom: "M76", awayFrom: "M78" },
  { matchKey: "M92", round: "r16", homeFrom: "M79", awayFrom: "M80" },
  { matchKey: "M93", round: "r16", homeFrom: "M83", awayFrom: "M84" },
  { matchKey: "M94", round: "r16", homeFrom: "M81", awayFrom: "M82" },
  { matchKey: "M95", round: "r16", homeFrom: "M86", awayFrom: "M88" },
  { matchKey: "M96", round: "r16", homeFrom: "M85", awayFrom: "M87" },
] as const;

export const QF_MATCHES: readonly KnockoutMatch[] = [
  { matchKey: "M97", round: "qf", homeFrom: "M89", awayFrom: "M90" },
  { matchKey: "M98", round: "qf", homeFrom: "M93", awayFrom: "M94" },
  { matchKey: "M99", round: "qf", homeFrom: "M91", awayFrom: "M92" },
  { matchKey: "M100", round: "qf", homeFrom: "M95", awayFrom: "M96" },
] as const;

export const SF_MATCHES: readonly KnockoutMatch[] = [
  { matchKey: "M101", round: "sf", homeFrom: "M97", awayFrom: "M98" },
  { matchKey: "M102", round: "sf", homeFrom: "M99", awayFrom: "M100" },
] as const;

export const FINAL_MATCH: KnockoutMatch = {
  matchKey: "M104",
  round: "final",
  homeFrom: "M101",
  awayFrom: "M102",
};
