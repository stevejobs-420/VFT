/**
 * Fixture helpers for bracket tests. Generates the 6 round-robin
 * predictions for a 4-team group given per-fixture scores.
 */

import type { GroupLetter } from "../bracket-types";
import type { GroupMatchPrediction } from "../bracket";

/**
 * The 6 fixtures of a 4-team round-robin in canonical order:
 *   T1-T2, T1-T3, T1-T4, T2-T3, T2-T4, T3-T4
 *
 * `scores[i]` = [home, away] for fixture i (home being the first-listed team).
 */
export function buildGroup(
  group: GroupLetter,
  teams: [string, string, string, string],
  scores: ReadonlyArray<readonly [number, number]>,
): GroupMatchPrediction[] {
  if (scores.length !== 6) {
    throw new Error(`buildGroup expects 6 scores, got ${scores.length}`);
  }
  const fixtures: Array<readonly [string, string]> = [
    [teams[0], teams[1]],
    [teams[0], teams[2]],
    [teams[0], teams[3]],
    [teams[1], teams[2]],
    [teams[1], teams[3]],
    [teams[2], teams[3]],
  ];
  return fixtures.map(([home, away], i) => ({
    group,
    homeTeam: home,
    awayTeam: away,
    homeScore: scores[i][0],
    awayScore: scores[i][1],
  }));
}
