import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  createProductInputSchema,
  PUBLISHABLE_RIGHTS,
  type CreateProductInput,
  type Lifecycle,
  type RightsStatus,
} from "./schema";
import { assertPublishable } from "./publish-constraint";

/**
 * ============================================================================
 * CATALOG DATA-ACCESS LAYER — the single sanctioned read/write path.
 * ============================================================================
 *
 * ACCESS MATRIX (mirrors docs/SECURITY.md):
 *
 *   anonymous / public visitor:
 *     - may read ONLY published, rights-cleared products and their public
 *       taxonomy + public preview media;
 *     - can NEVER read drafts/archived/unreviewed/rejected products, private
 *       deliverables, admin identities, or private storage paths.
 *
 *   authenticated non-admin:
 *     - gains NO mutation powers; can see no more than anon.
 *
 *   authenticated allow-listed admin (requireAdmin):
 *     - may create/update/publish/archive products and manage deliverables.
 *
 * HOW THIS IS ENFORCED HERE:
 *   - Public read functions use an explicit `select` that omits
 *     `product_deliverables` and the admin audit columns (`created_by_id`,
 *     `updated_by_id`). Using `select` (not `include`) guarantees a public
 *     read can never accidentally leak a private relation added later.
 *   - Public read functions filter on `lifecycle = 'published'` AND
 *     `rightsStatus IN ('original','licensed')`.
 *   - Every mutation accepts an `adminUserId` and calls `requireAdmin` first,
 *     then validates input with Zod, then writes. Defense in depth: a
 *     protected layout is NEVER the only authorization layer.
 *
 * PRODUCTION MAPPING: in Supabase these same guarantees are enforced by RLS
 * policies + a CHECK constraint on publication. Here they are enforced in
 * code; both layers must agree.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Public SELECT shapes — deliberately narrow.
// ---------------------------------------------------------------------------

const publicGenreSelect = {
  genre: { select: { slug: true, name: true } },
} satisfies Prisma.ProductGenreSelect;

const publicPluginSelect = {
  plugin: { select: { slug: true, name: true, vendor: true } },
  minVersion: true,
  required: true,
} satisfies Prisma.ProductPluginSelect;

const publicMediaSelect = {
  id: true,
  kind: true,
  // Public bucket only; safe to expose for CDN delivery.
  bucket: true,
  storageObjectPath: true,
  externalUrl: true,
  mimeType: true,
  bytes: true,
  altText: true,
  createdAt: true,
} satisfies Prisma.ProductMediaSelect;

/**
 * Explicit public product projection. Notice what is ABSENT:
 *   - product_deliverables (private paid files) — never selected publicly;
 *   - createdById / updatedById (admin user ids) — never exposed.
 */
const publicProductSelect = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  longDescription: true,
  productType: true,
  lifecycle: true,
  rightsStatus: true,
  price: true,
  priceCurrency: true,
  compareAtPrice: true,
  dawName: true,
  dawVersion: true,
  bpm: true,
  musicalKey: true,
  durationSeconds: true,
  totalSizeBytes: true,
  includedFormats: true,
  featured: true,
  seoTitle: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  genres: { select: publicGenreSelect },
  plugins: { select: publicPluginSelect },
  media: { select: publicMediaSelect },
} satisfies Prisma.ProductSelect;

export type PublicProduct = Prisma.ProductGetPayload<{
  select: typeof publicProductSelect;
}>;

export type PublicGenre = { slug: string; name: string };
export type PublicPlugin = {
  slug: string;
  name: string;
  vendor: string | null;
};
export type PublicMedia = Prisma.ProductMediaGetPayload<{
  select: typeof publicMediaSelect;
}>;

const PUBLIC_WHERE = {
  lifecycle: "published" as Lifecycle,
  rightsStatus: { in: [...PUBLISHABLE_RIGHTS] as RightsStatus[] },
} satisfies Prisma.ProductWhereInput;

// ---------------------------------------------------------------------------
// PUBLIC READS (no admin required)
// ---------------------------------------------------------------------------

export async function listPublishedProducts(): Promise<PublicProduct[]> {
  return db.product.findMany({
    where: PUBLIC_WHERE,
    select: publicProductSelect,
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
  });
}

export async function getPublishedProductBySlug(
  slug: string,
): Promise<PublicProduct | null> {
  return db.product.findFirst({
    where: { ...PUBLIC_WHERE, slug },
    select: publicProductSelect,
  });
}

