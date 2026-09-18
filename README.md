# Music Project Store

A worldwide digital-product store for music producers: original DAW project files,
legally cleared educational remakes, original stems, and original sample packs.
Inspired by the product category popularized by stores like FLPStudio.com, but
with original code, design, copy, branding, and assets — and deliberately
improving on the reference weaknesses (broken links, hidden compatibility info,
fabricated reviews, keyword stuffing, etc.).

> **Status:** Step 1 of 9 — foundation, architecture, and secure catalog data
> layer only. No storefront, cart, checkout, admin CMS, or fulfillment exists
> yet. See [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Important: environment adaptation in this repository

The canonical master plan specifies **pnpm + Supabase + Vercel**. This
development environment is a constrained sandbox that runs **bun + Prisma/SQLite
+ Next.js 16**. Step 1 is implemented faithfully against the available stack
while preserving the security and architecture intent of the plan:

| Plan target (production) | Step 1 implementation here | Notes |
| --- | --- | --- |
| pnpm + lockfile | **bun** + `bun.lock` | `packageManager` pinned to `bun@1.3.14` |
| Supabase Postgres migrations | **Prisma schema** (`prisma/schema.prisma`) | The same model, with the production enum/check/RLS mapping documented inline |
| Supabase Row-Level Security | **Application-layer access matrix** in `src/features/catalog/data-access.ts` | The exact access matrix from `docs/SECURITY.md`, enforced in code and proven by DB-backed tests |
| Supabase `is_admin()` SECURITY DEFINER | `src/lib/auth/is-admin.ts` | Allow-list keyed by user id; never trusts an email or claim |
| Supabase Storage public/private buckets | **Prisma `product_media` / `product_deliverables`** + documented bucket model | Public reads never select private deliverables |
| pgTAP / Supabase database tests | **bun test** DB-backed access-matrix tests | Prove allow + deny behavior against the real DB |
| `supabase db reset` | `bun run db:push` | Creates the schema from the Prisma schema |
| `pnpm` lockfile / `pnpm install` | `bun install` | A committed `bun.lock` is present |

The production Supabase SQL migrations (enums, CHECK constraints, RLS policies,
the `is_admin()` SECURITY DEFINER function, storage bucket policies) are
committed under `supabase/migrations/` for the future hosted project. They are
**not runnable in this SQLite sandbox** and are documented as a blocker.

## Prerequisites

- **Node.js 24.x** (pinned via `engines` in `package.json` and `.node-version`)
- **bun 1.3.x** (the package manager for this environment)
- **Docker** + **Supabase CLI** — required ONLY to run the committed Supabase
  migrations/pgTAP tests against a real hosted/local Supabase project. **Not
  available in this sandbox**; see "Blockers" below.

## Getting started

```bash
# 1. Install dependencies (bun.lock is committed)
bun install

# 2. Copy the environment template and fill in values (real secrets never committed)
cp .env.example .env.local
#   At minimum set DATABASE_URL. Supabase URL/publishable/secret keys can stay
#   empty for the Step 1 placeholder home page; they are required from Step 3+.

# 3. Create/sync the database schema from the Prisma schema
bun run db:push          # creates tables (the "supabase db reset" equivalent here)
bun run db:generate      # generate TypeScript types that match the schema

# 4. Run the checks
bun run lint             # ESLint (Next.js 16 core-web-vitals + TS)
bun run typecheck        # tsc --noEmit (strict, noUncheckedIndexedAccess)
bun test                 # unit + DB-backed access-matrix tests
bun run dev              # start the dev server on http://localhost:3000
```

The **only user-visible route** is `/` (the Step 1 placeholder home page).

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Start the Next.js dev server (port 3000) |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` across the whole project |
| `bun test` | Run all tests (bun test runner) |
| `bun run test:db` | Run only the DB-backed access-matrix test |
| `bun run db:push` | Push the Prisma schema to the DB |
| `bun run db:generate` | Generate Prisma Client types |
| `bun run db:seed` | Run the seed script (fictional data only) |
| `bun run build` | Production build (see "Blockers") |

## Generating database TypeScript types

```bash
bun run db:generate     # writes types to node_modules/@prisma/client
```

The generated types match the migration/schema (acceptance criterion). The
public data-access layer (`src/features/catalog/data-access.ts`) derives its
return types from these via `Prisma.ProductGetPayload<...>`.

## Linking a future hosted Supabase project (DO NOT commit secrets)

1. Create a Supabase project; enable the current `sb_publishable_...` /
   `sb_secret_...` key model.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY` in `.env.local` (git-ignored).
3. Apply the SQL in `supabase/migrations/*.sql` to the hosted project.
4. Run the pgTAP tests in `supabase/tests/` against the hosted DB.
5. Provision an admin allow-list row manually; enforce TOTP MFA/AAL2 before
   accepting live orders.

## Deploying to Vercel (later — NOT part of Step 1)

Vercel deployment is **Step 9** and is explicitly not implemented here. When it
is, set the matching environment variables in the Vercel project, select the
Supabase region, and configure the domain/DNS/TLS. Do not treat this README as
a deployment guide until Step 9 lands.

## Blockers (honest)

- **Production build (`bun run build`)** is intentionally not run in this
  sandbox per environment rules. Verified instead via `bun run lint`,
  `bun run typecheck`, `bun test`, and a clean dev-server boot of `/`.
- **Supabase migrations / pgTAP / real RLS** cannot run here (no Supabase/Docker
  in the sandbox). The committed SQL is the source of truth for production;
  the equivalent guarantees are proven at the application layer by
  `tests/catalog/db-access.test.ts`.

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — end-state topology, data
  boundaries, caching strategy, why large uploads bypass Vercel Functions.
- [`docs/SECURITY.md`](./docs/SECURITY.md) — assets, actors, trust boundaries,
  threats, controls, secret handling, RLS rules, future payment/download
  requirements.
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — Steps 2–9, all explicitly unimplemented.
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — decision record (hosted Stripe
  Checkout, guest checkout, private Supabase delivery storage, webhook-authoritative
  fulfillment).

## Legal note

This store will only sell products the owner has the legal right to distribute.
The database enforces a rights status and refuses publication until a product is
marked `original` or `licensed`. This is an engineering guardrail, not legal
advice; verify business registration, payment-processor eligibility, tax/VAT,
consumer-contract, privacy, copyright, trademark, licensing, refund, and
digital-withdrawal obligations for the operating jurisdiction before live orders.
