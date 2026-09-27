# FL Store

A digital-download store for music-production assets (FL Studio projects, stems, WAVs, sample packs). Customers buy as guests; only allow-listed administrators sign in.

**Stack:** Next.js 16 (App Router, TypeScript strict) · Supabase (Postgres, Auth, Storage, RLS) · Stripe-hosted Checkout · Resend · Vercel · bun.

## How a purchase works

```
Product page ──Add to cart──▶ /cart (server-owned guest cart, HttpOnly cookie)
   └─Checkout─▶ server re-reads prices from Postgres ─▶ Stripe Checkout Session
Stripe ──webhook (signed)──▶ /api/stripe/webhook ─▶ webhook_inbox (idempotent)
   └─▶ mark_order_paid() — one transaction: order + items + entitlements + email job
   └─▶ delivery worker ─▶ Resend (idempotency key) ─▶ email with a 72 h access link
Buyer clicks link ─▶ /downloads/access ─▶ 30-min session cookie
   └─▶ Download ─▶ quota check ─▶ 120-second signed URL to a PRIVATE bucket
Refund / dispute webhooks ─▶ revoke or hold access
```

Sources of truth: products/orders in **Postgres**, payment status from **Stripe via verified webhooks only**, files in **private Supabase Storage**, admin identity in **Supabase Auth** (AAL2/TOTP required).

## Local development

Requirements: Node 24, bun 1.3.x, a Supabase project, Stripe + Resend **test** keys.

```bash
bun install
cp .env.example .env.local          # fill in; every variable is documented there
bun run dev                          # http://localhost:3000
stripe listen --forward-to localhost:3000/api/stripe/webhook   # copy whsec_ into .env.local
```

| Script | What it does |
| --- | --- |
| `bun run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `bun run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `bun run lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `bun test` | Unit tests; the Supabase RLS suite runs when Supabase env is set |
| `supabase db test` | pgTAP security-matrix + catalog tests (needs `supabase start`) |

## Database

All schema lives in `supabase/migrations/` (apply in order; never edit the database by hand). Regenerate types after a migration: `supabase gen types typescript --project-id <ref> > src/types/database.generated.ts`.

Access model (every table has RLS enabled):

| Data | Anonymous | Signed-in non-admin | Admin (active + AAL2) | Server (secret key) |
| --- | --- | --- | --- | --- |
| Published products, media, taxonomy | read | read | read/write | — |
| Drafts, deliverables, uploads | none | none | read/write | read |
| Orders, entitlements, emails, webhooks, refunds | none | none | **read only** | read/write |
| Carts, access tokens, sessions, rate limits | none | none | none | read/write |
| `mark_order_paid`, `revoke_fulfillment`, `rate_limit_hit` | none | none | none | execute |

Admins change orders only through audited Server Actions (refund, resend, restore/revoke access), never by direct table writes.

## Deployment

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the step-by-step Supabase → Stripe → Resend → Vercel → domain runbook and the launch checklist.

## Legal

The database refuses to publish a product without a title, summary, valid price, cover and ZIP. Legal pages under `/legal/*` are drafts marked `[Draft]`: have them reviewed for your jurisdiction before taking live payments.
