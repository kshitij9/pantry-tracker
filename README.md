# 🥬 Pantry Tracker

An intelligent pantry & expiry-tracking app. It auto-syncs grocery orders from
quick-commerce apps (Swiggy Instamart, Blinkit, Zepto) via **Gmail API + Google
Cloud Pub/Sub webhooks**, parses them with **Gemini** into structured items,
tracks expiry dates, and generates **AI recipes** from soon-to-expire ingredients.

## Tech stack

| Layer     | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Framework | Next.js 14 (App Router, TypeScript, Tailwind CSS)             |
| Database  | PostgreSQL + Prisma ORM                                       |
| AI        | `@google/generative-ai` — `gemini-2.5-flash` (structured JSON) |
| Email     | `@googleapis/gmail` + Google Cloud Pub/Sub push webhooks      |
| UI        | Lucide icons, Shadcn/Radix-style components                   |

## Project structure

```
prisma/
  schema.prisma                 # User, PantryItem, OrderLog models
app/
  layout.tsx  page.tsx          # Shell + landing page
  dashboard/page.tsx            # Pantry dashboard (badges, filters, add modal)
  recipes/page.tsx              # Recipe generator + "Cooked This"
  api/
    webhooks/gmail/route.ts     # Pub/Sub push handler -> parse -> save
    pantry/route.ts             # GET list / POST add
    pantry/[id]/route.ts        # PATCH toggle-consume/decrement / DELETE
    recipes/route.ts            # POST generate recipes
components/
  ExpiryBadge.tsx  AddItemModal.tsx
lib/
  prisma.ts        # Prisma singleton
  gemini.ts        # Gemini client + order/recipe response schemas
  gmail.ts         # OAuth2 client + message retrieval/decoding
  categories.ts    # Category shelf-life defaults + expiry math
  utils.ts         # cn(), expiry state/labels
  user.ts          # user resolution (replace with real auth)
```

## Getting started

### 1. Configure environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, `GEMINI_API_KEY`, and the `GMAIL_*` OAuth credentials.
See the comments in `.env.example` for how to obtain each one.
For a quick local run, set `DEV_DEFAULT_USER_EMAIL` to your email.

### 2. Push the schema to your database

```bash
npx prisma db push
```

This creates the `users`, `pantry_items`, and `order_logs` tables. Then
(re)generate the client if needed:

```bash
npx prisma generate
```

Inspect data any time with `npx prisma studio`.

### 3. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000):

- **/dashboard** — your pantry, color-coded by expiry, with filters + Add Item.
- **/recipes** — generate 3 AI recipes and mark ingredients consumed.

## Expiry rules

Expiry is derived from category shelf-life defaults in `lib/categories.ts`
(e.g. Leafy Greens 3d, Dairy 4d, Root Veggies 12d, Staples 120d). Badges:

- 🔴 **Critical** — ≤ 48 hours
- 🟡 **Soon** — 3–5 days
- 🟢 **Fresh** — > 5 days

## Wiring the Gmail webhook (production)

1. Enable the **Gmail API** and **Pub/Sub API** in Google Cloud.
2. Create a Pub/Sub topic and grant `gmail-api-push@system.gserviceaccount.com`
   the **Pub/Sub Publisher** role on it.
3. Call `users.watch` on the mailbox pointing at that topic (filtered to the
   grocery senders) to start receiving change notifications.
4. Create a **push subscription** whose endpoint is
   `https://<your-domain>/api/webhooks/gmail?token=<PUBSUB_VERIFICATION_TOKEN>`.
5. On each push, the handler decodes the envelope, finds recent order emails,
   parses new ones with Gemini, and stores items — deduping via `OrderLog`.

To test locally, expose your dev server with a tunnel (e.g. `ngrok http 3000`)
and point the push subscription at the tunnel URL.

## Notes

- This scaffold ships **no auth** — all data is attributed to a single dev user
  (`DEV_DEFAULT_USER_EMAIL`). Replace `lib/user.ts` with your real session lookup
  (e.g. NextAuth) before going multi-tenant.
- Gemini calls use `responseSchema` for strict structured JSON — no regex parsing.
