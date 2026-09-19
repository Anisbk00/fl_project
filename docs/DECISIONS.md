# Decision Record

Key architectural decisions for the Music Project Store, with rationale and
trade-offs.

## ADR-001 — Hosted Stripe Checkout (not a custom payment form)

**Decision:** Use Stripe-hosted Checkout for all payments.

**Rationale:** The application never handles card details, dramatically
reducing PCI scope and liability. Hosted Checkout also surfaces eligible
payment methods/wallets dynamically per merchant, currency, amount, and
customer location without us promising universal availability.

**Trade-offs:** Less visual control over the payment page; dependent on
Stripe's hosted UI. Acceptable: security and compliance outweigh pixel control.

## ADR-002 — Guest checkout, no customer accounts

**Decision:** No customer registration, login, or account area. Guests check
out via Stripe-hosted Checkout; delivery is by an emailed high-entropy access
link.

**Rationale:** The product category (digital music products) does not benefit
enough from accounts to justify the auth surface area, password handling,
account-takeover risk, and UX friction. Reducing the trust boundary reduces
attack surface.

**Trade-offs:** Repeat customers cannot view order history without an account.
Mitigated by a resend/recovery flow keyed on the delivery email (Step 6).

## ADR-003 — Private Supabase delivery storage with short-lived signed URLs

**Decision:** Paid deliverables live in a private Supabase Storage bucket and
are served only via short-lived signed URLs issued after verified payment.

**Rationale:** Permanent public URLs would be shareable indefinitely. Signed
URLs reduce casual unauthorized sharing and allow revocation on refund.

**Trade-offs (honest):** Once a customer downloads a file, perfect DRM is
impossible — they can redistribute the bytes. We do not pretend otherwise. The
model raises the bar against casual sharing and gives us revocation control,
not absolute copy protection.

## ADR-004 — Webhook-authoritative fulfillment (the success page is UX only)

**Decision:** Stripe webhooks are the payment authority. Orders, order-item
snapshots, and download grants are created only after a signature-verified
webhook confirms payment, not when the browser hits the success URL.

**Rationale:** The success page can be reached without payment (e.g. a user
navigates directly, or the payment is delayed/abandoned). Trusting it would
allow granting files without payment. Webhooks are idempotent and
concurrency-safe via unique Stripe event/session/payment IDs and DB
transactions.

**Trade-offs:** A customer may see the success page before the webhook lands.
Mitigated by: (a) the success page saying "we're confirming your payment" and
polling the order status; (b) handling delayed-payment methods by waiting for
the webhook; (c) fulfillment reconciliation.

## ADR-005 — Direct browser-to-Supabase uploads for large files (bypass Vercel Functions)

**Decision:** Large admin uploads (ZIPs, WAVs, project files) go directly from
the authenticated admin browser to Supabase Storage via TUS/resumable uploads
or signed upload tokens, against the direct storage hostname. They never
traverse a Vercel Function.

**Rationale:** Vercel Functions have a request body size limit unsuitable for
large music archives. Proxying the bytes through a function would cap upload
size, add latency, and waste function compute. A server-issued short-lived
signed upload token (after `requireAdmin`) keeps authorization server-side while
letting the bytes flow directly.

**Trade-offs:** The admin client must implement TUS/resumable logic. Acceptable
given the size requirements.

## ADR-006 — Immutable/versioned storage paths

**Decision:** Replacing a deliverable/preview creates a new, versioned object
path rather than overwriting the same CDN path.

**Rationale:** Overwriting a CDN path leaves stale cached copies and breaks
download integrity for customers who already received a link. Versioned paths
keep caches stable and let us checksum and audit each version.

**Trade-offs:** More objects stored. Acceptable for correctness.

## ADR-007 — Safe Markdown only (no stored arbitrary HTML)

**Decision:** Product long descriptions are stored as Markdown/plain text and
rendered through a Markdown renderer that strips raw HTML. Never
`dangerouslySetInnerHTML`.

**Rationale:** Stored arbitrary HTML is an XSS vector. Markdown keeps useful
formatting (headings, lists, links) without the risk.

## ADR-008 — Defer Content-Security-Policy until origins are known

**Decision:** Do not ship a CSP in Step 1. Ship baseline headers (nosniff,
frame DENY, referrer, permissions-policy) now; ship a real CSP in Step 8 once
every trusted origin (fonts, Stripe.js, Supabase storage CDN, analytics) is
finalized.

**Rationale:** A restrictive CSP shipped before origins are known would break
the storefront; a permissive one would protect nothing. Deferring avoids both
failure modes and is documented honestly rather than pretending a placeholder
is protection.

## ADR-009 — RLS is the real access boundary; the application layer is defense-in-depth

**Decision:** Row-Level Security in Supabase Postgres IS the access matrix
(anon sees only published + rights-cleared rows; `product_deliverables` and
`admin_users` are denied to anon entirely; admin mutations are permitted only
when `is_admin()` returns true). The application data-access layer applies the
identical filter as defense-in-depth, but is never relied upon as the sole
boundary.

**Rationale:** Defense in depth. If a future server bug or a privileged-client
misuse bypassed the application filter, RLS still prevents the leak; if RLS
were somehow misconfigured, the application filter still narrows the result.
The committed SQL (`supabase/migrations/0002_rls_and_admin.sql`) is the source
of truth and is exercised by the pgTAP suite and the gated JS integration suite.

## ADR-010 — Supabase is the only data platform; bun is the package manager

**Decision:** Use Supabase (Postgres + Auth + Storage) as the only data
platform. There is NO local database and NO Prisma. The package manager for
this development environment is bun (the plan specifies pnpm; `packageManager`
is pinned to `bun@1.3.14` with a committed `bun.lock`).

**Rationale:** The plan mandates Supabase. A hand-authored `Database` type
(`src/types/database.ts`) mirrors the SQL migrations so the application
type-checks and builds WITHOUT a live Supabase project — in a real project,
regenerate it with `supabase gen types`. This preserves the Supabase-only
data model exactly as specified, with no local-DB substitute, while keeping the
build/test loop runnable before a project is linked.
