/**
 * Computes which knockout match slots change teams between two derived
 * brackets. Used by the /predict edit-cascade flow: when the user changes
 * a group-stage score, we re-derive the bracket and ask "which knockout
 * predictions reference slots whose teams just changed?".
 *
 * The diff walks R32 directly, then propagates forward through R16/QF/SF/
 * Final via the static feeder edges in bracket-matches.ts: if a feeder
 * match is in the affected set AND the user predicted the dependent match,
 * the dependent match is also affected (because the winner the user picked
 * may no longer be one of the now-different teams).
 */

import type { DerivedBracket } from "./bracket";
import {
  FINAL_MATCH,
  QF_MATCHES,
  R16_MATCHES,
  SF_MATCHES,
  type KnockoutMatch,
} from "./bracket-matches";

export type BracketDiff = {
  /** matchKeys of knockout matches whose teams (or feeders) changed AND the user has a prediction for. */
  affected: Set<string>;
};

/**
 * @param oldBracket Previous derived bracket (before applying the group edit).
 * @param newBracket New derived bracket (after applying the group edit).
 * @param predictedMatchKeys Keys for which the user has a stored knockout prediction.
 */
export function diffBracket(
  oldBracket: DerivedBracket,
  newBracket: DerivedBracket,
  predictedMatchKeys: ReadonlySet<string>,
): BracketDiff {
  const teamsChanged = new Set<string>();

  // R32 layer: direct team comparison.
  const oldR32 = new Map(oldBracket.r32.map((m) => [m.matchKey, m]));
  for (const newMatch of newBracket.r32) {
    const oldMatch = oldR32.get(newMatch.matchKey);
    if (!oldMatch) continue;
    if (oldMatch.homeTeam !== newMatch.homeTeam || oldMatch.awayTeam !== newMatch.awayTeam) {
      teamsChanged.add(newMatch.matchKey);
    }
  }

  // Walk forward through R16 -> QF -> SF -> Final, marking any match whose
  // feeder is already in teamsChanged.
  const propagate = (rounds: ReadonlyArray<KnockoutMatch>) => {
    for (const m of rounds) {
      if (teamsChanged.has(m.homeFrom) || teamsChanged.has(m.awayFrom)) {
        teamsChanged.add(m.matchKey);
      }
    }
  };
  propagate(R16_MATCHES);
  propagate(QF_MATCHES);
  propagate(SF_MATCHES);
  propagate([FINAL_MATCH]);

  // Intersect with what the user has actually predicted — only those count
  // as user-visible "affected".
  const affected = new Set<string>();
  for (const key of teamsChanged) {
    if (predictedMatchKeys.has(key)) affected.add(key);
  }
  return { affected };
}
