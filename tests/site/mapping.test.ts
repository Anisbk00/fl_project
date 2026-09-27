import { describe, it, expect } from "bun:test";
import { mapCard, mapDetail } from "@/features/catalog/repository";
import type { CardRow, DetailRow } from "@/features/catalog/repository";

const cardRow: CardRow = {
  id: "p1",
  slug: "vector-drift",
  title: "Vector Drift",
  short_description: "Original project.",
  product_type: "project_file",
  price: 2400,
  price_currency: "USD",
  compare_at_price: 3200,
  daw_name: "FL Studio",
  daw_version: "21",
  bpm: 126,
  musical_key: "F# minor",
  duration_seconds: 312,
  total_size_bytes: 58720256,
  included_formats: ".flp, .zip, stems",
  featured: true,
  published_at: "2026-09-18T00:00:00Z",
  genres: [{ slug: "techno", name: "Techno" }],
  plugins: [
    { slug: "serum", name: "Serum", vendor: "Xfer", min_version: "1.3", required: true },
  ],
  cover_path: "product-public/vector-drift/v1/cover.svg",
  audio_preview_path: "product-public/vector-drift/v1/preview.mp3",
};

const detailRow: DetailRow = {
  ...cardRow,
  lifecycle: "published",
  long_description: "## Inside\nFull session.",
  seo_title: "Vector Drift — FL Studio Project",
  seo_description: "Original FL Studio project.",
  created_at: "2026-09-18T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
  media: [
    {
      id: "m1",
      kind: "cover_image",
      bucket: "product-public",
      storage_object_path: "product-public/vector-drift/v1/cover.svg",
      external_url: null,
      mime_type: "image/svg+xml",
      bytes: 2048,
      alt_text: "Vector Drift cover",
      created_at: "2026-09-18T00:00:00Z",
    },
    {
      id: "m2",
      kind: "audio_preview",
      bucket: "product-public",
      storage_object_path: "product-public/vector-drift/v1/preview.mp3",
      external_url: null,
      mime_type: "audio/mpeg",
      bytes: 8192,
      alt_text: "Short preview",
      created_at: "2026-09-18T00:00:00Z",
    },
  ],
};

describe("mapCard (row → view model)", () => {
  const vm = mapCard(cardRow);

  it("maps core fields", () => {
    expect(vm.slug).toBe("vector-drift");
    expect(vm.title).toBe("Vector Drift");
    expect(vm.productType).toBe("project_file");
    expect(vm.price).toBe(2400);
    expect(vm.currency).toBe("USD");
    expect(vm.compareAtPrice).toBe(3200);
    expect(vm.dawName).toBe("FL Studio");
    expect(vm.dawVersion).toBe("21");
    expect(vm.bpm).toBe(126);
    expect(vm.musicalKey).toBe("F# minor");
    expect(vm.formats).toEqual([".flp", ".zip", "stems"]);
  });

  it("maps href to the live detail route", () => {
    expect(vm.href).toBe("/products/vector-drift");
  });

  it("maps genres to names (not slug objects) for cards", () => {
    expect(vm.genres).toEqual(["Techno"]);
  });

  it("marks free when price is 0", () => {
    expect(vm.free).toBe(false);
    const free = mapCard({ ...cardRow, price: 0 });
    expect(free.free).toBe(true);
  });

  it("carries public cover/audio paths", () => {
    expect(vm.coverPath).toBe(cardRow.cover_path);
    expect(vm.audioPreviewPath).toBe(cardRow.audio_preview_path);
  });

  it("does NOT include forbidden fields", () => {
    const keys = Object.keys(vm) as (keyof typeof vm)[];
    expect(keys).not.toContain("createdById");
    expect(keys).not.toContain("updatedById");
    expect(keys).not.toContain("deliverables");
    expect(keys).not.toContain("searchVector");
    // No private bucket path leaks (cover/audio are public-bucket paths only).
    expect(JSON.stringify(vm)).not.toContain("product-private");
  });
});

describe("mapDetail (row → detail view model)", () => {
  const vm = mapDetail(detailRow);

  it("maps long-form description through unchanged", () => {
    expect(vm.longDescription).toBe(detailRow.long_description);
  });

  it("extracts cover + audio from media", () => {
    expect(vm.coverPath).toBe(detailRow.media[0]!.storage_object_path);
    expect(vm.audioPreviewPath).toBe(detailRow.media[1]!.storage_object_path);
  });

  it("maps genres with slugs (for linked taxonomy)", () => {
    expect(vm.genres).toEqual([{ slug: "techno", name: "Techno" }]);
  });

  it("maps plugins with vendor + min_version + required", () => {
    expect(vm.plugins[0]).toEqual({
      slug: "serum",
      name: "Serum",
      vendor: "Xfer",
      minVersion: "1.3",
      required: true,
    });
  });

  it("does NOT include forbidden fields", () => {
    const keys = Object.keys(vm) as (keyof typeof vm)[];
    expect(keys).not.toContain("createdById");
    expect(keys).not.toContain("updatedById");
    expect(JSON.stringify(vm)).not.toContain("product-private");
  });
});
