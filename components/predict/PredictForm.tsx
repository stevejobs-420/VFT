"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { savePrediction } from "@/app/actions/predictions";
import type {
  PredictPageData,
  PredictionView,
  SaveStatus,
} from "@/lib/predict-types";
import { GroupStageSection } from "./GroupStageSection";
import styles from "./PredictForm.module.css";

type Props = {
  initialData: PredictPageData;
};

type StatusEntry = { status: SaveStatus; error: string | null };

const SAVED_DISPLAY_MS = 1500;

export function PredictForm({ initialData }: Props) {
  const [predictionsByMatch, setPredictionsByMatch] = useState<Record<string, PredictionView>>(
    initialData.predictionsByMatch,
  );
  const [statusByMatch, setStatusByMatch] = useState<Record<string, StatusEntry>>({});
  const [, startTransition] = useTransition();
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setStatus = useCallback((matchId: string, entry: StatusEntry) => {
    setStatusByMatch((prev) => ({ ...prev, [matchId]: entry }));
  }, []);

  const onScoreChange = useCallback(
    (matchId: string, homeScore: number | null, awayScore: number | null) => {
      // Optimistic update.
      setPredictionsByMatch((prev) => ({
        ...prev,
        [matchId]: {
          matchId,
          homeScore,
          awayScore,
          locked: prev[matchId]?.locked ?? false,
        },
      }));
      setStatus(matchId, { status: "saving", error: null });

      // Clear any pending "saved" fade timer for this match.
      const existingTimer = savedTimers.current[matchId];
      if (existingTimer) clearTimeout(existingTimer);

      startTransition(async () => {
        const result = await savePrediction(matchId, homeScore, awayScore);
        if (result.ok) {
          setStatus(matchId, { status: "saved", error: null });
          savedTimers.current[matchId] = setTimeout(() => {
            setStatusByMatch((prev) => {
              if (prev[matchId]?.status !== "saved") return prev;
              const next = { ...prev };
              delete next[matchId];
              return next;
            });
          }, SAVED_DISPLAY_MS);
        } else {
          // Revert to server state by leaving the optimistic value but mark error.
          setStatus(matchId, { status: "error", error: result.error });
        }
      });
    },
    [setStatus],
  );

  return (
    <div className={styles.form}>
      <GroupStageSection
        groups={initialData.groups}
        predictionsByMatch={predictionsByMatch}
        statusByMatch={statusByMatch}
        onScoreChange={onScoreChange}
      />
      <p className={styles.knockoutHint}>
        Vyřazovací část se odemkne, až budeš mít vyplněných všech 72 zápasů ve skupinách.
      </p>
    </div>
  );
}
