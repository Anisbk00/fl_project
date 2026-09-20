# Payments

Checkout-attempt saga + Stripe-hosted Checkout (Step 5). Guest-only; the app
never sees card details.

## Saga (do not hold a DB transaction open across the Stripe call)
1. Same-origin POST/Server-Action with cart version + consent IDs (no prices).
2. Durable rate limit (cart-token digest + privacy-preserving key) — not an
   in-memory Map.
3. Lock + read the cart transactionally.
4. Re-resolve every item from trusted product/rights/asset tables.
5. Enforce every purchase gate.
6. Reject empty/free-only/stale/mixed-currency/changed carts with a refreshed
   typed response.
7. Validate consent is current + bound to the exact cart fingerprint.
8. Build the deterministic server-side cart fingerprint (`cart-fingerprint.ts`).
9. Reuse an existing unexpired open Session only if fingerprint + consent match.
10. Else create one immutable `creating` attempt + item snapshots (unique
    constraint).
11. Commit.
12. `stripe.checkout.sessions.create` with the attempt's stable non-PII
    idempotency key (`checkout_<attempt_id>`).
13. Persist Session id/PaymentIntent/URL/expiry.
14. Transition attempt → open.
15. Never return the full Stripe response; redirect server-side to the hosted URL.
Double-clicks/retries/Vercel-retries converge on the same attempt + Session
(via DB uniqueness/locking + the Stripe idempotency key). Ambiguous Stripe
errors → reconciliation state (no second charge path).

## Stripe SDK + exact Checkout config
- Official stable Stripe Node SDK; pinned GA API version (no preview/beta);
  `server-only`; no secret in client code.
- `mode: payment`; hosted UI; line items from immutable snapshots; quantity 1;
  inline `price_data` (no secondary Stripe Price catalog).
- NO `customer_email` (Stripe collects it); NO static `payment_method_types`
  (dynamic eligibility); NO shipping/phone/promo/coupons/subscriptions/saved
  methods/Adaptive Pricing.
- metadata = opaque internal ids + schema version only (no email/token/price).
- success = `/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  cancel = `/cart?checkout=cancelled`; both from the canonical-origin
  allow-list; explicit 60-minute expiry; `customer_creation: if_required`;
  `consent_collection.terms_of_service=required` only with an approved Terms URL.

## Trusted pricing
Integer minor units; every line item from the immutable attempt snapshot;
browser price/title/currency/tax/asset/entitlement/payment state ignored.

## Payment + order state machines
Separate attempt/payment/refund/dispute/fulfillment states; monotonic (no
regression from paid); immediate vs delayed; completed≠paid; unsafe mismatches
→ manual_review. See `state-machine.ts`. Paid transition in ONE transactional
RPC `mark_order_paid(...)`.

## Immutable snapshots
Order + attempt items are immutable (triggers block UPDATE/DELETE); product
edits after Checkout never alter snapshots. `on delete restrict` prevents
cascade-deleting a paid order.

## Step 6 extension point
`after_order_paid_extension(order_id)` is called inside the paid transaction,
BEFORE commit. Step 5 ships a no-op; Step 6 creates download grants + a
delivery-outbox job there (no email/token/signed URL in Step 5).
