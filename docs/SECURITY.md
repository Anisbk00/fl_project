# Security

This document defines assets, actors, trust boundaries, threats, controls,
secret handling, the admin-only auth model, the RLS rules (production mapping),
and the future payment/download security requirements.

## 1. Assets

| Asset | Sensitivity | Where it lives |
| --- | --- | --- |
| Admin allow-list (`admin_users`) | High — reveals admin identities | Supabase Postgres; RLS blocks anon/authenticated reads entirely (only `is_admin()` SECURITY DEFINER consults it). |
| Catalog metadata (products, genres, plugins) | Public when published + rights-cleared; private when draft/archived/unreviewed | Supabase Postgres (RLS-protected) |
| Public preview media | Public by design | `product-public` bucket / `product_media` rows |
| Private deliverables | High — paid product | `product-private` bucket / `product_deliverables` rows (never in public reads) |
| Customer payment/delivery data | High — PII | Stripe + a hashed download-token table (Step 6). Never logged in full. |
| Supabase secret key | Critical | Server env only; never in a client bundle, log, URL, or error. |

## 2. Actors

| Actor | Can authenticate? | Powers |
| --- | --- | --- |
| Anonymous / public visitor | No (no customer auth, ever) | Read only published + rights-cleared catalog, taxonomy, public media. No mutations. |
| Authenticated non-admin | (admin auth only; no customer accounts) | No more than anon. No mutations, no private reads. |
| Allow-listed admin (MFA/AAL2) | Yes (Supabase Auth, manual provisioning) | Catalog CRUD, publish/archive, deliverable management, asset upload. |
| Privileged server client (secret key) | n/a (server-only) | Narrowly-scoped ops; never compensates for broken RLS. |
| Stripe | n/a | Payment authority via signed webhooks. |

## 3. Trust boundaries and rules

1. **The browser is never trusted** for price, entitlement, or authorization
   data. The server recalculates every line item from trusted DB values.
2. **A protected layout is never the only authorization layer.** Every Server
   Action / Route Handler performs its own `requireAdmin`, input validation
   (Zod), and rate-limit check.
3. **`server-only` guards** every module that can touch secrets or privileged
   data, so a Client Component importing it fails the build.
4. **Public reads use explicit `select`** that omits private relations and
   admin-only columns. Using `select` (not `include`) guarantees a future added
   relation cannot accidentally leak.
5. **Stored Markdown, not arbitrary HTML.** Product descriptions are rendered
   through a Markdown renderer that strips raw HTML — never
   `dangerouslySetInnerHTML`.
6. **Never log credentials, full payment/customer records, tokens, or private
   storage URLs.** `src/lib/security/redact.ts` scrubs known secrets and
   common secret patterns from log/error input. No SQL query logging is enabled.

## 4. Threat model and controls

| Threat | Controls (Step 1 + planned) |
| --- | --- |
| Unauthorized admin access / privilege escalation | Admin allow-list keyed by `auth.users.id`; `requireAdmin` on every mutation; TOTP MFA/AAL2 required before launch (Step 4). |
| Public reads of drafts / private deliverables | Access matrix in `data-access.ts` (here) + RLS policies (production). DB-backed tests prove allow/deny. |
| Secret-key exposure | `server-only` guard; lazy server env validation; never printed; `redact.ts` scrubs logs; `.env*` git-ignored except `.env.example`. |
| Price/cart manipulation | Server recalculates prices from trusted DB values (Step 5); Zod at every trust boundary. |
| Forged/replayed payment webhooks | Verify Stripe signatures against the raw request body; idempotency on event/session/payment IDs; DB transactions (Step 5). |
| Duplicate fulfillment | Unique-key constraints + transactions; handle immediate + delayed events (Step 6). |
| Guessing/replaying/sharing download links | High-entropy tokens; store only a cryptographic hash; validate status/expiry/revocation/limits; short-lived signed URLs (Step 6). |
| XSS via product descriptions | Safe Markdown only; sanitize; never raw HTML. |
| Malicious/invalid uploads | File allow-list + size limits + MIME checks + SHA-256 checksums + versioned immutable paths (Step 4). |
| Abusive checkout/download/API traffic | Rate limits backed by durable shared state (NOT a fake in-memory limiter — see `rate-limit.ts`); bot controls (Step 5/8). |
| Sensitive data in logs | `redact.ts`; no query logging; structured redacted logs (Step 8). |
| Dependency / supply-chain | Committed lockfile; `bun audit`; CI dependency review (Step 8). |

## 5. Secret handling

- `.env.example` contains **placeholders only**. Real `.env*` files are
  git-ignored.
