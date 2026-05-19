/**
 * Dev tool — creates N demo users with random predictions for every match.
 *
 *   npm run demo-predictions -- 10           # create/refresh 10 users
 *   npm run demo-predictions -- 10 --reset   # delete existing demo-* first
 *
 * Idempotent: re-running with the same N updates the same users (by email).
 * Demo users have emails demo-1@vft.local … demo-N@vft.local and Czech
 * display names. Predictions cover all 72 group matches + 31 knockout
 * matches (M73-M104 excluding M103, the 3rd-place playoff).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── env ──────────────────────────────────────────────────────────────────
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
    /* no .env.local */
  }
}
loadEnvLocal();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Chybí proměnná prostředí ${name}.`);
    process.exit(1);
  }
  return v;
}

// ── args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const reset = args.includes("--reset");
const countArg = args.find((a) => /^\d+$/.test(a));
const COUNT = countArg ? parseInt(countArg, 10) : 10;
if (COUNT < 1 || COUNT > 50) {
  console.error("Počet musí být mezi 1 a 50.");
  process.exit(1);
}

// ── names ────────────────────────────────────────────────────────────────
const CZECH_NAMES = [
  "Petr Novák",
  "Jana Procházková",
  "Tomáš Svoboda",
  "Marie Dvořáková",
  "Jakub Černý",
  "Veronika Nováková",
  "Martin Horák",
  "Kateřina Marešová",
  "David Krejčí",
  "Lenka Pokorná",
  "Pavel Beneš",
  "Tereza Vlčková",
  "Filip Procházka",
  "Klára Vaňková",
  "Michal Šimek",
  "Eva Růžičková",
  "Lukáš Kratochvíl",
  "Anna Štěpánková",
  "Radim Bartoš",
  "Hana Kučerová",
];

// ── random helpers ───────────────────────────────────────────────────────
/** Weighted goal generator — football-realistic: 0 most likely, 4+ rare. */
function randomGoals(): number {
  const r = Math.random();
  if (r < 0.32) return 0;
  if (r < 0.62) return 1;
  if (r < 0.83) return 2;
  if (r < 0.94) return 3;
  if (r < 0.98) return 4;
  return 5;
}

function randomKnockoutScore(): { home: number; away: number } {
  let home = randomGoals();
  let away = randomGoals();
  // No ties allowed in knockouts — bump one side if equal.
  if (home === away) {
    if (Math.random() < 0.5) home += 1;
    else away += 1;
  }
  return { home, away };
}

// ── main ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listDemoUsers(): Promise<Map<string, string>> {
  // auth.admin.listUsers paginates — for our scale a single page is fine.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const out = new Map<string, string>(); // email → user_id
  for (const u of data.users) {
    if (u.email && /^demo-\d+@vft\.local$/.test(u.email)) {
      out.set(u.email, u.id);
    }
  }
  return out;
}

async function resetDemoUsers() {
  const existing = await listDemoUsers();
  if (existing.size === 0) {
    console.log("Žádní demo uživatelé ke smazání.");
    return;
  }
  console.log(`Mažu ${existing.size} demo uživatelů…`);
  for (const [email, id] of existing) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) console.error(`  ${email}: ${error.message}`);
  }
  console.log("✓ Smazáno.");
}

async function ensureUser(
  email: string,
  displayName: string,
): Promise<string> {
  const existing = await listDemoUsers();
  let userId = existing.get(email);
  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    userId = data.user.id;
  }
  // Upsert profile (display_name is NOT NULL).
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, display_name: displayName });
  if (profileErr) throw new Error(`profile ${email}: ${profileErr.message}`);
  return userId;
}

type MatchRow = { id: string; match_key: string; stage: string };

async function loadMatches(): Promise<MatchRow[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, match_key, stage");
  if (error) throw error;
  return (data ?? []) as MatchRow[];
}

async function regeneratePredictionsFor(userId: string, matches: MatchRow[]) {
  // Wipe existing predictions for this user so re-running gives fresh data.
  const { error: delErr } = await supabase
    .from("predictions")
    .delete()
    .eq("user_id", userId);
  if (delErr) throw new Error(`delete predictions: ${delErr.message}`);

  const rows = matches
    .filter((m) => m.match_key !== "M103") // 3rd-place playoff excluded
    .map((m) => {
      if (m.stage === "group") {
        return {
          user_id: userId,
          match_id: m.id,
          home_score: randomGoals(),
          away_score: randomGoals(),
        };
      }
      const { home, away } = randomKnockoutScore();
      return { user_id: userId, match_id: m.id, home_score: home, away_score: away };
    });

  const { error: insErr } = await supabase.from("predictions").insert(rows);
  if (insErr) throw new Error(`insert predictions: ${insErr.message}`);
  return rows.length;
}

async function main() {
  if (reset) {
    await resetDemoUsers();
    if (countArg === undefined) {
      console.log("Hotovo (jen reset).");
      return;
    }
  }

  console.log(`Načítám zápasy z DB…`);
  const matches = await loadMatches();
  console.log(`  ${matches.length} zápasů.`);

  console.log(`Generuji ${COUNT} demo uživatelů s náhodnými tipy…`);
  for (let i = 1; i <= COUNT; i++) {
    const email = `demo-${i}@vft.local`;
    const name = CZECH_NAMES[(i - 1) % CZECH_NAMES.length];
    const userId = await ensureUser(email, name);
    const count = await regeneratePredictionsFor(userId, matches);
    console.log(`  ${i}. ${name} (${email}) → ${count} tipů`);
  }
  console.log("Hotovo.");
}

main().catch((err) => {
  console.error("Demo seed selhal:", err);
  process.exit(1);
});
