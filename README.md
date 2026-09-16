# Apex

Owner-side audit and asset management for small landlords. Your rentals, audited monthly — every number sourced, every action approved.

Apex reconciles property-manager statements against the owner's budget, flags fee drift / duplicate charges / unexplained fees with evidence, and drafts follow-ups that only send after owner approval. The LLM extracts, classifies, and explains — it never computes finance numbers. All NOI, DSCR, cash-on-cash, and IRR math lives in a deterministic, versioned TypeScript engine.

## Stack

- **App:** Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- **DB:** Postgres + Drizzle ORM (`postgres.js` driver), row-level ownership by `workspace_id`
- **Tests:** Vitest (known-answer cases for the finance engine)
- **Local infra:** Docker Compose for Postgres — no cloud accounts needed

## Run locally

Requires Node 22+ and Docker.

```bash
npm install
npm run db:up        # starts Postgres 17 in Docker (postgres://postgres:postgres@localhost:5432/apex)
npm run db:migrate   # applies drizzle/ migrations
npm run dev          # http://localhost:3000
```

`DATABASE_URL` defaults to the dockerized Postgres, so no `.env` is needed. To override, copy `.env.example` to `.env` and edit.

```bash
npm test             # finance engine + waitlist validation unit tests
npm run build        # production build
npm run lint         # eslint
```

Useful DB extras: `npm run db:studio` (Drizzle Studio), `npm run db:generate` (new migration after editing `src/lib/db/schema.ts`), `npm run db:down`.

## Project layout

```
src/
  app/                  # landing page + /api/waitlist
  components/           # shadcn/ui primitives + WaitlistForm
  finance/              # deterministic finance engine (pure TS, no LLM, no I/O)
    v1.ts               # finance-v1 formula set
    v1.test.ts          # known-answer tests
  lib/
    db/schema.ts        # canonical model: 22 workspace-scoped tables + waitlist
    db/index.ts         # lazy postgres.js client (safe to import at build time)
drizzle/                # generated SQL migrations
docker-compose.yml      # local Postgres
```

### Conventions that matter

- **Money is integer cents** (`bigint`) everywhere — never float dollars.
- **Rates are basis points** in the schema (`650` = 6.50%) and decimal fractions (`0.065`) in the finance engine.
- **Every domain table carries `workspace_id`.** All queries must be workspace-scoped; `waitlist` is the only non-scoped table (pre-signup capture).
- **The formula set is versioned** (`finance-v1`). Dossiers store the version that produced them. Never mutate a shipped version — add `finance-v2`.
- **Ratios return `null` on zero denominators** so engine output stays JSON-serializable for dossier payloads.

## Provisioning (Ashwin, when we move off localhost)

Everything above runs with zero cloud accounts. Do these when we're ready for a shared/preview environment — all three are Vercel Marketplace installs from the same dashboard.

### 1. Neon (Postgres)

1. Vercel dashboard → project → **Storage** tab → **Create Database** → **Neon Serverless Postgres**.
2. Accept the default region; link it to the project. Vercel injects `DATABASE_URL` into all environments automatically.
3. Run migrations against Neon from your machine: `DATABASE_URL=<neon-url> npm run db:migrate` (the URL is under Storage → `.env.local` tab).
4. Local dev keeps using docker-compose Postgres; Neon is for preview/prod.

### 2. Auth — Clerk (recommended) or WorkOS

**Recommendation: Clerk.** Apex sells to individual landlords, not enterprises — we need magic-link + Google sign-in and low-friction UX, not SAML/SSO. Clerk's Next.js App Router integration is the fastest to ship, its free tier (10k MAU) covers the beta, and its prebuilt components match our shadcn setup. WorkOS becomes interesting only if we later sell into PM companies or funds that demand SSO; switching cost is contained because the schema keeps `users.external_auth_id` provider-agnostic.

1. Vercel dashboard → **Marketplace** → **Clerk** → install, link to the project (injects `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`).
2. In the Clerk dashboard: enable **Email magic link** and **Google** only (no password, no Gmail scopes).
3. `npm install @clerk/nextjs`, wrap the app in `ClerkProvider`, and map `clerkUserId` → `users.external_auth_id` on first sign-in (create workspace + user row in the same transaction).
4. WorkOS alternative: same flow via the WorkOS AuthKit marketplace listing if we ever need SAML.

### 3. Vercel Blob (statement/PDF storage)

1. Vercel dashboard → project → **Storage** → **Create Database** → **Blob**.
2. Link to the project; Vercel injects `BLOB_READ_WRITE_TOKEN`.
3. Create the store as **private** — statements and leases are sensitive. Serve files through short-lived signed URLs only.
4. `npm install @vercel/blob`; store the returned key in `documents.storage_key`.

## What intentionally isn't here yet

Auth enforcement (schema-ready only), ingestion pipeline, reconciliation/exceptions engines, approval queue UI, billing. See the master plan for the 26-week sequence.
