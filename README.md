# 🥬 Pantry Tracker

An intelligent, multi-user pantry & expiry-tracking app for shared households.

- **Auto-syncs** grocery orders from quick-commerce apps (Swiggy Instamart,
  Blinkit, Zepto) via the **Gmail API + Google Cloud Pub/Sub**.
- **Parses** order emails **and uploaded invoices** (image/PDF) with **Gemini**
  into structured items — inferring weights from price for `NOS`/unit lines.
- **Tracks expiry** per item and **de-duplicates** re-orders by merging quantity.
- **Suggests recipes** from soon-to-expire ingredients.
- **Installable PWA** that sends **push reminders ~1 day before items expire**.

## Tech stack

| Layer     | Choice                                                              |
| --------- | ------------------------------------------------------------------ |
| Framework | Next.js 14 (App Router, TypeScript, Tailwind CSS)                  |
| Auth      | Auth.js (NextAuth v5) — Google OAuth, JWT sessions, edge middleware |
| Database  | PostgreSQL + Prisma ORM (hosted on Supabase)                       |
| AI        | `@google/generative-ai` — `gemini-flash-latest` (structured JSON + vision) |
| Email     | `@googleapis/gmail` + Google Cloud Pub/Sub push webhooks           |
| Push      | Web Push (`web-push` + VAPID), service worker, Vercel Cron         |
| UI        | Lucide icons, Shadcn/Radix-style components                        |

## Core concepts

- **Houses** — every pantry belongs to a **House**. Users are members (OWNER or
  MEMBER) and can belong to several; the **active house** scopes all reads/writes.
- **Member attribution** — each item records who added it (`purchasedBy`).
- **De-duplication** — adding the same item again (manual, invoice, or auto-sync)
  merges into the existing un-consumed row: quantity is summed, and the **soonest**
  expiry is kept (never hide spoiling stock).

## Project structure

```
auth.ts / auth.config.ts       # Auth.js (node) + edge-safe config
middleware.ts                  # Route guards (/dashboard, /recipes, /house)
prisma/schema.prisma           # Auth.js models + User/House/HouseMember/
                               #   PantryItem/OrderLog/PushSubscription
app/
  layout.tsx  page.tsx         # Shell (SessionProvider, SW register) + landing
  signin/  onboarding/         # Sign-in + forced household onboarding
  dashboard/  recipes/  house/ # Pantry, recipes, household management
  api/
    auth/[...nextauth]         # Auth.js handlers
    webhooks/gmail             # Pub/Sub push -> parse -> attribute to a house
    pantry/                    # GET/POST, [id] PATCH/DELETE, bulk, import
    recipes/                   # POST generate recipes
    house/                     # create/list, join, active, [id]/members
    push/subscribe|unsubscribe # Web Push subscription storage
    notifications/run          # Cron: send expiry reminders
components/                    # Header, modals, toggles, badges
lib/
  prisma.ts    auth-helpers.ts # DB singleton; house-scoped auth guard
  gemini.ts    gmail.ts        # Structured extraction; OAuth + message decode
  house.ts     pantry.ts       # Household ops; add-or-merge (dedup) logic
  push.ts      user.ts         # Web Push send; webhook target resolution
  categories.ts utils.ts       # Shelf-life defaults; expiry math + cn()
public/                        # manifest.webmanifest, sw.js, icons
scripts/                       # Gmail/Gemini setup + test helpers
vercel.json                    # Daily cron for expiry reminders
```

## Getting started

### 1. Environment

```bash
cp .env.example .env
```

Fill in the values — see `.env.example` for how to obtain each:

| Group | Keys |
| --- | --- |
| Database | `DATABASE_URL` (pooled 6543), `DIRECT_URL` (direct 5432) |
| Auth.js | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-flash-latest`) |
| Gmail | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER_ID` |
| Pub/Sub | `PUBSUB_VERIFICATION_TOKEN`, `GCP_PROJECT_ID`, `PUBSUB_TOPIC` |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |
| Cron | `CRON_SECRET` |

> The Google OAuth client can be **shared** between Gmail and Auth.js — just add
> both callback URLs (`/api/auth/callback/google` for localhost and prod) to it.

### 2. Database

```bash
npx prisma db push
```

Creates all tables and generates the client. Inspect data with `npx prisma studio`.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Sign in** → create/join a
household → land on the dashboard.

## Features

### Auth & households
Google sign-in via Auth.js; new users are sent to `/onboarding` to create or join
a house (via invite code). `/house` manages members, the invite code, active-house
switching, and owner-only removal. Every API route is scoped to the caller's active
house and verified against membership (`lib/auth-helpers.ts`).

### Pantry
Color-coded expiry badges — 🔴 Critical (≤48h) · 🟡 Soon (3–5d) · 🟢 Fresh (>5d).
Filter by category, add manually, mark consumed, or decrement quantity. Shelf-life
defaults live in `lib/categories.ts` (Leafy Greens 3d, Dairy 4d, Root Veggies 12d,
Staples 120d…).

### Invoice upload
**Upload invoice** → Gemini reads the image/PDF → review/edit/deselect the extracted
items → add. Weights for `NOS`/unit lines are **inferred from price** using Indian
quick-commerce baselines and flagged `est.` for review.

### Recipes
`/recipes` sends the soonest-expiring inventory to Gemini and returns 3 recipes with
prep time, matched pantry items, and missing essentials. "Cooked this" marks the
used items consumed.

### Gmail auto-sync
On a Pub/Sub push, the webhook resolves the mailbox owner → their active house,
fetches recent vendor emails, classifies grocery vs. prepared-food (skips the
latter), extracts items, and merges them in. Idempotent via `OrderLog`.

### PWA & expiry reminders
Installable (manifest + icons + service worker). Enable **reminders** on the
dashboard to subscribe this browser to Web Push. A daily Vercel Cron hits
`/api/notifications/run`, which notifies every household member about items
expiring within ~36h (idempotent via `PantryItem.expiryNotifiedAt`).

> iOS delivers web push only when the PWA is **installed to the home screen**
> (iOS 16.4+). Desktop/Android browsers work directly.

## Setup helpers (npm scripts)

```bash
npm run gmail:token    # OAuth consent flow -> prints a GMAIL_REFRESH_TOKEN
npm run gmail:test     # verify Gmail read access
npm run gmail:watch    # register/renew the mailbox watch (expires ~7 days)
npm run gemini:test    # verify the Gemini key + structured extraction
```

### Wiring the Gmail webhook (production)
1. Enable the **Gmail API** and **Pub/Sub API** in Google Cloud.
2. Create a Pub/Sub topic (`gmail-orders`) and grant
   `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role.
3. Create a **push subscription** → endpoint
   `https://<domain>/api/webhooks/gmail?token=<PUBSUB_VERIFICATION_TOKEN>`
   (enable authentication if it asks you to verify the domain).
4. `npm run gmail:watch` to start notifications.

## Deploying (Vercel)

1. Import the repo; framework auto-detects as Next.js.
2. Add **all** env vars from your `.env` to the Vercel project.
3. Add both Google OAuth callback URLs to your OAuth client.
4. `vercel.json` registers the daily cron automatically; Vercel sends
   `CRON_SECRET` as a bearer token on cron invocations.

> Note: Vercel's Hobby plan runs crons **once daily**, so reminders land 1–2 days
> before expiry (36h look-ahead). Pro allows more frequent runs for a tighter window.

## Notes

- Gemini calls use `responseSchema` for strict structured JSON — no regex parsing.
- Prisma uses Supabase's pooled URL at runtime and the direct URL for `db push`
  (see the datasource block in `prisma/schema.prisma`).
