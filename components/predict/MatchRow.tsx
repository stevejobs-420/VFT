"use client";

import { useRef, useState } from "react";
import type { GroupMatchView, SaveStatus } from "@/lib/predict-types";
import styles from "./MatchRow.module.css";

type Props = {
  match: GroupMatchView;
  homeScore: number | null;
  awayScore: number | null;
  status: SaveStatus;
  error: string | null;
  onChange: (homeScore: number | null, awayScore: number | null) => void;
  locked: boolean;
};

const kickoffFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function parseScore(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return NaN as unknown as number;
  return n;
}

export function MatchRow({
  match,
  homeScore,
  awayScore,
  status,
  error,
  onChange,
  locked,
}: Props) {
  const [home, setHome] = useState<string>(homeScore === null ? "" : String(homeScore));
  const [away, setAway] = useState<string>(awayScore === null ? "" : String(awayScore));
  const lastEmitted = useRef<{ h: number | null; a: number | null }>({
    h: homeScore,
    a: awayScore,
  });

  function maybeEmit(nextHomeRaw: string, nextAwayRaw: string) {
    const h = parseScore(nextHomeRaw);
    const a = parseScore(nextAwayRaw);
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    const bothNull = h === null && a === null;
    const bothFilled = h !== null && a !== null;
    if (!bothNull && !bothFilled) return; // wait until partner is filled too
    if (h === lastEmitted.current.h && a === lastEmitted.current.a) return;
    lastEmitted.current = { h, a };
    onChange(h, a);
  }

  return (
    <div className={styles.row}>
      <div className={styles.kickoff}>{kickoffFormatter.format(new Date(match.kickoffAt))}</div>
      <div className={styles.teams}>
        <div className={`${styles.team} ${styles.home}`}>
          {match.homeTeam.flagUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.flag}
              src={match.homeTeam.flagUrl}
              alt=""
              width={24}
              height={16}
            />
          )}
          <span className={styles.teamName}>{match.homeTeam.name}</span>
        </div>
        <div className={styles.scores}>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className={styles.scoreInput}
            value={home}
            onChange={(e) => {
              setHome(e.target.value);
              maybeEmit(e.target.value, away);
            }}
            onBlur={() => maybeEmit(home, away)}
            disabled={locked}
            aria-label={`Skóre domácí ${match.homeTeam.name}`}
          />
          <span className={styles.separator}>:</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className={styles.scoreInput}
            value={away}
            onChange={(e) => {
              setAway(e.target.value);
              maybeEmit(home, e.target.value);
            }}
            onBlur={() => maybeEmit(home, away)}
            disabled={locked}
            aria-label={`Skóre hosté ${match.awayTeam.name}`}
          />
        </div>
        <div className={`${styles.team} ${styles.away}`}>
          <span className={styles.teamName}>{match.awayTeam.name}</span>
          {match.awayTeam.flagUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.flag}
              src={match.awayTeam.flagUrl}
              alt=""
              width={24}
              height={16}
            />
          )}
        </div>
      </div>
      <div className={styles.statusCell}>
        {locked && <span className={styles.locked}>Zamčeno</span>}
        {!locked && status === "saving" && <span className={styles.saving}>Ukládám…</span>}
        {!locked && status === "saved" && <span className={styles.saved}>Uloženo</span>}
        {!locked && status === "error" && (
          <span className={styles.error} title={error ?? undefined}>
            Chyba
          </span>
        )}
      </div>
    </div>
  );
}
