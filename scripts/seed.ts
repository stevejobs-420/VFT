/**
 * Seed script — populates `teams` and `matches` from football-data.org.
 *
 * Run with: `npm run seed`
 *
 * Requires .env.local with:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - FOOTBALL_DATA_API_KEY
 *
 * Idempotent: re-runs upsert on `teams.api_team_id` and `matches.api_match_id`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getCzechName } from "../lib/teams-cs";

// ---------------------------------------------------------------------------
// .env.local loader — tsx doesn't auto-load it (Next.js does for the app).
// ---------------------------------------------------------------------------
function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, valueRaw] = m;
      const value = valueRaw.replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env.local — fall back to whatever's in the parent shell env.
  }
}
loadEnvLocal();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Chybí proměnná prostředí ${name}. Doplň ji do .env.local a spusť znovu.`);
    process.exit(1);
  }
  return v;
}

const FOOTBALL_DATA_API_KEY = requireEnv("FOOTBALL_DATA_API_KEY");
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// football-data.org types (subset of fields we use)
// ---------------------------------------------------------------------------
type ApiTeam = {
  id: number;
  name: string;
  tla: string;
  crest: string;
};

type ApiTeamRef = {
  id: number | null;
  name: string | null;
  tla: string | null;
  crest: string | null;
};

type ApiStage =
  | "GROUP_STAGE"
  | "LAST_32"
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

type ApiMatch = {
  id: number;
  utcDate: string;
  stage: ApiStage;
  group: string | null; // "GROUP_A" .. "GROUP_L" or null
  status: string;
  homeTeam: ApiTeamRef;
  awayTeam: ApiTeamRef;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
};

const STAGE_MAP: Record<ApiStage, "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final"> = {
  GROUP_STAGE: "group",
  LAST_32: "r32",
  LAST_16: "r16",
  QUARTER_FINALS: "qf",
  SEMI_FINALS: "sf",
  THIRD_PLACE: "third_place",
  FINAL: "final",
};

// ---------------------------------------------------------------------------
// API fetcher
// ---------------------------------------------------------------------------
async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.football-data.org${path}`, {
    headers: { "X-Auth-Token": FOOTBALL_DATA_API_KEY },
  });
  if (!res.ok) {
    throw new Error(`football-data ${path} → HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Slot labels for unresolved knockout matches.
// stageIndex is 1-based within the stage. The bracket-derivation engine (PR 06)
// will overwrite these with real Annex-C-derived labels.
// ---------------------------------------------------------------------------
function slotLabel(stage: ApiStage, stageIndex: number, side: "home" | "away"): string {
  switch (stage) {
    case "LAST_32":
      return `R32 zápas ${stageIndex} (${side === "home" ? "domácí" : "hosté"})`;
    case "LAST_16":
      return `R16 zápas ${stageIndex} (${side === "home" ? "domácí" : "hosté"})`;
    case "QUARTER_FINALS":
      return `Čtvrtfinále ${stageIndex} (${side === "home" ? "domácí" : "hosté"})`;
    case "SEMI_FINALS":
      return `Semifinále ${stageIndex} (${side === "home" ? "domácí" : "hosté"})`;
    case "THIRD_PLACE":
      return `O 3. místo (${side === "home" ? "domácí" : "hosté"})`;
    case "FINAL":
      return `Finále (${side === "home" ? "domácí" : "hosté"})`;
    default:
      throw new Error(`slotLabel called for non-knockout stage: ${stage}`);
  }
}

// ---------------------------------------------------------------------------
// Seed: teams
// ---------------------------------------------------------------------------
async function seedTeams(apiTeams: ApiTeam[], apiMatches: ApiMatch[]) {
  // Derive group letter per team from group-stage matches.
  const teamGroup = new Map<number, string>();
  for (const m of apiMatches) {
    if (m.stage !== "GROUP_STAGE" || !m.group) continue;
    const letter = m.group.replace("GROUP_", ""); // "GROUP_A" -> "A"
    if (m.homeTeam.id) teamGroup.set(m.homeTeam.id, letter);
    if (m.awayTeam.id) teamGroup.set(m.awayTeam.id, letter);
  }

  const rows = apiTeams.map((t) => {
    const group = teamGroup.get(t.id);
    if (!group) {
      throw new Error(`Tým ${t.name} (id ${t.id}) nemá přiřazenou skupinu — chybí v zápasech?`);
    }
    return {
      name: getCzechName(t.name),
      group_letter: group,
      flag_url: t.crest,
      api_team_id: t.id,
    };
  });

  const { error } = await supabase
    .from("teams")
    .upsert(rows, { onConflict: "api_team_id" });
  if (error) throw error;
  console.log(`✓ Týmů: ${rows.length}`);
}

// ---------------------------------------------------------------------------
// Seed: matches
// ---------------------------------------------------------------------------
async function seedMatches(apiMatches: ApiMatch[]) {
  // Build api_team_id -> our teams.id lookup.
  const { data: dbTeams, error: teamsErr } = await supabase
    .from("teams")
    .select("id, api_team_id");
  if (teamsErr) throw teamsErr;
  const teamIdByApiId = new Map<number, string>();
  for (const t of dbTeams ?? []) {
    if (t.api_team_id != null) teamIdByApiId.set(t.api_team_id as number, t.id as string);
  }

  // Count per-stage so we can index slot labels.
  const stageCounters = new Map<ApiStage, number>();

  const rows = apiMatches.map((m) => {
    const stage = STAGE_MAP[m.stage];
    const idx = (stageCounters.get(m.stage) ?? 0) + 1;
    stageCounters.set(m.stage, idx);

    const homeId = m.homeTeam.id ? teamIdByApiId.get(m.homeTeam.id) ?? null : null;
    const awayId = m.awayTeam.id ? teamIdByApiId.get(m.awayTeam.id) ?? null : null;

    const homeLabel = !homeId && m.stage !== "GROUP_STAGE" ? slotLabel(m.stage, idx, "home") : null;
    const awayLabel = !awayId && m.stage !== "GROUP_STAGE" ? slotLabel(m.stage, idx, "away") : null;

    return {
      stage,
      home_team_id: homeId,
      away_team_id: awayId,
      home_slot_label: homeLabel,
      away_slot_label: awayLabel,
      kickoff_at: m.utcDate,
      home_score: m.score.fullTime.home,
      away_score: m.score.fullTime.away,
      status:
        m.status === "FINISHED"
          ? "finished"
          : m.status === "IN_PLAY" || m.status === "PAUSED"
            ? "live"
            : "scheduled",
      api_match_id: String(m.id),
    };
  });

  const { error } = await supabase
    .from("matches")
    .upsert(rows, { onConflict: "api_match_id" });
  if (error) throw error;
  console.log(`✓ Zápasů: ${rows.length}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Stahuji data z football-data.org…");
  const [teamsResp, matchesResp] = await Promise.all([
    fetchJson<{ teams: ApiTeam[] }>("/v4/competitions/WC/teams"),
    fetchJson<{ matches: ApiMatch[] }>("/v4/competitions/WC/matches"),
  ]);
  console.log(`API: ${teamsResp.teams.length} týmů, ${matchesResp.matches.length} zápasů.`);

  await seedTeams(teamsResp.teams, matchesResp.matches);
  await seedMatches(matchesResp.matches);

  console.log("Hotovo.");
}

main().catch((err) => {
  console.error("Seed selhal:", err);
  process.exit(1);
});
