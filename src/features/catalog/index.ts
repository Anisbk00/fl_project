/**
 * Catalog feature barrel. Public reads + admin writes are the ONLY sanctioned
 * way to touch catalog data. Import from `@/features/catalog`, not from the
 * underlying Supabase client, in application code.
 *
 * `data-access` imports `server-only`, so importing catalog mutations from a
 * Client Component fails the build.
 *
 * Public reads use the publishable client (RLS-protected). Admin mutations
 * take an authenticated `AdminClient` (obtained from the cookie server client
 * in Step 4) and call `requireAdmin` (the `is_admin()` RPC) before writing —
 * RLS is the real boundary; the application never compensates for it.
 */
export {
  listPublishedProducts,
  getPublishedProductBySlug,
  listAllProductsForAdmin,
  createProduct,
  publishProduct,
  archiveProduct,
  unpublishToDraft,
  addDeliverable,
  listDeliverablesForAdmin,
  type PublicProduct,
  type PublicGenre,
  type PublicPlugin,
  type PublicMedia,
  type PublicGenreRef,
  type PublicPluginRef,
  type PublicProductGenre,
  type PublicProductPlugin,
  type AddDeliverableInput,
} from "./data-access";

export {
  isPubliclyVisible,
  filterPublic,
  type VisibilityCheckable,
} from "./visibility";

export {
  assertPublishable,
  canPublish,
  PublicationError,
  type PublishableProduct,
} from "./publish-constraint";

export {
  PRODUCT_TYPES,
  LIFECYCLES,
  createProductInputSchema,
  productTypeSchema,
  lifecycleSchema,
  slugSchema,
  currencySchema,
  bpmSchema,
  priceSchema,
  mediaKindSchema,
  type ProductType,
  type Lifecycle,
  type CreateProductInput,
} from "./schema";

// Step 3 — live catalog repository, URL params, sort, SEO, safe markdown.
export {
  isCatalogReady,
  CatalogUnavailableError,
  searchCatalog,
  getProductDetail,
  getRelatedProducts,
  listFreeProducts,
  listFeaturedProducts,
  listGenres,
  listPlugins,
  type CatalogResult,
} from "./repository";

export {
  PAGE_SIZE,
  SORT_KEYS,
  SORT_LABELS,
  catalogParamsSchema,
  parseCatalogParams,
  serializeCatalogParams,
  withParam,
  withPage,
  hasActiveFilters,
  toRpcParams,
  type CatalogParams,
  type CatalogRpcParams,
  type SortKey,
} from "./url-params";

export { isValidSortKey, resolveSortKey, SORT_OPTIONS } from "./sort";

export {
  siteUrl,
  coverUrl,
  productCanonical,
  catalogCanonical,
  freeCanonical,
  breadcrumbJsonLd,
  productJsonLd,
  serializeJsonLd,
} from "./seo";

export { SafeMarkdown, sanitizeUrl } from "./markdown";
export { PRODUCT_TYPE_LABELS, formatBytes, formatDuration, type ProductCardVM, type ProductDetailVM, type ProductMediaVM } from "./view-models";
