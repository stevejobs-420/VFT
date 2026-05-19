"use client";

import type { ThirdPlaceRanking } from "@/lib/bracket";
import { getFlagEmoji } from "@/lib/teams-cs";
import styles from "./ThirdPlaceTable.module.css";

type Props = {
  ranking: ThirdPlaceRanking[] | null;
};

export function ThirdPlaceTable({ ranking }: Props) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.heading}>Tabulka 3. míst</h2>
        <p className={styles.lede}>
          Z 12 týmů na 3. místě postupuje do vyřazovací fáze nejlepších 8.
        </p>
      </header>
      {ranking === null ? (
        <div className={styles.pending}>
          Dokončí se po vyplnění všech 72 zápasů ve skupinách.
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.posHeader}>#</th>
              <th className={styles.groupHeader}>Skupina</th>
              <th className={styles.teamHeader}>Tým</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => (
              <tr
                key={r.team}
                className={`${styles.row} ${r.qualifies ? styles.rowQualifies : ""}`}
              >
                <td className={styles.pos}>{r.rank}</td>
                <td className={styles.group}>{r.group}</td>
                <td className={styles.team}>
                  <span aria-hidden="true">{getFlagEmoji(r.team)}</span>{" "}
                  <span>{r.team}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
