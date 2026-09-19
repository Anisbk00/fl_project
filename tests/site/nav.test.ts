import { describe, it, expect } from "bun:test";
import { primaryNav, footerNav } from "@/components/site/nav";

const KNOWN_ROUTE_PATHS = new Set<string>([
  "/",
  "/catalog",
  "/free",
  "/cart",
  "/about",
  "/faq",
  "/contact",
  "/legal/license",
  "/legal/refunds",
  "/legal/privacy",
  "/legal/terms",
]);

function pathOf(href: string): string {
  return href.split("?")[0]!;
}

describe("header navigation", () => {
  it("every primary nav link is internal and resolves to a known route", () => {
    for (const item of primaryNav) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(KNOWN_ROUTE_PATHS.has(pathOf(item.href))).toBe(true);
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("includes the required destinations", () => {
    const labels = primaryNav.map((i) => i.label);
    expect(labels).toContain("Catalog");
    expect(labels).toContain("Project Files");
    expect(labels).toContain("Stems");
    expect(labels).toContain("Sample Packs");
    expect(labels).toContain("Free");
    expect(labels).toContain("About");
  });

  it("does NOT include a customer sign-in or account link", () => {
    const labels = primaryNav.map((i) => i.label.toLowerCase());
    expect(labels).not.toContain("sign in");
    expect(labels).not.toContain("login");
    expect(labels).not.toContain("account");
    expect(labels).not.toContain("admin");
  });
});

describe("footer navigation", () => {
  it("every footer link is internal and resolves to a known route", () => {
    for (const col of footerNav) {
      for (const item of col.items) {
        expect(item.href.startsWith("/")).toBe(true);
        expect(KNOWN_ROUTE_PATHS.has(pathOf(item.href))).toBe(true);
      }
    }
  });

  it("includes the legal draft routes", () => {
    const hrefs = footerNav.flatMap((c) => c.items.map((i) => pathOf(i.href)));
    expect(hrefs).toContain("/legal/license");
    expect(hrefs).toContain("/legal/refunds");
    expect(hrefs).toContain("/legal/privacy");
    expect(hrefs).toContain("/legal/terms");
  });
});
