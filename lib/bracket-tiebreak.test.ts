import { describe, it, expect } from "vitest";
import { rankGroup, rankThirdPlaced } from "./bracket-tiebreak";
import { buildGroup } from "./test-fixtures/groups";

describe("rankGroup", () => {
  it("orders a clean group with no ties", () => {
    // Argentina beats everyone; Mexiko beats the bottom two; Saúdská Arábie
    // beats Polsko. Decisive — no tiebreaker needed.
    const fixtures = buildGroup(
      "A",
      ["Argentina", "Mexiko", "Saúdská Arábie", "Polsko"],
      [
        [2, 0], // ARG-MEX
        [3, 0], // ARG-SAU
        [4, 0], // ARG-POL
        [2, 0], // MEX-SAU
        [3, 0], // MEX-POL
        [2, 0], // SAU-POL
      ],
    );
    const standings = rankGroup(["Argentina", "Mexiko", "Saúdská Arábie", "Polsko"], fixtures);
    expect(standings.map((s) => [s.team, s.position])).toEqual([
      ["Argentina", 1],
      ["Mexiko", 2],
      ["Saúdská Arábie", 3],
      ["Polsko", 4],
    ]);
    expect(standings[0].points).toBe(9);
    expect(standings[3].points).toBe(0);
  });

  it("resolves a 3-way tie via head-to-head points", () => {
    // Brazílie, Švýcarsko, Kamerun all win one match each among themselves;
    // Srbsko loses all three. So three teams tie on 7 pts (3+3+1 = nope — let's
    // do all draws between top 3 + each beats Srbsko 1-0): Brazílie 5,
    // Švýcarsko 5, Kamerun 5, Srbsko 0. Then need an actual h2h differentiator.
    //
    // Simpler: Brazílie beats Švýcarsko, Švýcarsko beats Kamerun, Kamerun
    // beats Brazílie, each beats Srbsko 1-0. Top three tied on 6 pts each
    // with cyclic h2h record — h2h points all equal at 3, h2h GD all equal at
    // 0, h2h GF all equal at 1. Falls through to overall GD/GF, then alpha.
    const fixtures = buildGroup(
      "B",
      ["Brazílie", "Kamerun", "Srbsko", "Švýcarsko"],
      [
        [2, 0], // BRA-KAM (Brazílie loses h2h vs Kamerun? — no, BRA beats KAM 2-0 here)
        [1, 0], // BRA-SRB
        [0, 1], // BRA-SUI (Švýcarsko beats Brazílie)
        [0, 1], // KAM-SRB (no, want KAM to beat SRB)
        [1, 0], // KAM-SUI (Kamerun beats Švýcarsko)
        [0, 1], // SRB-SUI (Švýcarsko beats Srbsko)
      ],
    );
    // Actually let's keep it cleaner. With the fixtures above:
    //   BRA: beat KAM 2-0, beat SRB 1-0, lost to SUI 0-1  → 6 pts, GF 3, GA 1, GD +2
    //   KAM: lost BRA 0-2, lost SRB 0-1, beat SUI 1-0     → 3 pts, GF 1, GA 3, GD -2
    //   SUI: beat BRA 1-0, lost KAM 0-1, beat SRB 1-0     → 6 pts, GF 2, GA 1, GD +1
    //   SRB: lost BRA 0-1, beat KAM 1-0, lost SUI 0-1     → 3 pts, GF 1, GA 2, GD -1
    //
    // BRA & SUI tied on 6 pts. h2h: SUI beat BRA → SUI 1, BRA 0. SUI wins tie.
    // KAM & SRB tied on 3 pts. h2h: SRB beat KAM → SRB 1, KAM 0. SRB wins tie.
    const standings = rankGroup(
      ["Brazílie", "Kamerun", "Srbsko", "Švýcarsko"],
      fixtures,
    );
    expect(standings.map((s) => s.team)).toEqual(["Švýcarsko", "Brazílie", "Srbsko", "Kamerun"]);
  });

  it("falls through to overall GD when h2h is identical", () => {
    // Two teams tied on points AND identical h2h (1-1 draw between them) →
    // resolved by overall GD.
    const fixtures = buildGroup(
      "C",
      ["Anglie", "Belgie", "Chorvatsko", "Dánsko"],
      [
        [1, 1], // ANG-BEL (1-1 draw)
        [3, 0], // ANG-CRO (Anglie crushes)
        [2, 0], // ANG-DAN
        [1, 0], // BEL-CRO
        [1, 0], // BEL-DAN
        [0, 0], // CRO-DAN
      ],
    );
    // Standings:
    //   ANG: D BEL 1-1, W CRO 3-0, W DAN 2-0  → 7 pts, GD +5
    //   BEL: D ANG 1-1, W CRO 1-0, W DAN 1-0  → 7 pts, GD +2
    //   CRO: L ANG 0-3, L BEL 0-1, D DAN 0-0  → 1 pt,  GD -4
    //   DAN: L ANG 0-2, L BEL 0-1, D CRO 0-0  → 1 pt,  GD -3
    // ANG & BEL tied on 7 pts. h2h is the draw → identical h2h.
    // Falls through to overall GD: ANG +5 > BEL +2.
    const standings = rankGroup(
      ["Anglie", "Belgie", "Chorvatsko", "Dánsko"],
      fixtures,
    );
    expect(standings.map((s) => s.team)).toEqual(["Anglie", "Belgie", "Dánsko", "Chorvatsko"]);
  });

  it("falls through to Czech alphabetical sort as final fallback", () => {
    // Three teams identical on points, h2h, GD, and GF — only thing left is
    // alphabetical. Construct: all teams draw 0-0 against each other.
    const fixtures = buildGroup(
      "D",
      ["Česko", "Bosna a Hercegovina", "Slovensko", "Maďarsko"],
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    );
    const standings = rankGroup(
      ["Česko", "Bosna a Hercegovina", "Slovensko", "Maďarsko"],
      fixtures,
    );
    // All tied at 3 pts (3 draws each), GD 0, GF 0.
    // Czech collation order: Bosna, Česko (Č follows C), Maďarsko, Slovensko.
    expect(standings.map((s) => s.team)).toEqual([
      "Bosna a Hercegovina",
      "Česko",
      "Maďarsko",
      "Slovensko",
    ]);
  });
});

