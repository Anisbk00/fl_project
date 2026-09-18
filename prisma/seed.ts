import { PrismaClient } from "@prisma/client";

/**
 * Deterministic local seed.
 *
 * Fictional, original product names and generic metadata only. No famous
 * artists, song titles, album art, commercial stems, or copyrighted audio.
 * No real admin email or password. No broken media URLs.
 *
 * Run: `bun run db:seed`
 *
 * Idempotent (upsert). Safe to re-run.
 */
const db = new PrismaClient();

async function main() {
  const house = await db.genre.upsert({
    where: { slug: "house" },
    update: {},
    create: { slug: "house", name: "House" },
  });
  const techno = await db.genre.upsert({
    where: { slug: "techno" },
    update: {},
    create: { slug: "techno", name: "Techno" },
  });
  const serum = await db.plugin.upsert({
    where: { slug: "serum" },
    update: {},
    create: { slug: "serum", name: "Serum", vendor: "Xfer Records" },
  });

  // A visible, published, rights-cleared product (fictional + original).
  const nebula = await db.product.upsert({
    where: { slug: "nebula-drift-original" },
    update: {},
    create: {
      slug: "nebula-drift-original",
      title: "Nebula Drift — Original Project",
      shortDescription: "An original FL Studio project file with full arrangement.",
      longDescription:
        "Original work. All audio, MIDI, and routing are the author's own. Not affiliated with any artist or label.",
      productType: "project_file",
      lifecycle: "published",
      rightsStatus: "original",
      price: 1900,
      priceCurrency: "USD",
      dawName: "FL Studio",
      dawVersion: "21",
      bpm: 124,
      musicalKey: "A minor",
      durationSeconds: 248,
      totalSizeBytes: 52_428_800,
      includedFormats: ".flp, .zip",
      featured: true,
      seoTitle: "Nebula Drift — Original FL Studio Project",
      seoDescription:
        "Original FL Studio project file with full arrangement, stems, and routing.",
      publishedAt: new Date("2026-09-18T00:00:00.000Z"),
    },
  });
  await db.productGenre.upsert({
    where: { productId_genreId: { productId: nebula.id, genreId: house.id } },
    update: {},
    create: { productId: nebula.id, genreId: house.id },
  });
  await db.productPlugin.upsert({
    where: { productId_pluginId: { productId: nebula.id, pluginId: serum.id } },
    update: {},
    create: {
      productId: nebula.id,
      pluginId: serum.id,
      minVersion: "1.3",
      required: true,
    },
  });

  // A draft product (hidden by the access matrix).
  await db.product.upsert({
    where: { slug: "aurora-stems" },
    update: {},
    create: {
      slug: "aurora-stems",
      title: "Aurora Stems",
      shortDescription: "Original stems pack (draft).",
      productType: "stems",
      lifecycle: "draft",
      rightsStatus: "original",
      price: 2500,
      priceCurrency: "USD",
      bpm: 128,
      musicalKey: "F# minor",
    },
  });

  // A second genre reference for filter development later.
  await db.genre.upsert({
    where: { slug: "techno" },
    update: {},
    create: { slug: "techno", name: "Techno" },
  });
  // Silence the unused-var concern for `techno`/`house` lookups above.
  void techno;

  console.log("Seed complete: 2 fictional products, 2 genres, 1 plugin.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
