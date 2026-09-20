/**
 * Stripe Checkout Session configuration builder (Step 5).
 *
 * Builds the exact, allowed `stripe.checkout.sessions.create` params from the
 * immutable checkout-attempt snapshots. Rules enforced here (and re-checked by
 * the trusted paid-transition RPC):
 *   - hosted/default ui_mode; `mode: payment` (one-time).
 *   - line items from immutable snapshots; quantity 1; inline `price_data`
 *     (no secondary Stripe Price catalog to desynchronize).
 *   - NO `customer_email` (Stripe collects the delivery email).
 *   - NO static `payment_method_types` (Stripe Dashboard + dynamic eligibility).
 *   - NO shipping/phone/promotion codes/coupons/subscriptions/saved-methods.
 *   - NO Adaptive Pricing.
 *   - metadata is an allow-list of OPAQUE internal ids + schema version only
 *     (no email, cart token, rights notes, private paths, browser prices).
 *   - success/cancel URLs from a validated canonical-origin allow-list; the
 *     Stripe `{CHECKOUT_SESSION_ID}` placeholder is preserved literally.
 *   - explicit Session expiry (60 minutes).
 *   - `customer_creation: if_required` (guest one-time).
 *
 * This is a pure function (no Stripe call) so it is unit-tested directly.
 */

export interface CheckoutLineItemSnapshot {
  slug: string;
  title: string;
  /** Sanitized, length-limited product description (no raw HTML). */
  description: string;
  unitAmount: number; // integer minor units
  currency: string; // lowercase ISO
  /** Optional intentional public cover URL. */
  imageUrl?: string;
}

export interface CheckoutAttemptSnapshot {
  attemptId: string;
  currency: string;
  lineItems: readonly CheckoutLineItemSnapshot[];
  /** Opaque internal cart reference (NOT the cart token). */
  cartInternalId: string;
  policyVersion: string | null;
  /** Canonical origin (already validated against the allow-list). */
  canonicalOrigin: string;
  /** Terms URL only when an approved Terms + Stripe setting exist. */
  termsUrl?: string | null;
}

export const CHECKOUT_SESSION_EXPIRY_MINUTES = 60;
export const METADATA_SCHEMA_VERSION = "1";
export const PRODUCT_TITLE_MAX = 40;
export const PRODUCT_DESC_MAX = 200;

function sanitizeText(s: string, max: number): string {
  return s.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

/**
 * Build Stripe Checkout Session create params from the immutable attempt.
 * The caller (server-only) passes these to the Stripe SDK with the attempt's
 * idempotency key. Nothing in the result is browser-supplied.
 */
export function buildCheckoutSessionParams(attempt: CheckoutAttemptSnapshot) {
  const lineItems = attempt.lineItems.map((li) => ({
    quantity: 1,
    price_data: {
      currency: attempt.currency,
      unit_amount: li.unitAmount,
      product_data: {
        name: sanitizeText(li.title, PRODUCT_TITLE_MAX),
        ...(li.description
          ? { description: sanitizeText(li.description, PRODUCT_DESC_MAX) }
          : {}),
        ...(li.imageUrl ? { images: [li.imageUrl] } : {}),
      },
    },
  }));

  const params: Record<string, unknown> = {
    mode: "payment",
    line_items: lineItems,
    // Stripe collects the delivery email; we do NOT pass customer_email.
    // No payment_method_types → dynamic eligible methods apply.
    customer_creation: "if_required",
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_EXPIRY_MINUTES * 60,
    success_url: buildSuccessUrl(attempt.canonicalOrigin),
    cancel_url: buildCancelUrl(attempt.canonicalOrigin),
    // Opaque internal references only — no PII, no tokens, no prices.
    client_reference_id: attempt.attemptId,
    metadata: {
      schema_version: METADATA_SCHEMA_VERSION,
      attempt_id: attempt.attemptId,
      cart_internal_id: attempt.cartInternalId,
      policy_version: attempt.policyVersion ?? "",
    },
  };

  // consent_collection.terms_of_service = required ONLY when an approved Terms
  // URL + Stripe account setting + policy are configured.
  if (attempt.termsUrl) {
    params.consent_collection = { terms_of_service: "required" };
    params.terms_url = attempt.termsUrl;
  }

  return params;
}

/** `/checkout/success?session_id={CHECKOUT_SESSION_ID}` — Stripe substitutes. */
export function buildSuccessUrl(origin: string): string {
  return `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
}

/** `/cart?checkout=cancelled` — navigation only; never marks a payment failed. */
export function buildCancelUrl(origin: string): string {
  return `${origin}/cart?checkout=cancelled`;
}
