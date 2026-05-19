"use client";

import type { AdvancedBracket } from "@/lib/advance-bracket";
import type { SaveStatus } from "@/lib/predict-types";
import { BracketRound } from "./BracketRound";
import { ChampionBanner } from "./ChampionBanner";
import styles from "./KnockoutSection.module.css";

type Props = {
  groupComplete: boolean;
  groupFilledCount: number;
  advanced: AdvancedBracket | null;
  annexCOption: number | null;
  qualifyingThirdGroups: string[];
  statusByMatchKey: Record<string, { status: SaveStatus; error: string | null }>;
  recentlyChanged: Set<string>;
  lockedByMatchKey: Record<string, boolean>;
  /** Per-matchKey version that bumps on cascade wipe — used by BracketRound to
   *  re-mount affected rows without re-mounting on every normal save. */
  wipeVersionByKey: Record<string, number>;
  onScoreChange: (matchKey: string, home: number | null, away: number | null) => void;
};

export function KnockoutSection({
  groupComplete,
  groupFilledCount,
  advanced,
  annexCOption,
  qualifyingThirdGroups,
  statusByMatchKey,
  recentlyChanged,
  lockedByMatchKey,
  wipeVersionByKey,
  onScoreChange,
}: Props) {
  if (!groupComplete || !advanced) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Vyřazovací část</h2>
        <div className={styles.lockedBanner}>
          Doplň nejdřív všech 72 zápasů ve skupinách — máš {groupFilledCount}/72.
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.heading}>Vyřazovací část</h2>
        <span className={styles.annexBadge}>
          Annex C #{annexCOption} · 3. místa z {qualifyingThirdGroups.join(", ")}
        </span>
      </header>
      <ChampionBanner champion={advanced.champion} />
      <div className={styles.rounds}>
        <BracketRound
          title="Šestnáctifinále"
          matches={advanced.r32}
          statusByMatchKey={statusByMatchKey}
          recentlyChanged={recentlyChanged}
          lockedByMatchKey={lockedByMatchKey}
          wipeVersionByKey={wipeVersionByKey}
          onScoreChange={onScoreChange}
        />
        <BracketRound
          title="Osmifinále"
          matches={advanced.r16}
          statusByMatchKey={statusByMatchKey}
          recentlyChanged={recentlyChanged}
          lockedByMatchKey={lockedByMatchKey}
          wipeVersionByKey={wipeVersionByKey}
          onScoreChange={onScoreChange}
        />
        <BracketRound
          title="Čtvrtfinále"
          matches={advanced.qf}
          statusByMatchKey={statusByMatchKey}
          recentlyChanged={recentlyChanged}
          lockedByMatchKey={lockedByMatchKey}
          wipeVersionByKey={wipeVersionByKey}
          onScoreChange={onScoreChange}
        />
        <BracketRound
          title="Semifinále"
          matches={advanced.sf}
          statusByMatchKey={statusByMatchKey}
          recentlyChanged={recentlyChanged}
          lockedByMatchKey={lockedByMatchKey}
          wipeVersionByKey={wipeVersionByKey}
          onScoreChange={onScoreChange}
        />
        <BracketRound
          title="Finále"
          matches={[advanced.final]}
          statusByMatchKey={statusByMatchKey}
          recentlyChanged={recentlyChanged}
          lockedByMatchKey={lockedByMatchKey}
          wipeVersionByKey={wipeVersionByKey}
          onScoreChange={onScoreChange}
        />
      </div>
    </section>
  );
}
