import { describe, it, expect } from "bun:test";
import {
  canTransitionAttempt,
  canTransitionPayment,
  canTransitionRefund,
  checkPaidTransition,
} from "@/features/payments/state-machine";
import {
  buildCheckoutSessionParams,
  buildSuccessUrl,
  buildCancelUrl,
  type CheckoutAttemptSnapshot,
} from "@/features/payments/checkout-config";
import { isSupportedEventType, shouldProcessEvent } from "@/features/payments/webhook-events";
import {
  validatePurchasable,
  isCartCheckoutEligible,
  type PurchasableProductInput,
} from "@/features/payments/validation-gates";
import { maskEmail, redactStripeId } from "@/features/payments/redaction";
import { evaluateLiveGate, validateOrigin } from "@/features/payments/live-gate";

const ok = <T>(o: T): T => o;

describe("state machine", () => {
  it("attempt: creating→open, open→completed, terminal stays", () => {
    expect(canTransitionAttempt("creating", "open")).toBe(true);
    expect(canTransitionAttempt("open", "completed")).toBe(true);
    expect(canTransitionAttempt("completed", "open")).toBe(false);
    expect(canTransitionAttempt("completed", "completed")).toBe(false);
  });
  it("payment: monotonic; no regression from paid", () => {
    expect(canTransitionPayment("pending", "paid")).toBe(true);
    expect(canTransitionPayment("paid", "failed")).toBe(false); // no regression
    expect(canTransitionPayment("paid", "pending")).toBe(false);
    expect(canTransitionPayment("paid", "refunded")).toBe(true);
    expect(canTransitionPayment("refunded", "partially_refunded")).toBe(true);
    expect(canTransitionPayment("none", "pending")).toBe(true);
  });
  it("refund: succeeded is terminal", () => {
    expect(canTransitionRefund("pending", "succeeded")).toBe(true);
    expect(canTransitionRefund("pending", "failed")).toBe(true);
    expect(canTransitionRefund("succeeded", "pending")).toBe(false);
    expect(canTransitionRefund("succeeded", "failed")).toBe(false);
  });
  it("paid-transition match: flags every mismatch", () => {
    const r = checkPaidTransition({
      attemptId: "a1", sessionFromAttempt: "s1", sessionFromStripe: "s1",
      expectedEnvironment: "test", stripeLivemode: false,
      expectedCurrency: "usd", stripeCurrency: "usd",
      expectedSubtotal: 600, stripeSubtotal: 600,
      expectedPaymentIntent: "pi_1", stripePaymentIntent: "pi_1",
      paymentStatus: "paid", hasCustomerEmail: true,
    });
    expect(r.ok).toBe(true);
    const bad = checkPaidTransition({
      attemptId: "a1", sessionFromAttempt: "s1", sessionFromStripe: "OTHER",
      expectedEnvironment: "test", stripeLivemode: true, // live key vs test env
      expectedCurrency: "usd", stripeCurrency: "eur",
      expectedSubtotal: 600, stripeSubtotal: 700,
      expectedPaymentIntent: "pi_1", stripePaymentIntent: "pi_2",
      paymentStatus: "unpaid", hasCustomerEmail: false,
    });
    expect(bad.errors).toContain("session_mismatch");
    expect(bad.errors).toContain("environment_mismatch");
    expect(bad.errors).toContain("currency_mismatch");
    expect(bad.errors).toContain("subtotal_mismatch");
    expect(bad.errors).toContain("payment_intent_mismatch");
    expect(bad.errors).toContain("not_paid");
    expect(bad.errors).toContain("missing_email");
  });
});

const attempt: CheckoutAttemptSnapshot = {
  attemptId: "att_1",
  currency: "usd",
  lineItems: [
    { slug: "vector-drift", title: "Vector Drift", description: "Original project.", unitAmount: 2400, currency: "usd", imageUrl: "https://cdn.example/cover.png" },
    { slug: "granite-room", title: "Granite Room", description: "", unitAmount: 2800, currency: "usd" },
  ],
  cartInternalId: "cart_internal_1",
  policyVersion: "pv1",
  canonicalOrigin: "https://store.example.com",
};

