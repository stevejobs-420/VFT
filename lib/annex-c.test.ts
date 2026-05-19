import { describe, it, expect } from "vitest";
import { getR32Layout, getAllEntries, type GroupLetter } from "./annex-c";
import { DYNAMIC_HOST_GROUP, DYNAMIC_R32_MATCH_KEYS } from "./annex-c-matches";

describe("annex-c", () => {
  it("has exactly 495 entries", () => {
    expect(Object.keys(getAllEntries()).length).toBe(495);
  });

  it("getR32Layout returns option 1 for qualifying groups {E, J, I, F, H, G, L, K}", () => {
    // Option 1 in the regs: 1A→3E, 1B→3J, 1D→3I, 1E→3F, 1G→3H, 1I→3G, 1K→3L, 1L→3K
    const entry = getR32Layout(["E", "J", "I", "F", "H", "G", "L", "K"]);
    expect(entry.option).toBe(1);
    expect(entry.qualifyingGroups).toBe("EFGHIJKL");
    expect(entry.slots).toEqual({
      M79: "E", // 1A vs 3E
      M85: "J", // 1B vs 3J
      M81: "I", // 1D vs 3I
      M74: "F", // 1E vs 3F
      M82: "H", // 1G vs 3H
      M77: "G", // 1I vs 3G
      M87: "L", // 1K vs 3L
      M80: "K", // 1L vs 3K
    });
  });

  it("getR32Layout is order-independent", () => {
    const a = getR32Layout(["E", "F", "G", "H", "I", "J", "K", "L"]);
    const b = getR32Layout(["L", "K", "J", "I", "H", "G", "F", "E"]);
    expect(a).toEqual(b);
  });

  it("throws on wrong length", () => {
    expect(() => getR32Layout(["A", "B", "C"] as GroupLetter[])).toThrow(/expected 8/);
  });

  it("throws on duplicate group letters", () => {
    expect(() =>
      getR32Layout(["A", "A", "B", "C", "D", "E", "F", "G"] as GroupLetter[]),
    ).toThrow(/duplicate/);
  });

  it("throws when no entry matches", () => {
    // C(12,8) = 495 covers every 8-of-12 combo — we'd have to feed nonsense
    // letters outside A..L to break the lookup, but the type system blocks
    // that. Force-cast to test the runtime guard.
    expect(() =>
      getR32Layout(["A", "B", "C", "D", "E", "F", "G", "X" as GroupLetter]),
    ).toThrow(/no Annex C entry/);
  });

  it("no R32 pairing puts two teams from the same group together", () => {
    for (const [key, entry] of Object.entries(getAllEntries())) {
      for (const matchKey of DYNAMIC_R32_MATCH_KEYS) {
        const host = DYNAMIC_HOST_GROUP[matchKey];
        const away = entry.slots[matchKey];
        expect(host, `key=${key} matchKey=${matchKey}`).not.toBe(away);
      }
    }
  });

  it("each entry's slot groups equal its qualifyingGroups key (set equality)", () => {
    for (const [key, entry] of Object.entries(getAllEntries())) {
      const slots = Object.values(entry.slots).slice().sort().join("");
      expect(slots).toBe(key);
    }
  });
});
