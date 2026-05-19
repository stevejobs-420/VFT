/**
 * Server-side data loaders for /predict. Keeps page.tsx thin.
 */

import { createClient } from "@/lib/supabase/server";
import { GROUP_LETTERS, type GroupLetter } from "./bracket-types";
import type {
  GroupMatchView,
  GroupView,
  PredictPageData,
  PredictionView,
  TeamView,
} from "./predict-types";

type DbTeamRow = {
  id: string;
  name: string;
  group_letter: string;
  flag_url: string | null;
};

type DbMatchRow = {
  id: string;
  stage: string;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff_at: string;
  status: string;
};

type DbPredictionRow = {
  match_id: string;
  home_score: number | null;
  away_score: number | null;
  locked: boolean;
};

export async function loadPredictPageData(userId: string): Promise<PredictPageData> {
  const supabase = await createClient();

  const [teamsRes, matchesRes, predictionsRes] = await Promise.all([
    supabase.from("teams").select("id, name, group_letter, flag_url"),
    supabase
      .from("matches")
      .select("id, stage, home_team_id, away_team_id, kickoff_at, status")
      .eq("stage", "group")
      .order("kickoff_at", { ascending: true }),
    supabase
      .from("predictions")
      .select("match_id, home_score, away_score, locked")
      .eq("user_id", userId),
  ]);

  if (teamsRes.error) throw teamsRes.error;
  if (matchesRes.error) throw matchesRes.error;
  if (predictionsRes.error) throw predictionsRes.error;

  const teamsById = new Map<string, TeamView>();
  for (const t of (teamsRes.data ?? []) as DbTeamRow[]) {
    teamsById.set(t.id, {
      id: t.id,
      name: t.name,
      groupLetter: t.group_letter as GroupLetter,
      flagUrl: t.flag_url,
    });
  }

  const matches: GroupMatchView[] = [];
  for (const m of (matchesRes.data ?? []) as DbMatchRow[]) {
    if (!m.home_team_id || !m.away_team_id) continue; // group rows should always have teams
    const home = teamsById.get(m.home_team_id);
    const away = teamsById.get(m.away_team_id);
    if (!home || !away) continue;
    matches.push({
      matchId: m.id,
      stage: "group",
      group: home.groupLetter,
      homeTeam: home,
      awayTeam: away,
      kickoffAt: m.kickoff_at,
      locked: m.status !== "scheduled",
    });
  }

  const groups: GroupView[] = GROUP_LETTERS.map((letter) => {
    const groupTeams = [...teamsById.values()]
      .filter((t) => t.groupLetter === letter)
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
    const groupMatches = matches.filter((m) => m.group === letter);
    return { letter, teams: groupTeams, matches: groupMatches };
  });

  const predictionsByMatch: Record<string, PredictionView> = {};
  for (const p of (predictionsRes.data ?? []) as DbPredictionRow[]) {
    predictionsByMatch[p.match_id] = {
      matchId: p.match_id,
      homeScore: p.home_score,
      awayScore: p.away_score,
      locked: p.locked,
    };
  }

  return { groups, predictionsByMatch };
}