- Public env (`NEXT_PUBLIC_*`) is validated eagerly with safe development
  defaults so the app builds/boots without real secrets.
- Server env (`SUPABASE_SECRET_KEY`, `SUPABASE_URL`) is
  validated **lazily** when a privileged operation needs it. There is NO local
  database and NO `DATABASE_URL` — Supabase is the only data platform. The
  build succeeds without secrets while privileged operations refuse to run if
  misconfigured.
- The secret key is imported only inside `src/lib/supabase/privileged.ts`
  (server-only). It never appears in a client bundle, log, URL, or error.
- `redact.ts` scrubs `sb_secret_...`, `sb_publishable_...`, Bearer tokens, and
  JWT-shaped blobs from any string before logging.

## 6. Admin-only authentication model

- **No customer authentication exists, and none will be added as a shortcut.**
  Only admins authenticate.
- Admin accounts are **manually provisioned** in `admin_users`, keyed by the
  Supabase `auth.users.id`. Public self-sign-up is disabled.
- Admin status is determined from `auth.uid()` + the allow-list — never from an
  email or a browser-supplied claim.
- **TOTP MFA / AAL2 is required** for admin access before production launch
  (Step 4).
- `requireAdmin(adminClient)` calls the `is_admin()` SECURITY DEFINER RPC on
  the authenticated admin client (so `auth.uid()` is set) and throws
  `UnauthorizedError` otherwise. Every catalog mutation calls it first. The
  privileged (secret) client is never used for catalog mutations — RLS is the
  real boundary.

## 7. Row-Level Security rules (production mapping)

RLS + explicit grants ARE the access matrix (this is not a local-DB
approximation — Supabase is the only data platform). The application
data-access layer applies the identical filter as defense-in-depth. RLS is
enabled on every table in the exposed schema; broad defaults are revoked;
only required operations are granted back. Policies are written per operation
(not one opaque `FOR ALL`).

| Table | anon SELECT | non-admin SELECT | admin SELECT | anon/non-admin INSERT/UPDATE/DELETE | admin mutation |
| --- | --- | --- | --- | --- | --- |
| `products` | only `published` + rights-cleared rows; only public columns | same as anon | all rows, all columns | denied | allowed via `is_admin()` |
| `genres`, `plugins` | all | all | all | denied | allowed |
| `product_genres`, `product_plugins` | only for published products | same | all | denied | allowed |
| `product_media` | only for published products | same | all | denied | allowed |
| `product_deliverables` | **denied entirely** | **denied** | all | denied | allowed |
| `admin_users` | **denied** | **denied** | all (and only via `is_admin()`) | denied | allowed |

The publication rule is enforced by a Postgres CHECK constraint
(`products_publication_check` in `0001_catalog_schema.sql`):
`lifecycle = 'published'` ⇒ `rights_status IN ('original','licensed')` AND
`published_at IS NOT NULL` AND `price >= 0` AND `price_currency IS NOT NULL` AND
required public metadata present. `assertPublishable()` in the data-access
write path + the Zod schema apply the same rule as defense-in-depth before the
DB is ever reached.

The `is_admin()` function is a `SECURITY DEFINER` with an empty/fixed
`search_path`, least-privilege EXECUTE grants, consulting `auth.uid()` against
`admin_users` (see `0002_rls_and_admin.sql`). The application calls it via
`adminClient.rpc('is_admin')` in `src/lib/auth/is-admin.ts`.

## 8. Storage access control (production)

- `product-public` bucket: public reads allowed (CDN delivery). Writes only by
  allow-listed admin (TUS/resumable or signed upload token). No anon writes.
- `product-private` bucket: no public reads. The fulfillment server issues
  short-lived signed URLs after verifying payment + a download grant. Object
  paths are never exposed in public catalog APIs.

## 9. Future payment & download security (Steps 5–6)

- Stripe-hosted Checkout (guest checkout). The server recalculates prices from
  trusted DB values; the browser never submits price/entitlement data.
- Stripe webhooks are the payment authority; the success page is UX only.
  Signatures verified against the raw body. Fulfillment is idempotent and
  concurrency-safe via unique Stripe IDs + transactions.
- Guest delivery via a high-entropy access link emailed to the customer. Only a
  cryptographic **hash** of the access token is stored. Before issuing a
  short-lived signed URL, the server validates: token status, order payment
  status, expiry, revocation, and download limits. Delayed payment events are
  handled before granting files; refund revokes grants.
- Honesty note: signed links reduce casual unauthorized sharing but cannot
  provide perfect DRM after a customer downloads a file.
