import { describe, it, expect } from "bun:test";
import {
  checkConcurrency,
  ConcurrencyConflictError,
} from "@/features/admin/concurrency";
import {
  isAal2,
  isAal1,
  toAdminPrincipal,
  type VerifiedClaims,
} from "@/features/admin/aal";
import { redactAuditContext, changedFields } from "@/features/admin/audit";

describe("optimistic concurrency", () => {
  it("no conflict when versions match", () => {
    expect(checkConcurrency(3, 3).conflict).toBe(false);
  });
  it("conflict when versions differ", () => {
    expect(checkConcurrency(3, 4).conflict).toBe(true);
  });
  it("throws a typed conflict error", () => {
    try {
      throw new ConcurrencyConflictError("stale", 3, 4);
    } catch (e) {
      expect(e).toBeInstanceOf(ConcurrencyConflictError);
      expect((e as ConcurrencyConflictError).code).toBe("conflict");
      expect((e as ConcurrencyConflictError).current).toBe(4);
    }
  });
});

describe("AAL claim parsing", () => {
  const aal2: VerifiedClaims = { sub: "u1", aal: "aal2" };
  const aal1: VerifiedClaims = { sub: "u1", aal: "aal1" };
  it("isAal2 true only for aal2", () => {
    expect(isAal2(aal2)).toBe(true);
    expect(isAal2(aal1)).toBe(false);
    expect(isAal2(null)).toBe(false);
  });
  it("isAal1 true only for aal1", () => {
    expect(isAal1(aal1)).toBe(true);
    expect(isAal1(aal2)).toBe(false);
  });
  it("builds an admin principal", () => {
    expect(toAdminPrincipal(aal2)).toEqual({ uid: "u1", aal2: true });
    expect(toAdminPrincipal(null)).toBeNull();
  });
});

describe("audit redaction", () => {
  it("redacts secret-ish keys recursively", () => {
    const ctx = {
      product_id: "p1",
      password: "hunter2",
      totp_secret: "ABCDEFGH",
      access_token: "x.y.z",
      nested: { api_key: "k", ok: "keep" },
      signed_url: "https://...signed...",
    };
    const out = redactAuditContext(ctx) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.totp_secret).toBe("[REDACTED]");
    expect(out.access_token).toBe("[REDACTED]");
    expect(out.signed_url).toBe("[REDACTED]");
    const nested = out.nested as Record<string, unknown>;
    expect(nested.api_key).toBe("[REDACTED]");
    expect(nested.ok).toBe("keep");
    expect(out.product_id).toBe("p1");
  });
  it("changedFields marks only changed keys + redacts secret ones", () => {
    const before = { title: "A", price: 100, password: "x" };
    const after = { title: "B", price: 100, password: "y", new_field: "z" };
    const out = changedFields(before, after);
    expect(out.title).toBe("changed");
    expect(out.price).toBeUndefined();
    expect(out.password).toBe("[REDACTED]");
    expect(out.new_field).toBe("changed");
  });
});
