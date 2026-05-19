"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { savePrediction } from "@/app/actions/predictions";
import { deriveBracket, type DerivedBracket } from "@/lib/bracket";
import {
  advanceBracket,
  type KnockoutScorePrediction,
  type ResolvedKnockoutMatch,
} from "@/lib/advance-bracket";
import { diffBracket } from "@/lib/bracket-diff";
import type {
  PredictPageData,
  PredictionView,
  SaveStatus,
} from "@/lib/predict-types";
import type { GroupMatchPrediction } from "@/lib/bracket";
import { GroupStageSection } from "./GroupStageSection";
import { KnockoutSection } from "./KnockoutSection";
import { EditCascadeDialog, type AffectedMatch } from "./EditCascadeDialog";
import styles from "./PredictForm.module.css";

const ROUND_LABEL_CS: Record<ResolvedKnockoutMatch["round"], string> = {
  r32: "Šestnáctifinále",
  r16: "Osmifinále",
  qf: "Čtvrtfinále",
  sf: "Semifinále",
  final: "Finále",
};

type Props = {
  initialData: PredictPageData;
  initialLayout: "one" | "two";
};

type StatusEntry = { status: SaveStatus; error: string | null };
type StatusMap = Record<string, StatusEntry>;
/**
 * A pending score change (group OR knockout) waiting for the user to confirm
 * the cascade. On confirm, the editing match saves AND each affectedMatches
 * row gets its prediction wiped.
 */
type PendingChange = {
  editingMatchId: string;
  editingHomeScore: number;
  editingAwayScore: number;
  affectedMatches: AffectedMatch[];
};

const SAVED_DISPLAY_MS = 1500;
const SLOT_FLASH_MS = 2000;
const TOTAL_GROUP_MATCHES = 72;

function buildGroupPredictions(
  groups: PredictPageData["groups"],
  predictionsByMatch: Record<string, PredictionView>,
): GroupMatchPrediction[] {
  const out: GroupMatchPrediction[] = [];
  for (const g of groups) {
    for (const m of g.matches) {
      const p = predictionsByMatch[m.matchId];
      if (!p || p.homeScore === null || p.awayScore === null) continue;
      out.push({
        group: g.letter,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
      });
    }
  }
  return out;
}

function buildKnockoutPredictions(
  matchIdByKey: Record<string, string>,
  predictionsByMatch: Record<string, PredictionView>,
): Map<string, KnockoutScorePrediction> {
  const out = new Map<string, KnockoutScorePrediction>();
  for (const [matchKey, matchId] of Object.entries(matchIdByKey)) {
    if (matchKey === "M103") continue; // 3rd-place playoff is out of scope
    if (!matchKey.startsWith("M") || parseInt(matchKey.slice(1), 10) < 73) continue;
    const p = predictionsByMatch[matchId];
    if (p && (p.homeScore !== null || p.awayScore !== null)) {
      out.set(matchKey, { homeScore: p.homeScore, awayScore: p.awayScore });
    }
  }
  return out;
}

