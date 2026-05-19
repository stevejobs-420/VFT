"use client";

import { useState } from "react";
import type { ResolvedKnockoutMatch } from "@/lib/advance-bracket";
import type { SaveStatus } from "@/lib/predict-types";
import { getFlagEmoji } from "@/lib/teams-cs";
import styles from "./KnockoutMatch.module.css";

type Props = {
  match: ResolvedKnockoutMatch;
  status: SaveStatus;
  error: string | null;
  locked: boolean;
  recentlyChanged: boolean;
  onScoreChange: (homeScore: number | null, awayScore: number | null) => void;
};

function parseScore(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return NaN as unknown as number;
  return n;
}

export function KnockoutMatch({
  match,
  status,
  error,
  locked,
  recentlyChanged,
  onScoreChange,
}: Props) {
  const initialHome = match.prediction?.homeScore;
  const initialAway = match.prediction?.awayScore;

  const [home, setHome] = useState<string>(initialHome === null || initialHome === undefined ? "" : String(initialHome));
  const [away, setAway] = useState<string>(initialAway === null || initialAway === undefined ? "" : String(initialAway));

  const teamsResolved = match.homeTeam !== null && match.awayTeam !== null;
  const inputsDisabled = !teamsResolved || locked;

  function maybeEmit(nextHomeRaw: string, nextAwayRaw: string) {
    const h = parseScore(nextHomeRaw);
    const a = parseScore(nextAwayRaw);
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    const bothNull = h === null && a === null;
    const bothFilled = h !== null && a !== null;
    if (!bothNull && !bothFilled) return;
    onScoreChange(h, a);
  }

  const footer = (() => {
    if (!teamsResolved) {
      return <span className={styles.placeholder}>Čekám na vítěze předchozího kola</span>;
    }
    if (match.winner) {
      const flag = getFlagEmoji(match.winner);
      return (
        <span className={styles.winner}>
          Vítěz: <span aria-hidden="true">{flag}</span> {match.winner}
        </span>
      );
    }
    if (
      match.prediction !== null &&
      match.prediction.homeScore !== null &&
      match.prediction.awayScore !== null
    ) {
      // Filled but tied.
      return <span className={styles.tieHint}>Musíš zvolit vítěze (rozdíl skóre)</span>;
    }
    return null;
  })();

  return (
    <div
      className={`${styles.match} ${recentlyChanged ? styles.slotChanged : ""} ${
        inputsDisabled ? styles.disabled : ""
      }`}
    >
      <div className={styles.teamRow}>
        <div className={`${styles.team} ${styles.home}`}>
          {match.homeTeam ? (
            <>
              <span className={styles.flag} aria-hidden="true">
                {getFlagEmoji(match.homeTeam)}
              </span>
              <span className={styles.teamName}>{match.homeTeam}</span>
            </>
          ) : (
            <span className={styles.slotLabel}>{match.homeSlotLabel}</span>
          )}
        </div>
        <div className={styles.scores}>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className={styles.scoreInput}
            value={home}
            disabled={inputsDisabled}
            onChange={(e) => {
              setHome(e.target.value);
              maybeEmit(e.target.value, away);
            }}
            onBlur={() => maybeEmit(home, away)}
            aria-label={`Skóre domácí ${match.homeTeam ?? match.homeSlotLabel}`}
          />
          <span className={styles.separator}>:</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className={styles.scoreInput}
            value={away}
            disabled={inputsDisabled}
            onChange={(e) => {
              setAway(e.target.value);
              maybeEmit(home, e.target.value);
            }}
            onBlur={() => maybeEmit(home, away)}
            aria-label={`Skóre hosté ${match.awayTeam ?? match.awaySlotLabel}`}
          />
        </div>
        <div className={`${styles.team} ${styles.away}`}>
          {match.awayTeam ? (
            <>
              <span className={styles.teamName}>{match.awayTeam}</span>
              <span className={styles.flag} aria-hidden="true">
                {getFlagEmoji(match.awayTeam)}
              </span>
            </>
          ) : (
            <span className={styles.slotLabel}>{match.awaySlotLabel}</span>
          )}
        </div>
        <div className={styles.statusCell}>
          {locked && <span className={styles.locked}>Zamčeno</span>}
          {!locked && status === "saving" && <span className={styles.saving}>Ukládám…</span>}
          {!locked && status === "saved" && <span className={styles.saved}>Uloženo</span>}
          {!locked && status === "error" && (
            <span className={styles.error} title={error ?? undefined}>Chyba</span>
          )}
        </div>
      </div>
      <div className={styles.footer}>
        <span className={styles.matchKey}>{match.matchKey}</span>
        {footer}
      </div>
    </div>
  );
}
