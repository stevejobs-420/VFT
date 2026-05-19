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

## Auth setup (Supabase dashboard)

1. **Authentication → Sign In / Up** — disable "Allow new users to sign up". Users are provisioned manually below.
2. **Authentication → Providers → Email** — enable. Magic link works out of the box.
3. **Authentication → Providers → Google** — enable, paste the OAuth client ID + secret from a Google Cloud OAuth 2.0 client.
4. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (dev) / your production URL. **Just the root** — no `/auth/callback` suffix, or the template will produce `…/auth/callback/auth/callback`.
   - Redirect URLs: include `http://localhost:3000/auth/callback` and the production equivalent.
5. **Add the first user** — Authentication → Users → "Add user", enter email, check "Auto Confirm User". Supabase emails them a magic-link invite.
6. **Update the magic-link email template** — Authentication → Email Templates → "Magic Link". Replace the link URL with the query-string pattern so the token arrives as a server-readable param:
   ```
   {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink
   ```
   The default `{{ .ConfirmationURL }}` puts the token in a URL hash fragment that browsers strip before sending to the server, so our `/auth/callback` would see no params. Apply the same fix to the "Invite user" template (with `type=invite`).

### SMTP — Resend

Supabase's built-in SMTP is unreliable for Czech inboxes (especially seznam.cz). We use **Resend** with a verified domain.

1. Sign up at https://resend.com (free tier: 100/day, 3000/month).
2. Resend → Domains → Add Domain → e.g. `vft.vojtechsykora.cz` → pick a region (e.g. `EU (eu-west-1)`).
3. Add the DNS records Resend gives you at your DNS provider:
   - 1 × TXT (DKIM) at `resend._domainkey.<subdomain>`
   - 1 × MX + 1 × TXT (SPF) at `send.<subdomain>` (these are at a sub-subdomain — they do not conflict with a CNAME for your web app on `<subdomain>` itself)
   - 1 × TXT (DMARC) at `_dmarc.<apex>` — optional but recommended
4. Wait for Resend's "Verify" to turn green (5–60 min depending on DNS TTL).
5. Resend → API Keys → Create → copy the `re_…` key.
6. **Supabase → Authentication → SMTP Settings:**

   | Field | Value |
   |---|---|
   | Enable Custom SMTP | ON |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` (literal) |
   | Password | the `re_…` API key |
   | Sender email | `info@<your verified subdomain>` |
   | Sender name | `VFT Tipovačka` |

**Domain-not-verified gotcha:** until you verify a domain in Resend, the `onboarding@resend.dev` sender can only send to the email you signed up with. To send to anyone else, verify a domain first.

### Generating a magic link without email

The free tier limits magic-link emails to 4/hour. To sign in without waiting:

```sh
npm run magic-link -- your@email.cz
```

Prints a local URL — paste it into your browser to sign in. Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

## Regenerating Annex C (only if FIFA amends regs)

`data/annex-c.json` is committed and is the runtime source. Regenerate from the FIFA regulations PDF only if the rules change:

```sh
mkdir -p tmp
curl -sL -o tmp/fwc2026_regs.pdf \
  "https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf"
pdftotext -layout tmp/fwc2026_regs.pdf tmp/fwc2026_regs.txt
npm run extract-annex-c
```

The script asserts 495 distinct entries, set-equality between key and slot groups, and that no R32 pairing puts two teams from the same group together. Fails loud on any miss.

## Seeding data

Once Supabase is set up and the migration is applied, populate teams and matches from football-data.org:

```sh
npm run seed
```

Requires `FOOTBALL_DATA_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Idempotent (upsert on `api_team_id` / `api_match_id`) — safe to re-run any time.

## Stack

Next.js 16 (App Router) · TypeScript · CSS Modules · Supabase (Postgres + Auth) · football-data.org · Vercel.
