import { z } from "zod";
import {
  PRODUCT_TYPES,
  type ProductType,
} from "./schema";

/**
 * Catalog URL parameter contract (Step 3).
 *
 * The server-rendered result is authoritative and derived from validated
 * search params. One canonical naming/serialization scheme, tested.
 *
 * Multi-select values are normalized into a stable order; defaults and empty
 * values are removed from the serialized URL. `page` is reset to 1 when any
 * filter changes (the page calls `withChangedFilters` to build the new href).
 *
 * Currency rule: price min/max are ONLY applied together with a selected
 * `currency`. Prices are never compared across currencies and no exchange
 * rates are invented.
 */

export const PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
export const MAX_QUERY_LENGTH = 200;
export const MAX_MULTI = 24;

export const SORT_KEYS = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
  "title",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "title", label: "Title (A–Z)" },
];

const productTypeSet = new Set<string>(PRODUCT_TYPES);
const sortSet = new Set<string>(SORT_KEYS);

const stringArray = (max: number) =>
  z.preprocess(
    (v) => {
      if (v == null) return [] as string[];
      if (Array.isArray(v)) {
        return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      }
      if (typeof v === "string") {
        return v.split(",").map((x) => x.trim()).filter(Boolean);
      }
      return [] as string[];
    },
    z.array(z.string().trim().toLowerCase().max(80)).max(max),
  );

/** Zod schema for catalog search params (server-boundary validation). */
export const catalogParamsSchema = z
  .object({
    q: z.string().trim().max(MAX_QUERY_LENGTH).optional().transform((s) => s ?? ""),
    types: stringArray(MAX_MULTI)
      .optional()
      .transform((a) => (a ?? []).filter((t) => productTypeSet.has(t)) as ProductType[]),
    genres: stringArray(MAX_MULTI).optional().transform((a) => a ?? []),
    daw: z.string().trim().max(80).optional().transform((s) => s ?? ""),
    plugins: stringArray(MAX_MULTI).optional().transform((a) => a ?? []),
    pluginFree: z
      .preprocess((v) => (v === "1" || v === "true" || v === true), z.boolean())
      .optional()
      .transform((b) => b ?? false),
    bpmMin: z.coerce.number().int().min(1).max(400).optional(),
    bpmMax: z.coerce.number().int().min(1).max(400).optional(),
    key: z.string().trim().max(50).optional().transform((s) => s ?? ""),
    priceMin: z.coerce.number().int().min(0).max(1_000_000).optional(),
    priceMax: z.coerce.number().int().min(0).max(1_000_000).optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    sort: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((s) => (s && sortSet.has(s) ? (s as SortKey) : "newest")),
    page: z.coerce.number().int().min(1).max(10_000).optional().transform((n) => n ?? 1),
  })
  .refine((d) => !d.priceMin || !d.priceMax || d.priceMin <= d.priceMax, {
    message: "priceMin must be <= priceMax",
    path: ["priceMin"],
  })
  .refine((d) => !d.bpmMin || !d.bpmMax || d.bpmMin <= d.bpmMax, {
    message: "bpmMin must be <= bpmMax",
    path: ["bpmMin"],
  });

export type CatalogParams = z.infer<typeof catalogParamsSchema>;

/** Raw RPC params derived from validated catalog params (currency rule enforced). */
export interface CatalogRpcParams {
  p_q: string;
  p_types: string[];
  p_genres: string[];
  p_daw: string;
  p_plugins: string[];
  p_plugin_free: boolean;
  p_bpm_min?: number; // undefined → function default (null)
  p_bpm_max?: number;
  p_musical_key: string;
  p_price_min?: number;
  p_price_max?: number;
  p_price_currency: string;
  p_sort: string;
  p_page: number;
  p_page_size: number;
}

/** Convert validated params to the RPC argument shape (currency rule enforced). */
export function toRpcParams(p: CatalogParams): CatalogRpcParams {
  const hasCurrency = !!p.currency && /^[A-Z]{3}$/.test(p.currency);
  return {
    p_q: p.q,
    p_types: p.types,
    p_genres: p.genres,
    p_daw: p.daw,
    p_plugins: p.plugins,
    p_plugin_free: p.pluginFree,
    p_bpm_min: p.bpmMin,
    p_bpm_max: p.bpmMax,
    p_musical_key: p.key,
    // Price filters apply ONLY with a selected currency.
    p_price_min: hasCurrency ? p.priceMin : undefined,
    p_price_max: hasCurrency ? p.priceMax : undefined,
    p_price_currency: hasCurrency ? (p.currency as string) : "",
    p_sort: p.sort,
    p_page: p.page,
    p_page_size: PAGE_SIZE,
  };
}

/** Normalize a multi-select array into stable sorted unique order. */
export function normalizeMulti(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))).sort();
}

