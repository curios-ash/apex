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
npm run db:seed      # idempotent demo workspace (slug "demo") + sample property
npm run dev          # http://localhost:3000
```

`DATABASE_URL` defaults to the dockerized Postgres, so no `.env` is needed. To override, copy `.env.example` to `.env` and edit.

```bash
npm test             # unit + golden-file tests (mock LLM provider, no credentials)
npm run build        # production build
npm run lint         # eslint
```

Useful DB extras: `npm run db:studio` (Drizzle Studio), `npm run db:generate` (new migration after editing `src/lib/db/schema.ts`), `npm run db:down`.

### Try the ingestion loop locally

No cloud accounts needed — storage falls back to local disk and the LLM falls
back to a deterministic mock provider.

```bash
npm run dev                                  # terminal 1
npm run db:seed                              # terminal 2, once
npm run inbound:demo                         # posts a sample inbound email w/ attachment
node scripts/e2e-inbound.mjs                 # full e2e assertion against the running server
```

Then open the internal pages:

- **`/upload`** — upload statements/invoices directly; table of recent documents with classification status.
- **`/verify`** — low-confidence extractions with the source document linked; approve, correct, or reject. Every decision writes an `audit_log` row.

## Inbound email (provider setup)

Each workspace gets an alias `<slug>@in.<domain>` (the demo workspace is
`demo@…`). `POST /api/inbound-email` accepts both Postmark- and Resend-style
JSON payloads, resolves the workspace from the alias, stores each attachment
as a document, and runs classify + extract on each. If an email has no
attachments, the text body itself becomes the document.

**Postmark (works out of the box):**

1. Postmark server → **Settings → Inbound** → set the inbound domain to `in.<yourdomain>` and add the DNS records they show.
2. Set the **webhook URL** to `https://<your-host>/api/inbound-email`. Postmark posts the full message including base64 attachments.

**Resend:**

1. Resend → **Inbound** → add `in.<yourdomain>`, verify DNS, and create a rule forwarding all addresses to a webhook: `https://<your-host>/api/inbound-email`.
2. Resend's `email.received` webhook carries message metadata only. The payload this route accepts is the *full retrieved email* (attachments with inline base64 `content`), so put a tiny passthrough in front that calls Resend's retrieve-email API and re-posts, or use Postmark. `scripts/dev-inbound-email.mjs` shows the accepted shape.

**Shared secret (recommended in production):** set `INBOUND_EMAIL_SECRET` and
append `?secret=<value>` to the webhook URL (or send header
`x-inbound-secret`). Unknown workspace slugs return `200` with
`{ ok: false, reason: "unknown_workspace" }` so providers don't retry forever.

## LLM pipeline

Classification (`classify-v1`) then per-type extraction with Zod schemas and
per-field confidence (`pm-statement-v1`, `bank-statement-v1`, `invoice-v1`,
`lease-v1`, `insurance-v1`, `listing-v1`). The LLM **classifies and extracts
only — it never computes finance numbers**; all math stays in `src/finance/`.

- **Provider selection:** `AI_GATEWAY_API_KEY` → Vercel AI Gateway (model `APEX_LLM_MODEL`, default `anthropic/claude-sonnet-5`); else `ANTHROPIC_API_KEY` → direct Anthropic; else the **deterministic mock provider** (`mock-deterministic-v1`), a rule-based parser used by tests and CI so no credentials are ever needed.
- **Every call is logged** to `llm_calls`: prompt version, model, tokens, cost (micro-dollars, `llm-pricing-v1` table in `src/lib/llm/index.ts`), sha256 of the canonical output, latency, status.
- **Review threshold:** any field below `EXTRACTION_REVIEW_THRESHOLD` (default 0.85) sends the extraction to `/verify`; the rest stay `pending` for reconciliation (weeks 5–6).
- Golden-file tests pin the mock provider's output for synthetic AppFolio/Buildium/Propertyware-style PM statements and a bank statement (`fixtures/` → `src/lib/llm/__golden__/`). Regenerate after intentional parser changes with `npx vitest run --update`.

## Document storage

`BLOB_READ_WRITE_TOKEN` set → Vercel Blob **private** store; unset → local disk
under `.data/files` (gitignored; override with `APEX_STORAGE_DIR`).
`documents.storage_key` records which backend wrote each file (`blob:` /
`disk:` prefix), so reads keep working if the environment changes. Files are
served back through `/api/documents/[id]/file`. Duplicates (same workspace +
sha256) are detected and return the existing document.

## Project layout

```
src/
  app/
    page.tsx + api/waitlist/   # landing page + waitlist capture
    (internal)/                # internal R0 tooling (pre-auth)
      upload/                  #   /upload — document upload + recent documents
      verify/                  #   /verify — low-confidence extraction queue
    api/documents/             #   POST upload, GET [id]/file (source download)
    api/inbound-email/         #   POST Resend/Postmark-style webhook
  components/                  # shadcn/ui primitives + WaitlistForm
  finance/                     # deterministic finance engine (pure TS, no LLM, no I/O)
  lib/
    db/schema.ts               # canonical model: 23 workspace-scoped tables + waitlist
    llm/                       # provider selection, mock provider, Zod schemas, logging
    ingest/                    # store → classify → extract pipeline
    storage.ts                 # Vercel Blob / local-disk file storage
    inbound-email.ts           # webhook payload normalization + alias parsing
    workspace.ts               # pre-auth active-workspace resolution
    audit.ts                   # audit_log writer
fixtures/                      # synthetic statements (tests + dev script)
scripts/                       # seed-demo, dev-inbound-email, e2e-inbound (.mjs, zero deps)
drizzle/                       # generated SQL migrations
docker-compose.yml             # local Postgres
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

Auth enforcement (schema-ready only — internal pages operate on the active workspace, see `src/lib/workspace.ts`), PDF text extraction (binary documents are classified by filename/context and land in `/verify` low-confidence until the real provider or a PDF parser handles them), durable job execution (pipeline runs inline in the request; Vercel Workflow replaces that in R1), reconciliation/exceptions engines, approval queue UI, billing. See the master plan for the 26-week sequence.