describe("checkout-config builder", () => {
  const params = buildCheckoutSessionParams(attempt);

  it("uses one-time payment mode + hosted UI", () => {
    expect(params.mode).toBe("payment");
    expect(params.ui_mode).toBeUndefined(); // default hosted
  });
  it("quantity is one per line + inline price_data (no secondary catalog)", () => {
    const li = params.line_items as Array<{ quantity: number; price_data: { unit_amount: number; currency: string; product_data: { name: string } } }>;
    expect(li.length).toBe(2);
    expect(li.every((x) => x.quantity === 1)).toBe(true);
    expect(li[0]!.price_data.unit_amount).toBe(2400);
    expect(li[0]!.price_data.currency).toBe("usd");
  });
  it("does NOT pass customer_email or static payment_method_types", () => {
    expect(params.customer_email).toBeUndefined();
    expect(params.payment_method_types).toBeUndefined();
    expect(params.shipping_address_collection).toBeUndefined();
    expect(params.allow_promotion_codes).toBeUndefined();
    expect(params.subscription_data).toBeUndefined();
  });
  it("metadata is opaque (no email/token/prices/rights notes)", () => {
    const md = params.metadata as Record<string, string>;
    expect(md.attempt_id).toBe("att_1");
    expect(md.cart_internal_id).toBe("cart_internal_1");
    expect(md.schema_version).toBe("1");
    const serialized = JSON.stringify(params);
    expect(serialized).not.toMatch(/@/); // no email
    expect(serialized).not.toMatch(/token/i);
  });
  it("success/cancel URLs use the canonical origin + Stripe placeholder", () => {
    expect(buildSuccessUrl("https://store.example.com")).toBe(
      "https://store.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(buildCancelUrl("https://store.example.com")).toBe(
      "https://store.example.com/cart?checkout=cancelled",
    );
  });
  it("omits consent_collection when no approved terms URL", () => {
    expect(params.consent_collection).toBeUndefined();
    const withTerms = buildCheckoutSessionParams({ ...attempt, termsUrl: "https://store.example.com/legal/terms" });
    expect((withTerms.consent_collection as { terms_of_service: string }).terms_of_service).toBe("required");
  });
});

describe("webhook event allow-list", () => {
  it("accepts subscribed events only", () => {
    expect(isSupportedEventType("checkout.session.completed")).toBe(true);
    expect(isSupportedEventType("refund.created")).toBe(true);
    expect(isSupportedEventType("invoice.paid")).toBe(false);
    expect(shouldProcessEvent("charge.refunded")).toBe(false); // not subscribed
  });
});

describe("validation gates", () => {
  const good: PurchasableProductInput = {
    productId: "p1", slug: "vector-drift", lifecycle: "published",
    price: 2400, currency: "usd",
    hasActiveValidatedDeliverable: true, free: false,
  };
  it("accepts a purchasable product", () => {
    expect(validatePurchasable(good, "usd")).toEqual([]);
  });
  it("rejects free / draft / missing-deliverable / bad price / cross-currency", () => {
    expect(validatePurchasable({ ...good, free: true }, "usd")).toContain("free_excluded");
    expect(validatePurchasable({ ...good, lifecycle: "draft" }, "usd")).toContain("not_published");
    expect(validatePurchasable({ ...good, hasActiveValidatedDeliverable: false }, "usd")).toContain("missing_deliverable");
    expect(validatePurchasable({ ...good, price: -1 }, "usd")).toContain("invalid_price");
    expect(validatePurchasable({ ...good, currency: "eur" }, "usd")).toContain("unsupported_currency");
  });
  it("cart eligibility: empty rejected, cross-currency rejected", () => {
    expect(isCartCheckoutEligible([]).ok).toBe(false);
    const mixed = isCartCheckoutEligible([
      { ...good, currency: "usd" },
      { ...good, productId: "p2", currency: "eur" },
    ]);
    expect(mixed.ok).toBe(false);
  });
});

describe("redaction + live gate", () => {
  it("masks email + redacts stripe id", () => {
    expect(maskEmail("alice@example.com")).toBe("a****@example.com");
    expect(maskEmail(null)).toBeNull();
    expect(redactStripeId("cs_test_1234567890abcdef")).toBe("cs_test_…");
    expect(redactStripeId(null)).toBeNull();
  });
  it("origin allow-list rejects unknown hosts", () => {
    expect(validateOrigin("https://store.example.com", { origins: ["https://store.example.com"] })).toBe("https://store.example.com");
    expect(validateOrigin("https://evil.com", { origins: ["https://store.example.com"] })).toBeNull();
    expect(validateOrigin(undefined, { origins: ["https://store.example.com"] })).toBeNull();
  });
  it("live gate: test mode allowed; live key refused until fully open", () => {
    expect(evaluateLiveGate({ liveCheckoutEnabled: false, stripeKeyIsLive: false, legalApproved: false, taxApproved: false, fulfillmentReady: false, monitoringReady: false }).allowed).toBe(true);
    const liveButNotReady = evaluateLiveGate({ liveCheckoutEnabled: false, stripeKeyIsLive: true, legalApproved: false, taxApproved: false, fulfillmentReady: false, monitoringReady: false });
    expect(liveButNotReady.allowed).toBe(false);
    expect(liveButNotReady.blockers).toContain("live_key_present");
    const fullyOpen = evaluateLiveGate({ liveCheckoutEnabled: true, stripeKeyIsLive: true, legalApproved: true, taxApproved: true, fulfillmentReady: true, monitoringReady: true });
    expect(fullyOpen.allowed).toBe(true);
  });
});

// (keep `ok` referenced for type narrowing in future tests)
void ok;
