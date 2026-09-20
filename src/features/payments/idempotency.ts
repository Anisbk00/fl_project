/**
 * Stripe idempotency keys (Step 5). Derived from server-generated random
 * checkout-attempt / refund-request IDs — NEVER from email or other PII.
 * Retries of the same attempt reuse the same key → Stripe deduplicates.
 */

/** Checkout-Session creation idempotency key from the checkout attempt id. */
export function checkoutIdempotencyKey(attemptId: string): string {
  if (!attemptId) throw new Error("missing attempt id");
  return `checkout_${attemptId}`;
}

/** Refund idempotency key from the internal refund-request id. */
export function refundIdempotencyKey(refundRequestId: string): string {
  if (!refundRequestId) throw new Error("missing refund request id");
  return `refund_${refundRequestId}`;
}