export function PredictForm({ initialData, initialLayout }: Props) {
  const [predictionsByMatch, setPredictionsByMatch] = useState<Record<string, PredictionView>>(
    initialData.predictionsByMatch,
  );
  const [statusByMatch, setStatusByMatch] = useState<StatusMap>({});
  const [statusByMatchKey, setStatusByMatchKey] = useState<StatusMap>({});
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set());
  /**
   * Per-knockout-match-key version that bumps every time the prediction is
   * wiped externally (cascade) OR a pending edit is cancelled. Used to
   * re-mount the KnockoutMatch row so it re-reads from props — so normal
   * saves don't reset focus mid-Tab, but cancel/wipe do reset the input.
   */
  const [wipeVersionByKey, setWipeVersionByKey] = useState<Record<string, number>>({});
  /** Same mechanism for group MatchRow, keyed by match_id. */
  const [revertVersionByMatchId, setRevertVersionByMatchId] = useState<Record<string, number>>({});
  const [, startTransition] = useTransition();
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filledGroupPredictions = useMemo(
    () => buildGroupPredictions(initialData.groups, predictionsByMatch),
    [initialData.groups, predictionsByMatch],
  );

  const groupFilledCount = filledGroupPredictions.length;
  const groupComplete = groupFilledCount === TOTAL_GROUP_MATCHES;

  const derived: DerivedBracket | null = useMemo(() => {
    if (!groupComplete) return null;
    try {
      return deriveBracket({ groupPredictions: filledGroupPredictions });
    } catch (err) {
      console.error("deriveBracket failed:", err);
      return null;
    }
  }, [groupComplete, filledGroupPredictions]);

  const knockoutPredictionsByKey = useMemo(
    () => buildKnockoutPredictions(initialData.matchIdByKey, predictionsByMatch),
    [initialData.matchIdByKey, predictionsByMatch],
  );

  const advanced = useMemo(() => {
    if (!derived) return null;
    return advanceBracket(derived.r32, knockoutPredictionsByKey);
  }, [derived, knockoutPredictionsByKey]);

  const qualifyingThirdGroupsSet = useMemo<Set<string> | null>(
    () => (derived ? new Set(derived.qualifyingThirdGroups) : null),
    [derived],
  );

  const lockedByMatchKey = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const k of Object.values(initialData.knockoutMatchesByKey)) {
      out[k.matchKey] = k.locked;
    }
    return out;
  }, [initialData.knockoutMatchesByKey]);

  const setStatus = useCallback((matchId: string, entry: StatusEntry) => {
    setStatusByMatch((prev) => ({ ...prev, [matchId]: entry }));
  }, []);

  const setKnockoutStatus = useCallback((matchKey: string, entry: StatusEntry) => {
    setStatusByMatchKey((prev) => ({ ...prev, [matchKey]: entry }));
  }, []);

  const fireSave = useCallback(
    (matchId: string, homeScore: number | null, awayScore: number | null) => {
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
          setStatus(matchId, { status: "error", error: result.error });
        }
      });
    },
    [setStatus],
  );

  const flashSlots = useCallback((keys: string[]) => {
    if (!keys.length) return;
    setRecentlyChanged((prev) => new Set([...prev, ...keys]));
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setRecentlyChanged(new Set());
    }, SLOT_FLASH_MS);
  }, []);

  const bumpWipeVersions = useCallback((keys: string[]) => {
    if (!keys.length) return;
    setWipeVersionByKey((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = (next[key] ?? 0) + 1;
      return next;
    });
  }, []);

  const enrichAffected = useCallback(
    (matchKeys: string[]): AffectedMatch[] => {
      if (!advanced) {
        return matchKeys.map((k) => ({
          matchKey: k,
          roundLabel: k,
          homeTeam: null,
          awayTeam: null,
        }));
      }
      const allResolved: ResolvedKnockoutMatch[] = [
        ...advanced.r32,
        ...advanced.r16,
        ...advanced.qf,
        ...advanced.sf,
        advanced.final,
      ];
      const byKey = new Map(allResolved.map((m) => [m.matchKey, m]));
      return matchKeys
        .slice()
        .sort()
        .map<AffectedMatch>((matchKey) => {
          const m = byKey.get(matchKey);
          return {
            matchKey,
            roundLabel: m ? ROUND_LABEL_CS[m.round] : matchKey,
            homeTeam: m?.homeTeam ?? null,
            awayTeam: m?.awayTeam ?? null,
          };
        });
    },
    [advanced],
  );

  // ── Group-edit impact ─────────────────────────────────────────────────────
  const computeGroupImpact = useCallback(
    (matchId: string, homeScore: number, awayScore: number): AffectedMatch[] => {
      if (!derived || !advanced) return [];
      let group: PredictPageData["groups"][number] | undefined;
      let homeTeam: string | undefined;
      let awayTeam: string | undefined;
      for (const g of initialData.groups) {
        const m = g.matches.find((mm) => mm.matchId === matchId);
        if (m) {
          group = g;
          homeTeam = m.homeTeam.name;
          awayTeam = m.awayTeam.name;
          break;
        }
      }
      if (!group || !homeTeam || !awayTeam) return [];
      const hypothetical = filledGroupPredictions.map((p) => {
        if (p.group === group!.letter && p.homeTeam === homeTeam && p.awayTeam === awayTeam) {
          return { ...p, homeScore, awayScore };
        }
        return p;
      });
      if (
        !filledGroupPredictions.some(
          (p) => p.group === group!.letter && p.homeTeam === homeTeam && p.awayTeam === awayTeam,
        )
      ) {
        hypothetical.push({
          group: group.letter,
          homeTeam: homeTeam!,
          awayTeam: awayTeam!,
          homeScore,
          awayScore,
        });
      }
      if (hypothetical.length !== TOTAL_GROUP_MATCHES) return [];
      let newDerived: DerivedBracket;
      try {
        newDerived = deriveBracket({ groupPredictions: hypothetical });
      } catch {
        return [];
      }
      const predictedKeys = new Set(knockoutPredictionsByKey.keys());
      const { affected } = diffBracket(derived, newDerived, predictedKeys);
      return enrichAffected([...affected]);
    },
    [
      derived,
      advanced,
      filledGroupPredictions,
      knockoutPredictionsByKey,
      initialData.groups,
      enrichAffected,
    ],
  );

  // ── Knockout-edit impact ──────────────────────────────────────────────────
  const computeKnockoutImpact = useCallback(
    (matchKey: string, homeScore: number, awayScore: number): AffectedMatch[] => {
      if (!derived || !advanced) return [];
      const newPreds = new Map(knockoutPredictionsByKey);
      newPreds.set(matchKey, { homeScore, awayScore });
      const newAdvanced = advanceBracket(derived.r32, newPreds);

      const oldDownstream = [
        ...advanced.r16,
        ...advanced.qf,
        ...advanced.sf,
        advanced.final,
      ];
      const newByKey = new Map(
        [
          ...newAdvanced.r16,
          ...newAdvanced.qf,
          ...newAdvanced.sf,
          newAdvanced.final,
        ].map((m) => [m.matchKey, m]),
      );

      const affectedKeys: string[] = [];
      for (const oldM of oldDownstream) {
        if (oldM.matchKey === matchKey) continue; // never include the edited match
        if (!knockoutPredictionsByKey.has(oldM.matchKey)) continue;
        const newM = newByKey.get(oldM.matchKey);
        if (!newM) continue;
        if (oldM.homeTeam !== newM.homeTeam || oldM.awayTeam !== newM.awayTeam) {
          affectedKeys.push(oldM.matchKey);
        }
      }
      return enrichAffected(affectedKeys);
    },
    [derived, advanced, knockoutPredictionsByKey, enrichAffected],
  );

  // ── Group score change handler ────────────────────────────────────────────
  const onGroupScoreChange = useCallback(
    (matchId: string, homeScore: number | null, awayScore: number | null) => {
      if (
        homeScore === null ||
        awayScore === null ||
        knockoutPredictionsByKey.size === 0 ||
        !derived
      ) {
        fireSave(matchId, homeScore, awayScore);
        return;
      }
      const impact = computeGroupImpact(matchId, homeScore, awayScore);
      if (impact.length === 0) {
        fireSave(matchId, homeScore, awayScore);
        return;
      }
      setPendingChange({
        editingMatchId: matchId,
        editingHomeScore: homeScore,
        editingAwayScore: awayScore,
        affectedMatches: impact,
      });
    },
    [knockoutPredictionsByKey, derived, computeGroupImpact, fireSave],
  );

  // Saves a knockout prediction, mirroring status into the matchKey map.
  const fireSaveKnockout = useCallback(
    (matchId: string, matchKey: string, homeScore: number | null, awayScore: number | null) => {
      setPredictionsByMatch((prev) => ({
        ...prev,
        [matchId]: {
          matchId,
          homeScore,
          awayScore,
          locked: prev[matchId]?.locked ?? false,
        },
      }));
      startTransition(async () => {
        const result = await savePrediction(matchId, homeScore, awayScore);
        if (result.ok) {
          setKnockoutStatus(matchKey, { status: "saved", error: null });
          setTimeout(() => {
            setStatusByMatchKey((prev) => {
              if (prev[matchKey]?.status !== "saved") return prev;
              const next = { ...prev };
              delete next[matchKey];
              return next;
            });
          }, SAVED_DISPLAY_MS);
        } else {
          setKnockoutStatus(matchKey, { status: "error", error: result.error });
        }
      });
    },
    [setKnockoutStatus],
  );

  // ── Knockout score change handler ─────────────────────────────────────────
  const onKnockoutScoreChange = useCallback(
    (matchKey: string, homeScore: number | null, awayScore: number | null) => {
      const matchId = initialData.matchIdByKey[matchKey];
      if (!matchId) return;

      // Clearing a knockout prediction can't cascade — just save and let
      // downstream show the "waiting for winner" placeholder.
      if (homeScore === null || awayScore === null) {
        setKnockoutStatus(matchKey, { status: "saving", error: null });
        fireSaveKnockout(matchId, matchKey, homeScore, awayScore);
        return;
      }

      const impact = computeKnockoutImpact(matchKey, homeScore, awayScore);
      if (impact.length === 0) {
        setKnockoutStatus(matchKey, { status: "saving", error: null });
        fireSaveKnockout(matchId, matchKey, homeScore, awayScore);
        return;
      }
      setPendingChange({
        editingMatchId: matchId,
        editingHomeScore: homeScore,
        editingAwayScore: awayScore,
        affectedMatches: impact,
      });
    },
    [initialData.matchIdByKey, setKnockoutStatus, computeKnockoutImpact, fireSaveKnockout],
  );

  // ── Confirm / cancel pending cascade ──────────────────────────────────────
  const confirmPendingChange = useCallback(() => {
    if (!pendingChange) return;
    const { editingMatchId, editingHomeScore, editingAwayScore, affectedMatches } = pendingChange;
    fireSave(editingMatchId, editingHomeScore, editingAwayScore);
    const keys = affectedMatches.map((m) => m.matchKey);
    for (const key of keys) {
      const affectedMatchId = initialData.matchIdByKey[key];
      if (!affectedMatchId) continue;
      fireSave(affectedMatchId, null, null);
    }
    bumpWipeVersions(keys);
    flashSlots(keys);
    setPendingChange(null);
  }, [pendingChange, fireSave, initialData.matchIdByKey, bumpWipeVersions, flashSlots]);

  const matchKeyById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, id] of Object.entries(initialData.matchIdByKey)) out[id] = key;
    return out;
  }, [initialData.matchIdByKey]);

  const cancelPendingChange = useCallback(() => {
    if (!pendingChange) return;
    const id = pendingChange.editingMatchId;
    const matchKey = matchKeyById[id];
    const isKnockout =
      typeof matchKey === "string" &&
      matchKey.startsWith("M") &&
      parseInt(matchKey.slice(1), 10) >= 73;
    if (isKnockout) {
      setWipeVersionByKey((prev) => ({ ...prev, [matchKey]: (prev[matchKey] ?? 0) + 1 }));
    } else {
      setRevertVersionByMatchId((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    }
    setPendingChange(null);
  }, [pendingChange, matchKeyById]);

  return (
    <div className={styles.form}>
      <GroupStageSection
        groups={initialData.groups}
        predictionsByMatch={predictionsByMatch}
        statusByMatch={statusByMatch}
        filledCount={groupFilledCount}
        thirdPlaceRanking={derived?.thirdPlaceRanking ?? null}
        qualifyingThirdGroups={qualifyingThirdGroupsSet}
        revertVersionByMatchId={revertVersionByMatchId}
        initialLayout={initialLayout}
        onScoreChange={onGroupScoreChange}
      />
      <KnockoutSection
        groupComplete={groupComplete}
        groupFilledCount={groupFilledCount}
        advanced={advanced}
        annexCOption={derived?.annexCOption ?? null}
        qualifyingThirdGroups={derived?.qualifyingThirdGroups ?? []}
        statusByMatchKey={statusByMatchKey}
        recentlyChanged={recentlyChanged}
        lockedByMatchKey={lockedByMatchKey}
        wipeVersionByKey={wipeVersionByKey}
        onScoreChange={onKnockoutScoreChange}
      />
      <EditCascadeDialog
        open={pendingChange !== null}
        affectedMatches={pendingChange?.affectedMatches ?? []}
        onConfirm={confirmPendingChange}
        onCancel={cancelPendingChange}
      />
    </div>
  );
}
