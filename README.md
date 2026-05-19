# VFT — Tipovačka MS 2026

Tipovací liga přátel pro Mistrovství světa ve fotbale 2026. Tipuj výsledky všech zápasů, sbírej body, poraz svoje kámoše.

Plný popis projektu viz `CLAUDE.md` a `ARCHITECTURE.md`.

## Local development

```sh
npm install
cp .env.local.example .env.local
# fill in values from Supabase + football-data.org dashboards
npm run dev
```

App runs at http://localhost:3000.

## Supabase setup

1. Create a project at https://supabase.com (free tier is fine).
2. In **Project Settings → API**, copy `URL`, `anon` key, and `service_role` key into `.env.local`.
3. In **Authentication → Sign In / Up**, disable public signups — users are provisioned manually.
4. Apply the schema migration: open **SQL Editor**, paste the contents of `supabase/migrations/0001_initial_schema.sql`, run it.

Alternatively, use the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## Stack

Next.js 16 (App Router) · TypeScript · CSS Modules · Supabase (Postgres + Auth) · football-data.org · Vercel.
