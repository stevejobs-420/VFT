"use client";

import { getFlagEmoji } from "@/lib/teams-cs";
import styles from "./ChampionBanner.module.css";

export function ChampionBanner({ champion }: { champion: string | null }) {
  if (!champion) return null;
  const flag = getFlagEmoji(champion);
  return (
    <div className={styles.banner} role="status">
      <span className={styles.label}>Tvůj šampion:</span>
      <span className={styles.flag} aria-hidden="true">{flag}</span>
      <span className={styles.team}>{champion}</span>
      <span className={styles.points}>— 30 bodů</span>
    </div>
  );
}
