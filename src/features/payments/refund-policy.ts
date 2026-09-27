/**
 * Refund → order/access policy. Pure (no I/O) so it is unit-tested directly.
 *
 * Inputs come from the authoritative Stripe Charge (re-fetched, never the
 * event payload), in integer minor units.
 */

export type RefundAccessAction = "revoke" | "hold" | "none";

export interface RefundOutcome {
  paymentState: "paid" | "partially_refunded" | "refunded";
  /** What happens to the buyer's download entitlements. */
  access: RefundAccessAction;
}

export function refundOutcome(chargeAmount: number, amountRefunded: number): RefundOutcome {
  // Nothing refunded (e.g. refund.failed): the buyer still paid.
  if (amountRefunded <= 0) return { paymentState: "paid", access: "none" };
  // Full refund: access ends permanently.
  if (amountRefunded >= chargeAmount) return { paymentState: "refunded", access: "revoke" };
  // Partial: the charge can't say WHICH product was refunded, so fail closed
  // and let an admin release (goodwill) or revoke (item refund) the hold.
  return { paymentState: "partially_refunded", access: "hold" };
}
