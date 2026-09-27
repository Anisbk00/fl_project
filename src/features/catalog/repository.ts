import "server-only";
import { unstable_cache } from "next/cache";
import { getPublishableClient } from "@/lib/supabase/publishable";
import { publicEnv } from "@/lib/env/public";
import {
  PRODUCT_TYPE_LABELS,
  type ProductCardVM,
  type ProductDetailVM,
  type ProductMediaVM,
  type ProductTypeVM,
} from "./view-models";
import {
  PAGE_SIZE,
  toRpcParams,
  type CatalogParams,
  type CatalogRpcParams,
} from "./url-params";
import { listGenres as listGenresRaw, listPlugins as listPluginsRaw } from "./data-access";

/**
 * ============================================================================
 * CATALOG REPOSITORY (Step 3) — server-only public catalog data layer.
 * ============================================================================
 *
 * The ONLY sanctioned path storefront pages use to read catalog data. It uses
 * the publishable Supabase client so RLS is exercised on every read; it NEVER
 * uses the secret key. It calls the Step 3 SECURITY INVOKER RPCs
 * (`search_products`, `get_product_by_slug`, `get_related_products`,
 * `list_free_products`) which return ONLY public columns + aggregated public
 * taxonomy/media — never deliverable paths, admin audit columns, or admin
 * identities.
 *
 * Row → view-model mapping happens at this single boundary. The narrow DTOs
 * cannot carry forbidden fields by construction.
 *
 * Caching: stable reads (single product, taxonomy, free/featured lists) are
 * cached with stable tags so Step 4 publishing can invalidate precisely. Search
 * is NOT cached to avoid unbounded cache cardinality across filter
 * combinations (documented in docs/CATALOG_AND_SEARCH.md). The Step 4
 * invalidation contract is documented but not implemented here.
 *
 * Graceful unconfigured handling: if Supabase is not linked in this
 * environment, every function throws `CatalogUnavailableError`. Pages detect
 * `isCatalogReady()` first and render an honest state — never a fixture
 * fallback, never a crash.
 * ============================================================================
 */

export class CatalogUnavailableError extends Error {}

