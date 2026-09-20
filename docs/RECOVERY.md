# Recovery

Guest order-number + email recovery without accounts.

## Flow

Public form asks for the unpredictable public order number + exact
Stripe-collected delivery email. For every request (matched or not):
- Same generic message, status code, and timing.
- No masked email, order state, item, amount, or existence fact revealed.
- Durable rate limits (cooldown + daily max per email/order/network key).
- Does NOT lock or mutate the order.
- Sends only to the email already bound to the paid order.
- Enqueues through the same outbox — never calls Resend directly.

## Token reuse vs rotation

If a valid unconsumed unexpired token exists → reuse it (pure resend, new
delivery-message sequence + provider idempotency key). If the token is
consumed/expired/revoked → create one fresh generation + token + message
under the active-token cap (3). Never invalidates an outstanding link.

## Admin email correction

AAL2-only; documented out-of-band verification workflow; explicit confirmation;
required reason; old/new value audit protected as PII; creates a fresh token.
Does NOT overwrite the original Stripe-collected email evidence.

## Support runbook

1. Verify the order is paid via admin.
2. Check delivery-message state (queued/sending/accepted/dead).
3. Retry/resend via the outbox (not direct provider call).
4. Rotate token if compromised (revokes old tokens + sessions).
5. Correct delivery email if the buyer's email changed (after verification).
