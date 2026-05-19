"use server";

import { createClient } from "@/lib/supabase/server";

export type SaveResult =
  | { ok: true; homeScore: number | null; awayScore: number | null }
  | { ok: false; error: string };

/**
 * Persists or clears a single match prediction for the current user.
 *
 * - Both scores must be non-negative integers, OR both null (which deletes the row).
 * - RLS enforces user_id ownership and the locked=false guard.
 */
export async function savePrediction(
  matchId: string,
  homeScore: number | null,
  awayScore: number | null,
): Promise<SaveResult> {
  if (!matchId || typeof matchId !== "string") {
    return { ok: false, error: "Neplatný zápas." };
  }

  const bothNull = homeScore === null && awayScore === null;
  const bothFilled = homeScore !== null && awayScore !== null;
  if (!bothNull && !bothFilled) {
    return { ok: false, error: "Vyplň obě skóre, nebo žádné." };
  }

  if (bothFilled) {
    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore! < 0 ||
      awayScore! < 0
    ) {
      return { ok: false, error: "Skóre musí být celé nezáporné číslo." };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nejsi přihlášen." };

  if (bothNull) {
    const { error } = await supabase
      .from("predictions")
      .delete()
      .eq("user_id", user.id)
      .eq("match_id", matchId);
    if (error) return { ok: false, error: "Uložení selhalo, zkus to znovu." };
    return { ok: true, homeScore: null, awayScore: null };
  }

  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.id,
      match_id: matchId,
      home_score: homeScore,
      away_score: awayScore,
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) {
    // RLS will reject locked rows with a Postgres permission error.
    if (/permission denied|new row violates/.test(error.message ?? "")) {
      return { ok: false, error: "Tipy už jsou uzamčené — zápas začal." };
    }
    return { ok: false, error: "Uložení selhalo, zkus to znovu." };
  }

  return { ok: true, homeScore: homeScore!, awayScore: awayScore! };
}