/** True if the params carry any active filter (affects pagination/indexing). */
export function hasActiveFilters(p: CatalogParams): boolean {
  return (
    p.q.trim().length > 0 ||
    p.types.length > 0 ||
    p.genres.length > 0 ||
    p.daw.length > 0 ||
    p.plugins.length > 0 ||
    p.pluginFree ||
    p.bpmMin != null ||
    p.bpmMax != null ||
    p.key.length > 0 ||
    p.priceMin != null ||
    p.priceMax != null ||
    !!p.currency
  );
}

/**
 * Serialize params to a canonical, stable query string. Defaults and empty
 * values are dropped; multi-select is sorted + comma-joined; booleans become
 * "1"/omitted. `page` is omitted when it is 1.
 */
export function serializeCatalogParams(p: CatalogParams): string {
  const sp = new URLSearchParams();
  if (p.q.trim()) sp.set("q", p.q.trim());
  for (const t of normalizeMulti(p.types)) sp.append("type", t);
  for (const g of normalizeMulti(p.genres)) sp.append("genre", g);
  if (p.daw) sp.set("daw", p.daw);
  for (const pl of normalizeMulti(p.plugins)) sp.append("plugin", pl);
  if (p.pluginFree) sp.set("pluginFree", "1");
  if (p.bpmMin != null) sp.set("bpmMin", String(p.bpmMin));
  if (p.bpmMax != null) sp.set("bpmMax", String(p.bpmMax));
  if (p.key) sp.set("key", p.key);
  if (p.currency && (p.priceMin != null || p.priceMax != null)) {
    if (p.priceMin != null) sp.set("priceMin", String(p.priceMin));
    if (p.priceMax != null) sp.set("priceMax", String(p.priceMax));
    sp.set("currency", p.currency);
  }
  if (p.sort && p.sort !== "newest") sp.set("sort", p.sort);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  // Stable order: re-create with sorted keys for canonical URLs.
  const sorted = new URLSearchParams();
  for (const k of Array.from(sp.keys()).sort()) {
    for (const v of sp.getAll(k)) sorted.append(k, v);
  }
  const qs = sorted.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Build the canonical catalog href for a param change, resetting `page` to 1
 * whenever a filter changes (sort/page changes keep the current page).
 */
export function withParam(
  current: CatalogParams,
  change: Partial<CatalogParams> & { resetPage?: boolean },
): string {
  const next: CatalogParams = { ...current, ...change } as CatalogParams;
  if (change.resetPage) next.page = 1;
  return `/catalog${serializeCatalogParams(next)}`;
}

/** Build the href for a page change (keeps filters + sort). */
export function withPage(current: CatalogParams, page: number): string {
  return `/catalog${serializeCatalogParams({ ...current, page })}`;
}

/** Parse Next.js searchParams (string | string[] | undefined per key) safely. */
export function parseCatalogParams(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
): { params: CatalogParams; error: null } | { params: null; error: string } {
  const record: Record<string, string | string[]> = {};
  const src =
    input instanceof URLSearchParams
      ? (Object.fromEntries(
          // URLSearchParams may have repeated keys; collect as arrays.
          input.entries(),
        ) as Record<string, string>)
      : input;
  // Flatten: collect repeated keys into arrays; strip empty-string scalars so
  // a GET form with unfilled number inputs (e.g. `bpmMin=`) doesn't fail.
  const collected: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      const filtered = v.filter((x) => x !== "");
      if (filtered.length) collected[k] = filtered.length > 1 ? filtered : filtered[0]!;
      continue;
    }
    if (v === "") continue; // drop empty scalars
    if (collected[k] == null) {
      collected[k] = v;
    } else if (Array.isArray(collected[k])) {
      (collected[k] as string[]).push(v);
    } else {
      collected[k] = [collected[k] as string, v];
    }
  }
  // Map singular URL/form param names to plural schema fields.
  // (serializeCatalogParams writes singular names: type=X&type=Y for
  // multi-select form-friendliness; the schema fields are plural arrays.)
  const remap: Record<string, string> = {
    type: "types",
    genre: "genres",
    plugin: "plugins",
  };
  for (const [from, to] of Object.entries(remap)) {
    if (from in collected && !(to in collected)) {
      collected[to] = collected[from]!;
      delete collected[from];
    }
  }
  Object.assign(record, collected);
  const parsed = catalogParamsSchema.safeParse(record);
  if (!parsed.success) {
    // Malformed params are a recoverable user state — return the first issue,
    // never the raw input (no reflected unsafe content).
    const first = parsed.error.issues[0];
    return { params: null, error: first?.message ?? "Invalid filter parameters." };
  }
  return { params: parsed.data as CatalogParams, error: null };
}
