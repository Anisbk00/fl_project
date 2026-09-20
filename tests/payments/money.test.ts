import { describe, it, expect } from "bun:test";
import {
  isValidAmount,
  sumAmounts,
  computeSubtotal,
  reconcileTotals,
  refundableBounds,
  validateRefundAmount,
  isValidCurrency,
  MAX_AMOUNT,
} from "@/features/payments/money";

describe("money (integer minor units)", () => {
  it("validates bounded non-negative integers", () => {
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount(100)).toBe(true);
    expect(isValidAmount(MAX_AMOUNT)).toBe(true);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(1.5)).toBe(false);
    expect(isValidAmount(MAX_AMOUNT + 1)).toBe(false);
    expect(isValidAmount(NaN)).toBe(false);
  });
  it("sums without overflow", () => {
    expect(sumAmounts(100, 200, 300)).toBe(600);
    expect(() => sumAmounts(MAX_AMOUNT, MAX_AMOUNT)).toThrow(/overflow|invalid/i);
  });
  it("computes a subtotal (quantity 1 each)", () => {
    expect(computeSubtotal([100, 200, 300])).toBe(600);
  });
  it("reconciles matching totals", () => {
    const r = reconcileTotals({
      expectedSubtotal: 600, expectedCurrency: "usd",
      stripeSubtotal: 600, stripeCurrency: "usd",
      stripeTaxTotal: 50, stripeTotal: 650,
    });
    expect(r.ok).toBe(true);
  });
  it("flags currency/subtotal/total mismatches", () => {
    const r = reconcileTotals({
      expectedSubtotal: 600, expectedCurrency: "usd",
      stripeSubtotal: 700, stripeCurrency: "eur",
      stripeTaxTotal: 0, stripeTotal: 700,
    });
    expect(r.errors).toContain("currency_mismatch");
    expect(r.errors).toContain("subtotal_mismatch");
  });
  it("refund bounds prevent over-refund", () => {
    expect(refundableBounds(1000, 300).max).toBe(700);
    expect(() => refundableBounds(1000, 1001)).toThrow();
    expect(validateRefundAmount(701, 1000, 300).ok).toBe(false);
    expect(validateRefundAmount(700, 1000, 300).ok).toBe(true);
    expect(validateRefundAmount(0, 1000, 0).ok).toBe(false);
  });
  it("validates lowercase ISO currency", () => {
    expect(isValidCurrency("usd")).toBe(true);
    expect(isValidCurrency("EUR")).toBe(false); // lowercase only
    expect(isValidCurrency("us")).toBe(false);
  });
});
