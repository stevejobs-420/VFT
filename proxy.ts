import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on every path except static assets, image optimisation, the favicon,
    // and the OAuth callback (the callback consumes the `?code=` itself).
    "/((?!_next/static|_next/image|favicon.ico|auth/callback).*)",
  ],
};
