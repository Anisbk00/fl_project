# Catalog and Search

The live catalog data layer, URL contract, search/ranking, filters, sorting,
pagination, currency rule, SQL functions/views, indexes, and empty/error
behavior. See `src/features/catalog/repository.ts`, `url-params.ts`, `sort.ts`,
and `supabase/migrations/0004_catalog_search.sql` for the code.

## Data architecture

- Storefront reads use the **publishable** Supabase client so RLS is exercised
  on every read. The secret key is NEVER imported by storefront code.
- The single sanctioned path is `src/features/catalog/repository.ts`. Page
  components import it; they never query Supabase ad hoc.
- Reads call the Step 3 SECURITY INVOKER RPCs:
  `search_products`, `get_product_by_slug`, `get_related_products`,
  `list_free_products`. Each returns ONLY public columns + aggregated public
  taxonomy/media. Row→view-model mapping happens at this boundary; the narrow
  DTOs cannot carry admin IDs, audit columns, deliverable paths, or other
  non-public fields.
- Initial page content is fetched in Server Components. The browser never
  receives the whole catalog for client-side filtering. The only client
  islands are the filter UI (mobile sheet + progressive-enhancement form) and
  the audio player.
- `isCatalogReady()` detects an unlinked environment; pages then render an
  honest state (not a fixture fallback, not a crash).

## Caching & revalidation

- Stable reads (single product, taxonomy, free/featured lists) are cached via
  `unstable_cache` with stable tags: `catalog:product`, `catalog:products`,
  `catalog:taxonomy`, `catalog:free`. `revalidate: 300s`.
- Search is NOT cached (unbounded filter cardinality) — it is server-rendered
  per request via the parameterized, indexed RPC.
- The Step 4 invalidation contract: on publish/archive/update, call
  `revalidateTag("catalog:products")`, `revalidateTag("catalog:product:"+slug)`,
  `revalidateTag("catalog:taxonomy")`. NOT implemented in Step 3.

## URL contract

Canonical, shareable, back/forward-friendly. The server-rendered result is
authoritative.

| Param | Meaning |
| --- | --- |
| `q` | text search (≤200 chars) |
| `type` | product type (repeated for multi-select; allow-listed) |
| `genre` | genre slug (repeated) |
| `daw` | DAW name |
| `plugin` | required plugin slug (repeated) |
| `pluginFree=1` | only products with no required plugins |
| `bpmMin`, `bpmMax` | BPM range (1–400) |
| `key` | musical key |
| `priceMin`, `priceMax` | price range (integer minor units) — requires `currency` |
| `currency` | 3-letter ISO 4217 |
| `sort` | `newest` \| `relevance` \| `price_asc` \| `price_desc` \| `title` |
| `page` | 1-based; fixed page size 24 |

- One canonical serialization: stable key order, defaults/empties dropped,
  multi-select normalized (sorted, deduped, lowercased). `page` resets to 1 when
  filters change (`withParam({ resetPage: true })`); `page` is kept when only
  sort/page changes.
- Malformed params are a recoverable user state: `parseCatalogParams` returns
  a non-disclosing error; no reflected input, no SQL error, no server crash.
- Sort keys are an allow-list; the URL value is passed as a PARAMETER to the
  RPC (never becomes an identifier/order clause in app code).
- The currency rule: prices are never compared across currencies. Price
  filters apply ONLY with a selected `currency`; otherwise omitted. No
  exchange rates are invented.
- No secrets/private IDs/storage paths in query strings.

## Search & ranking

- Parameterized PostgreSQL full-text search via `websearch_to_tsquery` (never
  `%term%` scans, never string concatenation).
- Generated `search_vector` tsvector: title weight A, short_description B,
  long_description C. GIN index. Trigger-maintained on insert/update.
- Rank (`ts_rank`) is used only when a query exists; otherwise the chosen
  deterministic sort. Every sort has tie-breakers (`published_at desc,
  updated_at desc, slug`) so pagination cannot shuffle.

## Indexes (additive, partial, matching the public predicate)

`products_search_vector_idx` (GIN); `products_published_newest_idx`,
`products_published_title_idx`, `products_published_type_idx`,
`products_published_price_idx`, `products_published_bpm_idx`,
`products_published_daw_idx`, `products_published_featured_idx`. Each matches a
real published-catalog query shape. Not over-indexed.

## Query-plan evidence

Not runnable in the SQLite sandbox (no Docker/Supabase CLI). On a linked
project, run representative plans, e.g.:

```
EXPLAIN (ANALYZE, BUFFERS)
select * from public.search_products(p_q => 'drift', p_sort => 'relevance');
```

Expected: the GIN index for `p_q`, the partial indexes for filters/sort, a
bounded window for pagination. A sequential scan on a tiny test table is not
automatically a defect. Documented as a blocker (no live DB here).

## Empty / error behavior

- Configured + no products + no filters → "No products published yet".
- Configured + no products + filters → "No products match" + keep filters +
  clear actions.
- Not configured → honest "Catalog isn't available here" state.
- A read failure → "Catalog couldn't be loaded" + retry.
- Draft/archived/unreviewed/rejected/missing slugs → nondisclosing 404
  (`notFound()`).
