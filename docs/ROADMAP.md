# Roadmap

This roadmap lists Steps 2–9. **Step 2 is COMPLETE; Steps 3–9 remain
explicitly UNIMPLEMENTED.** Step 1 delivered the foundation, architecture, and
secure catalog data layer; Step 2 delivered the original brand system and
responsive storefront shell.

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

## Step 3 — Catalog, product pages, filters, SEO, and audio previews *(unimplemented)*

Build real data-backed catalog/product pages, URL-based filters, search,
sorting, native performant preview playback, compatibility panels, related
products, metadata, canonical URLs, sitemap, robots rules, Open Graph, and
validated Product/Offer/BreadcrumbList structured data.

**Not started.**

## Step 4 — Admin authentication and product CMS *(unimplemented)*

Implement manually provisioned admin login, disabled public sign-up, TOTP
MFA/AAL2 enforcement, protected server actions, product CRUD, draft/preview/
publish workflow, rights-clearance gate, genres/plugins management, direct
resumable uploads to Supabase Storage, validation, checksums, versioned assets,
audit history, and safe delete/archive behavior.

**Not started.** (The `requireAdmin` gate, the `AdminUser` allow-list model,
and the publish-constraint guardrail are already in place from Step 1 so the
moment real admin auth lands, the gate is already enforced.)

## Step 5 — Cart and Stripe guest checkout *(unimplemented)*

Implement a durable guest cart, trusted server-side price lookup, checkout-
session creation, dynamic eligible payment methods, customer email collection,
terms/consumer consent where legally required, tax configuration,
success/cancel flows, signature-verified webhooks, idempotent orders, refunds,
and exhaustive test-mode scenarios.

**Not started.**

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
