import type { ProductCardVM } from "../view-models";

/**
 * ============================================================================
 * FICTIONAL PRESENTATION FIXTURES — NON-PRODUCTION DATA.
 * ----------------------------------------------------------------------------
 * These exist ONLY so the Step 2 layouts can be judged before the live catalog
 * is wired (Step 3). They are:
 *   - fictional product titles (no real artists, songs, labels, or likenesses);
 *   - backed by original, locally authored abstract artwork (no copied covers);
 *   - never inserted into Supabase and never modify the production schema;
 *   - deterministic so screenshots and tests are stable.
 *
 * Step 3 replaces `listFixtureProducts()` and `listFeaturedFixtureProducts()`
 * with mapped Supabase data implementing the same `ProductCardVM` interface.
 * ============================================================================
 */

const PRODUCTS: readonly ProductCardVM[] = [
  {
    slug: "vector-drift",
    title: "Vector Drift",
    productType: "project_file",
    price: 2400,
    currency: "USD",
    compareAtPrice: 3200,
    bpm: 126,
    musicalKey: "F# minor",
    dawName: "FL Studio",
    dawVersion: "21",
    durationSeconds: 312,
    totalSizeBytes: 58_720_256,
    formats: [".flp", ".zip", "stems"],
    genres: ["Techno", "Melodic"],
    plugins: [
      { name: "Serum", minVersion: "1.3", required: true },
      { name: "Valhalla VintageVerb", required: false },
    ],
    featured: true,
    artworkSeed: "vector-drift",
    href: "/catalog",
  },
  {
    slug: "tape-hiss-studies",
    title: "Tape Hiss Studies",
    productType: "sample_pack",
    price: 1900,
    currency: "USD",
    bpm: 90,
    musicalKey: "A minor",
    durationSeconds: 0,
    totalSizeBytes: 312_412_160,
    formats: ["24-bit WAV", "128 one-shots", "32 loops"],
    genres: ["Lo-fi", "Ambient"],
    featured: true,
    artworkSeed: "tape-hiss",
    href: "/catalog",
  },
  {
    slug: "perimeter",
    title: "Perimeter",
    productType: "stems",
    price: 1500,
    currency: "EUR",
    bpm: 174,
    musicalKey: "G minor",
    dawName: "Ableton Live",
    dawVersion: "12",
    durationSeconds: 268,
    totalSizeBytes: 412_877_312,
    formats: ["stems", "mixdown"],
    genres: ["Drum & Bass"],
    plugins: [{ name: "FabFilter Pro-Q 3", required: false }],
    featured: true,
    artworkSeed: "perimeter",
    href: "/catalog",
  },
  {
    slug: "cold-bloom",
    title: "Cold Bloom",
    productType: "remake",
    price: 2200,
    currency: "USD",
    bpm: 140,
    musicalKey: "C# minor",
    dawName: "FL Studio",
    dawVersion: "21",
    durationSeconds: 205,
    totalSizeBytes: 61_234_432,
    formats: [".flp", "educational notes"],
    genres: ["Trap", "Hybrid"],
    plugins: [
      { name: "Serum", minVersion: "1.3", required: true },
      { name: "Omnisphere", required: false },
    ],
    featured: false,
    artworkSeed: "cold-bloom",
    href: "/catalog",
  },
  {
    slug: "granite-room",
    title: "Granite Room",
    productType: "project_file",
    price: 2800,
    currency: "USD",
    bpm: 124,
    musicalKey: "D minor",
    dawName: "Ableton Live",
    dawVersion: "12",
    durationSeconds: 358,
    totalSizeBytes: 88_120_128,
    formats: [".als", ".zip", "stems"],
    genres: ["Deep House"],
    plugins: [
      { name: "Diva", minVersion: "1.4", required: true },
      { name: "Pro-R", required: false },
    ],
    featured: true,
    artworkSeed: "granite-room",
    href: "/catalog",
  },
  {
    slug: "half-light",
    title: "Half-Light",
    productType: "stems",
    price: 1200,
    currency: "EUR",
    bpm: 110,
    musicalKey: "E minor",
    durationSeconds: 240,
    totalSizeBytes: 220_300_800,
    formats: ["stems", "mixdown"],
    genres: ["Ambient", "Cinematic"],
    featured: false,
    artworkSeed: "half-light",
    href: "/catalog",
  },
  {
    slug: "ferrite",
    title: "Ferrite",
    productType: "sample_pack",
    price: 0,
    currency: "USD",
    bpm: 128,
    musicalKey: "A minor",
    totalSizeBytes: 96_420_352,
    formats: ["24-bit WAV", "60 one-shots"],
    genres: ["Techno"],
    free: true,
    featured: false,
    artworkSeed: "ferrite",
    href: "/catalog",
  },
  {
    slug: "magnet",
    title: "Magnet",
    productType: "sample_pack",
    price: 0,
    currency: "USD",
    bpm: 140,
    musicalKey: "F minor",
    totalSizeBytes: 71_120_128,
    formats: ["24-bit WAV", "40 one-shots", "12 loops"],
    genres: ["Trap", "Hip-Hop"],
    free: true,
    featured: false,
    artworkSeed: "magnet",
    href: "/catalog",
  },
] as const;

export function listFixtureProducts(): readonly ProductCardVM[] {
  return PRODUCTS;
}

export function listFeaturedFixtureProducts(
  limit = 6,
): readonly ProductCardVM[] {
  return PRODUCTS.filter((p) => p.featured).slice(0, limit);
}

export function listFreeFixtureProducts(): readonly ProductCardVM[] {
  return PRODUCTS.filter((p) => p.free);
}

export function listProductsByType(
  type: ProductCardVM["productType"],
): readonly ProductCardVM[] {
  return PRODUCTS.filter((p) => p.productType === type);
}
