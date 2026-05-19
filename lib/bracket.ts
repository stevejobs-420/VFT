/**
 * Bracket derivation engine. Takes a user's 72 group-stage score
 * predictions and returns the resolved R32 bracket (with teams filled in)
 * plus per-group standings and 3rd-place ranking.
 *
 * Pure function — no DB, no I/O. PR 07 adapts DB shapes to this input.
 *
 * R16/QF/SF/Final are NOT in the output. Those depend on the user's
 * knockout-round predictions and are filled by a separate `advanceBracket`
 * helper in PR 07.
 */

import { R32_MATCHES, type R32Slot } from "./annex-c-matches";
import { getR32Layout } from "./annex-c";
import { GROUP_LETTERS, type GroupLetter } from "./bracket-types";
import {
  rankGroup,
  rankThirdPlaced,
  type FixtureScore,
  type GroupStanding,
  type ThirdPlaceRanking,
} from "./bracket-tiebreak";

export type { GroupLetter, GroupStanding, ThirdPlaceRanking };

export type GroupMatchPrediction = FixtureScore & {
  group: GroupLetter;
};

export type DeriveInput = {
  /** All 72 group-stage predictions. Order irrelevant. */
  groupPredictions: GroupMatchPrediction[];
  /**
   * Optional override of teams per group. If omitted, the teams in each
   * group are inferred from the predictions themselves (every team must
   * appear in at least one fixture of its group).
   */
  teamsByGroup?: Partial<Record<GroupLetter, string[]>>;
};

export type KnockoutSlot = {
  matchKey: string; // "M73".."M88" for now (R32 only)
  round: "r32";
  homeTeam: string;
  awayTeam: string;
  homeSlot: R32Slot;
  awaySlot: R32Slot | { kind: "third"; group: GroupLetter };
};

export type DerivedBracket = {
  groupStandings: Record<GroupLetter, GroupStanding[]>;
  thirdPlaceRanking: ThirdPlaceRanking[];
  annexCOption: number;
  qualifyingThirdGroups: GroupLetter[]; // 8 sorted letters
  r32: KnockoutSlot[];
};

const MATCHES_PER_GROUP = 6;
const GROUPS_COUNT = 12;

function inferTeams(predictions: GroupMatchPrediction[]): Record<GroupLetter, string[]> {
  const byGroup: Partial<Record<GroupLetter, Set<string>>> = {};
  for (const p of predictions) {
    const set = byGroup[p.group] ?? new Set<string>();
    set.add(p.homeTeam);
    set.add(p.awayTeam);
    byGroup[p.group] = set;
  }
  const result = {} as Record<GroupLetter, string[]>;
  for (const g of GROUP_LETTERS) {
    const teams = [...(byGroup[g] ?? new Set<string>())];
    if (teams.length !== 4) {
      throw new Error(`Group ${g} has ${teams.length} teams — expected 4`);
    }
    result[g] = teams;
  }
  return result;
}

function validate(input: DeriveInput, teamsByGroup: Record<GroupLetter, string[]>) {
  if (input.groupPredictions.length !== MATCHES_PER_GROUP * GROUPS_COUNT) {
    throw new Error(
      `Expected ${MATCHES_PER_GROUP * GROUPS_COUNT} group predictions, got ${input.groupPredictions.length}`,
    );
  }
  // Each group must have exactly 6 fixtures across exactly 4 teams.
  const fixturesByGroup: Partial<Record<GroupLetter, GroupMatchPrediction[]>> = {};
  for (const p of input.groupPredictions) {
    (fixturesByGroup[p.group] ??= []).push(p);
  }
  for (const g of GROUP_LETTERS) {
    const fixtures = fixturesByGroup[g] ?? [];
    if (fixtures.length !== MATCHES_PER_GROUP) {
      throw new Error(`Group ${g} has ${fixtures.length} fixtures — expected ${MATCHES_PER_GROUP}`);
    }
    const teams = new Set(teamsByGroup[g]);
    const seenPairs = new Set<string>();
    for (const f of fixtures) {
      if (!teams.has(f.homeTeam) || !teams.has(f.awayTeam)) {
        throw new Error(
          `Group ${g} fixture ${f.homeTeam} vs ${f.awayTeam} references team not in this group`,
        );
      }
      const pairKey = [f.homeTeam, f.awayTeam].sort().join("");
      if (seenPairs.has(pairKey)) {
        throw new Error(`Group ${g} has duplicate fixture between ${f.homeTeam} and ${f.awayTeam}`);
      }
      seenPairs.add(pairKey);
    }
  }
}

