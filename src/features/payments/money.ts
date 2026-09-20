/**
 * Integer-minor-unit money (Step 5). Never floating-point. All amounts are
 * non-negative integers in the smallest currency unit (e.g. cents).
 *
 * Currency codes are lowercase ISO 4217 per the locked decisions (stored
 * lowercase; formatted for display via the existing Price component).
 */

export const MIN_AMOUNT = 0;
export const MAX_AMOUNT = 999_999_999; // < 1 billion minor units (Stripe boundary)
export const CURRENCY_RE = /^[a-z]{3}$/;

/** Zero-decimal currencies (no minor units) — Stripe treats their amount as
 * the major-unit value. The catalog stores yen etc. as the integer major value,
 * which is correct for both Stripe and Intl formatting. */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx",
  "vnd", "vuv", "xaf", "xof", "xpf",
]);

export function isValidCurrency(code: string | undefined | null): code is string {
  return typeof code === "string" && CURRENCY_RE.test(code);
}

export function isZeroDecimalCurrency(code: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(code.toLowerCase());
}

/** Guard: a valid, bounded, non-negative integer amount. */
export function isValidAmount(amount: unknown): amount is number {
  return (
    typeof amount === "number" &&
    Number.isInteger(amount) &&
    amount >= MIN_AMOUNT &&
    amount <= MAX_AMOUNT
  );
}

/** Integer overflow-safe summation of minor-unit amounts. */
export function sumAmounts(...amounts: number[]): number {
  let total = 0;
  for (const a of amounts) {
    if (!isValidAmount(a)) {
      throw new RangeError(`Invalid money amount: ${a}`);
    }
    // Guard against overflow of the running total.
    if (total > MAX_AMOUNT - a) {
      throw new RangeError("Money overflow");
    }
    total += a;
  }
  return total;
}

/** Compute a subtotal from per-item unit amounts (quantity fixed at one). */
export function computeSubtotal(unitAmounts: number[]): number {
  return sumAmounts(...unitAmounts);
}

export interface ReconcileResult {
  ok: boolean;
  expectedSubtotal: number;
  stripeSubtotal: number;
  stripeTaxTotal: number;
  stripeTotal: number;
  errors: string[];
}

/**
 * Reconcile Stripe's authoritative totals against the trusted expected
 * subtotal. Currency + amounts are integer minor units. Tax is honored as
 * Stripe computed it (only when tax is configured). A mismatch routes to
 * manual review, never to silent acceptance.
 */
export function reconcileTotals(input: {
  expectedSubtotal: number;
  expectedCurrency: string;
  stripeSubtotal: number;
  stripeCurrency: string;
  stripeTaxTotal: number;
  stripeTotal: number;
  stripeDiscountTotal?: number;
}): ReconcileResult {
  const errors: string[] = [];
  if (input.expectedCurrency !== input.stripeCurrency) errors.push("currency_mismatch");
  if (input.expectedSubtotal !== input.stripeSubtotal) errors.push("subtotal_mismatch");
  if (!isValidAmount(input.stripeTaxTotal)) errors.push("invalid_tax");
  if (!isValidAmount(input.stripeTotal)) errors.push("invalid_total");
  // total must equal subtotal + tax - discount (all minor units).
  const discount = input.stripeDiscountTotal ?? 0;
  const expectedTotal = input.stripeSubtotal + input.stripeTaxTotal - discount;
  if (expectedTotal !== input.stripeTotal) errors.push("total_does_not_reconcile");
  if (expectedTotal < 0) errors.push("negative_total");
  return {
    ok: errors.length === 0,
    expectedSubtotal: input.expectedSubtotal,
    stripeSubtotal: input.stripeSubtotal,
    stripeTaxTotal: input.stripeTaxTotal,
    stripeTotal: input.stripeTotal,
    errors,
  };
}

/** Refundable amount bounds for an order. */
export function refundableBounds(orderTotal: number, alreadyRefunded: number): {
  min: number;
  max: number;
} {
  if (!isValidAmount(orderTotal)) throw new RangeError("invalid order total");
  if (!isValidAmount(alreadyRefunded)) throw new RangeError("invalid refunded");
  if (alreadyRefunded > orderTotal) throw new RangeError("refunded exceeds total");
  return { min: 1, max: orderTotal - alreadyRefunded };
}

/** Validate a requested refund amount against the current bounds. */
export function validateRefundAmount(
  requested: number,
  orderTotal: number,
  alreadyRefunded: number,
): { ok: boolean; error?: string } {
  if (!isValidAmount(requested)) return { ok: false, error: "invalid_amount" };
  const { max } = refundableBounds(orderTotal, alreadyRefunded);
  if (requested < 1) return { ok: false, error: "must_be_positive" };
  if (requested > max) return { ok: false, error: "exceeds_refundable" };
  return { ok: true };
}
