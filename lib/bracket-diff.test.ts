import { describe, it, expect } from "vitest";
import { diffBracket } from "./bracket-diff";
import type { DerivedBracket } from "./bracket";
import type { KnockoutSlot } from "./bracket";
import { R32_MATCHES } from "./annex-c-matches";

function makeR32(homeOverrides: Record<string, string> = {}, awayOverrides: Record<string, string> = {}): KnockoutSlot[] {
  return R32_MATCHES.map((m) => ({
    matchKey: `M${m.match}`,
    round: "r32" as const,
    homeTeam: homeOverrides[`M${m.match}`] ?? `T${m.match}H`,
    awayTeam: awayOverrides[`M${m.match}`] ?? `T${m.match}A`,
    homeSlot: m.home,
    awaySlot: "awayThirdSlot" in m ? { kind: "third", group: "A" as const } : m.away,
  }));
}

function fakeBracket(r32: KnockoutSlot[]): DerivedBracket {
  return {
    groupStandings: {} as DerivedBracket["groupStandings"],
    thirdPlaceRanking: [],
    annexCOption: 1,
    qualifyingThirdGroups: [],
    r32,
  };
}

describe("diffBracket", () => {
  it("returns empty affected set when nothing changed", () => {
    const r32 = makeR32();
    const result = diffBracket(fakeBracket(r32), fakeBracket(r32), new Set(["M74", "M89"]));
    expect(result.affected.size).toBe(0);
  });

  it("flags an R32 match whose teams changed only if user predicted it", () => {
    const before = makeR32();
    const after = makeR32({ M74: "DIFFERENT" });
    const withPred = diffBracket(fakeBracket(before), fakeBracket(after), new Set(["M74"]));
    expect([...withPred.affected]).toEqual(["M74"]);
    const noPred = diffBracket(fakeBracket(before), fakeBracket(after), new Set());
    expect(noPred.affected.size).toBe(0);
  });

  it("propagates a single R32 team change forward to R16 (M89 depends on M74)", () => {
    const before = makeR32();
    const after = makeR32({ M74: "DIFFERENT" });
    // R16 M89's feeders are M74 and M77. If M74 changed, M89 is in teamsChanged.
    // User predicted M89 → it shows up in affected.
    const result = diffBracket(fakeBracket(before), fakeBracket(after), new Set(["M89"]));
    expect(result.affected.has("M89")).toBe(true);
  });

  it("cascade through QF/SF/Final when an early R32 changes and all downstream are predicted", () => {
    const before = makeR32();
    const after = makeR32({ M74: "DIFFERENT" });
    // M74 -> M89 -> M97 -> M101 -> M104.
    const predicted = new Set(["M89", "M97", "M101", "M104"]);
    const result = diffBracket(fakeBracket(before), fakeBracket(after), predicted);
    expect([...result.affected].sort()).toEqual(["M101", "M104", "M89", "M97"].sort());
  });

  it("does not flag siblings (M73 doesn't propagate to M91)", () => {
    const before = makeR32();
    const after = makeR32({ M73: "DIFFERENT" });
    // M73 feeds M90, not M91.
    const result = diffBracket(
      fakeBracket(before),
      fakeBracket(after),
      new Set(["M90", "M91"]),
    );
    expect(result.affected.has("M90")).toBe(true);
    expect(result.affected.has("M91")).toBe(false);
  });
});
