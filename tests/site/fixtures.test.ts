import { describe, it, expect } from "bun:test";
import {
  listFixtureProducts,
  listFeaturedFixtureProducts,
  listFreeFixtureProducts,
} from "@/features/catalog/fixtures/products";
import {
  PRODUCT_TYPES,
  type ProductType,
} from "@/features/catalog/schema";
import type { ProductCardVM } from "@/features/catalog/view-models";

/** Known public routes that exist in Step 2 (path part, ignoring query). */
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

/** Tokens that must never appear in fixture data (no copied branding/assets). */
const BANNED_TOKENS = [
  "flpstudio",
  "splice",
  "kshmr",
  "metro boomin",
  "drake",
  "billie",
  "skrillex",
  "deadmau5",
  "martin garrix",
];

describe("fixture products (Step 2 presentation data)", () => {
  const all = listFixtureProducts();

  it("are non-empty and typed", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it("all have valid product types", () => {
    for (const p of all) {
      expect((PRODUCT_TYPES as readonly string[]).includes(p.productType)).toBe(true);
    }
  });

  it("all prices are non-negative integer minor units", () => {
    for (const p of all) {
      expect(Number.isInteger(p.price)).toBe(true);
      expect(p.price).toBeGreaterThanOrEqual(0);
      expect(/^[A-Z]{3}$/.test(p.currency)).toBe(true);
    }
  });

  it("artwork seeds are deterministic and non-empty", () => {
    const first = listFixtureProducts().map((p) => p.artworkSeed);
    const second = listFixtureProducts().map((p) => p.artworkSeed);
    for (const seed of first) {
      expect(seed.length).toBeGreaterThan(0);
    }
    expect(first).toEqual(second);
  });

  it("all hrefs resolve to a known Step 2 route path", () => {
    for (const p of all) {
      expect(KNOWN_ROUTE_PATHS.has(pathOf(p.href))).toBe(true);
    }
  });

  it("featured and free selectors are stable subsets", () => {
    const featured = listFeaturedFixtureProducts();
    const free = listFreeFixtureProducts();
    expect(featured.every((p) => p.featured === true)).toBe(true);
    expect(free.every((p) => p.free === true)).toBe(true);
    expect(featured.length).toBeLessThanOrEqual(all.length);
    expect(free.length).toBeLessThanOrEqual(all.length);
  });

  it("contain no banned brand/artist tokens", () => {
    for (const p of all) {
      const hay = (p.title + " " + (p.genres ?? []).join(" ")).toLowerCase();
      for (const token of BANNED_TOKENS) {
        expect(hay).not.toContain(token);
      }
    }
  });

  it("every card has a non-empty title", () => {
    for (const p of all) {
      expect(p.title.trim().length).toBeGreaterThan(0);
    }
  });
});

// Re-export the type so the import is used in this file's contract.
export type { ProductCardVM, ProductType };
