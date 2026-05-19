import { describe, it, expect } from "vitest";
import { deriveBracket, type GroupMatchPrediction } from "./bracket";
import { GROUP_LETTERS, type GroupLetter } from "./bracket-types";
import { buildGroup } from "./test-fixtures/groups";

/**
 * Construct a 4-team group where positions 1→4 are clearly decided.
 *
 * `pattern`:
 *   "strong-third" → 3rd-placed team finishes with 3 pts, GD +1, GF 3
 *   "weak-third"   → 3rd-placed team finishes with 3 pts, GD -2, GF 1
 */
function makeGroup(
  group: GroupLetter,
  pattern: "strong-third" | "weak-third",
): GroupMatchPrediction[] {
  const teams: [string, string, string, string] = [
    `Tým ${group}1`,
    `Tým ${group}2`,
    `Tým ${group}3`,
    `Tým ${group}4`,
  ];
  if (pattern === "strong-third") {
    // pos1: 9 pts +3 GD; pos2: 6 pts +1 GD; pos3: 3 pts +1 GD GF=3; pos4: 0 pts -5 GD
    return buildGroup(group, teams, [
      [1, 0], // T1 vs T2 → T1 wins
      [1, 0], // T1 vs T3
      [1, 0], // T1 vs T4
      [1, 0], // T2 vs T3
      [1, 0], // T2 vs T4
      [3, 0], // T3 vs T4 → T3 wins big
    ]);
  } else {
    // pos1: 9 pts +6 GD; pos2: 6 pts +2 GD; pos3: 3 pts -2 GD GF=1; pos4: 0 pts -6 GD
    return buildGroup(group, teams, [
      [1, 0], // T1 vs T2
      [2, 0], // T1 vs T3
      [3, 0], // T1 vs T4
      [1, 0], // T2 vs T3
      [2, 0], // T2 vs T4
      [1, 0], // T3 vs T4
    ]);
  }
}

function fullFixture(strongGroups: GroupLetter[]): GroupMatchPrediction[] {
  const strong = new Set(strongGroups);
  return GROUP_LETTERS.flatMap((g) =>
    makeGroup(g, strong.has(g) ? "strong-third" : "weak-third"),
  );
}

describe("deriveBracket", () => {
  it("rejects fewer than 72 predictions", () => {
    expect(() => deriveBracket({ groupPredictions: [] })).toThrow(/Expected 72/);
  });

  it("rejects a group with the wrong number of fixtures", () => {
    const fixtures = fullFixture([]);
    // Move one fixture from group A to group B — keeps total at 72 but groups
    // become uneven, so the per-group fixture count check fires.
    const aIdx = fixtures.findIndex((f) => f.group === "A");
    fixtures[aIdx] = { ...fixtures[aIdx], group: "B" };
    expect(() => deriveBracket({ groupPredictions: fixtures })).toThrow(
      /Group [A-L]/,
    );
  });

  it("derives a clean bracket when groups E–L produce qualifying 3rd-placed teams", () => {
    const strong: GroupLetter[] = ["E", "F", "G", "H", "I", "J", "K", "L"];
    const result = deriveBracket({ groupPredictions: fullFixture(strong) });

    // Each group has 4 teams in 1→4 order.
    for (const g of GROUP_LETTERS) {
      expect(result.groupStandings[g].length).toBe(4);
      expect(result.groupStandings[g].map((s) => s.position)).toEqual([1, 2, 3, 4]);
    }

    // 8 teams qualify as 3rd-placed.
    expect(result.thirdPlaceRanking.length).toBe(12);
    expect(result.thirdPlaceRanking.filter((t) => t.qualifies).length).toBe(8);

    // Qualifying groups = strong ones, sorted.
    expect(result.qualifyingThirdGroups).toEqual(strong);

    // Annex C "EFGHIJKL" maps to option 1.
    expect(result.annexCOption).toBe(1);

    // 16 R32 matches with 32 distinct teams.
    expect(result.r32.length).toBe(16);
    const participants = new Set(result.r32.flatMap((m) => [m.homeTeam, m.awayTeam]));
    expect(participants.size).toBe(32);

    // Spot-check a static match: M73 is 2A vs 2B.
    const m73 = result.r32.find((m) => m.matchKey === "M73")!;
    expect(m73.homeTeam).toBe("Tým A2");
    expect(m73.awayTeam).toBe("Tým B2");

    // Spot-check a dynamic match: M74 (1E host) faces a 3rd-placed team. From
    // Annex C option 1, M74's slot = group F → 3rd of group F = "Tým F3".
    const m74 = result.r32.find((m) => m.matchKey === "M74")!;
    expect(m74.homeTeam).toBe("Tým E1");
    expect(m74.awayTeam).toBe("Tým F3");
  });
});
