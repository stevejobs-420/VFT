"use client";

import type { ResolvedKnockoutMatch } from "@/lib/advance-bracket";
import type { SaveStatus } from "@/lib/predict-types";
import { KnockoutMatch } from "./KnockoutMatch";
import styles from "./BracketRound.module.css";

type Props = {
  title: string;
  matches: ResolvedKnockoutMatch[];
  statusByMatchKey: Record<string, { status: SaveStatus; error: string | null }>;
  recentlyChanged: Set<string>;
  lockedByMatchKey: Record<string, boolean>;
  wipeVersionByKey: Record<string, number>;
  onScoreChange: (matchKey: string, home: number | null, away: number | null) => void;
};

export function BracketRound({
  title,
  matches,
  statusByMatchKey,
  recentlyChanged,
  lockedByMatchKey,
  wipeVersionByKey,
  onScoreChange,
}: Props) {
  return (
    <section className={styles.round}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.matches}>
        {matches.map((m) => {
          const s = statusByMatchKey[m.matchKey] ?? { status: "idle" as const, error: null };
          // wipeVersion bumps only on cascade wipes — re-mounts the row so
          // it picks up the now-empty prediction. User-typed saves don't
          // bump it, so Tab order across matches is preserved.
          const wipeVersion = wipeVersionByKey[m.matchKey] ?? 0;
          return (
            <KnockoutMatch
              key={`${m.matchKey}:${wipeVersion}`}
              match={m}
              status={s.status}
              error={s.error}
              locked={lockedByMatchKey[m.matchKey] ?? false}
              recentlyChanged={recentlyChanged.has(m.matchKey)}
              onScoreChange={(h, a) => onScoreChange(m.matchKey, h, a)}
            />
          );
        })}
      </div>
    </section>
  );
}
