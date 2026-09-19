import { describe, it, expect } from "bun:test";
import { isPubliclyVisible, filterPublic } from "@/features/catalog/visibility";

const base = {
  rightsStatus: "original",
};

describe("isPubliclyVisible", () => {
  it("is true only for published + rights-cleared", () => {
    expect(isPubliclyVisible({ ...base, lifecycle: "published" })).toBe(true);
  });

  it("is false for drafts", () => {
    expect(isPubliclyVisible({ ...base, lifecycle: "draft" })).toBe(false);
  });

  it("is false for archived even if rights-cleared", () => {
    expect(isPubliclyVisible({ ...base, lifecycle: "archived" })).toBe(false);
  });

  it("is false for unreviewed even if published", () => {
    expect(
      isPubliclyVisible({ lifecycle: "published", rightsStatus: "unreviewed" }),
    ).toBe(false);
  });

  it("is false for rejected even if published", () => {
    expect(
      isPubliclyVisible({ lifecycle: "published", rightsStatus: "rejected" }),
    ).toBe(false);
  });

  it("is false for licensed-unpublished (rights cleared but not published)", () => {
    expect(
      isPubliclyVisible({ lifecycle: "draft", rightsStatus: "licensed" }),
    ).toBe(false);
  });
});

describe("filterPublic", () => {
  const products = [
    { id: "1", lifecycle: "published", rightsStatus: "original" },
    { id: "2", lifecycle: "draft", rightsStatus: "original" },
    { id: "3", lifecycle: "archived", rightsStatus: "licensed" },
    { id: "4", lifecycle: "published", rightsStatus: "unreviewed" },
    { id: "5", lifecycle: "published", rightsStatus: "rejected" },
    { id: "6", lifecycle: "published", rightsStatus: "licensed" },
  ];

  it("returns only published + rights-cleared products", () => {
    const visible = filterPublic(products);
    expect(visible).toHaveLength(2);
    expect(visible.map((p) => p.id).sort()).toEqual(["1", "6"]);
  });

  it("returns an empty array when nothing qualifies", () => {
    expect(filterPublic([])).toEqual([]);
  });
});
