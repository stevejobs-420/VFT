"use client";

import type { GroupView, PredictionView, SaveStatus } from "@/lib/predict-types";
import { MatchRow } from "./MatchRow";
import { StandingsPreview } from "./StandingsPreview";
import styles from "./GroupCard.module.css";

type Props = {
  group: GroupView;
  predictionsByMatch: Record<string, PredictionView>;
  statusByMatch: Record<string, { status: SaveStatus; error: string | null }>;
  onScoreChange: (matchId: string, homeScore: number | null, awayScore: number | null) => void;
};

export function GroupCard({ group, predictionsByMatch, statusByMatch, onScoreChange }: Props) {
  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <h2 className={styles.heading}>Skupina {group.letter}</h2>
        <div className={styles.teams}>
          {group.teams.map((t) => (
            <span key={t.id} className={styles.teamChip}>
              {t.flagUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.flagUrl} alt="" className={styles.chipFlag} width={16} height={12} />
              )}
              {t.name}
            </span>
          ))}
        </div>
      </header>
      <div className={styles.matches}>
        {group.matches.map((m) => {
          const p = predictionsByMatch[m.matchId];
          const s = statusByMatch[m.matchId] ?? { status: "idle" as const, error: null };
          return (
            <MatchRow
              key={m.matchId}
              match={m}
              homeScore={p?.homeScore ?? null}
              awayScore={p?.awayScore ?? null}
              status={s.status}
              error={s.error}
              onChange={(h, a) => onScoreChange(m.matchId, h, a)}
              locked={p?.locked ?? m.locked}
            />
          );
        })}
      </div>
      <StandingsPreview
        teams={group.teams.map((t) => ({ id: t.id, name: t.name }))}
        matches={group.matches}
        predictionsByMatch={predictionsByMatch}
      />
    </section>
  );
}