export async function listGenres(): Promise<PublicGenre[]> {
  return db.genre.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listPlugins(): Promise<PublicPlugin[]> {
  return db.plugin.findMany({
    select: { slug: true, name: true, vendor: true },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------------------
// ADMIN READS (require allow-listed admin)
// ---------------------------------------------------------------------------

export async function listAllProductsForAdmin(
  adminUserId: string | null | undefined,
) {
  await requireAdmin(adminUserId);
  // Admin may see draft/archived/unreviewed AND the audit columns + a count of
  // deliverables (the count, not the private paths, unless explicitly fetched).
  return db.product.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      productType: true,
      lifecycle: true,
      rightsStatus: true,
      price: true,
      priceCurrency: true,
      featured: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      createdById: true,
      updatedById: true,
      _count: { select: { deliverables: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// ADMIN WRITES (require allow-listed admin + Zod validation)
// ---------------------------------------------------------------------------

export async function createProduct(
  adminUserId: string | null | undefined,
  rawInput: unknown,
): Promise<{ id: string; slug: string }> {
  await requireAdmin(adminUserId);
  const input = createProductInputSchema.parse(
    rawInput,
  ) as CreateProductInput;
  // New products are always created as drafts. Publication is a separate,
  // rights-gated step.
  const created = await db.product.create({
    data: {
      slug: input.slug,
      title: input.title,
      shortDescription: input.shortDescription,
      longDescription: input.longDescription ?? null,
      productType: input.productType,
      rightsStatus: input.rightsStatus,
      price: input.price,
      priceCurrency: input.priceCurrency,
      compareAtPrice: input.compareAtPrice ?? null,
      dawName: input.dawName ?? null,
      dawVersion: input.dawVersion ?? null,
      bpm: input.bpm ?? null,
      musicalKey: input.musicalKey ?? null,
      durationSeconds: input.durationSeconds ?? null,
      totalSizeBytes: input.totalSizeBytes ?? null,
      includedFormats: input.includedFormats ?? null,
      featured: input.featured,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      lifecycle: "draft",
      createdById: adminUserId,
      updatedById: adminUserId,
    },
    select: { id: true, slug: true },
  });
  return created;
}

export async function publishProduct(
  adminUserId: string | null | undefined,
  productId: string,
): Promise<{ id: string; lifecycle: string }> {
  await requireAdmin(adminUserId);
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      rightsStatus: true,
      price: true,
      priceCurrency: true,
      title: true,
      shortDescription: true,
      productType: true,
    },
  });
  if (!product) {
    throw new Error("Product not found.");
  }
  // Engineering guardrail: refuse to publish unless rights-cleared and valid.
  assertPublishable(product);
  const updated = await db.product.update({
    where: { id: productId },
    data: {
      lifecycle: "published",
      publishedAt: new Date(),
      updatedById: adminUserId,
    },
    select: { id: true, lifecycle: true },
  });
  return updated;
}

export async function archiveProduct(
  adminUserId: string | null | undefined,
  productId: string,
): Promise<{ id: string; lifecycle: string }> {
  await requireAdmin(adminUserId);
  const updated = await db.product.update({
    where: { id: productId },
    data: {
      lifecycle: "archived",
      publishedAt: null,
      updatedById: adminUserId,
    },
    select: { id: true, lifecycle: true },
  });
  return updated;
}

export async function unpublishToDraft(
  adminUserId: string | null | undefined,
  productId: string,
): Promise<{ id: string; lifecycle: string }> {
  await requireAdmin(adminUserId);
  const updated = await db.product.update({
    where: { id: productId },
    data: {
      lifecycle: "draft",
      updatedById: adminUserId,
    },
    select: { id: true, lifecycle: true },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// ADMIN: private deliverable management (paths never returned publicly)
// ---------------------------------------------------------------------------

export interface AddDeliverableInput {
  bucket?: string;
  storageObjectPath: string;
  customerFilename: string;
  mimeType: string;
  bytes: number;
  version?: number;
  sha256?: string;
  active?: boolean;
}

const addDeliverableInputSchema = z.object({
  bucket: z.string().default("product-private"),
  storageObjectPath: z.string().min(1).max(1024),
  customerFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  bytes: z.number().int().min(0),
  version: z.number().int().min(1).default(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  active: z.boolean().default(true),
});

export async function addDeliverable(
  adminUserId: string | null | undefined,
  productId: string,
  rawInput: unknown,
): Promise<{ id: string }> {
  await requireAdmin(adminUserId);
  // Validate the trust boundary.
  const input = addDeliverableInputSchema.parse(rawInput);
  // Ensure the product exists.
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new Error("Product not found.");
  const created = await db.productDeliverable.create({
    data: {
      productId,
      bucket: input.bucket,
      storageObjectPath: input.storageObjectPath,
      customerFilename: input.customerFilename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      version: input.version,
      sha256: input.sha256 ?? null,
      active: input.active,
    },
    select: { id: true },
  });
  return created;
}

/**
 * Admin-only: list a product's private deliverables. There is NO public
 * equivalent. The fulfillment server (Step 6) will instead issue short-lived
 * signed URLs after verifying payment + a download grant — it will never rely
 * on this admin path.
 */
export async function listDeliverablesForAdmin(
  adminUserId: string | null | undefined,
  productId: string,
) {
  await requireAdmin(adminUserId);
  return db.productDeliverable.findMany({
    where: { productId },
    select: {
      id: true,
      bucket: true,
      storageObjectPath: true,
      customerFilename: true,
      mimeType: true,
      bytes: true,
      version: true,
      sha256: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
