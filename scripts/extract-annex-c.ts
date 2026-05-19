/**
 * One-shot extractor: parses Annex C from FIFA's 2026 Competition Regulations
 * and writes data/annex-c.json (495 entries).
 *
 * Prep:
 *   curl -sL -o tmp/fwc2026_regs.pdf \
 *     "https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf"
 *   pdftotext -layout tmp/fwc2026_regs.pdf tmp/fwc2026_regs.txt
 *
 * Then: npm run extract-annex-c
 *
 * Only needs to run if FIFA amends the regulations. The committed JSON is the
 * runtime source of truth.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DYNAMIC_R32_MATCH_KEYS, DYNAMIC_HOST_GROUP } from "../lib/annex-c-matches";

const INPUT = resolve(process.cwd(), "tmp/fwc2026_regs.txt");
const OUTPUT = resolve(process.cwd(), "data/annex-c.json");

// Annex C columns in the PDF (sorted alphabetically by group letter).
const ANNEX_C_COLUMN_GROUPS = ["A", "B", "D", "E", "G", "I", "K", "L"] as const;

type AnnexCEntry = {
  option: number;
  qualifyingGroups: string;
  slots: Record<string, string>; // DynamicR32MatchKey -> group letter "A".."L"
};

function parseRows(text: string): AnnexCEntry[] {
  const rowRe = /^\s*(\d{1,3})\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s+3([A-L])\s*$/gm;
  const entries: AnnexCEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text)) !== null) {
    const option = parseInt(m[1], 10);
    const groupsByColumn = [m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9]];
    const slots: Record<string, string> = {};
    // Annex C columns are 1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L (host group winners).
    // Each column maps to a specific dynamic R32 match key.
    ANNEX_C_COLUMN_GROUPS.forEach((hostGroup, i) => {
      const matchKey = DYNAMIC_R32_MATCH_KEYS.find(
        (key) => DYNAMIC_HOST_GROUP[key] === hostGroup,
      );
      if (!matchKey) throw new Error(`No dynamic match for host group ${hostGroup}`);
      slots[matchKey] = groupsByColumn[i];
    });
    const qualifyingGroups = Object.values(slots).slice().sort().join("");
    entries.push({ option, qualifyingGroups, slots });
  }
  return entries;
}

function validate(entries: AnnexCEntry[]) {
  if (entries.length !== 495) {
    throw new Error(`Expected 495 entries, got ${entries.length}`);
  }
  // Option numbers must be 1..495 contiguous.
  const options = entries.map((e) => e.option).sort((a, b) => a - b);
  for (let i = 0; i < 495; i++) {
    if (options[i] !== i + 1) {
      throw new Error(`Missing/duplicate option ${i + 1} — got ${options[i]}`);
    }
  }
  // qualifyingGroups keys must be distinct.
  const keys = new Set(entries.map((e) => e.qualifyingGroups));
  if (keys.size !== 495) {
    throw new Error(`Expected 495 distinct qualifyingGroups, got ${keys.size}`);
  }
  for (const e of entries) {
    // Each row must use exactly 8 distinct group letters across its slots.
    const slotGroups = Object.values(e.slots);
    const distinct = new Set(slotGroups);
    if (distinct.size !== 8) {
      throw new Error(`Option ${e.option}: expected 8 distinct slot groups, got ${distinct.size}`);
    }
    // Set equality between qualifyingGroups and the row's slot groups.
    const sortedFromSlots = [...distinct].sort().join("");
    if (sortedFromSlots !== e.qualifyingGroups) {
      throw new Error(
        `Option ${e.option}: qualifyingGroups (${e.qualifyingGroups}) ≠ slot groups (${sortedFromSlots})`,
      );
    }
    // No host group can meet a 3rd-placed team from the same group (FIFA rule).
    for (const [matchKey, slotGroup] of Object.entries(e.slots)) {
      const host = DYNAMIC_HOST_GROUP[matchKey as keyof typeof DYNAMIC_HOST_GROUP];
      if (host === slotGroup) {
        throw new Error(`Option ${e.option}: match ${matchKey} pairs host 1${host} against 3${slotGroup}`);
      }
    }
  }
}

function main() {
  const text = readFileSync(INPUT, "utf8");
  const entries = parseRows(text);
  validate(entries);

  // Sort by option for stable output.
  entries.sort((a, b) => a.option - b.option);

  // Index by qualifyingGroups for the runtime loader.
  const byQualifyingGroups: Record<string, AnnexCEntry> = {};
  for (const e of entries) byQualifyingGroups[e.qualifyingGroups] = e;

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(byQualifyingGroups, null, 2) + "\n", "utf8");
  console.log(`✓ Annex C: ${entries.length} entries → ${OUTPUT}`);
}

main();
