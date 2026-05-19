import { describe, it, expect } from "vitest";
import { advanceBracket, type KnockoutScorePrediction } from "./advance-bracket";
import type { KnockoutSlot } from "./bracket";
import { R32_MATCHES } from "./annex-c-matches";
import { R16_MATCHES, QF_MATCHES, SF_MATCHES, FINAL_MATCH } from "./bracket-matches";

/**
 * Build a synthetic R32 list with named placeholder teams (e.g. "T74H" /
 * "T74A" for M74). Useful for testing the progression logic in isolation
 * from deriveBracket.
 */
function fakeR32(): KnockoutSlot[] {
  return R32_MATCHES.map((m) => ({
    matchKey: `M${m.match}`,
    round: "r32" as const,
    homeTeam: `T${m.match}H`,
    awayTeam: `T${m.match}A`,
    homeSlot: m.home,
    awaySlot: "awayThirdSlot" in m ? { kind: "third", group: "A" as const } : m.away,
  }));
}

function preds(entries: Record<string, [number, number]>): Map<string, KnockoutScorePrediction> {
  return new Map(
    Object.entries(entries).map(([key, [home, away]]) => [
      key,
      { homeScore: home, awayScore: away },
    ]),
  );
}

describe("advanceBracket", () => {
  it("returns null teams for R16+ when no R32 predictions given", () => {
    const result = advanceBracket(fakeR32(), new Map());
    expect(result.r16.every((m) => m.homeTeam === null && m.awayTeam === null)).toBe(true);
    expect(result.qf.every((m) => m.homeTeam === null && m.awayTeam === null)).toBe(true);
    expect(result.champion).toBe(null);
  });

  it("populates R16 home/away when both feeder R32 matches have winners", () => {
    // M89 = winner(M74) vs winner(M77).
    const result = advanceBracket(
      fakeR32(),
      preds({
        M74: [2, 1], // T74H wins
        M77: [0, 3], // T77A wins
      }),
    );
    const m89 = result.r16.find((m) => m.matchKey === "M89")!;
    expect(m89.homeTeam).toBe("T74H");
    expect(m89.awayTeam).toBe("T77A");
  });

  it("blocks downstream when an R32 prediction is a tie", () => {
    const result = advanceBracket(
      fakeR32(),
      preds({
        M74: [1, 1], // tie → null winner
        M77: [2, 0],
      }),
    );
    const m89 = result.r16.find((m) => m.matchKey === "M89")!;
    expect(m89.homeTeam).toBe(null); // feeder M74 had no winner
    expect(m89.awayTeam).toBe("T77H"); // feeder M77 winner
  });

  it("returns champion when full bracket is filled with non-ties", () => {
    const all: Record<string, [number, number]> = {};
    // R32: all home teams win 1-0.
    for (const m of R32_MATCHES) all[`M${m.match}`] = [1, 0];
    // R16: all home teams win.
    for (const m of R16_MATCHES) all[m.matchKey] = [1, 0];
    // QF: all home teams win.
    for (const m of QF_MATCHES) all[m.matchKey] = [1, 0];
    // SF: all home teams win.
    for (const m of SF_MATCHES) all[m.matchKey] = [1, 0];
    // Final: home wins.
    all[FINAL_MATCH.matchKey] = [3, 1];

    const result = advanceBracket(fakeR32(), preds(all));
    // M104 = winner(M101) vs winner(M102); M101 = winner(M97) vs winner(M98); etc.
    // With all home-team-wins in R32, M89's home = T74H (M74 home). Propagating
    // through, the final's home is whoever fed M101 as home, which is whoever
    // won M97, which is M89's winner, which is T74H.
    expect(result.champion).toBe("T74H");
  });

  it("returns null champion on a tied final", () => {
    const all: Record<string, [number, number]> = {};
    for (const m of R32_MATCHES) all[`M${m.match}`] = [1, 0];
    for (const m of R16_MATCHES) all[m.matchKey] = [1, 0];
    for (const m of QF_MATCHES) all[m.matchKey] = [1, 0];
    for (const m of SF_MATCHES) all[m.matchKey] = [1, 0];
    all[FINAL_MATCH.matchKey] = [2, 2];
    const result = advanceBracket(fakeR32(), preds(all));
    expect(result.champion).toBe(null);
  });

  it("cascade: editing an R32 prediction changes downstream teams", () => {
    // Baseline: T74H wins M74 → reaches M89 as home, then M97 as home, then M101 home, then M104 home.
    const baseline: Record<string, [number, number]> = {};
    for (const m of R32_MATCHES) baseline[`M${m.match}`] = [1, 0];
    for (const m of R16_MATCHES) baseline[m.matchKey] = [1, 0];
    for (const m of QF_MATCHES) baseline[m.matchKey] = [1, 0];
    for (const m of SF_MATCHES) baseline[m.matchKey] = [1, 0];
    baseline[FINAL_MATCH.matchKey] = [1, 0];

    const before = advanceBracket(fakeR32(), preds(baseline));
    const before104 = before.r32.find((m) => m.matchKey === "M74")!.winner;
    expect(before104).toBe("T74H");

    // Flip M74: now T74A wins. M89's home should now be T74A.
    const flipped = { ...baseline, M74: [0, 1] as [number, number] };
    const after = advanceBracket(fakeR32(), preds(flipped));
    const m89After = after.r16.find((m) => m.matchKey === "M89")!;
    expect(m89After.homeTeam).toBe("T74A");
  });
});
