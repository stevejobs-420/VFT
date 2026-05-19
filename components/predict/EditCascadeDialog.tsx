"use client";

import { useEffect, useRef } from "react";
import styles from "./EditCascadeDialog.module.css";

export type AffectedMatch = {
  matchKey: string;
  roundLabel: string; // Czech round name, e.g. "Osmifinále"
  homeTeam: string | null;
  awayTeam: string | null;
};

type Props = {
  open: boolean;
  affectedMatches: AffectedMatch[];
  onConfirm: () => void;
  onCancel: () => void;
};

function formatPair(match: AffectedMatch): string {
  if (match.homeTeam && match.awayTeam) {
    return `${match.homeTeam} – ${match.awayTeam}`;
  }
  if (match.homeTeam) return `${match.homeTeam} – ?`;
  if (match.awayTeam) return `? – ${match.awayTeam}`;
  return "?";
}

export function EditCascadeDialog({ open, affectedMatches, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const count = affectedMatches.length;
  const noun =
    count === 1 ? "zápas" : count >= 2 && count <= 4 ? "zápasy" : "zápasů";

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onCancel}>
      <h3 className={styles.heading}>Změna ovlivní vyřazovací fázi</h3>
      <p className={styles.body}>
        Touto úpravou se ve vyřazovací fázi změní {count} {noun}. Tipy pro tyto zápasy budou
        smazány a budeš je muset zadat znovu:
      </p>
      <ul className={styles.list}>
        {affectedMatches.map((m) => (
          <li key={m.matchKey} className={styles.listItem}>
            <span className={styles.round}>{m.roundLabel}</span>
            <span className={styles.pair}>{formatPair(m)}</span>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Zrušit
        </button>
        <button type="button" className={styles.confirm} onClick={onConfirm}>
          Pokračovat a smazat tipy
        </button>
      </div>
    </dialog>
  );
}
