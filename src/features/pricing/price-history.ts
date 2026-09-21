/**
 * Price history, promotions, and price-transparency logic (Step 7).
 * All amounts are integer minor units; lowercase ISO currency codes.
 */

export type PriceType = "normal" | "promotional";

export interface PriceInterval {
  sellableId: string;     // product or bundle ID
  currency: string;
  amount: number;         // integer minor units
  priceType: PriceType;
  validFrom: string;      // ISO timestamp
  validUntil: string | null;
  reason: string;
  publishedBy: string | null;
}

/** Check for overlapping active price intervals (same sellable + currency). */
export function checkPriceIntervalOverlap(
  intervals: readonly PriceInterval[],
  sellableId: string,
  currency: string,
): { ok: boolean; conflicts: { from: string; until: string | null }[] } {
  const relevant = intervals
    .filter((i) => i.sellableId === sellableId && i.currency === currency)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const conflicts: { from: string; until: string | null }[] = [];
  for (let i = 1; i < relevant.length; i++) {
    const prev = relevant[i - 1]!;
    const curr = relevant[i]!;
    if (prev.validUntil === null || prev.validUntil > curr.validFrom) {
      conflicts.push({ from: curr.validFrom, until: curr.validUntil });
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

/** Resolve the effective price for a sellable at a given time. */
export function resolveEffectivePrice(
  intervals: readonly PriceInterval[],
  sellableId: string,
  currency: string,
  now: string,
): PriceInterval | null {
  const candidates = intervals.filter(
    (i) =>
      i.sellableId === sellableId &&
      i.currency === currency &&
      i.validFrom <= now &&
      (i.validUntil === null || i.validUntil > now),
  );
  if (candidates.length === 0) return null;
  // Latest validFrom wins (promotional overrides normal within its window).
  candidates.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return candidates[0] ?? null;
}

// --- Promotions ---
export type DiscountType = "fixed_amount" | "percentage";
export type PromotionState = "active" | "scheduled" | "expired" | "disabled" | "exhausted";

export interface Promotion {
  codeDigest: string;      // HMAC digest of the private code (never the raw code)
  label: string;
  currency: string;
  market: string;
  startTime: string;
  endTime: string;
  state: PromotionState;
  discountType: DiscountType;
  discountValue: number;   // minor units (fixed) or 0-100 (percentage)
  maxDiscount?: number;   // cap for percentage
  minSubtotal: number;
  totalUsageLimit: number;
  totalUsageCount: number;
}

export interface PromotionEligibility {
  ok: boolean;
  discountAmount: number;  // in minor units
  errors: string[];
}

export function checkPromotionEligibility(
  promo: Promotion,
  cartSubtotal: number,
  currency: string,
  now: string,
): PromotionEligibility {
  const errors: string[] = [];
  if (promo.state !== "active") errors.push("not_active");
  if (promo.currency !== currency) errors.push("currency_mismatch");
  if (now < promo.startTime || now > promo.endTime) errors.push("outside_window");
  if (cartSubtotal < promo.minSubtotal) errors.push("below_min_subtotal");
  if (promo.totalUsageCount >= promo.totalUsageLimit) errors.push("exhausted");
  if (errors.length > 0) return { ok: false, discountAmount: 0, errors };

  let discount: number;
  if (promo.discountType === "fixed_amount") {
    discount = promo.discountValue;
  } else {
    discount = Math.floor((cartSubtotal * promo.discountValue) / 100);
    if (promo.maxDiscount && discount > promo.maxDiscount) discount = promo.maxDiscount;
  }
  // Never create a negative total or a free product via discount.
  if (discount >= cartSubtotal) {
    errors.push("discount_exceeds_subtotal");
    return { ok: false, discountAmount: 0, errors };
  }
  return { ok: true, discountAmount: discount, errors };
}

// --- Redemption state machine ---
export type RedemptionState = "reserved" | "consumed" | "released" | "expired";

export function canTransitionRedemption(from: RedemptionState, to: RedemptionState): boolean {
  if (from === to) return true;
  if (from === "reserved" && (to === "consumed" || to === "released" || to === "expired")) return true;
  if (from === "consumed") return false; // terminal
  if (from === "released" || from === "expired") return false; // terminal
  return false;
}

// --- EU-style lowest-price-within-30-days ---
export function computeLowestPrice30Days(
  intervals: readonly PriceInterval[],
  sellableId: string,
  currency: string,
  now: string,
): { lowest: number; hasReference: boolean } {
  const thirtyDaysAgo = new Date(new Date(now).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const relevant = intervals.filter(
    (i) => i.sellableId === sellableId && i.currency === currency && i.validFrom <= now,
  );
  if (relevant.length === 0) return { lowest: 0, hasReference: false };
  // Consider all prices that were effective within the last 30 days.
  const applicable = relevant.filter(
    (i) => i.validFrom >= thirtyDaysAgo || (i.validUntil && i.validUntil > thirtyDaysAgo),
  );
  if (applicable.length === 0) return { lowest: 0, hasReference: false };
  const lowest = Math.min(...applicable.map((i) => i.amount));
  return { lowest, hasReference: true };
}
