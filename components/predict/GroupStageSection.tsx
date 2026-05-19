"use client";

import { useState } from "react";
import type { GroupView, PredictionView, SaveStatus } from "@/lib/predict-types";
import { GroupCard } from "./GroupCard";
import styles from "./GroupStageSection.module.css";

type Props = {
  groups: GroupView[];
  predictionsByMatch: Record<string, PredictionView>;
  statusByMatch: Record<string, { status: SaveStatus; error: string | null }>;
  onScoreChange: (matchId: string, homeScore: number | null, awayScore: number | null) => void;
};

type Layout = "one" | "two";

const TOTAL_GROUP_MATCHES = 72;

function readStoredLayout(): Layout {
  if (typeof window === "undefined") return "two";
  const v = window.localStorage.getItem("vft-predict-layout");
  return v === "one" ? "one" : "two";
}

export function GroupStageSection({
  groups,
  predictionsByMatch,
  statusByMatch,
  onScoreChange,
}: Props) {
  const [layout, setLayoutState] = useState<Layout>(readStoredLayout);

  const filled = Object.values(predictionsByMatch).filter(
    (p) => p.homeScore !== null && p.awayScore !== null,
  ).length;

  function setLayout(next: Layout) {
    if (next === layout) return;
    setLayoutState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("vft-predict-layout", next);
    }
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <h1 className={styles.heading}>Tipy na skupiny</h1>
          <div className={styles.progress} aria-live="polite">
            Vyplněno <strong>{filled}</strong> z {TOTAL_GROUP_MATCHES} zápasů
          </div>
        </div>
        <div className={styles.layoutToggle} role="group" aria-label="Rozložení">
          <button
            type="button"
            className={`${styles.toggleBtn} ${layout === "two" ? styles.toggleBtnActive : ""}`}
            onClick={() => setLayout("two")}
            aria-pressed={layout === "two"}
            aria-label="Dva sloupce"
            title="Dva sloupce"
          >
            <svg
              className={styles.toggleIcon}
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2.5" y="3" width="5.5" height="12" rx="1" />
              <rect x="10" y="3" width="5.5" height="12" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${layout === "one" ? styles.toggleBtnActive : ""}`}
            onClick={() => setLayout("one")}
            aria-pressed={layout === "one"}
            aria-label="Jeden sloupec"
            title="Jeden sloupec"
          >
            <svg
              className={styles.toggleIcon}
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2.5" y="3" width="13" height="3.5" rx="1" />
              <rect x="2.5" y="7.25" width="13" height="3.5" rx="1" />
              <rect x="2.5" y="11.5" width="13" height="3.5" rx="1" />
            </svg>
          </button>
        </div>
      </header>
      <div
        key={layout}
        className={`${styles.grid} ${layout === "one" ? styles.gridOne : styles.gridTwo}`}
      >
        {groups.map((g) => (
          <GroupCard
            key={g.letter}
            group={g}
            predictionsByMatch={predictionsByMatch}
            statusByMatch={statusByMatch}
            onScoreChange={onScoreChange}
          />
        ))}
      </div>
    </section>
  );
}
