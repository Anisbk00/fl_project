/**
 * Stripe webhook event allow-list (Step 5). Subscribe ONLY to events required
 * by this integration; safely acknowledge verified-but-unsupported events
 * without processing side effects.
 */

export const SUPPORTED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
] as const;

export type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_EVENT_TYPES);

export function isSupportedEventType(type: string): boolean {
  return SUPPORTED_SET.has(type);
}

/**
 * Decide whether a verified event should be processed or safely acknowledged.
 * A verified-but-unsupported event returns `false` (ack 2xx, no side effects).
 */
export function shouldProcessEvent(type: string): boolean {
  return isSupportedEventType(type);
}
