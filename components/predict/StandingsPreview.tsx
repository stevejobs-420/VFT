"use client";

import { useMemo } from "react";
import { rankGroup, type FixtureScore } from "@/lib/bracket-tiebreak";
import type { GroupLetter } from "@/lib/bracket-types";
import type { GroupMatchView, PredictionView } from "@/lib/predict-types";
import styles from "./StandingsPreview.module.css";

type Props = {
  groupLetter: GroupLetter;
  teams: { id: string; name: string }[];
  matches: GroupMatchView[];
  predictionsByMatch: Record<string, PredictionView>;
  /** Set of group letters whose 3rd-placed team qualifies. null when group stage isn't fully filled yet. */
  qualifyingThirdGroups: Set<string> | null;
};

export function StandingsPreview({
  groupLetter,
  teams,
  matches,
  predictionsByMatch,
  qualifyingThirdGroups,
}: Props) {
  const standings = useMemo(() => {
    const fixtures: FixtureScore[] = [];
    for (const m of matches) {
      const p = predictionsByMatch[m.matchId];
      if (!p || p.homeScore === null || p.awayScore === null) return null;
      fixtures.push({
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
      });
    }
    return rankGroup(
      teams.map((t) => t.name),
      fixtures,
    );
  }, [teams, matches, predictionsByMatch]);

  if (standings === null) {
    return (
      <div className={styles.pending}>
        Doplň všech 6 zápasů ve skupině, ať uvidíš pořadí.
      </div>
    );
  }

  const thirdQualifies = qualifyingThirdGroups?.has(groupLetter) ?? false;

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.posHeader}>#</th>
          <th className={styles.teamHeader}>Tým</th>
          <th>Z</th>
          <th>V</th>
          <th>R</th>
          <th>P</th>
          <th>Skóre</th>
          <th>B</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s) => {
          const qualifies =
            s.position === 1 || s.position === 2 || (s.position === 3 && thirdQualifies);
          return (
            <tr
              key={s.team}
              className={`${styles.row} ${qualifies ? styles.rowQualifies : ""}`}
            >
              <td className={styles.pos}>{s.position}</td>
              <td className={styles.team}>{s.team}</td>
              <td>{s.played}</td>
              <td>{s.won}</td>
              <td>{s.drawn}</td>
              <td>{s.lost}</td>
              <td className={styles.score}>
                {s.goalsFor}:{s.goalsAgainst}
              </td>
              <td className={styles.points}>{s.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
