/**
 * FIFA group-stage tiebreaker pipeline + third-place ranking.
 *
 * Implements steps 1–5 of FIFA's chain (per ARCHITECTURE.md "Tournament
 * Structure → FIFA group-stage tiebreaker order"):
 *
 *   1. Points
 *   2. Head-to-head points among tied teams
 *   3. Head-to-head goal difference among tied teams
 *   4. Head-to-head goals scored among tied teams
 *   5. Overall goal difference
 *   6. Overall goals scored
 *
 * MVP truncates the real FIFA chain at step 5 (overall GD) + 6 (overall GF)
 * and falls back to Czech alphabetical sort for steps 7 (fair play) and 8
 * (FIFA ranking), since neither is derivable from score predictions alone.
 */

import type { GroupLetter } from "./bracket-types";

export type RawTeamStats = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type GroupStanding = RawTeamStats & {
  goalDifference: number;
  points: number;
  position: 1 | 2 | 3 | 4;
};

export type FixtureScore = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
};

function emptyStats(team: string): RawTeamStats {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
}

function applyFixture(stats: RawTeamStats, gf: number, ga: number): RawTeamStats {
  const won = gf > ga ? 1 : 0;
  const drawn = gf === ga ? 1 : 0;
  const lost = gf < ga ? 1 : 0;
  return {
    ...stats,
    played: stats.played + 1,
    won: stats.won + won,
    drawn: stats.drawn + drawn,
    lost: stats.lost + lost,
    goalsFor: stats.goalsFor + gf,
    goalsAgainst: stats.goalsAgainst + ga,
  };
}

export function aggregateStats(teams: string[], fixtures: FixtureScore[]): RawTeamStats[] {
  const byTeam = new Map<string, RawTeamStats>();
  for (const t of teams) byTeam.set(t, emptyStats(t));

  for (const f of fixtures) {
    const home = byTeam.get(f.homeTeam);
    const away = byTeam.get(f.awayTeam);
    if (!home || !away) {
      throw new Error(
        `Fixture references unknown team(s): ${f.homeTeam} vs ${f.awayTeam}. Known: ${teams.join(", ")}`,
      );
    }
    byTeam.set(f.homeTeam, applyFixture(home, f.homeScore, f.awayScore));
    byTeam.set(f.awayTeam, applyFixture(away, f.awayScore, f.homeScore));
  }

  return [...byTeam.values()];
}

function pointsOf(s: RawTeamStats): number {
  return s.won * 3 + s.drawn;
}

function withDerivedFields(s: RawTeamStats): Omit<GroupStanding, "position"> {
  return {
    ...s,
    goalDifference: s.goalsFor - s.goalsAgainst,
    points: pointsOf(s),
  };
}

const cs = new Intl.Collator("cs", { sensitivity: "base" });

/**
 * Rank one group's 4 teams using the FIFA tiebreaker chain.
 *
 * @param teams Team names in this group (4 expected).
 * @param fixtures All 6 group-stage fixtures with scores.
 */
export function rankGroup(teams: string[], fixtures: FixtureScore[]): GroupStanding[] {
  const raw = aggregateStats(teams, fixtures).map(withDerivedFields);

  // First pass: sort by points desc.
  raw.sort((a, b) => b.points - a.points);

  // Identify runs of teams tied on points, resolve each run via h2h then overall.
  const result: Array<Omit<GroupStanding, "position">> = [];
  let i = 0;
  while (i < raw.length) {
    let j = i + 1;
    while (j < raw.length && raw[j].points === raw[i].points) j++;
    const run = raw.slice(i, j);
    if (run.length === 1) {
      result.push(run[0]);
    } else {
      result.push(...resolveRun(run, fixtures));
    }
    i = j;
  }

  return result.map((s, idx) => ({ ...s, position: (idx + 1) as 1 | 2 | 3 | 4 }));
}

function resolveRun(
  run: Array<Omit<GroupStanding, "position">>,
  allFixtures: FixtureScore[],
): Array<Omit<GroupStanding, "position">> {
  // h2h pass: build sub-table over fixtures restricted to teams in the run.
  const runNames = new Set(run.map((s) => s.team));
  const h2hFixtures = allFixtures.filter(
    (f) => runNames.has(f.homeTeam) && runNames.has(f.awayTeam),
  );
  const h2hStats = aggregateStats([...runNames], h2hFixtures).map(withDerivedFields);
  const byName = new Map(h2hStats.map((s) => [s.team, s]));

  // Comparator: h2h pts → h2h GD → h2h GF → overall GD → overall GF → alphabetical (Czech).
  const overallByName = new Map(run.map((s) => [s.team, s]));

  function cmp(a: string, b: string): number {
    const ah = byName.get(a)!;
    const bh = byName.get(b)!;
    if (bh.points !== ah.points) return bh.points - ah.points;
    if (bh.goalDifference !== ah.goalDifference) return bh.goalDifference - ah.goalDifference;
    if (bh.goalsFor !== ah.goalsFor) return bh.goalsFor - ah.goalsFor;
    const ao = overallByName.get(a)!;
    const bo = overallByName.get(b)!;
    if (bo.goalDifference !== ao.goalDifference) return bo.goalDifference - ao.goalDifference;
    if (bo.goalsFor !== ao.goalsFor) return bo.goalsFor - ao.goalsFor;
    return cs.compare(a, b);
  }

  // Sort run by the team name through the comparator.
  const sortedNames = run.map((s) => s.team).sort(cmp);
  return sortedNames.map((name) => overallByName.get(name)!);
}

export type ThirdPlaceRanking = {
  team: string;
  group: GroupLetter;
  rank: number; // 1..12
  qualifies: boolean;
  stats: GroupStanding;
};

/**
 * Rank the 12 third-placed teams across all groups. Top 8 qualify for R32.
 * Order: points → GD → goals scored → alphabetical (Czech).
 */
export function rankThirdPlaced(
  thirds: Array<{ team: string; group: GroupLetter; stats: GroupStanding }>,
): ThirdPlaceRanking[] {
  const sorted = thirds.slice().sort((a, b) => {
    if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
    if (b.stats.goalDifference !== a.stats.goalDifference) {
      return b.stats.goalDifference - a.stats.goalDifference;
    }
    if (b.stats.goalsFor !== a.stats.goalsFor) return b.stats.goalsFor - a.stats.goalsFor;
    return cs.compare(a.team, b.team);
  });
  return sorted.map((t, i) => ({
    team: t.team,
    group: t.group,
    rank: i + 1,
    qualifies: i < 8,
    stats: t.stats,
  }));
}
