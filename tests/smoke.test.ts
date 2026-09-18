import { describe, it, expect } from "bun:test";
import { securityHeaders } from "@/lib/security/headers";

describe("security headers (smoke)", () => {
  it("includes the baseline protective headers", () => {
    const keys = securityHeaders.map((h) => h.key);
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Permissions-Policy");
  });

  it("sets X-Content-Type-Options to nosniff", () => {
    const h = securityHeaders.find((x) => x.key === "X-Content-Type-Options");
    expect(h?.value).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY (clickjacking defense-in-depth)", () => {
    const h = securityHeaders.find((x) => x.key === "X-Frame-Options");
    expect(h?.value).toBe("DENY");
  });

  it("does NOT ship a Content-Security-Policy yet (deferred to Step 8)", () => {
    const keys = securityHeaders.map((h) => h.key);
    expect(keys).not.toContain("Content-Security-Policy");
  });
});
