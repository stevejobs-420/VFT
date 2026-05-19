/**
 * Shared types between the /predict Server Component data loader and the
 * client components that render the form. Kept in lib/ so server and client
 * code can both import without crossing the use-server / use-client boundary.
 */

import type { GroupLetter } from "./bracket-types";

export type TeamView = {
  id: string;
  name: string;
  groupLetter: GroupLetter;
  flagUrl: string | null;
};

export type GroupMatchView = {
  matchId: string;
  /** Stage discriminant — always "group" here; knockout view comes in PR 07b. */
  stage: "group";
  group: GroupLetter;
  homeTeam: TeamView;
  awayTeam: TeamView;
  /** ISO timestamp — formatted client-side via Intl.DateTimeFormat("cs-CZ"). */
  kickoffAt: string;
  locked: boolean;
};

export type PredictionView = {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  locked: boolean;
};

export type GroupView = {
  letter: GroupLetter;
  /** Always 4 teams, sorted alphabetically by Czech name. */
  teams: TeamView[];
  /** Always 6 fixtures, sorted by kickoff. */
  matches: GroupMatchView[];
};

export type PredictPageData = {
  groups: GroupView[];
  /** Keyed by match_id. */
  predictionsByMatch: Record<string, PredictionView>;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";
