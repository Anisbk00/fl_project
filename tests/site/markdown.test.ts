import { describe, it, expect } from "bun:test";
import { sanitizeUrl } from "@/features/catalog/markdown";

describe("sanitizeUrl (markdown link allow-list)", () => {
  it("allows http/https/mailto/relative", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
    expect(sanitizeUrl("mailto:support@example.com")).toBe("mailto:support@example.com");
    expect(sanitizeUrl("/catalog")).toBe("/catalog");
    expect(sanitizeUrl("#compatibility")).toBe("#compatibility");
  });

  it("blocks javascript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("JavaScript:alert(1)")).toBeNull();
  });

  it("blocks data: URLs", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("blocks malformed/empty input", () => {
    expect(sanitizeUrl(undefined)).toBeNull();
    expect(sanitizeUrl("")).toBeNull();
    expect(sanitizeUrl("   ")).toBeNull();
  });
});
