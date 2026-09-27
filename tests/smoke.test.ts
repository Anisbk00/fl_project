import { describe, it, expect } from "bun:test";
import { noStoreHeaders, PRIVATE_ROUTE_SOURCES, securityHeaders } from "@/lib/security/headers";

const prod = securityHeaders({ supabaseUrl: "https://abc.supabase.co", dev: false });
const dev = securityHeaders({ supabaseUrl: "", dev: true });
const value = (list: { key: string; value: string }[], key: string) => list.find((h) => h.key === key)?.value;

describe("security headers", () => {
  it("ships the baseline protective headers", () => {
    expect(value(prod, "X-Content-Type-Options")).toBe("nosniff");
    expect(value(prod, "X-Frame-Options")).toBe("DENY");
    expect(value(prod, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value(prod, "Content-Security-Policy")).toBeDefined();
  });

  it("sends HSTS in production only (never over local http)", () => {
    expect(value(prod, "Strict-Transport-Security")).toContain("max-age=63072000");
    expect(value(dev, "Strict-Transport-Security")).toBeUndefined();
  });

  it("marks every private area no-store", () => {
    expect(PRIVATE_ROUTE_SOURCES).toContain("/downloads");
    expect(PRIVATE_ROUTE_SOURCES).toContain("/api/:path*");
    expect(PRIVATE_ROUTE_SOURCES.some((s) => s.startsWith("/control-"))).toBe(true);
    expect(value(noStoreHeaders, "Cache-Control")).toContain("no-store");
  });
});
