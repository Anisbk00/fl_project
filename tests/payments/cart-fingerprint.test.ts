import { describe, it, expect } from "bun:test";
import { generateCartToken, digestCartToken, cartCookieName } from "@/features/payments/cart-token";
import {
  cartFingerprint,
  consentFingerprint,
  requiresReConsent,
  type CartFingerprintInput,
} from "@/features/payments/cart-fingerprint";
import { checkoutIdempotencyKey, refundIdempotencyKey } from "@/features/payments/idempotency";

const PEPPER = "supersecretpepper123456";

describe("cart token", () => {
  it("generates 256-bit tokens", () => {
    const t = generateCartToken();
    const bytes = Buffer.from(t, "base64url");
    expect(bytes.length).toBe(32);
  });
  it("digest is stable + never equals the raw token", () => {
    const t = generateCartToken();
    const d1 = digestCartToken(t, PEPPER);
    const d2 = digestCartToken(t, PEPPER);
    expect(d1).toBe(d2);
    expect(d1).not.toBe(t);
  });
  it("digests differ across tokens", () => {
    expect(digestCartToken(generateCartToken(), PEPPER)).not.toBe(
      digestCartToken(generateCartToken(), PEPPER),
    );
  });
  it("refuses empty token / weak pepper", () => {
    expect(() => digestCartToken("", PEPPER)).toThrow();
    expect(() => digestCartToken("x", "short")).toThrow();
  });
  it("uses __Host- cookie only when secure", () => {
    expect(cartCookieName(true)).toMatch(/^__Host-/);
    expect(cartCookieName(false)).not.toMatch(/^__Host-/);
  });
});

const baseItems: CartFingerprintInput = {
  items: [
    { productId: "p1", productRowVersion: 1, slug: "a", unitAmount: 100, currency: "usd", deliverableAssetId: "d1", licenseVersion: "v1", taxCode: null },
    { productId: "p2", productRowVersion: 1, slug: "b", unitAmount: 200, currency: "usd", deliverableAssetId: "d2", licenseVersion: "v1", taxCode: null },
  ],
  currency: "usd",
  policyVersion: "pv1",
};

describe("cart fingerprint", () => {
  it("is deterministic regardless of item order", () => {
    const a = cartFingerprint(baseItems);
    const reversed: CartFingerprintInput = { ...baseItems, items: [...baseItems.items].reverse() };
    expect(cartFingerprint(reversed)).toBe(a);
  });
  it("changes when price changes", () => {
    const fp1 = cartFingerprint(baseItems);
    const changed = cartFingerprint({
      ...baseItems,
      items: [{ ...baseItems.items[0]!, unitAmount: 101 }, baseItems.items[1]!],
    });
    expect(changed).not.toBe(fp1);
  });
  it("changes when product row version changes", () => {
    const fp1 = cartFingerprint(baseItems);
    const changed = cartFingerprint({
      ...baseItems,
      items: [{ ...baseItems.items[0]!, productRowVersion: 2 }, baseItems.items[1]!],
    });
    expect(changed).not.toBe(fp1);
  });
  it("changes when deliverable asset version changes", () => {
    const fp1 = cartFingerprint(baseItems);
    const changed = cartFingerprint({
      ...baseItems,
      items: [{ ...baseItems.items[0]!, deliverableAssetId: "d1_v2" }, baseItems.items[1]!],
    });
    expect(changed).not.toBe(fp1);
  });
  it("changes when policy version changes", () => {
    const fp1 = cartFingerprint(baseItems);
    const changed = cartFingerprint({ ...baseItems, policyVersion: "pv2" });
    expect(changed).not.toBe(fp1);
  });
});

describe("consent", () => {
  it("requires re-consent when the cart fingerprint changes", () => {
    const fp = cartFingerprint(baseItems);
    const c1 = consentFingerprint(fp, "pv1");
    expect(requiresReConsent(null, fp, "pv1")).toBe(true);
    expect(requiresReConsent(c1, fp, "pv1")).toBe(false);
    const fp2 = cartFingerprint({ ...baseItems, policyVersion: "pv2" });
    expect(requiresReConsent(c1, fp2, "pv1")).toBe(true);
    expect(requiresReConsent(c1, fp, "pv2")).toBe(true);
  });
});

describe("idempotency keys", () => {
  it("are stable + non-PII", () => {
    expect(checkoutIdempotencyKey("att_123")).toBe("checkout_att_123");
    expect(refundIdempotencyKey("rreq_456")).toBe("refund_rreq_456");
    expect(() => checkoutIdempotencyKey("")).toThrow();
  });
});
