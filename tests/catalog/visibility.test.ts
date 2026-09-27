import { describe, it, expect } from "bun:test";
import { isPubliclyVisible, filterPublic } from "@/features/catalog/visibility";

describe("isPubliclyVisible", () => {
  it("is true only for published", () => {
    expect(isPubliclyVisible({ lifecycle: "published" })).toBe(true);
  });

  it("is false for drafts", () => {
    expect(isPubliclyVisible({ lifecycle: "draft" })).toBe(false);
  });

  it("is false for archived", () => {
    expect(isPubliclyVisible({ lifecycle: "archived" })).toBe(false);
  });
});

describe("filterPublic", () => {
  const products = [
    { id: "1", lifecycle: "published" },
    { id: "2", lifecycle: "draft" },
    { id: "3", lifecycle: "archived" },
    { id: "4", lifecycle: "published" },
  ];

  it("returns only published products", () => {
    const visible = filterPublic(products);
    expect(visible.map((p) => p.id).sort()).toEqual(["1", "4"]);
  });

  it("returns an empty array when nothing qualifies", () => {
    expect(filterPublic([])).toEqual([]);
  });
});
