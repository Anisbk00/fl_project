# Refunds

AAL2-protected, idempotent, safe test-mode refunds (Step 5).

## Admin flow
1. AAL2 admin opens a known paid order (`/admin/orders/[id]`).
2. The browser never supplies an arbitrary PaymentIntent/Charge.
3. Display the remaining refundable amount (integer minor units).
4. Require explicit full-or-partial choice + reason + confirmation naming the
   order + amount.
5. Server reloads the trusted order/payment/currency/refund-totals/version.
6. Create/reserve one refund request transactionally with a random Stripe
   idempotency key (`refund_<request_id>`); prevent concurrent over-refund
   (`refund-bounds.ts`).
7. Call Stripe outside the DB transaction using the order's trusted
   PaymentIntent/Charge.
8. Persist the Refund id + state; retry local failures with the SAME key;
   never blindly create a second refund.
9. Audit the actor/amount/safe reason/request/result; never log customer PII.

## Partial + full + pending + failed
- Refund events are authoritative; reconcile individual refunds + aggregate
  refunded amount with Stripe.
- Pending/succeeded/failed represented accurately; Dashboard-originated
  refunds linked via verified `refund.*` events.
- A successful (full or partial) refund sets a future entitlement-revocation
  signal for Step 6.
- No manual "mark as paid" anywhere.
