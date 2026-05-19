/**
 * Generates a local magic-link URL via Supabase admin API.
 * Bypasses email (and its 4-per-hour rate limit on the free tier).
 *
 * Usage: npm run magic-link -- some@email.cz
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    // No .env.local — fall back to whatever's in the parent shell env.
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

const email = process.argv[2];
if (!email) {
  console.error("Použití: npm run magic-link -- some@email.cz");
  process.exit(1);
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function main() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });

  if (!res.ok) {
    console.error(`Generování selhalo — HTTP ${res.status}:`, await res.text());
    process.exit(1);
  }

  const { hashed_token } = (await res.json()) as { hashed_token: string };
  if (!hashed_token) {
    console.error("V odpovědi chybí hashed_token. Zkontroluj e-mail a admin práva.");
    process.exit(1);
  }

  const url = new URL("/auth/callback", SITE_URL);
  url.searchParams.set("token_hash", hashed_token);
  url.searchParams.set("type", "magiclink");
  console.log(url.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
