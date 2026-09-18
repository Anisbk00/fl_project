import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { db } from "@/lib/db";
import {
  listPublishedProducts,
  getPublishedProductBySlug,
  listGenres,
  listPlugins,
  listAllProductsForAdmin,
  createProduct,
  publishProduct,
  archiveProduct,
  listDeliverablesForAdmin,
} from "@/features/catalog";
import { UnauthorizedError } from "@/lib/auth";

/**
 * Database-backed access-matrix test (the SQLite/Prisma equivalent of the
 * Supabase pgTAP RLS tests in the plan).
 *
 * It exercises the REAL data-access layer against the real database and proves
 * BOTH allowed and denied behavior:
 *   - anon sees a published rights-cleared product;
 *   - anon does NOT see draft / archived / rejected / unreviewed products;
 *   - anon can NOT read private deliverables (they are never selected by public
 *     reads) nor admin-only audit columns;
 *   - an authenticated non-admin can NOT mutate catalog tables;
 *   - an allow-listed admin can perform intended CRUD;
 *   - the publication guardrail rejects an unreviewed product.
 *
 * Tests fail closed: if a public read ever returns a private field or a
 * non-public product, the test fails.
 */

const ADMIN = "admin-test-allowlisted";
const INTRUDER = "intruder-not-allowlisted";

const NOW = new Date("2026-09-18T00:00:00.000Z");

async function seed() {
  await db.adminUser.create({ data: { userId: ADMIN } });
  await db.genre.create({ data: { slug: "house", name: "House" } });
  await db.plugin.create({
    data: { slug: "serum", name: "Serum", vendor: "Xfer Records" },
  });

  // A: published + original (visible)
  const a = await db.product.create({
    data: {
      slug: "nebula-drift-original",
      title: "Nebula Drift — Original Project",
      shortDescription: "Original FL Studio project file.",
      productType: "project_file",
      lifecycle: "published",
      rightsStatus: "original",
      price: 1900,
      priceCurrency: "USD",
      bpm: 124,
      musicalKey: "A minor",
      publishedAt: NOW,
      createdById: ADMIN,
      updatedById: ADMIN,
      genres: { create: [{ genre: { connect: { slug: "house" } } }] },
      plugins: {
        create: [
          {
            plugin: { connect: { slug: "serum" } },
            minVersion: "1.3",
            required: true,
          },
        ],
      },
      media: {
        create: [
          {
            kind: "cover_image",
            bucket: "product-public",
            storageObjectPath: "product-public/nebula-drift/v1/cover.png",
            mimeType: "image/png",
            bytes: 2048,
            altText: "Nebula Drift cover art",
          },
        ],
      },
    },
  });

  // Private deliverable on A — must NEVER be readable publicly.
  await db.productDeliverable.create({
    data: {
      productId: a.id,
      bucket: "product-private",
      storageObjectPath: "product-private/nebula-drift/v1/archive.zip",
      customerFilename: "nebula-drift.zip",
      mimeType: "application/zip",
      bytes: 123456,
      version: 1,
      sha256: "a".repeat(64),
      active: true,
    },
  });

  // B: draft (hidden)
  await db.product.create({
    data: {
      slug: "draft-track",
      title: "Draft Track",
      shortDescription: "Not yet published.",
      productType: "stems",
      lifecycle: "draft",
      rightsStatus: "original",
      price: 900,
      priceCurrency: "USD",
    },
  });

  // C: archived (hidden)
  await db.product.create({
    data: {
      slug: "archived-pack",
      title: "Archived Pack",
      shortDescription: "Removed from sale.",
      productType: "sample_pack",
      lifecycle: "archived",
      rightsStatus: "licensed",
      price: 1500,
      priceCurrency: "USD",
      publishedAt: null,
    },
  });

  // D: unreviewed draft (publish should be rejected)
  await db.product.create({
    data: {
      slug: "unreviewed-draft",
      title: "Unreviewed Draft",
      shortDescription: "Awaiting rights review.",
      productType: "remake",
      lifecycle: "draft",
      rightsStatus: "unreviewed",
      price: 1900,
      priceCurrency: "USD",
    },
  });

  // E: published BUT rejected rights (must stay hidden — tests the matrix)
  await db.product.create({
    data: {
      slug: "published-but-rejected",
      title: "Should Be Hidden",
      shortDescription: "Rights rejected.",
      productType: "stems",
      lifecycle: "published",
      rightsStatus: "rejected",
      price: 1900,
      priceCurrency: "USD",
      publishedAt: NOW,
    },
  });

  // F: original draft (valid to publish later)
  await db.product.create({
    data: {
      slug: "aurora-stems",
      title: "Aurora Stems",
      shortDescription: "Original stems pack.",
      productType: "stems",
      lifecycle: "draft",
      rightsStatus: "original",
      price: 2500,
      priceCurrency: "USD",
    },
  });
}

async function cleanup() {
  // Cascade deletes handle media/deliverables/joins tied to products.
  await db.product.deleteMany({});
  await db.genre.deleteMany({});
  await db.plugin.deleteMany({});
  await db.adminUser.deleteMany({});
}

