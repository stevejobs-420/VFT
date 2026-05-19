/**
 * Walks the knockout bracket round by round. Given the resolved R32 (from
 * `deriveBracket`) and the user's knockout score predictions, fills in
 * R16/QF/SF/Final teams based on who the user picked to win each match.
 *
 * Pure function — no DB, no I/O. Called from a useMemo on the predict page.
 *
 * Winner rule: home if homeScore > awayScore, away if awayScore > homeScore,
 * else null. Null winner blocks downstream slots (homeTeam/awayTeam become
 * null in the next round's match for the dependent side). M103 (3rd-place
 * playoff) is excluded — out of scope per CLAUDE.md.
 */

import type { KnockoutSlot } from "./bracket";
import {
  FINAL_MATCH,
  QF_MATCHES,
  R16_MATCHES,
  SF_MATCHES,
  type KnockoutMatch,
  type KnockoutRound,
} from "./bracket-matches";

export type KnockoutScorePrediction = {
  homeScore: number | null;
  awayScore: number | null;
};

export type ResolvedKnockoutMatch = {
  matchKey: string;
  round: "r32" | KnockoutRound;
  homeTeam: string | null;
  awayTeam: string | null;
  homeSlotLabel: string;
  awaySlotLabel: string;
  prediction: KnockoutScorePrediction | null;
  winner: string | null;
};

export type AdvancedBracket = {
  r32: ResolvedKnockoutMatch[];
  r16: ResolvedKnockoutMatch[];
  qf: ResolvedKnockoutMatch[];
  sf: ResolvedKnockoutMatch[];
  final: ResolvedKnockoutMatch;
  champion: string | null;
};

function computeWinner(
  homeTeam: string | null,
  awayTeam: string | null,
  prediction: KnockoutScorePrediction | null,
): string | null {
  if (!homeTeam || !awayTeam || !prediction) return null;
  const { homeScore, awayScore } = prediction;
  if (homeScore === null || awayScore === null) return null;
  if (homeScore > awayScore) return homeTeam;
  if (awayScore > homeScore) return awayTeam;
  return null;
}

function resolveR32(
  r32: KnockoutSlot[],
  predictionsByKey: Map<string, KnockoutScorePrediction>,
): ResolvedKnockoutMatch[] {
  return r32.map((slot) => {
    const prediction = predictionsByKey.get(slot.matchKey) ?? null;
    const winner = computeWinner(slot.homeTeam, slot.awayTeam, prediction);
    return {
      matchKey: slot.matchKey,
      round: "r32",
      homeTeam: slot.homeTeam,
      awayTeam: slot.awayTeam,
      homeSlotLabel: slot.homeSlot,
      awaySlotLabel:
        typeof slot.awaySlot === "string" ? slot.awaySlot : `3${slot.awaySlot.group}`,
      prediction,
      winner,
    };
  });
}

function resolveRound(
  matches: readonly KnockoutMatch[],
  winnersByMatchKey: Map<string, string | null>,
  predictionsByKey: Map<string, KnockoutScorePrediction>,
): ResolvedKnockoutMatch[] {
  return matches.map((m) => {
    const homeTeam = winnersByMatchKey.get(m.homeFrom) ?? null;
    const awayTeam = winnersByMatchKey.get(m.awayFrom) ?? null;
    const prediction = predictionsByKey.get(m.matchKey) ?? null;
    const winner = computeWinner(homeTeam, awayTeam, prediction);
    return {
      matchKey: m.matchKey,
      round: m.round,
      homeTeam,
      awayTeam,
      homeSlotLabel: `Vítěz ${m.homeFrom}`,
      awaySlotLabel: `Vítěz ${m.awayFrom}`,
      prediction,
      winner,
    };
  });
}

export function advanceBracket(
  r32: KnockoutSlot[],
  predictionsByKey: Map<string, KnockoutScorePrediction>,
): AdvancedBracket {
  const r32Resolved = resolveR32(r32, predictionsByKey);
  const winnersAfterR32 = new Map<string, string | null>(
    r32Resolved.map((m) => [m.matchKey, m.winner]),
  );

  const r16 = resolveRound(R16_MATCHES, winnersAfterR32, predictionsByKey);
  const winnersAfterR16 = new Map<string, string | null>([
    ...winnersAfterR32,
    ...r16.map((m) => [m.matchKey, m.winner] as const),
  ]);

  const qf = resolveRound(QF_MATCHES, winnersAfterR16, predictionsByKey);
  const winnersAfterQf = new Map<string, string | null>([
    ...winnersAfterR16,
    ...qf.map((m) => [m.matchKey, m.winner] as const),
  ]);

  const sf = resolveRound(SF_MATCHES, winnersAfterQf, predictionsByKey);
  const winnersAfterSf = new Map<string, string | null>([
    ...winnersAfterQf,
    ...sf.map((m) => [m.matchKey, m.winner] as const),
  ]);

  const [final] = resolveRound([FINAL_MATCH], winnersAfterSf, predictionsByKey);

  return {
    r32: r32Resolved,
    r16,
    qf,
    sf,
    final,
    champion: final.winner,
  };
}
