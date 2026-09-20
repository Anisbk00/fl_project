# Roadmap

This roadmap lists Steps 2–9. **Steps 1–5 are COMPLETE (within sandbox limits);
Steps 6–9 remain explicitly UNIMPLEMENTED.** Step 1 delivered the foundation +
secure catalog data layer; Step 2 the brand system + storefront shell; Step 3
the live catalog, product pages, filters, SEO, and audio previews; Step 4 the
secure admin auth + product CMS architecture + verifiable security logic; Step 5
the durable guest cart + Stripe-hosted checkout + signature-verified webhook
pipeline + idempotent order/refund architecture + verifiable payment-domain logic.

## Step 2 — Brand system and responsive storefront shell ✅ COMPLETE

Established the original visual direction (dark graphite + chartreuse,
independent of FLP Studio's design), responsive navigation, home-page
information architecture, footer/trust navigation, accessible component
primitives, loading/error/empty states, and performance budgets.

**Implemented:**
- Original dark-graphite design system with semantic tokens (`docs/DESIGN_SYSTEM.md`).
- Original SVG brand mark, favicon, and OG image (no copied assets).
- Two self-hosted font families via `next/font` (Geist Sans + Geist Mono).
- Component layer (`src/components/site/*`): header, mobile nav, footer,
  container/section/grid, button/icon-button, badge, price, product card,
  product artwork, section heading, empty/error/skeleton, skip link, page header/prose.
- Typed view-model + deterministic fictional fixtures (`src/features/catalog/fixtures`).
- Routes: `/`, `/catalog`, `/free`, `/cart`, `/about`, `/faq`, `/contact`,
  `/legal/{license,refunds,privacy,terms}`, branded `not-found`, route-level
  `error`, global `loading`.
- Honest global metadata (title template, OG/Twitter, `metadataBase`, favicon);
  `noindex` on draft legal pages.
- Accessibility: skip link, landmarks, focus-visible, mobile-menu focus trap +
  Escape + focus return, WCAG 2.2 AA (axe-core scan: 0 violations on `/`,
  `/catalog`, `/cart`, `/about`, and the open mobile menu).
- Responsive: verified 320–1920 px, no horizontal overflow at 320.
- No fake interactivity (no player/checkout/download/email/review/filter/admin).
- Tests: price formatting (USD/EUR/JPY/GBP), view-model helpers, fixtures
  integrity, nav destinations + link resolution; bun test 55 pass / 4 skip / 0 fail.

**Review artifacts:** `review-home-375.png`, `review-home-768.png`,
`review-home-1440.png`, `review-mobile-menu-open.png`.

## Step 3 — Catalog, product pages, filters, SEO, and audio previews ✅ COMPLETE

Replaced the Step 2 fixture catalog with a secure, server-rendered, Supabase-backed
catalog; product detail pages; URL-based filters/search/sort/pagination;
audio previews; and truthful SEO.

**Implemented:**
- Server-only catalog repository using the publishable client + SECURITY INVOKER
  RPCs (`search_products`, `get_product_by_slug`, `get_related_products`,
  `list_free_products`); narrow typed DTOs that cannot carry forbidden fields.
- SQL migration `0004_catalog_search.sql`: generated tsvector + GIN index,
  parameterized FTS via `websearch_to_tsquery`, allow-listed sort with
  deterministic tie-breakers, partial indexes matching the public predicate.
- Deterministic fictional seed (`supabase/seed.sql`) exercising allow/deny +
  media; pgTAP tests (`catalog_search.test.sql`).
- `/catalog` (filters, sort pills, pagination, active-filter chips, clear-all,
  empty/no-results/unconfigured/error states, mobile filter sheet, noindex on
  filtered combos), `/free` (live), `/products/[slug]` (breadcrumb, compatibility
  summary, safe Markdown, related, audio, truthful JSON-LD, canonical,
  nondisclosing 404).
- `sitemap.ts` + `robots.ts`.
- Audio preview: native `HTMLMediaElement`, `preload="none"`, single-active,
  keyboard, reduced-motion, failure-tolerant; pure state machine + coordinator
  unit-tested.
- Caching tags + documented Step 4 invalidation contract.
- Tests: url-params parse/serialize/normalize/reset/currency, sort allow-list,
  mapping forbidden-fields, markdown URL sanitization, JSON-LD escaping+shape,
  audio state machine. 105 pass / 4 skip / 0 fail.

**Honest blockers (no Docker/Supabase CLI in sandbox):** live catalog data,
RLS/pgTAP, `EXPLAIN` plans, and live audio/SEO external validation require a
linked Supabase project. Pages render honest inspectable states when unlinked.
See `docs/CATALOG_AND_SEARCH.md`, `docs/MEDIA_PREVIEWS.md`, `docs/SEO.md`.

## Step 4 — Secure admin authentication and product CMS ✅ COMPLETE (architecture + verifiable logic)

Implemented the secure admin auth + product CMS architecture and the
verifiable pure-logic security core. The live Auth/MFA/Storage/TUS/RLS/E2E
verification is a documented blocker (no live Supabase project in the sandbox).

**Implemented (code):**
- SQL migration `0005_admin_cms.sql`: `admin_users` (active/disabled + who),
  `product_rights`, `upload_intents`, `audit_events`; product/media/deliverable
  columns (row_version, validation_state, server_checksum, detected_type);
  `is_active_admin()` + `aal2()` SECURITY DEFINERs; transactional
  `publish_product`/`archive_product`/`unpublish_product` RPCs (AAL2-enforced,
  optimistic concurrency, readiness gate, audited in-transaction); AAL2 RLS on
  every table; append-only audit triggers.
- Central `requireAdmin({ aal2 })` guard (verified `getUser()` + MFA assurance
  level + `is_active_admin` RPC — never `getSession()`); SSR cookie clients
  (`server-client.ts`, `browser-client.ts`); token-refresh `middleware.ts`.
- Admin routes: `/admin/login`, `/admin/mfa/enroll`, `/admin/mfa/challenge`,
  `/admin/password-recovery`, `/admin` (dashboard), `/admin/products`,
  `/admin/products/new`, `/admin/products/[id]`, `/admin/products/[id]/preview`,
  `/admin/taxonomies`, `/admin/audit`, `/admin/security`; noindex + force-dynamic
  (no-store); not in public nav/sitemap; honest states when unconfigured.
- Client components: login form (non-enumerating), MFA enroll (local QR via
  `qrcode`), MFA challenge, password recovery; logout Server Action.
- Pure security logic (unit-tested): lifecycle transitions, publish-readiness
  gate, optimistic concurrency, AAL2 parsing, audit redaction,
  filename/extension/path validation, magic-byte detection, ZIP traversal/abuse
  defenses, staging-key generation, cache-invalidation mapping.
- Docs: `ADMIN_AUTH.md`, `ADMIN_CMS.md`, `UPLOAD_SECURITY.md`, `OPERATIONS.md`.

**Honest blockers (sandbox):** real MFA login, AAL2 enforcement against a live
session, TUS uploads to a real Storage bucket, the trusted file validator
against real bytes, the pgTAP role/AAL2 matrix, and admin CMS E2E require a
linked Supabase project. Run `supabase db reset` + `supabase db test` against a
linked project. Per the plan, NO security control is claimed verified without
running it.

## Step 5 — Cart and Stripe guest checkout ✅ COMPLETE (architecture + verifiable payment-domain logic; live Stripe/Supabase verification blocked)

Implemented the durable guest cart + Stripe-hosted checkout + signature-verified
webhook pipeline + idempotent order/refund architecture + the verifiable
pure-logic payment domain. Live Stripe sandbox/webhook/refund/E2E verification is
a documented blocker (no Stripe keys + no live Supabase in the sandbox).

**Implemented (code):**
- SQL migration `0006_payments.sql`: `guest_carts` (token digest only),
  `guest_cart_items`, `checkout_attempts` (+ partial unique open-fingerprint
  index for Session reuse), `checkout_attempt_items`, `webhook_inbox`,
  `orders` (separate payment/refund/dispute/fulfillment states),
  `order_items` (immutable, `on delete restrict`), `refunds`; RLS denies
  anon/authenticated (AAL2 admin read-only); transactional `mark_order_paid`
  SECURITY DEFINER RPC (match + upsert + convert + audit + Step 6 extension
  hook `after_order_paid_extension`); append-only immutability triggers.
- Pure payment domain (unit-tested): integer-minor-unit money + reconcile +
  overflow + refund-bounds, cart token + digest, cart fingerprint, consent,
  idempotency keys, Checkout-Session config builder (no email/static payment
  methods/shipping/promo; opaque metadata; canonical-origin URLs), webhook
  event allow-list, validation gates, redaction, fail-closed live gate.
- Stripe SDK server client (pinned GA, server-only); raw-body signature-
  verified webhook Route Handler (verify→persist→2xx, 5xx on persistence
  failure, 503 when no secret configured).
- Routes: `/checkout` (saga entry, honest state), `/checkout/success`
  (read-only no-store status), `/admin/orders` + `/admin/orders/[id]` (AAL2).
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CART_TOKEN_PEPPER`,
  `CHECKOUT_ORIGIN_ALLOWLIST`, `LIVE_CHECKOUT_ENABLED` (server-only, fail-closed).
- Docs: `CART.md`, `PAYMENTS.md`, `STRIPE_WEBHOOKS.md`, `REFUNDS.md`,
  `TAX_AND_CHECKOUT_LEGAL.md`, `DATA_RETENTION.md`.

**Honest blockers (sandbox):** real Checkout creation, real webhook signature
verification against Stripe, the durable inbox/processor, order creation,
refund flows, and the full Stripe sandbox E2E require a live Stripe account
(sandbox keys + CLI + reachable webhook) + a live Supabase project. Run
`stripe listen --forward-to …` + `supabase db reset` + `supabase db test` against
a configured environment. **No mock counted as a real Stripe pass; live Checkout
is fail-closed until Step 6 + legal/tax + monitoring + release gates.**

## Step 6 — Secure digital fulfillment *(unimplemented)*

Implement private deliverables, order-item snapshots, hashed download tokens,
email delivery, short-lived signed URLs, expiry/revocation/download limits,
delayed-payment handling, refund revocation rules, resend/recovery flow
without customer accounts, and fulfillment reconciliation.

**Not started.** (The `product_deliverables` model and the "never in public
reads" rule are already in place from Step 1.)

## Step 7 — Trust, legal pages, reviews, and growth features *(unimplemented)*

Add consistent terms, privacy/cookie, refund, license, copyright/takedown,
compatibility, and contact information reviewed for the operating
jurisdiction. Add verified-purchase reviews (never fabricated), free-product/
email funnel, bundles, promotions, recommendations, and trust content without
dark patterns.

**Not started.**

## Step 8 — Observability, security, performance, and accessibility hardening *(unimplemented)*

Add privacy-aware analytics, error monitoring, structured redacted logs,
alerts, rate limits (durable shared state — see `src/lib/security/rate-limit.ts`),
bot controls, a real Content-Security-Policy enumerating all known origins,
dependency/secret scanning, RLS regression tests, webhook/download abuse tests,
WCAG review, browser/device E2E coverage, load checks, query analysis,
Lighthouse/Core Web Vitals validation, backup/restore drill, and incident
runbooks.

**Not started.** (Baseline headers — nosniff, frame DENY, referrer,
permissions-policy — are shipped in Step 1. CSP is deliberately deferred until
all origins are known, to avoid shipping a broken or useless policy.)

## Step 9 — Vercel production deployment and release *(unimplemented)*

Create separate development/preview/production configuration, provision
production Supabase/Stripe/email services, rotate and scope secrets, set matching
regions, configure domain/DNS/TLS, validate webhook endpoints, run migrations
safely, seed the real admin, complete merchant/legal/tax checks, execute a
release checklist and rollback test, perform a real low-value
purchase/refund/download test, and launch with monitoring.

**Not started.**
