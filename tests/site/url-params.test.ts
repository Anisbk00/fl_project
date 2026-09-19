import { describe, it, expect } from "bun:test";
import {
  parseCatalogParams,
  serializeCatalogParams,
  withParam,
  withPage,
  normalizeMulti,
  toRpcParams,
  hasActiveFilters,
  PAGE_SIZE,
  type CatalogParams,
} from "@/features/catalog/url-params";

const baseParams: CatalogParams = {
  q: "",
  types: [],
  genres: [],
  daw: "",
  plugins: [],
  pluginFree: false,
  bpmMin: undefined,
  bpmMax: undefined,
  key: "",
  priceMin: undefined,
  priceMax: undefined,
  currency: undefined,
  sort: "newest",
  page: 1,
};

describe("parseCatalogParams", () => {
  it("applies defaults for empty input", () => {
    const r = parseCatalogParams({});
    expect(r.params).not.toBeNull();
    expect(r.params!.q).toBe("");
    expect(r.params!.types).toEqual([]);
    expect(r.params!.sort).toBe("newest");
    expect(r.params!.page).toBe(1);
  });

  it("parses multi-select from arrays", () => {
    const r = parseCatalogParams({ type: ["stems", "project_file"] });
    expect(r.params!.types).toEqual(["stems", "project_file"]);
  });

  it("coerces numeric fields", () => {
    const r = parseCatalogParams({ bpmMin: "120", bpmMax: "140", page: "3" });
    expect(r.params!.bpmMin).toBe(120);
    expect(r.params!.bpmMax).toBe(140);
    expect(r.params!.page).toBe(3);
  });

  it("strips empty scalars (GET form unfilled inputs)", () => {
    const r = parseCatalogParams({ q: "", bpmMin: "", daw: "" });
    expect(r.params!.q).toBe("");
    expect(r.params!.bpmMin).toBeUndefined();
    expect(r.params!.daw).toBe("");
  });

  it("treats malformed page as a recoverable error (no crash)", () => {
    const r = parseCatalogParams({ page: "abc" });
    expect(r.params).toBeNull();
    expect(typeof r.error).toBe("string");
  });

  it("rejects an unknown sort key by falling back to newest", () => {
    const r = parseCatalogParams({ sort: "evil; DROP TABLE" });
    expect(r.params!.sort).toBe("newest");
  });

  it("validates product type allow-list", () => {
    const r = parseCatalogParams({ type: ["stems", "nuclear", "project_file"] });
    expect(r.params!.types).toEqual(["stems", "project_file"]);
  });

  it("rejects bpmMin > bpmMax", () => {
    const r = parseCatalogParams({ bpmMin: "200", bpmMax: "100" });
    expect(r.params).toBeNull();
  });
});

describe("serializeCatalogParams (canonical)", () => {
  it("is empty for defaults", () => {
    expect(serializeCatalogParams(baseParams)).toBe("");
  });

  it("produces a stable, sorted, default-stripped string", () => {
    const params = { ...baseParams, q: "drift", types: ["stems", "techno"], page: 2, sort: "price_asc" };
    const out = serializeCatalogParams(params);
    // Sorted keys, no page=1 default dropped (page=2 kept), sort kept.
    expect(out.startsWith("?")).toBe(true);
    expect(out).toContain("q=drift");
    expect(out).toContain("type=stems");
    expect(out).toContain("type=techno");
    expect(out).toContain("page=2");
    expect(out).toContain("sort=price_asc");
  });

  it("round-trips parse(serialize(parse(x)))", () => {
    const original = parseCatalogParams({
      q: "vector", type: ["stems"], genre: ["techno"], sort: "title", page: "2",
    }).params!;
    const serialized = serializeCatalogParams(original);
    const reparsed = parseCatalogParams(
      Object.fromEntries(new URLSearchParams(serialized.slice(1)).entries()),
    ).params!;
    expect(reparsed.q).toBe(original.q);
    expect(reparsed.types).toEqual(original.types);
    expect(reparsed.genres).toEqual(original.genres);
    expect(reparsed.sort).toBe(original.sort);
    expect(reparsed.page).toBe(original.page);
  });
});

describe("withParam / withPage", () => {
  it("resets page to 1 when a filter changes", () => {
    const params = { ...baseParams, page: 5, q: "drift" };
    const href = withParam(params, { types: ["stems"], resetPage: true });
    expect(href).not.toContain("page=");
  });

  it("keeps filters + sort when changing page", () => {
    const params = { ...baseParams, q: "drift", sort: "title", page: 1 };
    const href = withPage(params, 3);
    expect(href).toContain("q=drift");
    expect(href).toContain("sort=title");
    expect(href).toContain("page=3");
  });
});

describe("normalizeMulti", () => {
  it("dedupes, lowercases, trims, and sorts", () => {
    expect(normalizeMulti(["Stems", " stems ", "techno", "Techno"])).toEqual([
      "stems",
      "techno",
    ]);
  });
});

describe("toRpcParams (currency rule)", () => {
  it("applies price filters only with a selected currency", () => {
    const withCurrency = toRpcParams({ ...baseParams, priceMin: 100, priceMax: 500, currency: "USD" });
    expect(withCurrency.p_price_min).toBe(100);
    expect(withCurrency.p_price_max).toBe(500);
    expect(withCurrency.p_price_currency).toBe("USD");

    const noCurrency = toRpcParams({ ...baseParams, priceMin: 100, priceMax: 500 });
    expect(noCurrency.p_price_min).toBeUndefined();
    expect(noCurrency.p_price_max).toBeUndefined();
    expect(noCurrency.p_price_currency).toBe("");
  });

  it("uses a fixed page size", () => {
    expect(toRpcParams(baseParams).p_page_size).toBe(PAGE_SIZE);
  });
});

describe("hasActiveFilters", () => {
  it("is false for defaults and true for any filter", () => {
    expect(hasActiveFilters(baseParams)).toBe(false);
    expect(hasActiveFilters({ ...baseParams, q: "x" })).toBe(true);
    expect(hasActiveFilters({ ...baseParams, types: ["stems"] })).toBe(true);
    expect(hasActiveFilters({ ...baseParams, pluginFree: true })).toBe(true);
  });
});
