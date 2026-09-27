import { isValidAmount, isValidCurrency } from "./money";

/**
 * Cart-item validation gates (Step 5). The browser submits only product
 * identifiers + a cart version; the server re-resolves authoritative product
 * data and applies these gates before any Checkout. A failing item is reported
 * as a safe, refreshed cart state — never silently charged.
 */

export interface PurchasableProductInput {
  productId: string;
  slug: string;
  /** lifecycle: draft | published | archived */
  lifecycle: string;
  price: number; // integer minor units
  currency: string; // lowercase ISO
  hasActiveValidatedDeliverable: boolean;
  /** free product (price 0) — excluded from PAID checkout */
  free: boolean;
}

export type CartGateError =
  | "free_excluded"
  | "not_published"
  | "missing_deliverable"
  | "invalid_price"
  | "unsupported_currency";

export function validatePurchasable(
  p: PurchasableProductInput,
  cartCurrency: string,
): CartGateError[] {
  const errors: CartGateError[] = [];
  if (p.free) errors.push("free_excluded");
  if (p.lifecycle !== "published") errors.push("not_published");
  if (!p.hasActiveValidatedDeliverable) errors.push("missing_deliverable");
  if (!isValidAmount(p.price)) errors.push("invalid_price");
  if (!isValidCurrency(p.currency)) errors.push("unsupported_currency");
  if (cartCurrency && isValidCurrency(p.currency) && p.currency !== cartCurrency)
    errors.push("unsupported_currency"); // cross-currency carts rejected
  return errors;
}

/** A cart is paid-checkout-eligible only if every item passes and the cart is
 * non-empty and single-currency. */
export function isCartCheckoutEligible(items: readonly PurchasableProductInput[]): {
  ok: boolean;
  errors: { productId: string; errors: CartGateError[] }[];
} {
  if (items.length === 0) {
    return { ok: false, errors: [] };
  }
  const currencies = new Set(items.map((i) => i.currency));
  const errors: { productId: string; errors: CartGateError[] }[] = [];
  for (const item of items) {
    const cartCurrency = currencies.size === 1 ? (item.currency ?? "") : "";
    const e = validatePurchasable(item, cartCurrency);
    if (e.length) errors.push({ productId: item.productId, errors: e });
  }
  if (currencies.size > 1) {
    // cross-currency: mark all items
    for (const item of items) {
      if (!errors.some((e) => e.productId === item.productId))
        errors.push({ productId: item.productId, errors: ["unsupported_currency"] });
    }
  }
  return { ok: errors.length === 0, errors };
}
