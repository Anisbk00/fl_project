import "server-only";
import { z } from "zod";
import { getPublishableClient } from "@/lib/supabase/publishable";
import { requireAdmin, type AdminClient } from "@/lib/auth";
import {
  createProductInputSchema,
  PUBLISHABLE_RIGHTS,
  type CreateProductInput,
  type Lifecycle,
  type RightsStatus,
} from "./schema";
import { assertPublishable } from "./publish-constraint";
import type { Database } from "@/types/database";

/**
 * ============================================================================
 * CATALOG DATA-ACCESS LAYER — Supabase-native, the single sanctioned read/write
 * path. NO local DB, NO Prisma — Supabase only.
 * ============================================================================
 *
 * ACCESS MATRIX (mirrors docs/SECURITY.md and the RLS policies in
 * supabase/migrations/0002_rls_and_admin.sql):
 *
 *   anonymous / public visitor:
 *     - may read ONLY published, rights-cleared products and their public
 *       taxonomy + public preview media, via the publishable client. RLS
 *       enforces this at the database; the application ALSO filters as
 *       defense-in-depth.
 *     - can NEVER read drafts/archived/unreviewed/rejected products, private
 *       deliverables, admin identities, or private storage paths. RLS blocks
 *       `product_deliverables` and `admin_users` for anon entirely.
 *
 *   authenticated non-admin:
 *     - gains NO mutation powers; can see no more than anon.
 *
 *   authenticated allow-listed admin (requireAdmin via `is_admin()` RPC):
 *     - may create/update/publish/archive products and manage deliverables,
 *       through the same admin client that RLS trusts because is_admin()=true.
 *
 * HOW THIS IS ENFORCED:
 *   - Public reads use an explicit `select` string that omits
 *     `product_deliverables` and the admin audit columns (`created_by_id`,
 *     `updated_by_id`). Combined with RLS, a public read can never leak a
 *     private relation or admin identity.
 *   - Public reads filter on `lifecycle = 'published'` AND
 *     `rights_status IN ('original','licensed')` (defense-in-depth alongside
 *     the identical RLS policy).
 *   - Every mutation accepts an authenticated `adminClient`, calls
 *     `requireAdmin(adminClient)` first, validates input with Zod, then writes
 *     via `adminClient` (RLS permits because is_admin()=true). A protected
 *     layout is never the only authorization layer.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Public SELECT shape — deliberately narrow.
// ---------------------------------------------------------------------------

const PUBLIC_PRODUCT_COLUMNS = [
  "id",
  "slug",
  "title",
  "short_description",
  "long_description",
  "product_type",
  "lifecycle",
  "rights_status",
  "price",
  "price_currency",
  "compare_at_price",
  "daw_name",
  "daw_version",
  "bpm",
  "musical_key",
  "duration_seconds",
  "total_size_bytes",
  "included_formats",
  "featured",
  "seo_title",
  "seo_description",
  "created_at",
  "updated_at",
  "published_at",
  // NOTE: created_by_id / updated_by_id (admin audit) deliberately omitted.
  "product_genres(genre(slug,name))",
  "product_plugins(min_version,required,plugin(slug,name,vendor))",
  "product_media(id,kind,bucket,storage_object_path,external_url,mime_type,bytes,alt_text,created_at)",
  // NOTE: product_deliverables deliberately omitted — private, RLS-blocked.
].join(",");

export interface PublicGenreRef {
  slug: string;
  name: string;
}
export interface PublicPluginRef {
  slug: string;
  name: string;
  vendor: string | null;
}
export interface PublicProductGenre {
  genre: PublicGenreRef;
}
export interface PublicProductPlugin {
  min_version: string | null;
  required: boolean;
  plugin: PublicPluginRef | null;
}
export interface PublicMedia {
  id: string;
  kind: Database["public"]["Enums"]["media_kind"];
  bucket: string;
  storage_object_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  bytes: number | null;
  alt_text: string | null;
  created_at: string;
}
export interface PublicProduct {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  long_description: string | null;
  product_type: Database["public"]["Enums"]["product_type"];
  lifecycle: Database["public"]["Enums"]["product_lifecycle"];
  rights_status: Database["public"]["Enums"]["rights_status"];
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
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  product_genres: PublicProductGenre[] | null;
  product_plugins: PublicProductPlugin[] | null;
  product_media: PublicMedia[] | null;
}

export interface PublicGenre {
  slug: string;
  name: string;
}
export interface PublicPlugin {
  slug: string;
  name: string;
  vendor: string | null;
}

// ---------------------------------------------------------------------------
// PUBLIC READS (publishable client, RLS-protected)
// ---------------------------------------------------------------------------

export async function listPublishedProducts(): Promise<PublicProduct[]> {
  const client = getPublishableClient();
  const { data, error } = await client
    .from("products")
    .select(PUBLIC_PRODUCT_COLUMNS)
    .eq("lifecycle", "published")
    .in("rights_status", [...PUBLISHABLE_RIGHTS] as RightsStatus[])
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false });
  if (error) {
    throw new Error(`Catalog listing failed: ${error.message}`);
  }
  return (data ?? []) as unknown as PublicProduct[];
}

export async function getPublishedProductBySlug(
  slug: string,
): Promise<PublicProduct | null> {
  const client = getPublishableClient();
  const { data, error } = await client
    .from("products")
    .select(PUBLIC_PRODUCT_COLUMNS)
    .eq("lifecycle", "published")
    .in("rights_status", [...PUBLISHABLE_RIGHTS] as RightsStatus[])
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new Error(`Catalog lookup failed: ${error.message}`);
  }
  return (data as unknown as PublicProduct | null) ?? null;
}

export async function listGenres(): Promise<PublicGenre[]> {
  const client = getPublishableClient();
  const { data, error } = await client
    .from("genres")
    .select("slug,name")
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`Genre listing failed: ${error.message}`);
  }
  return (data ?? []) as unknown as PublicGenre[];
}

export async function listPlugins(): Promise<PublicPlugin[]> {
  const client = getPublishableClient();
  const { data, error } = await client
    .from("plugins")
    .select("slug,name,vendor")
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`Plugin listing failed: ${error.message}`);
  }
  return (data ?? []) as unknown as PublicPlugin[];
}

// ---------------------------------------------------------------------------
// ADMIN READS (authenticated admin client + requireAdmin)
// ---------------------------------------------------------------------------

export async function listAllProductsForAdmin(adminClient: AdminClient) {
  await requireAdmin(adminClient);
  const { data, error } = await adminClient
    .from("products")
    .select(
      "id,slug,title,product_type,lifecycle,rights_status,price,price_currency,featured,created_at,updated_at,published_at,created_by_id,updated_by_id",
    )
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`Admin product listing failed: ${error.message}`);
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// ADMIN WRITES (authenticated admin client + requireAdmin + Zod)
// ---------------------------------------------------------------------------

export async function createProduct(
  adminClient: AdminClient,
  rawInput: unknown,
): Promise<{ id: string; slug: string }> {
  await requireAdmin(adminClient);
  const input = createProductInputSchema.parse(
    rawInput,
  ) as CreateProductInput;
  // New products are always created as drafts. Publication is a separate,
  // rights-gated step.
  const row: Database["public"]["Tables"]["products"]["Insert"] = {
    slug: input.slug,
    title: input.title,
    short_description: input.shortDescription,
    long_description: input.longDescription ?? null,
    product_type: input.productType,
    rights_status: input.rightsStatus,
    price: input.price,
    price_currency: input.priceCurrency,
    compare_at_price: input.compareAtPrice ?? null,
    daw_name: input.dawName ?? null,
    daw_version: input.dawVersion ?? null,
    bpm: input.bpm ?? null,
    musical_key: input.musicalKey ?? null,
    duration_seconds: input.durationSeconds ?? null,
    total_size_bytes: input.totalSizeBytes ?? null,
    included_formats: input.includedFormats ?? null,
    featured: input.featured,
    seo_title: input.seoTitle ?? null,
    seo_description: input.seoDescription ?? null,
    lifecycle: "draft",
    // created_by_id/updated_by_id will be set from the admin session in Step 4.
  };
  const { data, error } = await adminClient
    .from("products")
    .insert(row)
    .select("id,slug")
    .single();
  if (error) {
    throw new Error(`Product creation failed: ${error.message}`);
  }
  return { id: data.id, slug: data.slug };
}

export async function publishProduct(
  adminClient: AdminClient,
  productId: string,
): Promise<{ id: string; lifecycle: Lifecycle }> {
  await requireAdmin(adminClient);
  const { data: product, error: fe } = await adminClient
    .from("products")
    .select("rights_status,price,price_currency,title,short_description,product_type")
    .eq("id", productId)
    .maybeSingle();
  if (fe) {
    throw new Error(`Product lookup failed: ${fe.message}`);
  }
  if (!product) {
    throw new Error("Product not found.");
  }
  // Engineering guardrail: refuse to publish unless rights-cleared and valid.
  assertPublishable({
    rightsStatus: product.rights_status,
    price: product.price,
    priceCurrency: product.price_currency,
    title: product.title,
    shortDescription: product.short_description,
    productType: product.product_type,
  });
  const { data, error } = await adminClient
    .from("products")
    .update({
      lifecycle: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .select("id,lifecycle")
    .single();
  if (error) {
    throw new Error(`Publish failed: ${error.message}`);
  }
  return { id: data.id, lifecycle: data.lifecycle };
}

export async function archiveProduct(
  adminClient: AdminClient,
  productId: string,
): Promise<{ id: string; lifecycle: Lifecycle }> {
  await requireAdmin(adminClient);
  const { data, error } = await adminClient
    .from("products")
    .update({ lifecycle: "archived", published_at: null })
    .eq("id", productId)
    .select("id,lifecycle")
    .single();
  if (error) {
    throw new Error(`Archive failed: ${error.message}`);
  }
  return { id: data.id, lifecycle: data.lifecycle };
}

export async function unpublishToDraft(
  adminClient: AdminClient,
  productId: string,
): Promise<{ id: string; lifecycle: Lifecycle }> {
  await requireAdmin(adminClient);
  const { data, error } = await adminClient
    .from("products")
    .update({ lifecycle: "draft" })
    .eq("id", productId)
    .select("id,lifecycle")
    .single();
  if (error) {
    throw new Error(`Unpublish failed: ${error.message}`);
  }
  return { id: data.id, lifecycle: data.lifecycle };
}

// ---------------------------------------------------------------------------
// ADMIN: private deliverable management (paths never returned publicly)
// ---------------------------------------------------------------------------

const addDeliverableInputSchema = z.object({
  bucket: z.string().default("product-private"),
  storage_object_path: z.string().min(1).max(1024),
  customer_filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(100),
  bytes: z.number().int().min(0),
  version: z.number().int().min(1).default(1),
  sha_256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  active: z.boolean().default(true),
});

export interface AddDeliverableInput {
  bucket?: string;
  storage_object_path: string;
  customer_filename: string;
  mime_type: string;
  bytes: number;
  version?: number;
  sha256?: string;
  active?: boolean;
}

export async function addDeliverable(
  adminClient: AdminClient,
  productId: string,
  rawInput: unknown,
): Promise<{ id: string }> {
  await requireAdmin(adminClient);
  const input = addDeliverableInputSchema.parse(rawInput);
  const row: Database["public"]["Tables"]["product_deliverables"]["Insert"] = {
    product_id: productId,
    bucket: input.bucket,
    storage_object_path: input.storage_object_path,
    customer_filename: input.customer_filename,
    mime_type: input.mime_type,
    bytes: input.bytes,
    version: input.version,
    sha_256: input.sha_256 ?? null,
    active: input.active,
  };
  const { data, error } = await adminClient
    .from("product_deliverables")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    throw new Error(`Deliverable creation failed: ${error.message}`);
  }
  return { id: data.id };
}

/**
 * Admin-only: list a product's private deliverables. There is NO public
 * equivalent. The fulfillment server (Step 6) issues short-lived signed URLs
 * after verifying payment + a download grant — it never relies on this path.
 */
export async function listDeliverablesForAdmin(
  adminClient: AdminClient,
  productId: string,
) {
  await requireAdmin(adminClient);
  const { data, error } = await adminClient
    .from("product_deliverables")
    .select(
      "id,bucket,storage_object_path,customer_filename,mime_type,bytes,version,sha_256,active,created_at,updated_at",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Deliverable listing failed: ${error.message}`);
  }
  return data ?? [];
}
