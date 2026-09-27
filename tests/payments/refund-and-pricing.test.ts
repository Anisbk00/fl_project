import { describe, expect, it } from "bun:test";
import { refundOutcome } from "@/features/payments/refund-policy";
import { formatPrice } from "@/components/site/price";
import { rateLimitKey, RATE_LIMITS } from "@/lib/security/rate-limit";

describe("refundOutcome", () => {
  it("keeps access when nothing was refunded (failed refund)", () => {
    expect(refundOutcome(1500, 0)).toEqual({ paymentState: "paid", access: "none" });
  });
  it("revokes on a full refund", () => {
    expect(refundOutcome(1500, 1500)).toEqual({ paymentState: "refunded", access: "revoke" });
  });
  it("treats an over-refund report as full", () => {
    expect(refundOutcome(1500, 1600).access).toBe("revoke");
  });
  it("holds (fails closed) on an ambiguous partial refund", () => {
    expect(refundOutcome(1500, 500)).toEqual({ paymentState: "partially_refunded", access: "hold" });
  });
});

describe("formatPrice currency units", () => {
  it("divides two-decimal currencies by 100", () => {
    expect(formatPrice(1500, "usd", "en-US")).toBe("$15.00");
  });
  it("does NOT divide zero-decimal currencies (display must equal the Stripe charge)", () => {
    // 1500 JPY minor units = ¥1,500 — previously rendered as ¥15.
    expect(formatPrice(1500, "jpy", "en-US")).toBe("¥1,500");
  });
});

describe("rate-limit keys", () => {
  it("never contain the raw IP", () => {
    const key = rateLimitKey(RATE_LIMITS.checkoutCreate, "203.0.113.7");
    expect(key.startsWith("checkout:create:")).toBe(true);
    expect(key).not.toContain("203.0.113.7");
  });
  it("differ per action for the same IP", () => {
    expect(rateLimitKey(RATE_LIMITS.checkoutCreate, "1.1.1.1")).not.toBe(rateLimitKey(RATE_LIMITS.downloadSign, "1.1.1.1"));
  });
});
