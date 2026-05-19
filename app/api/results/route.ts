/**
 * GET /api/results — Vercel Cron sync from football-data.org → matches table.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends
 * this header automatically when the env var is set in project settings.
 *
 * Idempotent — re-running is safe. See README "Cron — synchronizace
 * výsledků" for setup details.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildMatchRowUpdate,
  stripUnresolvedSlotLabels,
  type ApiMatch,
} from "@/lib/results-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server" },
      { status: 500 },
    );
  }
  if (!checkAuth(req)) return unauthorized();

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FOOTBALL_DATA_API_KEY not configured" },
      { status: 500 },
    );
  }

  const errors: string[] = [];
  const recomputeQueue: string[] = []; // PR-09 hook
  let updated = 0;
  let locked = 0;

  // ── 1. Fetch upstream
  let payload: { matches: ApiMatch[] };
  try {
    const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
      headers: { "X-Auth-Token": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { updated: 0, locked: 0, errors: [`football-data ${res.status}`] },
        { status: 502 },
      );
    }
    payload = (await res.json()) as { matches: ApiMatch[] };
  } catch (e) {
    return NextResponse.json(
      { updated: 0, locked: 0, errors: [`fetch failed: ${(e as Error).message}`] },
      { status: 502 },
    );
  }

  const supabase = createAdminClient();

  // ── 2. Team lookup
  const { data: teamRows, error: teamErr } = await supabase
    .from("teams")
    .select("id, api_team_id");
  if (teamErr) {
    return NextResponse.json(
      { updated: 0, locked: 0, errors: [`teams select: ${teamErr.message}`] },
      { status: 500 },
    );
  }
  const teamIdByApiId = new Map<number, string>();
  for (const t of teamRows ?? []) {
    if (t.api_team_id != null) teamIdByApiId.set(t.api_team_id as number, t.id as string);
  }

  // ── 3. Build rows
  const rows = payload.matches.map((m) => {
    const { row, warnings } = buildMatchRowUpdate(m, teamIdByApiId);
    if (warnings.length) errors.push(...warnings);
    return stripUnresolvedSlotLabels(row);
  });

  // ── 4. Update each match by api_match_id.
  // We use UPDATE instead of UPSERT because matches are pre-seeded; an UPSERT
  // would fail NOT NULL on columns the cron has no business setting
  // (e.g. match_key, which is owned by the seed).
  const results = await Promise.all(
    rows.map(async (row) => {
      const { api_match_id, ...patch } = row;
      const { error } = await supabase
        .from("matches")
        .update(patch)
        .eq("api_match_id", api_match_id);
      return { api_match_id, error };
    }),
  );
  for (const r of results) {
    if (r.error) errors.push(`match ${r.api_match_id}: ${r.error.message}`);
    else updated += 1;
  }

  // Track newly-finished matches so PR-09 can recompute points for them.
  // (For now we just collect ids; PR-09 will diff against pre-update state.)
  for (const row of rows) {
    if (row.status === "finished") recomputeQueue.push(row.api_match_id);
  }

  // ── 5. Lock predictions where kickoff has passed (time-based, not API-based).
  const nowIso = new Date().toISOString();
  const { data: kickedOff, error: koErr } = await supabase
    .from("matches")
    .select("id")
    .lte("kickoff_at", nowIso);
  if (koErr) {
    errors.push(`kickoff select: ${koErr.message}`);
  } else if (kickedOff && kickedOff.length > 0) {
    const matchIds = kickedOff.map((m) => m.id as string);
    const { error: lockErr, count: lockCount } = await supabase
      .from("predictions")
      .update({ locked: true }, { count: "exact" })
      .in("match_id", matchIds)
      .eq("locked", false);
    if (lockErr) errors.push(`lock update: ${lockErr.message}`);
    else locked = lockCount ?? 0;
  }

  // TODO(PR-09): trigger /api/points recompute for `recomputeQueue` match ids.

  return NextResponse.json({ updated, locked, errors }, { status: 200 });
}
