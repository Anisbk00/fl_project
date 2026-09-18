/**
 * Catalog feature barrel. Public reads + admin writes are the ONLY sanctioned
 * way to touch catalog data. Import from `@/features/catalog`, not from the
 * underlying Prisma client, in application code.
 *
 * `data-access` imports `server-only`, so importing catalog mutations from a
 * Client Component fails the build.
 */
export {
  listPublishedProducts,
  getPublishedProductBySlug,
  listGenres,
  listPlugins,
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
  RIGHTS_STATUSES,
  PUBLISHABLE_RIGHTS,
  createProductInputSchema,
  productTypeSchema,
  lifecycleSchema,
  rightsStatusSchema,
  slugSchema,
  currencySchema,
  bpmSchema,
  priceSchema,
  mediaKindSchema,
  type ProductType,
  type Lifecycle,
  type RightsStatus,
  type CreateProductInput,
} from "./schema";
