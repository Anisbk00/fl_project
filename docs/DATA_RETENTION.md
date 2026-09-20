# Data Retention

## Abandoned carts
Idle + absolute ~30-day expiry; bounded cleanup of expired/abandoned carts.

## Webhook payloads
Private `payload` purged/nulled after a short retention once durable business
fields exist; the event envelope + processing audit retained for reconciliation.

## Customer PII
Minimal: buyer delivery email (from Stripe `customer_details.email`); no
phone/shipping. No card brand/last4 unless a documented support requirement
exists. Email masked in admin lists.

## Financial records
Orders/order_items/refunds retained per statutory financial-record requirements
— the exact period is pending legal review (do not invent one; do not
prematurely delete financial/audit records).

## Cart token / pepper
Raw token never persisted; only the HMAC digest. Pepper is server-only, never
logged/URL/metadata/client.
