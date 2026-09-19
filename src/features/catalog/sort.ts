import { SORT_KEYS, type SortKey } from "./url-params";

/**
 * Sort allow-list. A URL `sort` value is validated against `SORT_KEYS` at the
 * server boundary and passed as a PARAMETER to the `search_products` RPC; it
 * never becomes an SQL identifier or ORDER BY clause in application code. The
 * function maps the key to known expressions internally with deterministic
 * tie-breakers (published_at, updated_at, slug).
 *
 * Relevance is only meaningful with a search query; otherwise the chosen
 * deterministic sort is used.
 */
export function isValidSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

export function resolveSortKey(value: unknown, hasQuery: boolean): SortKey {
  if (isValidSortKey(value)) return value;
  return hasQuery ? "relevance" : "newest";
}

export const SORT_OPTIONS = [
  { value: "newest" as const, label: "Newest" },
  { value: "relevance" as const, label: "Relevance" },
  { value: "price_asc" as const, label: "Price: low to high" },
  { value: "price_desc" as const, label: "Price: high to low" },
  { value: "title" as const, label: "Title (A–Z)" },
];
