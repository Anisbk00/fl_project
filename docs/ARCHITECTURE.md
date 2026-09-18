# Architecture

This document describes the end-state topology, data boundaries, and caching
strategy for the Music Project Store, and notes what is implemented in Step 1
versus what is scheduled for later steps.

## 1. High-level topology

```
                ┌──────────────────────────────────────────────┐
                │                Vercel (Step 9)                │
                │  Next.js 16 App Router (Server Components)   │
                │  Route Handlers (webhooks, downloads, etc.)   │
                │  Server Actions (authenticated mutations)    │
                └──────────────┬───────────────────────────────┘
                               │
        ┌──────────────────────┼─────────────────────────┐
        │                      │                         │
        ▼                      ▼                         ▼
┌────────────────┐   ┌──────────────────┐      ┌──────────────────┐
│ Supabase       │   │ Supabase Storage  │      │ Stripe           │
│ Postgres +     │   │  - product-public │      │ Hosted Checkout  │
│ Auth + RLS     │   │  - product-private│      │ Webhooks         │
└────────────────┘   └──────────────────┘      └──────────────────┘
```

- **Next.js 16 App Router** is the application. Server Components are the
  default; Client Components exist only for genuine interactivity (audio player,
  filters, cart, admin upload progress).
- **Supabase Postgres** is the source of truth for catalog metadata, orders,
  fulfillment state, and download grants.
- **Supabase Auth** is used ONLY for manually provisioned admin accounts. Public
  self-sign-up is disabled. Customers never authenticate.
- **Supabase Storage** has two buckets: `product-public` (intentionally public,
  CDN-delivered cover images + compressed previews) and `product-private`
  (customer deliverables, served only via short-lived signed URLs after verified
  payment).
- **Stripe-hosted Checkout** handles all payment UX. The app never sees card
  details. Stripe webhooks are the payment authority.
- **Vercel** hosts the Next.js app and serverless functions.

### Step 1 status

Implemented: the catalog data model (Prisma schema mirroring the future
Postgres model), the access matrix (in code here, via RLS in production), the
validated environment module, three separated Supabase client factories
(publishable / cookie server / privileged), the admin allow-list helper, and the
security header baseline. NOT implemented: orders, payment, fulfillment,
storefront UI, admin CMS.

## 2. Repository / module layout

```
src/
  app/                    # Next.js App Router (only `/` is user-visible in Step 1)
    page.tsx              # Step 1 placeholder home page
    layout.tsx            # root layout, metadata from validated env
    api/                  # Route Handlers (webhooks/downloads later)
  components/ui/           # shadcn/ui primitives (pre-generated)
  features/
    catalog/              # the ONLY sanctioned catalog data-access path
      data-access.ts      # public reads + admin writes (access matrix)
      visibility.ts       # pure public-visibility rule (unit-tested)
      publish-constraint.ts # rights-cleared-before-publish guardrail
      schema.ts           # Zod trust-boundary schemas (product types, etc.)
      index.ts            # barrel
  lib/
    env/                  # validated env: public.ts (eager, safe defaults),
                          #   server.ts (lazy, server-only), index.ts
    supabase/             # publishable.ts / server.ts / privileged.ts
                          #   (each server-only-guarded; never in a client bundle)
    auth/                 # is-admin.ts (admin allow-list gate), index.ts
    security/            # headers.ts, redact.ts, rate-limit.ts (doc stub)
    db.ts                 # Prisma client (warn/error logging only)
    utils.ts
  types/
supabase/
  migrations/             # production SQL (enums, CHECKs, RLS, is_admin()) — committed
  tests/                  # production pgTAP tests — committed
prisma/
  schema.prisma           # the catalog model (the local/SQLite source of truth)
  seed.ts                 # fictional seed (generic, no copyrighted assets)
tests/                    # bun tests (env, redact, visibility, publish-constraint,
                          #   DB-backed access matrix, smoke)
docs/                     # ARCHITECTURE, SECURITY, ROADMAP, DECISIONS
.github/workflows/ci.yml  # CI (committed; not run in sandbox)
```

No empty abstraction layers are created merely to match the tree. Folders that
do not yet have real content (`features/checkout`, `features/fulfillment`,
`features/admin`) are intentionally absent until their step.

## 3. Data boundaries

### Three Supabase clients, impossible to import accidentally

| Client | Key | Used by | Server-only? |
| --- | --- | --- | --- |
| `getPublishableClient()` | publishable | Server Components reading public RLS data | yes (`server-only`) |
| `createSupabaseServerClient(cookies)` | publishable + cookies | admin session reads (Step 4) | yes |
| `getPrivilegedClient()` | secret | narrowly-scoped server ops only; NEVER compensates for broken RLS | yes |

Every module that can access a secret or privileged data imports `server-only`,
so a Client Component importing it fails the production build.

### Catalog data-access layer is the single sanctioned path

`src/features/catalog/data-access.ts` is the only code that should touch catalog
tables. It implements the access matrix:

- **Public reads** use an explicit `select` (not `include`) that omits
  `product_deliverables` and the admin audit columns (`createdById`,
  `updatedById`). This guarantees a public read can never leak a private
  relation added later.
- **Public reads** filter on `lifecycle = 'published'` AND `rightsStatus IN
  ('original','licensed')`.
- **Every mutation** accepts an `adminUserId`, calls `requireAdmin` first,
  validates input with Zod, then writes. A protected layout is never the only
  authorization layer.

### Public vs private storage

- `product_media` rows reference versioned, immutable object paths in the
  `product-public` bucket. Public by design.
- `product_deliverables` rows reference immutable object paths in the
  `product-private` bucket. Never returned by any public read; the future
  fulfillment server (Step 6) issues short-lived signed URLs after verifying
  payment + a download grant.

## 4. Caching strategy

- Public catalog/product content is rendered on the server and
  cached/revalidated deliberately (Step 3 will set explicit `revalidate` /
  ISR and cache tags).
- Admin and order pages are always dynamic and uncached.
- Image optimization and compressed preview audio (Step 3) reduce payload.
- Client bundles are kept small; interactivity is isolated to Client Components.

## 5. Why large uploads bypass Vercel Functions

Vercel Functions have a request body size limit unsuitable for large music
archives (ZIPs, WAVs, project files can be hundreds of MB to GB). The admin
upload flow (Step 4) uploads **directly from the authenticated admin browser to
Supabase Storage** using TUS/resumable uploads or signed upload tokens, against
the direct storage hostname. The Next.js app only issues the short-lived signed
upload token server-side (after `requireAdmin`); it never proxies the bytes.

Object paths are versioned/immutable: replacing a file creates a new path, never
overwriting the same CDN path, so cached copies and download integrity stay
stable.

## 6. Performance budgets (Step 8, defined later)

Measurable launch budgets will be set for Core Web Vitals, JavaScript weight,
images, and audio. Indexes are added only to match real queries:

- `products(lifecycle, rights_status, published_at DESC)` — the public listing.
- `products(slug)` — slug lookup (also the unique constraint).
- `products(featured, lifecycle)` — featured surfaced products.
- `product_media(product_id, kind)` — media per product.
- `product_deliverables(product_id, active)` — active deliverables per product.
- `product_genres(genre_id)` / `product_plugins(plugin_id)` — reverse lookups.

No premature generic indexes are added.
