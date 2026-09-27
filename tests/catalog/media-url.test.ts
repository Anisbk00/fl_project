import { describe, it, expect } from "bun:test";
import { publicObjectPath, mediaSrc } from "@/features/catalog/seo";

describe("publicObjectPath", () => {
  it("adds the bucket to admin-uploaded paths", () => {
    expect(publicObjectPath("products/p1/cover_image-x.png")).toBe("product-public/products/p1/cover_image-x.png");
  });

  it("keeps seed paths that already include the bucket", () => {
    expect(publicObjectPath("/product-public/slug/v1/cover.svg")).toBe("product-public/slug/v1/cover.svg");
  });
});

describe("mediaSrc", () => {
  it("prefers an external URL", () => {
    expect(mediaSrc({ externalUrl: "https://cdn.example/v.mp4", storageObjectPath: "products/p1/a.mp4" })).toBe(
      "https://cdn.example/v.mp4",
    );
  });
});