function parseSlot(slot: R32Slot): { position: 1 | 2 | 3; group: GroupLetter } {
  const position = parseInt(slot[0], 10) as 1 | 2 | 3;
  const group = slot[1] as GroupLetter;
  return { position, group };
}

function resolveStaticSlot(
  slot: R32Slot,
  standings: Record<GroupLetter, GroupStanding[]>,
): string {
  const { position, group } = parseSlot(slot);
  const team = standings[group][position - 1]?.team;
  if (!team) throw new Error(`Cannot resolve slot ${slot}`);
  return team;
}

export function deriveBracket(input: DeriveInput): DerivedBracket {
  // Total count first — most actionable error for the caller.
  if (input.groupPredictions.length !== MATCHES_PER_GROUP * GROUPS_COUNT) {
    throw new Error(
      `Expected ${MATCHES_PER_GROUP * GROUPS_COUNT} group predictions, got ${input.groupPredictions.length}`,
    );
  }
  const teamsByGroup = (input.teamsByGroup as Record<GroupLetter, string[]> | undefined) ??
    inferTeams(input.groupPredictions);
  validate(input, teamsByGroup);

  // 1. Per-group standings.
  const groupStandings = {} as Record<GroupLetter, GroupStanding[]>;
  for (const g of GROUP_LETTERS) {
    const fixtures = input.groupPredictions.filter((p) => p.group === g);
    groupStandings[g] = rankGroup(teamsByGroup[g], fixtures);
  }

  // 2. Rank the 12 third-placed teams.
  const thirds = GROUP_LETTERS.map((g) => ({
    team: groupStandings[g][2].team,
    group: g,
    stats: groupStandings[g][2],
  }));
  const thirdPlaceRanking = rankThirdPlaced(thirds);

  // 3. Annex C lookup — qualifying groups are those whose 3rd-placed team ranks ≤ 8.
  const qualifyingThirdGroups = thirdPlaceRanking
    .filter((t) => t.qualifies)
    .map((t) => t.group)
    .sort();
  const layout = getR32Layout(qualifyingThirdGroups);

  // 4. Fill the 16 R32 slots.
  const r32: KnockoutSlot[] = R32_MATCHES.map((m) => {
    const homeTeam = resolveStaticSlot(m.home, groupStandings);
    let awayTeam: string;
    let awaySlot: KnockoutSlot["awaySlot"];
    if ("awayThirdSlot" in m) {
      const sourceGroup = layout.slots[m.awayThirdSlot];
      awayTeam = groupStandings[sourceGroup as GroupLetter][2].team;
      awaySlot = { kind: "third", group: sourceGroup as GroupLetter };
    } else {
      awayTeam = resolveStaticSlot(m.away, groupStandings);
      awaySlot = m.away;
    }
    return {
      matchKey: `M${m.match}`,
      round: "r32" as const,
      homeTeam,
      awayTeam,
      homeSlot: m.home,
      awaySlot,
    };
  });

  // Sanity check: 32 distinct teams in R32.
  const participants = new Set(r32.flatMap((slot) => [slot.homeTeam, slot.awayTeam]));
  if (participants.size !== 32) {
    throw new Error(
      `R32 has ${participants.size} distinct participants — expected 32. Bug in tiebreaker or Annex C wiring.`,
    );
  }

  return {
    groupStandings,
    thirdPlaceRanking,
    annexCOption: layout.option,
    qualifyingThirdGroups,
    r32,
  };
}
