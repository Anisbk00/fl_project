import { describe, it, expect } from "bun:test";
import {
  serializeJsonLd,
  productJsonLd,
  breadcrumbJsonLd,
  productCanonical,
  catalogCanonical,
} from "@/features/catalog/seo";
import type { ProductDetailVM } from "@/features/catalog/view-models";

const product: ProductDetailVM = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "vector-drift",
  title: "Vector Drift",
  shortDescription: "Original project.",
  longDescription: null,
  productType: "project_file",
  price: 2400,
  currency: "USD",
  compareAtPrice: 3200,
  dawName: "FL Studio",
  dawVersion: "21",
  bpm: 126,
  musicalKey: "F# minor",
  durationSeconds: 312,
  totalSizeBytes: 58720256,
  formats: [".flp"],
  genres: [{ slug: "techno", name: "Techno" }],
  plugins: [],
  media: [],
  artworkSeed: "vector-drift",
  updatedAt: "2026-09-19T00:00:00Z",
  publishedAt: "2026-09-18T00:00:00Z",
};

describe("serializeJsonLd (escaping)", () => {
  it("escapes <, >, & to unicode so stored content cannot break out of <script>", () => {
    const out = serializeJsonLd({ name: "</script>&<b>x" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
    expect(out).toContain("\\u0026");
  });
});

describe("productJsonLd (truthful, no fake commerce)", () => {
  it("emits a Product with visible fields only", () => {
    const ld = productJsonLd(product) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBe("Vector Drift");
    expect(ld.description).toBe("Original project.");
    expect(ld.category).toBe("Project File");
  });

  it("never emits fabricated Offer/Review/AggregateRating/SKU", () => {
    const ld = productJsonLd(product) as Record<string, unknown>;
    expect(ld.offers).toBeUndefined();
    expect(ld.review).toBeUndefined();
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.sku).toBeUndefined();
    expect(ld.brand).toBeUndefined();
  });
});

describe("breadcrumbJsonLd", () => {
  it("builds a BreadcrumbList matching the visible trail", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Catalog", path: "/catalog" },
      { name: "Vector Drift", path: "/products/vector-drift" },
    ]) as Record<string, unknown>;
    expect(ld["@type"]).toBe("BreadcrumbList");
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items.length).toBe(3);
    expect(items[0]!.position).toBe(1);
    expect(items[2]!.position).toBe(3);
    expect(items[2]!.name).toBe("Vector Drift");
  });
});

describe("canonicals", () => {
  it("builds canonical product + catalog URLs from site config", () => {
    expect(productCanonical("vector-drift")).toMatch(/\/products\/vector-drift$/);
    expect(catalogCanonical()).toMatch(/\/catalog$/);
  });
});
