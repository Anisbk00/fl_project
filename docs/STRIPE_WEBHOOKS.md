# Stripe Webhooks

Raw-body signature-verified webhook endpoint + durable inbox + processor.

## Endpoint (`/api/stripe/webhook`, Node runtime, no-store)
- POST only; reject oversized bodies; read the raw body ONCE; require
  `Stripe-Signature`; verify raw payload + signature + endpoint secret via the
  official SDK `constructEvent` (timestamp tolerance).
- Nondisclosing 400 for malformed/invalid/expired signatures.
- Persist the VERIFIED event in `webhook_inbox` (unique by Stripe event id)
  BEFORE 2xx; duplicate id → 2xx after confirming the existing record;
  persistence failure → retryable 5xx.
- Safe-acknowledge verified-but-unsupported events (2xx, no side effects).
- NEVER log signing secret/full signature/raw payload/email/address/Checkout
  URL/cart token/PaymentIntent client secret.

## Subscribed events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created/
updated/closed`.

## Inbox + processor
- `FOR UPDATE SKIP LOCKED` lease; bounded exponential backoff + jitter; max
  attempts/age; dead-letter on exhaustion.
- Retrieve current Stripe object state (not event timestamps) for
  ordering/dup decisions; monotonic transitions; compare-and-set short
  transactions; network calls outside long-held locks.
- Purge private payloads after a short retention once durable fields exist.

## Reconciliation
Auth operator action + scheduled scan for stuck inbox rows, stale creating/open
attempts, missing Sessions, pending payments, paid Sessions without an order,
pending refunds, dead-letter events. Reconciliation uses the SAME idempotent
transition logic; never sets `paid=true` directly.

## Stripe CLI
`stripe listen --forward-to http://localhost:3000/api/stripe/webhook` with the
endpoint-specific webhook secret. Replay: `stripe events resend <id>`. Signing-
secret rotation is an operational procedure.
