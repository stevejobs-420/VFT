/**
 * Pure helpers for the results sync cron. Maps football-data.org's match
 * payload into the shape we write into our `matches` table. Kept side-effect
 * free so the route handler stays thin and the logic is unit-testable
 * without mocking Supabase or fetch.
 */

export type ApiTeamRef = {
  id: number | null;
  name: string | null;
  tla: string | null;
  crest: string | null;
};

export type ApiStage =
  | "GROUP_STAGE"
  | "LAST_32"
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

export type ApiMatch = {
  id: number;
  utcDate: string;
  stage: ApiStage;
  group: string | null;
  status: string;
  homeTeam: ApiTeamRef;
  awayTeam: ApiTeamRef;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
};

export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";
export type Status = "scheduled" | "live" | "finished";

export type MatchRowUpdate = {
  api_match_id: string;
  stage: Stage;
  kickoff_at: string;
  status: Status;
  home_team_id: string | null;
  away_team_id: string | null;
  /** null means "do not overwrite the existing slot label". */
  home_slot_label: string | null;
  away_slot_label: string | null;
  home_score: number | null;
  away_score: number | null;
};

export const STAGE_MAP: Record<ApiStage, Stage> = {
  GROUP_STAGE: "group",
  LAST_32: "r32",
  LAST_16: "r16",
  QUARTER_FINALS: "qf",
  SEMI_FINALS: "sf",
  THIRD_PLACE: "third_place",
  FINAL: "final",
};

export function mapApiStatus(apiStatus: string): Status {
  switch (apiStatus) {
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "IN_PLAY":
    case "LIVE":
    case "PAUSED":
      return "live";
    default:
      // TIMED, SCHEDULED, POSTPONED, SUSPENDED, CANCELLED, unknown → scheduled.
      return "scheduled";
  }
}

export type BuildResult = {
  row: MatchRowUpdate;
  warnings: string[];
};

/**
 * Build the row that goes into the matches upsert.
 *
 * Knockout matches with newly-resolved teams get their home/away_team_id set
 * AND their slot_label nulled (signal: "we have a team now, drop the
 * placeholder"). Knockout matches still without teams from the API get
 * home/away_team_id = null and slot_label = null (meaning "do not overwrite
 * existing label"). The upsert sends NULL for slot_label fields, but at the
 * SQL level, NULL on an existing column will overwrite — so we filter those
 * fields out at the caller level before sending if no change is intended.
 *
 * In practice: cron callers will strip null slot_label fields from the row
 * before upsert to preserve existing labels.
 */
export function buildMatchRowUpdate(
  apiMatch: ApiMatch,
  teamIdByApiId: Map<number, string>,
): BuildResult {
  const warnings: string[] = [];

  function resolveId(ref: ApiTeamRef, side: "home" | "away"): string | null {
    if (ref.id == null) return null;
    const id = teamIdByApiId.get(ref.id);
    if (!id) {
      warnings.push(
        `unknown api_team_id=${ref.id} (${ref.name ?? "?"}) for ${side} of api_match_id=${apiMatch.id}`,
      );
      return null;
    }
    return id;
  }

  const home_team_id = resolveId(apiMatch.homeTeam, "home");
  const away_team_id = resolveId(apiMatch.awayTeam, "away");

  // If the API now provides a real team id where seed wrote a placeholder
  // slot label, null the label out. Otherwise leave it alone (null in the
  // payload means "don't touch").
  const home_slot_label = home_team_id !== null ? null : null;
  const away_slot_label = away_team_id !== null ? null : null;

  return {
    row: {
      api_match_id: String(apiMatch.id),
      stage: STAGE_MAP[apiMatch.stage],
      kickoff_at: apiMatch.utcDate,
      status: mapApiStatus(apiMatch.status),
      home_team_id,
      away_team_id,
      // Only flag for caller-side stripping: caller treats `null` as
      // "include in upsert only if home_team_id is set" via the helper below.
      home_slot_label,
      away_slot_label,
      home_score: apiMatch.score.fullTime.home,
      away_score: apiMatch.score.fullTime.away,
    },
    warnings,
  };
}

/**
 * The shape sent to the matches upsert. Slot-label fields are optional so
 * we can omit them entirely (keep the seed-written placeholder) when the
 * API hasn't resolved the team yet.
 */
export type MatchRowUpsertShape = Omit<
  MatchRowUpdate,
  "home_slot_label" | "away_slot_label"
> & {
  home_slot_label?: string | null;
  away_slot_label?: string | null;
};

/**
 * Strip slot_label fields from a row when no team is available — we don't
 * want to overwrite the seed-written placeholder with NULL.
 */
export function stripUnresolvedSlotLabels(row: MatchRowUpdate): MatchRowUpsertShape {
  const out: MatchRowUpsertShape = { ...row };
  if (row.home_team_id === null) delete out.home_slot_label;
  if (row.away_team_id === null) delete out.away_slot_label;
  return out;
}