/** True when the publishable Supabase client can be constructed. */
export function isCatalogReady(): boolean {
  return (
    !!publicEnv.NEXT_PUBLIC_SUPABASE_URL &&
    !!publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

function client() {
  try {
    return getPublishableClient();
  } catch {
    throw new CatalogUnavailableError(
      "Catalog is unavailable — Supabase is not linked in this environment.",
    );
  }
}

// ---------------------------------------------------------------------------
// Raw row shapes (match the SECURITY INVOKER function return columns exactly).
// These are the ONLY fields the functions return — no deliverable paths, no
// admin audit columns. Mapping strips to stable view models.
// ---------------------------------------------------------------------------

export interface GenreRow {
  slug: string;
  name: string;
}
export interface PluginRow {
  slug: string;
  name: string;
  vendor: string | null;
  min_version: string | null;
  required: boolean;
}
export interface MediaRow {
  id: string;
  kind: string;
  bucket: string;
  storage_object_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  bytes: number | null;
  alt_text: string | null;
  created_at: string;
}
export interface SearchRow {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  long_description: string | null;
  product_type: ProductTypeVM;
  lifecycle: string;
  price: number;
  price_currency: string;
  compare_at_price: number | null;
  daw_name: string | null;
  daw_version: string | null;
  bpm: number | null;
  musical_key: string | null;
  duration_seconds: number | null;
  total_size_bytes: number | null;
  included_formats: string | null;
  featured: boolean;
  published_at: string | null;
  genres: GenreRow[];
  plugins: PluginRow[];
  cover_path: string | null;
  audio_preview_path: string | null;
  total_count: number;
}
export interface DetailRow extends Omit<SearchRow, "total_count"> {
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  media: MediaRow[];
}
export interface CardRow {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  product_type: ProductTypeVM;
  price: number;
  price_currency: string;
  compare_at_price: number | null;
  daw_name: string | null;
  daw_version: string | null;
  bpm: number | null;
  musical_key: string | null;
  duration_seconds: number | null;
  total_size_bytes: number | null;
  included_formats: string | null;
  featured: boolean;
  published_at: string | null;
  genres: GenreRow[];
  plugins: PluginRow[];
  cover_path: string | null;
  audio_preview_path: string | null;
}

// ---------------------------------------------------------------------------
// Mapping (row → view model). Forbidden fields cannot appear here.
// Exported for unit tests that assert the absence of forbidden fields.
// ---------------------------------------------------------------------------

export function parseFormats(included: string | null): string[] | undefined {
  if (!included) return undefined;
  return included
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mapCard(row: CardRow): ProductCardVM {
  return {
    slug: row.slug,
    title: row.title,
    productType: row.product_type,
    price: row.price,
    currency: row.price_currency,
    compareAtPrice: row.compare_at_price ?? undefined,
    bpm: row.bpm ?? undefined,
    musicalKey: row.musical_key ?? undefined,
    dawName: row.daw_name ?? undefined,
    dawVersion: row.daw_version ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    totalSizeBytes: row.total_size_bytes ?? undefined,
    formats: parseFormats(row.included_formats),
    genres: (row.genres ?? []).map((g) => g.name),
    plugins: (row.plugins ?? []).map((p) => ({
      name: p.name,
      minVersion: p.min_version ?? undefined,
      required: p.required,
    })),
    featured: row.featured,
    free: row.price === 0,
    artworkSeed: row.slug,
    href: `/products/${encodeURIComponent(row.slug)}`,
    coverPath: row.cover_path ?? undefined,
    audioPreviewPath: row.audio_preview_path ?? undefined,
    publishedAt: row.published_at,
  };
}

export function mapDetail(row: DetailRow): ProductDetailVM {
  const media: ProductMediaVM[] = (row.media ?? []).map((m) => ({
    id: m.id,
    kind: m.kind as ProductMediaVM["kind"],
    bucket: m.bucket,
    storageObjectPath: m.storage_object_path,
    externalUrl: m.external_url,
    mimeType: m.mime_type,
    bytes: m.bytes,
    altText: m.alt_text,
    createdAt: m.created_at,
  }));
  const cover = media.find((m) => m.kind === "cover_image");
  const audio = media.find((m) => m.kind === "audio_preview");
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    productType: row.product_type,
    price: row.price,
    currency: row.price_currency,
    compareAtPrice: row.compare_at_price ?? undefined,
    bpm: row.bpm ?? undefined,
    musicalKey: row.musical_key ?? undefined,
    dawName: row.daw_name ?? undefined,
    dawVersion: row.daw_version ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    totalSizeBytes: row.total_size_bytes ?? undefined,
    formats: parseFormats(row.included_formats),
    genres: (row.genres ?? []).map((g) => ({ slug: g.slug, name: g.name })),
    plugins: (row.plugins ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      vendor: p.vendor,
      minVersion: p.min_version,
      required: p.required,
    })),
    media,
    featured: row.featured,
    free: row.price === 0,
    artworkSeed: row.slug,
    coverPath: cover?.storageObjectPath ?? undefined,
    audioPreviewPath: audio?.storageObjectPath ?? undefined,
    seoTitle: row.seo_title ?? undefined,
    seoDescription: row.seo_description ?? undefined,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

// ---------------------------------------------------------------------------
// Cached stable reads. Tags: catalog:product:<slug>, catalog:products,
// catalog:taxonomy, catalog:free. Step 4 will call revalidateTag(...) on
// publish/archive/update.
// ---------------------------------------------------------------------------

const REVALIDATE_SECONDS = 300;

const getProductDetailUncached = async (slug: string): Promise<ProductDetailVM | null> => {
  const c = client();
  const { data, error } = await c.rpc("get_product_by_slug", { p_slug: slug });
  if (error) throw new Error(`Product lookup failed: ${error.message}`);
  const rows = (data ?? []) as unknown as DetailRow[];
  const row = rows[0];
  return row ? mapDetail(row) : null;
};

const listFreeUncached = async (): Promise<ProductCardVM[]> => {
  const c = client();
  const { data, error } = await c.rpc("list_free_products");
  if (error) throw new Error(`Free listing failed: ${error.message}`);
  return ((data ?? []) as unknown as CardRow[]).map(mapCard);
};

const listFeaturedUncached = async (limit: number): Promise<ProductCardVM[]> => {
  // Featured = newest published (honest "Recent resources").
  const c = client();
  const { data, error } = await c.rpc("search_products", {
    p_q: "",
    p_types: [],
    p_genres: [],
    p_daw: "",
    p_plugins: [],
    p_plugin_free: false,
    p_musical_key: "",
    p_price_currency: "",
    p_sort: "newest",
    p_page: 1,
    p_page_size: Math.min(Math.max(limit, 1), PAGE_SIZE),
  } satisfies CatalogRpcParams);
  if (error) throw new Error(`Featured listing failed: ${error.message}`);
  return ((data ?? []) as unknown as SearchRow[]).slice(0, limit).map(mapCard);
};

const getRelatedUncached = async (
  slug: string,
  limit: number,
): Promise<ProductCardVM[]> => {
  const c = client();
  const { data, error } = await c.rpc("get_related_products", {
    p_slug: slug,
    p_limit: limit,
  });
  if (error) throw new Error(`Related listing failed: ${error.message}`);
  return ((data ?? []) as unknown as CardRow[]).map(mapCard);
};

// Wrapped (cached) versions with stable tags.
export const getProductDetail = unstable_cache(
  getProductDetailUncached,
  ["catalog:product"], // key parts: slug appended automatically
  {
    revalidate: REVALIDATE_SECONDS,
    tags: ["catalog:products"],
  },
);

export const listFreeProducts = unstable_cache(
  listFreeUncached,
  ["catalog:free"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog:products", "catalog:free"] },
);

export const listFeaturedProducts = unstable_cache(
  listFeaturedUncached,
  ["catalog:featured"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog:products"] },
);

export const getRelatedProducts = unstable_cache(
  getRelatedUncached,
  ["catalog:related"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog:products"] },
);

export const listGenres = unstable_cache(
  async () => listGenresRaw(),
  ["catalog:genres"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog:taxonomy"] },
);

export const listPlugins = unstable_cache(
  async () => listPluginsRaw(),
  ["catalog:plugins"],
  { revalidate: REVALIDATE_SECONDS, tags: ["catalog:taxonomy"] },
);

// ---------------------------------------------------------------------------
// Search — NOT cached (unbounded filter cardinality). Server-rendered per
// request; the function is parameterized and indexed.
// ---------------------------------------------------------------------------

export interface CatalogResult {
  products: ProductCardVM[];
  total: number;
  page: number;
  pageSize: number;
}

export async function searchCatalog(
  params: CatalogParams,
): Promise<CatalogResult> {
  const c = client();
  const rpcParams = toRpcParams(params);
  const { data, error } = await c.rpc("search_products", rpcParams);
  if (error) throw new Error(`Catalog search failed: ${error.message}`);
  const rows = (data ?? []) as unknown as SearchRow[];
  const total = rows[0]?.total_count ?? 0;
  return {
    products: rows.map(mapCard),
    total: typeof total === "number" ? total : 0,
    page: params.page,
    pageSize: PAGE_SIZE,
  };
}

// Re-export labels for convenience.
export { PRODUCT_TYPE_LABELS };
