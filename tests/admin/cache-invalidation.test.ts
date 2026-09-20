import { describe, it, expect } from "bun:test";
import { tagsForMutation } from "@/features/admin/cache-invalidation";

describe("cache invalidation mapping", () => {
  it("publish/unpublish/archive/published_edit invalidate product + list + free tags", () => {
    const tags = tagsForMutation({ kind: "product.publish", slug: "vector-drift" });
    expect(tags).toContain("catalog:products");
    expect(tags).toContain("catalog:product:vector-drift");
    expect(tags).toContain("catalog:free");
    expect(tags).toContain("catalog:related");
    expect(tags).toContain("catalog:featured");
  });
  it("draft-only edits do NOT invalidate public caches", () => {
    expect(tagsForMutation({ kind: "product.draft_edit" })).toEqual([]);
    expect(tagsForMutation({ kind: "product.create_draft" })).toEqual([]);
  });
  it("taxonomy change invalidates taxonomy + lists", () => {
    const tags = tagsForMutation({ kind: "taxonomy.change" });
    expect(tags).toContain("catalog:taxonomy");
    expect(tags).toContain("catalog:products");
  });
  it("unpublish touches the slug tag", () => {
    expect(
      tagsForMutation({ kind: "product.unpublish", slug: "x" }),
    ).toContain("catalog:product:x");
  });
});
