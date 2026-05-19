# 04 — Supabase auth (magic link + Google OAuth)

## Context

Step 4 of `ARCHITECTURE.md` "Scaffolding order". PR 02 landed the Supabase clients (`lib/supabase/{client,server,admin}.ts`) but nothing actually signs anyone in — `/` is a static placeholder ("Přihlašování přijde za chvíli") and `/predict`, `/matches`, `/dashboard` are reachable by anyone. The auth-protected concept of "current user" must exist before the predict form (PR 07) has anywhere to write `user_id`.

Per `ARCHITECTURE.md` "Authentication": magic link primary, Google OAuth secondary, public signups disabled (admin adds users via Supabase dashboard), no passwords, sessions stored in browser by Supabase.

**Next.js 16 breaking change** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`): the `middleware.ts` convention is **deprecated and renamed to `proxy.ts`**, exporting a `proxy()` function (not `middleware()`). This is the file the Supabase + Next.js App Router session-refresh pattern lives in. We use the new name.

## Approach

**Session refresh** via `proxy.ts` at project root. On every matched request, build a `@supabase/ssr` `createServerClient` wired to `request.cookies` + `NextResponse` cookies, call `supabase.auth.getUser()`, and return the response so Set-Cookie headers carrying refreshed tokens flow back to the browser. Helper extracted to `lib/supabase/middleware.ts` (kept as `middleware.ts` filename inside `lib/` since it's still the canonical Supabase helper name — only the Next.js root file uses the new `proxy` convention).

**Login UI** is a Client Component at `app/(auth)/login-form.tsx` rendered from `app/page.tsx`. It uses the browser client:
- Email input + "Pošli mi přihlašovací odkaz" → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: ${origin}/auth/callback } })`. Success state swaps the form for "Mrkni do mailu — poslali jsme ti odkaz."
- "Přihlásit přes Google" button → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ${origin}/auth/callback } })`.
- Czech error mapping: any `AuthApiError` → friendly Czech ("Nepovedlo se odeslat odkaz, zkus to za chvíli.", "Tenhle e-mail nemá přístup." for `signup_disabled` / `email_not_authorized`). Map by `error.code` / `error.status === 422`, fall through to a generic message.

**OAuth + magic-link callback** at `app/auth/callback/route.ts` (Route Handler). Reads `?code=…` from the URL, calls `supabase.auth.exchangeCodeForSession(code)` via the App Router server client, then `NextResponse.redirect` to `/predict` (or `?next=` param if present). On error → redirect to `/?error=auth_callback`. `app/page.tsx` reads that query param and renders the Czech error message.

**Server-side guard** via a tiny `lib/auth.ts` helper `requireUser()` that calls `supabase.auth.getUser()` on the server client; if null, `redirect("/")`. Each protected page (`/predict`, `/dashboard`, `/matches`) becomes an `async` Server Component that calls `await requireUser()` at the top. Authenticated `/` redirects to `/predict` so logged-in users skip the login form.

**Logout** as a Server Action in `app/actions/auth.ts`: `"use server"` → server client `signOut()` → `redirect("/")`. Wired to a "Odhlásit" button in the header, rendered conditionally when a user is present. Header becomes `app/site-header.tsx` (Server Component) — reads user once, passes email + logout action to a small client form.

**Supabase dashboard config** (manual, documented in README, not in code):
- Authentication → Providers → Email: enable magic link, disable "Confirm email" if needed for invite flow.
- Authentication → Providers → Google: enable, paste Google Cloud OAuth client id + secret.
- Authentication → URL Configuration → Site URL `http://localhost:3000`, Redirect URLs include `http://localhost:3000/auth/callback` and the eventual production URL.
- Authentication → Settings → **disable "Allow new users to sign up"**. Admin adds users via Authentication → Users → "Add user" with email; Supabase sends the magic-link invite.

## Files

**Create:**
- `/projects/VFT/proxy.ts` — Next.js 16 proxy file, delegates to `lib/supabase/middleware.ts`, matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `auth/callback`.
- `/projects/VFT/lib/supabase/middleware.ts` — `updateSession(request)` helper: builds server client over `request.cookies` + `NextResponse.next()`, calls `getUser()`, returns the response. Standard `@supabase/ssr` pattern.
- `/projects/VFT/lib/auth.ts` — `requireUser()` server helper using `lib/supabase/server.ts`.
- `/projects/VFT/app/auth/callback/route.ts` — `GET` handler exchanging `code` for session, redirects to `/predict` or `/?error=auth_callback`.
- `/projects/VFT/app/actions/auth.ts` — `"use server"` `signOut()` action.
- `/projects/VFT/app/(auth)/login-form.tsx` — client component, both sign-in paths, Czech copy + error map.
- `/projects/VFT/app/(auth)/login-form.module.css` — CSS Module: form layout, button, error/success states.
- `/projects/VFT/app/site-header.tsx` — extracted header showing nav + logout button when signed in.

**Modify:**
- `/projects/VFT/app/layout.tsx` — replace inline header with `<SiteHeader />`.
- `/projects/VFT/app/page.tsx` — async Server Component: if user → `redirect('/predict')`; else render `<LoginForm errorCode={searchParams.error} />`.
- `/projects/VFT/app/predict/page.tsx`, `/projects/VFT/app/matches/page.tsx`, `/projects/VFT/app/dashboard/page.tsx` — add `await requireUser()` at top, make async.
- `/projects/VFT/README.md` — add "Auth setup" section covering dashboard config + first admin user.
- `/projects/VFT/.env.local.example` — add `NEXT_PUBLIC_SITE_URL` comment if needed (used as fallback for `emailRedirectTo` server-side; browser uses `window.location.origin`).

## Verification

1. `npm run build` + `npm run lint` — clean. The build must complete without complaint about `proxy.ts` (Next.js 16 recognises the new convention; a `middleware.ts` would log a deprecation warning).
2. `npx tsc --noEmit` — types compile.
3. **Smoke test (requires Supabase project configured per README):**
   - Visit `/predict` while signed out → redirect to `/`.
   - Submit a non-allowlisted email → Czech error "Tenhle e-mail nemá přístup." renders.
   - Submit an allowlisted email → success state; magic link in inbox → click → land on `/predict` signed in.
   - Google OAuth button → consent screen → back to `/predict`.
   - "Odhlásit" → back to `/` login form; refresh `/predict` → redirect to `/`.
4. Hand-trace the `proxy.ts` matcher to confirm `/auth/callback` is excluded (otherwise the proxy's `getUser()` runs before `exchangeCodeForSession` and the code is consumed mid-redirect).

## Out of scope

- `profiles` table population on first sign-in (display name, avatar) → defer; predict form (PR 07) creates a row lazily if needed.
- Admin UI for adding users → manual dashboard flow stays for MVP, per `ARCHITECTURE.md` "Open questions".
- Prediction-lock enforcement (`locked = true` on kickoff) → PR 08 (results cron).
- Custom Czech email templates in Supabase dashboard → cosmetic, do after the flow works end-to-end.
