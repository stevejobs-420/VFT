# 01 — Next.js scaffold with Czech page stubs

**Shipped:** commit `988d5c6` (2026-05-19) — retrospective doc.

## Context

First step of `ARCHITECTURE.md` "Scaffolding order". Project began with only `CLAUDE.md` + `ARCHITECTURE.md`. Needed a working Next.js skeleton so every subsequent PR (Supabase, predict UI, etc.) has somewhere to land. All UI text in Czech from day one — no English-then-translate.

## What shipped

- **Next.js 16.2.6 + React 19** scaffolded via `create-next-app` in `/tmp/vft-init`, then moved into `/projects/VFT/` (npm rejects uppercase project names; the dir is `VFT`).
- **App Router, TypeScript, ESLint, no Tailwind, no `src/` dir, Turbopack enabled.**
- **Root layout** (`app/layout.tsx`): `lang="cs"`, Geist fonts with **`subsets: ["latin", "latin-ext"]`** so Czech diacritics (ě, š, č, ř, ž, ý, ů, etc.) render. Top nav links the 4 pages.
- **Four page stubs** in Czech: `/` (Vítej v tipovačce na MS 2026), `/predict` (Tvoje tipy), `/matches` (Zápasy), `/dashboard` (Žebříček).
- **Global styles** (`app/globals.css`): light/dark via `prefers-color-scheme`, header/nav, max-width container.
- **`AGENTS.md`** kept from create-next-app (Next.js 16 breaking-changes warning) and imported into `CLAUDE.md` via `@AGENTS.md` so future agents see the heads-up automatically.

## Key decisions

- **Latin-ext font subset is mandatory** for Czech. Default `latin` doesn't include accented characters. Easy to miss; explicit here.
- **Project `package.json` `name` is `vft`** (lowercase) even though the dir is `VFT` — npm naming restriction.
- **No `src/` directory.** Files at root per `ARCHITECTURE.md` "Project Structure".
- **Inline styles in stubs** are acceptable as placeholders. Real components will use CSS Modules.

## Verification (then)

- `npm run build` ✓ — all 4 routes prerendered as static
- `npm run lint` ✓ — clean
- `npm run dev` + `curl localhost:3000/{,predict,matches,dashboard}` → all 200

## Followup

None directly. Every subsequent PR builds on this scaffold.
