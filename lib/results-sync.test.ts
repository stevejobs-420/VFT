import { describe, it, expect } from "vitest";
import {
  buildMatchRowUpdate,
  mapApiStatus,
  stripUnresolvedSlotLabels,
  type ApiMatch,
} from "./results-sync";

describe("mapApiStatus", () => {
  it("maps FINISHED and AWARDED to finished", () => {
    expect(mapApiStatus("FINISHED")).toBe("finished");
    expect(mapApiStatus("AWARDED")).toBe("finished");
  });

  it("maps IN_PLAY / LIVE / PAUSED to live", () => {
    expect(mapApiStatus("IN_PLAY")).toBe("live");
    expect(mapApiStatus("LIVE")).toBe("live");
    expect(mapApiStatus("PAUSED")).toBe("live");
  });

  it("maps everything else to scheduled", () => {
    for (const s of ["TIMED", "SCHEDULED", "POSTPONED", "SUSPENDED", "CANCELLED", "UNKNOWN_X"]) {
      expect(mapApiStatus(s)).toBe("scheduled");
    }
  });
});

function makeApiMatch(over: Partial<ApiMatch> = {}): ApiMatch {
  return {
    id: 537327,
    utcDate: "2026-06-11T19:00:00Z",
    stage: "GROUP_STAGE",
    group: "GROUP_A",
    status: "TIMED",
    homeTeam: { id: 769, name: "Mexico", tla: "MEX", crest: null },
    awayTeam: { id: 774, name: "South Africa", tla: "RSA", crest: null },
    score: { fullTime: { home: null, away: null } },
    ...over,
  };
}

describe("buildMatchRowUpdate", () => {
  const teamLookup = new Map<number, string>([
    [769, "uuid-mexico"],
    [774, "uuid-south-africa"],
  ]);

  it("builds a fully resolved row for a finished group match", () => {
    const apiMatch = makeApiMatch({
      status: "FINISHED",
      score: { fullTime: { home: 2, away: 1 } },
    });
    const { row, warnings } = buildMatchRowUpdate(apiMatch, teamLookup);
    expect(warnings).toEqual([]);
    expect(row.status).toBe("finished");
    expect(row.home_team_id).toBe("uuid-mexico");
    expect(row.away_team_id).toBe("uuid-south-africa");
    expect(row.home_score).toBe(2);
    expect(row.away_score).toBe(1);
    expect(row.api_match_id).toBe("537327");
  });

  it("emits a warning when an api_team_id isn't in the lookup", () => {
    const apiMatch = makeApiMatch({
      homeTeam: { id: 9999, name: "Phantom", tla: "PHA", crest: null },
    });
    const { row, warnings } = buildMatchRowUpdate(apiMatch, teamLookup);
    expect(row.home_team_id).toBe(null);
    expect(row.away_team_id).toBe("uuid-south-africa");
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/api_team_id=9999/);
  });

  it("returns null team ids for an unresolved knockout match", () => {
    const apiMatch = makeApiMatch({
      stage: "LAST_32",
      group: null,
      homeTeam: { id: null, name: null, tla: null, crest: null },
      awayTeam: { id: null, name: null, tla: null, crest: null },
    });
    const { row, warnings } = buildMatchRowUpdate(apiMatch, teamLookup);
    expect(warnings).toEqual([]);
    expect(row.home_team_id).toBe(null);
    expect(row.away_team_id).toBe(null);
  });
});

describe("stripUnresolvedSlotLabels", () => {
  const baseRow = {
    api_match_id: "1",
    status: "scheduled" as const,
    home_score: null,
    away_score: null,
    home_slot_label: null,
    away_slot_label: null,
  };

  it("keeps slot_label keys when teams are resolved (null label = overwrite existing)", () => {
    const result = stripUnresolvedSlotLabels({
      ...baseRow,
      home_team_id: "uuid-h",
      away_team_id: "uuid-a",
    });
    expect("home_slot_label" in result).toBe(true);
    expect("away_slot_label" in result).toBe(true);
    expect(result.home_slot_label).toBe(null);
    expect(result.away_slot_label).toBe(null);
  });

  it("strips slot_label keys when teams are unresolved (preserves existing seed label)", () => {
    const result = stripUnresolvedSlotLabels({
      ...baseRow,
      home_team_id: null,
      away_team_id: null,
    });
    expect("home_slot_label" in result).toBe(false);
    expect("away_slot_label" in result).toBe(false);
  });

  it("strips just the side that's unresolved", () => {
    const result = stripUnresolvedSlotLabels({
      ...baseRow,
      home_team_id: "uuid-h",
      away_team_id: null,
    });
    expect("home_slot_label" in result).toBe(true);
    expect("away_slot_label" in result).toBe(false);
  });
});
