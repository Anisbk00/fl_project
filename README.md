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

## Important: data platform

The store uses **Supabase only** for data (Postgres + Auth + Storage). There is
**no local database and no Prisma** — nothing else is substituted in. The
package manager for this development environment is **bun** (the plan specifies
pnpm); `packageManager` is pinned to `bun@1.3.14` and `bun.lock` is committed.

The Supabase SQL migrations (enums, CHECK constraints, RLS policies, the
`is_admin()` SECURITY DEFINER function, storage bucket policies) are committed
under `supabase/migrations/` and are the source of truth. A hand-authored
TypeScript `Database` type (`src/types/database.ts`) mirrors them so the
application type-checks and builds **without a live Supabase project**; in a
real project, regenerate it with `supabase gen types`.

## Prerequisites

- **Node.js 24.x** (pinned via `engines` in `package.json` and `.node-version`)
- **bun 1.3.x** (the package manager for this environment)
- **Supabase CLI** + **Docker** — required to run the committed Supabase
  migrations/pgTAP tests against a local Supabase project. **Not available in
  this sandbox**; see "Blockers" below.

## Getting started

```bash
# 1. Install dependencies (bun.lock is committed)
bun install

# 2. Copy the environment template and fill in values (real secrets never committed)
cp .env.example .env.local
#   The Step 1 placeholder home page builds and boots with NO secrets. Supabase
#   URL/publishable/secret keys are required once you link a project (Step 3+).

# 3. (With Docker + Supabase CLI) start local Supabase and apply migrations:
supabase start
supabase db reset         # applies all migrations in supabase/migrations/
bun run db:types          # regenerates src/types/database.generated.ts from the live DB

# 4. Run the checks
bun run lint             # ESLint (Next.js 16 core-web-vitals + TS)
bun run typecheck        # tsc --noEmit (strict, noUncheckedIndexedAccess)
bun test                 # unit tests + gated Supabase RLS integration suite (skips if no project linked)
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
| `bun run test:db` | Run the gated Supabase RLS integration suite |
| `bun run db:reset` | `supabase db reset` (applies migrations) |
| `bun run db:types` | `supabase gen types --typescript --local` |
| `bun run build` | Production build (see "Blockers") |

## Database TypeScript types

`src/types/database.ts` is a hand-authored `Database` type that mirrors the SQL
migrations, so the app builds without a live Supabase project. Once a project
is linked, regenerate from the live DB and prefer the generated file:

```bash
bun run db:types   # writes types to stdout; redirect to src/types/database.generated.ts
```

The data-access layer (`src/features/catalog/data-access.ts`) derives its
public row shapes from the `Database` type.

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
- **Supabase migrations / pgTAP / real RLS** cannot run here (no Supabase CLI /
  Docker in the sandbox). The committed SQL (`supabase/migrations/`) is the
  source of truth for production; the access-matrix deny rules are also
  exercised by a gated JS integration suite (`tests/catalog/supabase-access.test.ts`)
  that runs automatically once a project is linked, and by the pgTAP suite in
  `supabase/tests/` (run with `supabase db test`).

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
