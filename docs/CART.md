# Cart

Server-backed durable guest cart (Step 5). No buyer account; the cart is owned
through possession of a high-entropy HttpOnly cookie.

## Identity + cookie model
- 256-bit cryptographically secure server-side random token (`cart-token.ts`).
- The database stores ONLY an HMAC-SHA-256 digest (with a server-only pepper);
  the raw token never persists in a column/URL/log/analytics/Stripe metadata.
- Cookie: HttpOnly, SameSite=Lax, Path=/, no Domain, Secure in production,
  prefer `__Host-` where possible; localhost uses a non-`__Host-` name. Idle +
  absolute expiry ~30 days. The client never chooses its cart id.

## Data flow
- The browser submits only opaque product IDs + the cart version (never price).
- Every cart READ recomputes display DTOs from current product data; the mutable
  cart never persists an authoritative price.
- A visitor cookie must NOT make public catalog pages dynamic/private. Cart
  count + state render through a small no-store endpoint/island; public HTML
  stays shared/cacheable; no cart token enters a public cache.

## Mutations + version
- POST/Server-Action semantics; never GET.
- Monotonic `version`; stale version → typed conflict + current cart.
- Add existing / remove absent = idempotent. Clear = explicit.
- A product appears at most once; quantity fixed at one (one license per line).
- Max items = 20; Stripe amount boundaries enforced.

## Product validation (server)
Reject free / draft / archived / rights-blocked / missing-validated-deliverable
/ invalid-zero-negative-overflowing price / unsupported currency / cross-currency
carts (`validation-gates.ts`). Show changed-price/unavailable + require review
before Checkout. Keep the cart after cancel/failed/expired Checkout; mark
converted only after an authoritative paid transition; a later interaction
creates a new empty cart without destroying the order relationship.

## Free-product exclusion
Free products are NOT sent through paid Checkout (acquisition is a later step).

## Failure UX
Safe refreshed cart state; never silently charge a different total.