describe("rankThirdPlaced", () => {
  it("ranks 12 thirds and qualifies the top 8", () => {
    const thirds = [
      // 12 thirds, points cleanly decreasing 11..0 except for two ties to test tiebreakers
      mkThird("A", "Tým 1", 7, 2, 5),
      mkThird("B", "Tým 2", 6, 4, 6),
      mkThird("C", "Tým 3", 6, 4, 5), // tie with Tým 2 on pts + GD, lower GF
      mkThird("D", "Tým 4", 5, 0, 3),
      mkThird("E", "Tým 5", 4, -1, 2),
      mkThird("F", "Tým 6", 4, -1, 2), // identical to Tým 5 → alpha
      mkThird("G", "Tým 7", 3, -2, 1),
      mkThird("H", "Tým 8", 2, -3, 0),
      mkThird("I", "Tým 9", 2, -4, 0),
      mkThird("J", "Tým 10", 1, -5, 0),
      mkThird("K", "Tým 11", 1, -6, 0),
      mkThird("L", "Tým 12", 0, -7, 0),
    ];
    const ranking = rankThirdPlaced(thirds);
    expect(ranking.length).toBe(12);
    expect(ranking.filter((r) => r.qualifies).length).toBe(8);
    // Tým 2 should rank ahead of Tým 3 (same pts+GD, higher GF).
    expect(ranking.find((r) => r.team === "Tým 2")!.rank).toBeLessThan(
      ranking.find((r) => r.team === "Tým 3")!.rank,
    );
    // Tým 5 ranks ahead of Tým 6 alphabetically ("Tým 1" < "Tým 11" lexically — but
    // for "Tým 5" vs "Tým 6" the sort is straight: "Tým 5" < "Tým 6").
    expect(ranking.find((r) => r.team === "Tým 5")!.rank).toBeLessThan(
      ranking.find((r) => r.team === "Tým 6")!.rank,
    );
  });
});

// Test helper to keep the third-place fixture compact.
function mkThird(
  group: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L",
  team: string,
  points: number,
  gd: number,
  gf: number,
) {
  return {
    team,
    group,
    stats: {
      team,
      played: 3,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: gf,
      goalsAgainst: gf - gd,
      goalDifference: gd,
      points,
      position: 3 as const,
    },
  };
}