beforeEach(async () => {
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("public catalog reads (anon access matrix)", () => {
  it("lists only published + rights-cleared products", async () => {
    const list = await listPublishedProducts();
    expect(list).toHaveLength(1);
    expect(list[0]!.slug).toBe("nebula-drift-original");
  });

  it("returns a published rights-cleared product by slug", async () => {
    const product = await getPublishedProductBySlug("nebula-drift-original");
    expect(product).not.toBeNull();
    expect(product!.title).toBe("Nebula Drift — Original Project");
  });

  it("does NOT expose private deliverables on a public product", async () => {
    const product = await getPublishedProductBySlug("nebula-drift-original");
    expect(product).not.toBeNull();
    expect(product as unknown as Record<string, unknown>).not.toHaveProperty(
      "deliverables",
    );
  });

  it("does NOT expose admin-only audit columns on a public product", async () => {
    const product = await getPublishedProductBySlug("nebula-drift-original");
    expect(product as unknown as Record<string, unknown>).not.toHaveProperty(
      "createdById",
    );
    expect(product as unknown as Record<string, unknown>).not.toHaveProperty(
      "updatedById",
    );
  });

  it("returns null for a draft product", async () => {
    expect(await getPublishedProductBySlug("draft-track")).toBeNull();
  });

  it("returns null for an archived product", async () => {
    expect(await getPublishedProductBySlug("archived-pack")).toBeNull();
  });

  it("returns null for an unreviewed product even if otherwise valid", async () => {
    expect(await getPublishedProductBySlug("unreviewed-draft")).toBeNull();
  });

  it("returns null for a published-but-rejected product", async () => {
    expect(await getPublishedProductBySlug("published-but-rejected")).toBeNull();
  });

  it("exposes public taxonomy", async () => {
    const genres = await listGenres();
    const plugins = await listPlugins();
    expect(genres.map((g) => g.slug)).toContain("house");
    expect(plugins.map((p) => p.slug)).toContain("serum");
  });
});

describe("admin authorization (mutation access matrix)", () => {
  it("rejects an unauthenticated caller from listing all products", async () => {
    expect(listAllProductsForAdmin(null)).rejects.toThrow();
  });

  it("rejects a non-allowlisted caller from listing all products", async () => {
    expect(listAllProductsForAdmin(INTRUDER)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("allows an allow-listed admin to list ALL products incl. drafts", async () => {
    const all = await listAllProductsForAdmin(ADMIN);
    // 6 seeded products.
    expect(all).toHaveLength(6);
    // Admin sees the private audit columns.
    expect(all[0] as unknown as Record<string, unknown>).toHaveProperty(
      "createdById",
    );
  });

  it("rejects a non-admin from creating a product", async () => {
    expect(
      createProduct(INTRUDER, {
        slug: "should-not-exist",
        title: "x",
        shortDescription: "y",
        productType: "stems",
        price: 100,
        priceCurrency: "USD",
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a non-admin from listing private deliverables", async () => {
    const [a] = await db.product.findMany({
      where: { slug: "nebula-drift-original" },
      select: { id: true },
    });
    expect(a).toBeDefined();
    expect(listDeliverablesForAdmin(INTRUDER, a!.id)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("allows an admin to list private deliverables", async () => {
    const a = await db.product.findUnique({
      where: { slug: "nebula-drift-original" },
      select: { id: true },
    });
    const dels = await listDeliverablesForAdmin(ADMIN, a!.id);
    expect(dels).toHaveLength(1);
    expect(dels[0]!.customerFilename).toBe("nebula-drift.zip");
  });
});

describe("publication guardrail", () => {
  it("rejects publishing an unreviewed product", async () => {
    const d = await db.product.findUnique({
      where: { slug: "unreviewed-draft" },
      select: { id: true },
    });
    expect(publishProduct(ADMIN, d!.id)).rejects.toThrow();
  });

  it("publishes a rights-cleared draft and makes it public", async () => {
    const f = await db.product.findUnique({
      where: { slug: "aurora-stems" },
      select: { id: true },
    });
    // Before: hidden.
    expect(await getPublishedProductBySlug("aurora-stems")).toBeNull();
    const updated = await publishProduct(ADMIN, f!.id);
    expect(updated.lifecycle).toBe("published");
    // After: visible, and still no private deliverables.
    const now = await getPublishedProductBySlug("aurora-stems");
    expect(now).not.toBeNull();
    expect(now as unknown as Record<string, unknown>).not.toHaveProperty(
      "deliverables",
    );
  });

  it("archiving removes a product from the public catalog", async () => {
    const f = await db.product.findUnique({
      where: { slug: "aurora-stems" },
      select: { id: true },
    });
    await publishProduct(ADMIN, f!.id);
    expect((await listPublishedProducts()).length).toBe(2);
    await archiveProduct(ADMIN, f!.id);
    expect((await listPublishedProducts()).length).toBe(1);
    expect(await getPublishedProductBySlug("aurora-stems")).toBeNull();
  });
});
