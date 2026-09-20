# Fulfillment

Authoritative paid-to-fulfillment transition, entitlement/generation state
machines, worker/outbox, recovery, refunds/disputes, invariants, limitations.
See `src/features/fulfillment/` + `supabase/migrations/0007_fulfillment.sql`.

## Authoritative paid transition

The Step 5 `mark_order_paid` RPC calls `after_order_paid_extension(order_id)`
INSIDE the same transaction. Step 6 fills this hook to atomically create:
- One initial `fulfillment_generation` (unique per order, generation=1).
- One `fulfillment_entitlement` per `order_item` (idempotent on conflict).
- One initial `delivery_message` (immutable, with a stable provider idempotency
  key) + a `fulfillment_outbox` job.
- The access token's HMAC digest + encrypted recovery material are created by
  trusted server code before the transaction (the DB stores only the digest +
  AES-256-GCM ciphertext envelope — never the raw token).

No email/token/signed-URL is sent inside the DB transaction. The outbox worker
sends after commit.

## Entitlement state machine

`active → held → revoked → active(restore)`. Monotonic; held can go to revoked
or back to active (restore). Revoked can be restored only by an authoritative
dispute-won transition. Refund/dispute events call `revoke_fulfillment(order_id,
action, reason)`:
- `revoke`: revoke all entitlements + unconsumed tokens + sessions.
- `hold`: hold all active entitlements; revoke sessions.
- `release`: restore held → active.

## Fulfillment policy (snapshot per generation)

Access-token expiry: 72h (max 7d). Download session: 30m. Signed-URL TTL: 120s
(max 10m). Issuance quota: 10 per order item. Recovery cooldown: 15m, max 5/day.
Active-token cap: 3. Worker lease: 30s, batch 10, max 8 attempts.

## Outbox worker

Claims due rows with `FOR UPDATE SKIP LOCKED` + lease. For each delivery
message: re-read state, cancel if not paid/hold/refunded/disputed, verify
entitlements still reference ready assets, prepare/load immutable payload,
verify hash, send with stable idempotency key, persist provider result. Retry:
immediate, seconds, tens of seconds, minutes. Dead-letter on exhaustion.

`after()` may accelerate a drain; correctness relies on the leased outbox.
A cron route (`/api/cron/fulfillment-drain`, Bearer CRON_SECRET) runs ≥1/min.

## Recovery/resend

Public form (order number + email). Generic response for all inputs. Durable
rate limits. Reuse valid unconsumed token (pure resend) or create a new
generation (token rotation). Never invalidates an outstanding link. Sends only
to the Stripe-collected delivery email bound to the order.

## Limitations

Signed URLs are bearer capabilities with a residual 120s window — cannot be
retroactively revoked once issued. Download "quota" counts issuances, not bytes
received. No DRM. A downloaded file cannot be clawed back.
