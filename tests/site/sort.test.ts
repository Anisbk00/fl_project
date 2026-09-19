import { describe, it, expect } from "bun:test";
import { isValidSortKey, resolveSortKey, SORT_OPTIONS } from "@/features/catalog/sort";

describe("sort allow-list", () => {
  it("accepts known sort keys only", () => {
    expect(isValidSortKey("newest")).toBe(true);
    expect(isValidSortKey("relevance")).toBe(true);
    expect(isValidSortKey("price_asc")).toBe(true);
    expect(isValidSortKey("price_desc")).toBe(true);
    expect(isValidSortKey("title")).toBe(true);
    expect(isValidSortKey("evil")).toBe(false);
    expect(isValidSortKey("; DROP TABLE")).toBe(false);
    expect(isValidSortKey(undefined)).toBe(false);
    expect(isValidSortKey(123)).toBe(false);
  });

  it("resolves a default sort based on whether a query exists", () => {
    expect(resolveSortKey("price_asc", false)).toBe("price_asc");
    expect(resolveSortKey(undefined, false)).toBe("newest");
    expect(resolveSortKey(undefined, true)).toBe("relevance");
    expect(resolveSortKey("evil", true)).toBe("relevance");
    expect(resolveSortKey("evil", false)).toBe("newest");
  });

  it("exposes a stable SORT_OPTIONS list", () => {
    const values = SORT_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["newest", "relevance", "price_asc", "price_desc", "title"]);
    expect(SORT_OPTIONS.length).toBe(5);
  });
});
