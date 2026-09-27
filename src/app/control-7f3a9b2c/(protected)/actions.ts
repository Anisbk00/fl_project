"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_PRODUCTS_PATH,
  ADMIN_TAXONOMIES_PATH,
} from "@/lib/admin-path";
import {
  productFormSchema,
  type ActionResult,
  type FieldErrors,
} from "@/lib/admin/product-schema";
import { getServerClient } from "@/lib/supabase/server-client";
import { requireAdminOrFailure } from "@/lib/auth/require-admin";
import type { Database } from "@/types/database";
import {
  MIME_ALLOWLISTS,
  MAX_BYTES,
  exceedsSize,
  hasPathTraversal,
  validateFilename,
  type AssetRole,
} from "@/features/admin/uploads";
import { invalidateForMutation } from "@/features/admin/cache-invalidation";

const SLUG_REGEX = /^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$/;

async function adminClient(): Promise<SupabaseClient<Database>> {
  return getServerClient();
}

/**
 * Expire the public catalog cache after a committed product change. Without a
 * lifecycle transition, only published products invalidate (drafts/archived
 * aren't public). Never throws — the DB change is already committed.
 */
async function invalidateCatalog(
  client: SupabaseClient<Database>,
  productId: string,
  transition?: "product.publish" | "product.unpublish" | "product.archive",
) {
  const { data } = await client.from("products").select("slug,lifecycle").eq("id", productId).maybeSingle();
  if (!data) return;
  if (!transition && data.lifecycle !== "published") return;
  invalidateForMutation({ kind: transition ?? "product.published_edit", slug: data.slug });
}

// ---------------------------------------------------------------------------
// Shared action result types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Logout — clears the Supabase session safely.
// ---------------------------------------------------------------------------

export async function logout() {
  const outcome = await requireAdminOrFailure({ aal2: false });
  if (!outcome.ok && outcome.reason !== "aal1_required") {
    // Already unauthenticated/inactive/unconfigured → just go to login.
    redirect(ADMIN_LOGIN_PATH);
  }
  try {
    const client = await adminClient();
    await client.auth.signOut();
  } catch {
    // ignore — redirect to login regardless
  }
  redirect(ADMIN_LOGIN_PATH);
}

// ---------------------------------------------------------------------------
// saveProduct — create OR update a draft product + sync its taxonomy joins.
// Optimistic concurrency: edit mode sends rowVersion; the UPDATE filters on
// the expected row_version and bumps it. A mismatch returns a typed conflict
// error and the operator must reload.
// ---------------------------------------------------------------------------

export async function saveProduct(
  rawInput: unknown,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return {
      ok: false,
      message:
        outcome.reason === "unconfigured"
          ? "Admin isn't configured in this environment."
          : "Unauthorized — you must be signed in as an AAL2 admin.",
    };
  }
  const principal = outcome.principal;

  // Parse + validate. On Zod failure, surface a per-field error map.
  const parsed = productFormSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      if (!errors[key]) {
        errors[key] = issue.message;
      }
    }
    return { ok: false, errors };
  }
  const v = parsed.data;

  // Cross-field validation that mirrors the DB CHECK constraints.
  if (v.compareAtPrice != null && v.compareAtPrice < v.price) {
    return {
      ok: false,
      errors: {
        compareAtPrice: "Compare-at price must be ≥ price.",
      },
    };
  }

  const client = await adminClient();

  const row: Database["public"]["Tables"]["products"]["Insert"] = {
    slug: v.slug,
    title: v.title,
    short_description: v.shortDescription,
    long_description: emptyToNull(v.longDescription),
    product_type: v.productType,
    // Editing does not change lifecycle — keep the existing value. For new
    // rows we default to draft (the schema default).
    lifecycle: "draft",
    price: v.price,
    price_currency: v.priceCurrency,
    compare_at_price: v.compareAtPrice ?? null,
    daw_name: emptyToNull(v.dawName),
    daw_version: emptyToNull(v.dawVersion),
    bpm: v.bpm ?? null,
    musical_key: emptyToNull(v.musicalKey),
    duration_seconds: v.durationSeconds ?? null,
    total_size_bytes: v.totalSizeBytes ?? null,
    included_formats: emptyToNull(v.includedFormats),
    featured: v.featured,
    seo_title: emptyToNull(v.seoTitle),
    seo_description: emptyToNull(v.seoDescription),
    created_by_id: principal.uid,
    updated_by_id: principal.uid,
  };

  // --- NEW product ----------------------------------------------------------
  if (!v.id) {
    const insertRes = await client
      .from("products")
      .insert(row)
      .select("id")
      .single();
    if (insertRes.error) {
      return {
        ok: false,
        message: friendlyPostgresError(insertRes.error, "create the product"),
        errors: inferFieldErrors(insertRes.error),
      };
    }
    const newId = insertRes.data.id;

    // Sync taxonomy joins. Partial failure is reported but does NOT roll back
    // the product row — Supabase HTTP API has no transaction. The operator can
    // re-open the editor and re-select the joins.
    const syncErr = await syncTaxonomyJoins(client, newId, v.genres, v.plugins);
    if (syncErr) {
      // Product was created; redirect to its edit page so the operator can
      // fix the joins. Revalidate first so the list reflects the new row.
      revalidatePath(ADMIN_PRODUCTS_PATH);
      redirect(`${ADMIN_PRODUCTS_PATH}/${newId}`);
    }
    revalidatePath(ADMIN_PRODUCTS_PATH);
    redirect(`${ADMIN_PRODUCTS_PATH}/${newId}`);
  }

  // --- EDIT product (optimistic concurrency) --------------------------------
  const expectedVersion = v.rowVersion ?? 1;
  const { data: updated, error: updateErr } = await client
    .from("products")
    .update({
      slug: v.slug,
      title: v.title,
      short_description: v.shortDescription,
      long_description: emptyToNull(v.longDescription),
      product_type: v.productType,
      price: v.price,
      price_currency: v.priceCurrency,
      compare_at_price: v.compareAtPrice ?? null,
      daw_name: emptyToNull(v.dawName),
      daw_version: emptyToNull(v.dawVersion),
      bpm: v.bpm ?? null,
      musical_key: emptyToNull(v.musicalKey),
      duration_seconds: v.durationSeconds ?? null,
      total_size_bytes: v.totalSizeBytes ?? null,
      included_formats: emptyToNull(v.includedFormats),
      featured: v.featured,
      seo_title: emptyToNull(v.seoTitle),
      seo_description: emptyToNull(v.seoDescription),
      updated_by_id: principal.uid,
      // Bump row_version atomically; the WHERE clause enforces optimistic
      // concurrency (the UPDATE only matches when the expected version is
      // current). Supabase will not return a PostgREST error when 0 rows
      // match — we detect the conflict by checking the returned row count.
    })
    .eq("id", v.id)
    .eq("row_version", expectedVersion)
    .select("id, row_version")
    .maybeSingle();

  if (updateErr) {
    return {
      ok: false,
      message: friendlyPostgresError(updateErr, "update the product"),
      errors: inferFieldErrors(updateErr),
    };
  }
  if (!updated) {
    // 0 rows updated → row_version mismatch (or row deleted). Surface a
    // clear conflict so the operator reloads.
    return {
      ok: false,
      message:
        "Someone else edited this product (or it was deleted). Reload the page to get the latest version.",
    };
  }

  // Sync taxonomy joins.
  const syncErr = await syncTaxonomyJoins(client, v.id, v.genres, v.plugins);
  await invalidateCatalog(client, v.id);
  if (syncErr) {
    revalidatePath(ADMIN_PRODUCTS_PATH);
    redirect(`${ADMIN_PRODUCTS_PATH}/${v.id}`);
  }

  revalidatePath(ADMIN_PRODUCTS_PATH);
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${v.id}`);
  redirect(`${ADMIN_PRODUCTS_PATH}/${v.id}`);
}

// ---------------------------------------------------------------------------
// publishProductAction — calls the transactional publish_product RPC.
// Returns structured errors when the readiness gate rejects (missing cover,
// missing deliverable, etc.).
// ---------------------------------------------------------------------------

export async function publishProductAction(
  productId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }

  const client = await adminClient();
  // The RPC returns `table(ok boolean, errors jsonb)`. We request a single
  // row — PostgREST returns the first row of the table-returning function.
  const { data, error } = await client
    .rpc("publish_product", {
      p_product_id: productId,
      p_expected_version: expectedVersion,
    })
    .single();

  if (error) {
    return {
      ok: false,
      message: `Publish call failed: ${error.message}`,
    };
  }
  const result = data as { ok?: boolean; errors?: unknown } | null;
  if (!result || result.ok !== true) {
    return {
      ok: false,
      message: formatPublishErrors(result?.errors),
    };
  }

  await invalidateCatalog(client, productId, "product.publish");
  revalidatePath(ADMIN_PRODUCTS_PATH);
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${productId}`);
  redirect(`${ADMIN_PRODUCTS_PATH}/${productId}`);
}

// ---------------------------------------------------------------------------
// unpublishProductAction — back to draft via the unpublish_product RPC.
// ---------------------------------------------------------------------------

export async function unpublishProductAction(
  productId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }

  const client = await adminClient();
  const { data, error } = await client
    .rpc("unpublish_product", {
      p_product_id: productId,
      p_expected_version: expectedVersion,
    })
    .single();

  if (error) {
    return {
      ok: false,
      message: `Unpublish call failed: ${error.message}`,
    };
  }
  const result = data as { ok?: boolean; errors?: unknown } | null;
  if (!result || result.ok !== true) {
    return {
      ok: false,
      message: formatPublishErrors(result?.errors),
    };
  }

  await invalidateCatalog(client, productId, "product.unpublish");
  revalidatePath(ADMIN_PRODUCTS_PATH);
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${productId}`);
  redirect(`${ADMIN_PRODUCTS_PATH}/${productId}`);
}

// ---------------------------------------------------------------------------
// archiveProductAction — archive via the archive_product RPC.
// ---------------------------------------------------------------------------

export async function archiveProductAction(
  productId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }

  const client = await adminClient();
  const { data, error } = await client
    .rpc("archive_product", {
      p_product_id: productId,
      p_expected_version: expectedVersion,
    })
    .single();

  if (error) {
    return {
      ok: false,
      message: `Archive call failed: ${error.message}`,
    };
  }
  const result = data as { ok?: boolean; errors?: unknown } | null;
  if (!result || result.ok !== true) {
    return {
      ok: false,
      message: formatPublishErrors(result?.errors),
    };
  }

  await invalidateCatalog(client, productId, "product.archive");
  revalidatePath(ADMIN_PRODUCTS_PATH);
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${productId}`);
  redirect(`${ADMIN_PRODUCTS_PATH}/${productId}`);
}

// ---------------------------------------------------------------------------
// Taxonomy CRUD
// ---------------------------------------------------------------------------

const genreInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      SLUG_REGEX,
      "Slug must be lowercase kebab-case (a–z, 0–9, hyphens between segments).",
    )
    .max(160),
  name: z.string().trim().min(1, "Name is required.").max(200),
});

const pluginInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      SLUG_REGEX,
      "Slug must be lowercase kebab-case (a–z, 0–9, hyphens between segments).",
    )
    .max(160),
  name: z.string().trim().min(1, "Name is required.").max(200),
  vendor: z.string().trim().max(200).optional().nullable(),
});

export async function addGenre(formData: FormData): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  const parsed = genreInputSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: collectZodErrors(parsed.error),
    };
  }
  const client = await adminClient();
  const { error } = await client.from("genres").insert({
    slug: parsed.data.slug,
    name: parsed.data.name,
  });
  if (error) {
    return {
      ok: false,
      message: friendlyPostgresError(error, "create the genre"),
    };
  }
  invalidateForMutation({ kind: "taxonomy.change" });
  revalidatePath(ADMIN_TAXONOMIES_PATH);
  redirect(ADMIN_TAXONOMIES_PATH);
}

export async function addPlugin(formData: FormData): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  const parsed = pluginInputSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    vendor: formData.get("vendor"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: collectZodErrors(parsed.error),
    };
  }
  const client = await adminClient();
  const { error } = await client.from("plugins").insert({
    slug: parsed.data.slug,
    name: parsed.data.name,
    vendor: emptyToNull(parsed.data.vendor),
  });
  if (error) {
    return {
      ok: false,
      message: friendlyPostgresError(error, "create the plugin"),
    };
  }
  invalidateForMutation({ kind: "taxonomy.change" });
  revalidatePath(ADMIN_TAXONOMIES_PATH);
  redirect(ADMIN_TAXONOMIES_PATH);
}

export async function deleteGenre(formData: FormData): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { ok: false, message: "Missing genre id." };
  }
  const client = await adminClient();
  // Refuse if any products reference this genre (the schema uses ON DELETE
  // CASCADE, but we never want a quiet destructive op).
  const { count } = await client
    .from("product_genres")
    .select("product_id", { count: "exact", head: true })
    .eq("genre_id", id);
  if (count && count > 0) {
    return {
      ok: false,
      message: `${count} product(s) still reference this genre. Remove the genre from those products first.`,
    };
  }
  const { error } = await client.from("genres").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      message: friendlyPostgresError(error, "delete the genre"),
    };
  }
  invalidateForMutation({ kind: "taxonomy.change" });
  revalidatePath(ADMIN_TAXONOMIES_PATH);
  redirect(ADMIN_TAXONOMIES_PATH);
}

export async function deletePlugin(formData: FormData): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { ok: false, message: "Missing plugin id." };
  }
  const client = await adminClient();
  const { count } = await client
    .from("product_plugins")
    .select("product_id", { count: "exact", head: true })
    .eq("plugin_id", id);
  if (count && count > 0) {
    return {
      ok: false,
      message: `${count} product(s) still reference this plugin. Remove the plugin from those products first.`,
    };
  }
  const { error } = await client.from("plugins").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      message: friendlyPostgresError(error, "delete the plugin"),
    };
  }
  invalidateForMutation({ kind: "taxonomy.change" });
  revalidatePath(ADMIN_TAXONOMIES_PATH);
  redirect(ADMIN_TAXONOMIES_PATH);
}

// ---------------------------------------------------------------------------
// Media + Deliverables — register / update-alt-text / toggle-active / delete.
// ---------------------------------------------------------------------------
// Browser uploads DIRECTLY to Supabase Storage (no server round-trip for the
// bytes — better for large audio/video, no body-size limit on the action).
// These actions INSERT/UPDATE/DELETE the DB rows AFTER the Storage upload
// succeeds. Every claim is re-validated server-side:
//   - AAL2 admin (`requireAdminOrFailure({ aal2: true })`)
//   - the actual product slug is fetched from the DB by `productId` so the
//     client can't lie about the path's slug segment
//   - the path is checked for traversal (`hasPathTraversal`) and must match
//     a strict regex shaped `products/<actual-slug>/<kind>-<uuid>.<ext>` for
//     media or `products/<actual-slug>/v<N>/<sanitized-filename>.zip` for
//     deliverables — extensions/MIME/size are checked against the same
//     `uploads.ts` allow-lists the client already used (defense in depth)
// ---------------------------------------------------------------------------

const MEDIA_KIND_VALUES = ["cover_image", "audio_preview", "video_preview"] as const;
type MediaKind = (typeof MEDIA_KIND_VALUES)[number];

const MEDIA_KIND_TO_ROLE: Record<MediaKind, AssetRole> = {
  cover_image: "cover_image",
  audio_preview: "audio_preview",
  video_preview: "video_preview",
};

/** Strict canonical shape: `products/<product-id>/<kind>-<uuid>.<allowed-ext>`.
 * Keyed by the immutable product UUID (not the editable slug), so renaming a
 * product never orphans its files. */
const MEDIA_PATH_REGEX: Record<MediaKind, RegExp> = {
  cover_image:
    /^products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/cover_image-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|webp|jpe?g)$/,
  audio_preview:
    /^products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/audio_preview-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(mp3|m4a|aac)$/,
  video_preview:
    /^products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/video_preview-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(mp4|webm)$/,
};

/** Strict canonical shape: `products/<product-id>/v<N>/<sanitized-name>.zip`. */
const DELIVERABLE_PATH_REGEX =
  /^products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v(\d{1,6})\/[a-z0-9][a-z0-9._-]{0,250}\.zip$/;

const SHA_256_REGEX = /^[a-f0-9]{64}$/;

const mediaInputSchema = z
  .object({
    kind: z.enum(MEDIA_KIND_VALUES),
    bucket: z.string().trim().min(1).max(64),
    storageObjectPath: z.string().trim().max(512).optional().nullable(),
    externalUrl: z.string().trim().url().max(2048)
      .refine((u) => u.startsWith("https://"), "External URLs must use https.")
      .optional().nullable(),
    mimeType: z.string().trim().max(200).optional().nullable(),
    bytes: z.number().int().min(0).optional().nullable(),
    altText: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (v) => Boolean(v.storageObjectPath) !== Boolean(v.externalUrl),
    {
      message:
        "Provide exactly one of storageObjectPath or externalUrl (not both, not neither).",
    },
  );

const deliverableInputSchema = z.object({
  bucket: z.string().trim().min(1).max(64),
  storageObjectPath: z.string().trim().min(1).max(512),
  customerFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  bytes: z.number().int().min(1),
  sha256: z.string().trim().regex(SHA_256_REGEX).optional().nullable(),
  version: z.number().int().min(1).max(1_000_000),
});

/**
 * registerMedia — INSERT a `product_media` row for a Storage upload OR an
 * external URL. The client uploads to Storage directly (browser→Supabase,
 * no server round-trip for the bytes), then calls this action to insert the
 * DB row. The server re-validates the path against the actual product slug
 * fetched from the DB by `productId` — the client can't lie about the slug
 * in the path.
 */
export async function registerMedia(
  productId: string,
  input: unknown,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return {
      ok: false,
      message:
        outcome.reason === "unconfigured"
          ? "Admin isn't configured in this environment."
          : "Unauthorized — you must be signed in as an AAL2 admin.",
    };
  }

  if (!z.string().uuid().safeParse(productId).success) {
    return { ok: false, message: "Invalid product id." };
  }

  const parsed = mediaInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: collectZodErrors(parsed.error) };
  }
  const v = parsed.data;

  const client = await adminClient();

  // Fetch the actual product so the path's slug segment can be checked
  // against the DB-trusted slug — never the client's claim.
  const { data: product, error: prodErr } = await client
    .from("products")
    .select("id,slug")
    .eq("id", productId)
    .maybeSingle();
  if (prodErr) {
    return {
      ok: false,
      message: friendlyPostgresError(prodErr, "look up the product"),
    };
  }
  if (!product) {
    return { ok: false, message: "That product does not exist." };
  }

  const role = MEDIA_KIND_TO_ROLE[v.kind];

  // External URL mode — no storage path; just URL-validate (the Zod schema
  // already enforces a URL). MIME/bytes may be null.
  if (v.externalUrl) {
    if (v.mimeType && !MIME_ALLOWLISTS[role].includes(v.mimeType)) {
      return {
        ok: false,
        message: `MIME type ${v.mimeType} is not allowed for ${v.kind}.`,
      };
    }
    const row: Database["public"]["Tables"]["product_media"]["Insert"] = {
      product_id: productId,
      kind: v.kind,
      bucket: "product-public", // fixed server-side; never client-chosen
      storage_object_path: null,
      external_url: v.externalUrl,
      mime_type: v.mimeType ?? null,
      bytes: v.bytes ?? null,
      alt_text: emptyToNull(v.altText ?? null),
    };
    const { error } = await client.from("product_media").insert(row);
    if (error) {
      return {
        ok: false,
        message: friendlyPostgresError(error, "register the media"),
      };
    }
    await invalidateCatalog(client, productId);
    revalidatePath(`${ADMIN_PRODUCTS_PATH}/${productId}`);
    return { ok: true };
  }

  // Storage upload mode — strict path revalidation.
  const path = v.storageObjectPath;
  if (!path) {
    return {
      ok: false,
      message: "Provide either a storage path or an external URL.",
    };
  }
  if (hasPathTraversal(path)) {
    return { ok: false, message: "Invalid storage path (traversal rejected)." };
  }
  const match = MEDIA_PATH_REGEX[v.kind].exec(path);
  if (!match) {
    return {
      ok: false,
      message:
        "The storage path doesn't match the expected pattern for this kind.",
    };
  }
  if (match[1] !== product.id) {
    return {
      ok: false,
      message: "The storage path doesn't belong to this product.",
    };
  }
  if (v.mimeType && !MIME_ALLOWLISTS[role].includes(v.mimeType)) {
    return {
      ok: false,
      message: `MIME type ${v.mimeType} is not allowed for ${v.kind}.`,
    };
  }
  if (v.bytes != null && exceedsSize(role, v.bytes)) {
    return {
      ok: false,
      message: `File is too large for ${v.kind} (max ${MAX_BYTES[role].toLocaleString()} bytes).`,
    };
  }

  const row: Database["public"]["Tables"]["product_media"]["Insert"] = {
    product_id: productId,
    kind: v.kind,
    bucket: "product-public", // fixed server-side; never client-chosen
    storage_object_path: path,
    external_url: null,
    mime_type: v.mimeType ?? null,
    bytes: v.bytes ?? null,
    alt_text: emptyToNull(v.altText ?? null),
  };
  const { error } = await client.from("product_media").insert(row);
  if (error) {
    return {
      ok: false,
      message: friendlyPostgresError(error, "register the media"),
    };
  }
  await invalidateCatalog(client, productId);
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${productId}`);
  return { ok: true };
}

/**
 * updateMediaAltText — inline-edit the alt_text on a media row. Used by the
 * cover-image subsection for accessibility. Truncates to 500 chars; empty
 * string is normalized back to NULL.
 */
export async function updateMediaAltText(
  mediaId: string,
  altText: string,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  if (!z.string().uuid().safeParse(mediaId).success) {
    return { ok: false, message: "Invalid media id." };
  }

  const trimmed = (altText ?? "").trim().slice(0, 500);

  const client = await adminClient();

  const { data: row, error: fetchErr } = await client
    .from("product_media")
    .select("id,product_id")
    .eq("id", mediaId)
    .maybeSingle();
  if (fetchErr) {
    return {
      ok: false,
      message: friendlyPostgresError(fetchErr, "look up the media"),
    };
  }
  if (!row) {
    return { ok: false, message: "That media row does not exist." };
  }

  const { error: updateErr } = await client
    .from("product_media")
    .update({ alt_text: trimmed.length === 0 ? null : trimmed })
    .eq("id", mediaId);
  if (updateErr) {
    return {
      ok: false,
      message: friendlyPostgresError(updateErr, "update the alt text"),
    };
  }
  await invalidateCatalog(client, row.product_id);
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${row.product_id}`);
  return { ok: true };
}

/**
 * deleteMedia — delete the Storage object (if any) and the DB row. An
 * external-URL media row has no Storage object to delete.
 */
export async function deleteMedia(mediaId: string): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  if (!z.string().uuid().safeParse(mediaId).success) {
    return { ok: false, message: "Invalid media id." };
  }

  const client = await adminClient();

  const { data: row, error: fetchErr } = await client
    .from("product_media")
    .select("id,product_id,bucket,storage_object_path,external_url,kind")
    .eq("id", mediaId)
    .maybeSingle();
  if (fetchErr) {
    return {
      ok: false,
      message: friendlyPostgresError(fetchErr, "look up the media"),
    };
  }
  if (!row) {
    return { ok: false, message: "That media row does not exist." };
  }

  // DB row first, so a failure never leaves a row pointing at a deleted file.
  const { error: deleteErr } = await client
    .from("product_media")
    .delete()
    .eq("id", mediaId);
  if (deleteErr) {
    return {
      ok: false,
      message: friendlyPostgresError(deleteErr, "delete the media"),
    };
  }
  await invalidateCatalog(client, row.product_id);
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${row.product_id}`);
  return row.storage_object_path
    ? removeStorageObject(client, row.bucket, row.storage_object_path)
    : { ok: true };
}

/**
 * registerDeliverable — INSERT a `product_deliverables` row for a private
 * ZIP uploaded to `product-private`. The client computes the SHA-256 via
 * Web Crypto API before uploading, then uploads to
 * `products/<slug>/v<N>/<sanitized-filename>.zip`, then calls this action.
 */
export async function registerDeliverable(
  productId: string,
  input: unknown,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return {
      ok: false,
      message:
        outcome.reason === "unconfigured"
          ? "Admin isn't configured in this environment."
          : "Unauthorized — you must be signed in as an AAL2 admin.",
    };
  }

  if (!z.string().uuid().safeParse(productId).success) {
    return { ok: false, message: "Invalid product id." };
  }

  const parsed = deliverableInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: collectZodErrors(parsed.error) };
  }
  const v = parsed.data;

  const client = await adminClient();

  const { data: product, error: prodErr } = await client
    .from("products")
    .select("id,slug")
    .eq("id", productId)
    .maybeSingle();
  if (prodErr) {
    return {
      ok: false,
      message: friendlyPostgresError(prodErr, "look up the product"),
    };
  }
  if (!product) {
    return { ok: false, message: "That product does not exist." };
  }

  if (hasPathTraversal(v.storageObjectPath)) {
    return { ok: false, message: "Invalid storage path (traversal rejected)." };
  }
  const match = DELIVERABLE_PATH_REGEX.exec(v.storageObjectPath);
  if (!match) {
    return {
      ok: false,
      message:
        "The storage path doesn't match the expected pattern `products/<product-id>/v<N>/<name>.zip`.",
    };
  }
  if (match[1] !== product.id) {
    return {
      ok: false,
      message: "The storage path doesn't belong to this product.",
    };
  }
  if (Number.parseInt(match[2] ?? "0", 10) !== v.version) {
    return {
      ok: false,
      message: "The path's version segment doesn't match the supplied version.",
    };
  }

  // Defense-in-depth: re-validate the customer filename via uploads.ts.
  const fn = validateFilename(v.customerFilename);
  if (!fn.ok) {
    return { ok: false, message: "Invalid customer filename." };
  }

  if (!MIME_ALLOWLISTS.private_deliverable.includes(v.mimeType)) {
    return {
      ok: false,
      message: `MIME type ${v.mimeType} is not allowed for deliverables.`,
    };
  }
  if (exceedsSize("private_deliverable", v.bytes)) {
    return {
      ok: false,
      message: `File is too large (max ${MAX_BYTES.private_deliverable.toLocaleString()} bytes).`,
    };
  }

  const row: Database["public"]["Tables"]["product_deliverables"]["Insert"] = {
    product_id: productId,
    bucket: "product-private", // fixed server-side; never client-chosen
    storage_object_path: v.storageObjectPath,
    customer_filename: v.customerFilename,
    mime_type: v.mimeType,
    bytes: v.bytes,
    version: v.version,
    sha_256: v.sha256 ?? null,
    active: true,
  };
  const { error } = await client.from("product_deliverables").insert(row);
  if (error) {
    return {
      ok: false,
      message: friendlyPostgresError(error, "register the deliverable"),
    };
  }
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${productId}`);
  return { ok: true };
}

/**
 * toggleDeliverableActive — flip the `active` flag on a deliverable. Inactive
 * deliverables aren't offered to buyers, but the row + Storage object are
 * preserved (so the operator can reactivate later without re-uploading).
 */
export async function toggleDeliverableActive(
  deliverableId: string,
  active: boolean,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  if (!z.string().uuid().safeParse(deliverableId).success) {
    return { ok: false, message: "Invalid deliverable id." };
  }

  const client = await adminClient();

  const { data: row, error: fetchErr } = await client
    .from("product_deliverables")
    .select("id,product_id")
    .eq("id", deliverableId)
    .maybeSingle();
  if (fetchErr) {
    return {
      ok: false,
      message: friendlyPostgresError(fetchErr, "look up the deliverable"),
    };
  }
  if (!row) {
    return { ok: false, message: "That deliverable does not exist." };
  }

  const { error: updateErr } = await client
    .from("product_deliverables")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", deliverableId);
  if (updateErr) {
    return {
      ok: false,
      message: friendlyPostgresError(updateErr, "toggle the deliverable"),
    };
  }
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${row.product_id}`);
  return { ok: true };
}

/**
 * deleteDeliverable — delete a never-purchased deliverable (DB row, then the
 * Storage object). Purchased versions are protected by an FK: buyers download
 * the exact version they bought, active or not, so those can only be
 * deactivated (which stops new sales of that version).
 */
export async function deleteDeliverable(
  deliverableId: string,
): Promise<ActionResult> {
  const outcome = await requireAdminOrFailure({ aal2: true });
  if (!outcome.ok) {
    return { ok: false, message: "Unauthorized — AAL2 required." };
  }
  if (!z.string().uuid().safeParse(deliverableId).success) {
    return { ok: false, message: "Invalid deliverable id." };
  }

  const client = await adminClient();

  const { data: row, error: fetchErr } = await client
    .from("product_deliverables")
    .select("id,product_id,bucket,storage_object_path")
    .eq("id", deliverableId)
    .maybeSingle();
  if (fetchErr) {
    return {
      ok: false,
      message: friendlyPostgresError(fetchErr, "look up the deliverable"),
    };
  }
  if (!row) {
    return { ok: false, message: "That deliverable does not exist." };
  }

  // DB row first: the FK from order items (0012) refuses to delete a version
  // someone bought, so the file is only removed once nothing references it.
  const { error: deleteErr } = await client
    .from("product_deliverables")
    .delete()
    .eq("id", deliverableId);
  if (deleteErr) {
    return {
      ok: false,
      message:
        deleteErr.code === "23503"
          ? "This file version has been purchased, so it can't be deleted — buyers still download it. Deactivate it instead to stop selling it."
          : friendlyPostgresError(deleteErr, "delete the deliverable"),
    };
  }
  revalidatePath(`${ADMIN_PRODUCTS_PATH}/${row.product_id}`);
  return removeStorageObject(client, row.bucket, row.storage_object_path);
}

/** Remove a Storage object after its DB row is gone; report failure honestly. */
async function removeStorageObject(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string,
): Promise<ActionResult> {
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    return {
      ok: false,
      message: `The record was removed, but the stored file could not be deleted (${bucket}/${path}). Remove it from Supabase Storage manually.`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  if (v.trim() === "") return null;
  return v;
}

function friendlyPostgresError(
  err: { code?: string; message: string },
  verb: string,
): string {
  // PostgREST error codes mirror Postgres SQLSTATE. Map the common ones to
  // actionable, non-enumerating messages.
  const code = err.code ?? "";
  if (code === "23505") {
    return `Could not ${verb}: a row with this slug already exists. Pick a unique slug.`;
  }
  if (code === "23503") {
    return `Could not ${verb}: a referenced row does not exist (e.g. a deleted genre/plugin).`;
  }
  if (code === "23514" || code === "check_violation") {
    return `Could not ${verb}: a value violated a database CHECK constraint (e.g. price < 0, BPM out of range, or a slug format mismatch).`;
  }
  // Strip the leading "PostgRESTError:" / "ApiError:" noise; keep the message.
  const msg = err.message?.replace(/^(PostgRESTError|ApiError):\s*/i, "");
  return `Could not ${verb}: ${msg ?? "unexpected database error"}`;
}

/** Heuristically map a Postgres error to a per-field error for the form. */
function inferFieldErrors(err: {
  code?: string;
  message: string;
}): FieldErrors {
  const msg = err.message ?? "";
  if (err.code === "23505" && /slug/i.test(msg)) {
    return { slug: "A product with this slug already exists." };
  }
  return {};
}

function collectZodErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) {
      out[key] = issue.message;
    }
  }
  return out;
}

const PUBLISH_ERROR_LABELS: Record<string, string> = {
  unauthorized: "You are not authorized to publish (must be an AAL2 admin).",
  not_found: "The product no longer exists.",
  conflict:
    "Someone else edited this product. Reload the page and try publishing again.",
  title_missing: "Title is required before publishing.",
  summary_missing: "Short description is required before publishing.",
  invalid_price: "Price must be a non-negative integer before publishing.",
  invalid_currency:
    "Currency must be a 3-letter ISO 4217 code before publishing.",
  cover_missing:
    "A validated cover image is required before publishing. Upload one in the Media panel below.",
  private_zip_missing:
    "A paid product requires at least one validated, active deliverable ZIP. Upload one in the Deliverables panel below.",
  pending_uploads:
    "There are pending uploads for this product. Finalize or cancel them first.",
};

function formatPublishErrors(errors: unknown): string {
  if (!errors) return "Publish was rejected (no error details provided).";
  if (Array.isArray(errors)) {
    if (errors.length === 0) return "Publish was rejected.";
    const parts = (errors as (string | number)[])
      .map((e) => String(e))
      .map((e) => PUBLISH_ERROR_LABELS[e] ?? e);
    return `Publish rejected: ${parts.join("; ")}.`;
  }
  if (typeof errors === "string") {
    return `Publish rejected: ${PUBLISH_ERROR_LABELS[errors] ?? errors}`;
  }
  try {
    return `Publish rejected: ${JSON.stringify(errors)}`;
  } catch {
    return "Publish rejected.";
  }
}

/**
 * Replace a product's genre + plugin joins with the supplied sets. Best-effort:
 * Supabase's HTTP API has no transaction. We delete-then-insert; if a step
 * fails the operator can re-open the editor and fix the joins.
 *
 * Returns null on success or a non-fatal error message.
 */
async function syncTaxonomyJoins(
  client: SupabaseClient<Database>,
  productId: string,
  genres: string[],
  plugins: {
    id: string;
    minVersion?: string | null | undefined;
    required: boolean;
  }[],
): Promise<string | null> {
  // Genres
  {
    const del = await client
      .from("product_genres")
      .delete()
      .eq("product_id", productId);
    if (del.error) {
      return friendlyPostgresError(del.error, "sync product genres");
    }
    if (genres.length > 0) {
      const rows = genres.map((gid) => ({
        product_id: productId,
        genre_id: gid,
      }));
      const ins = await client.from("product_genres").insert(rows);
      if (ins.error) {
        return friendlyPostgresError(ins.error, "sync product genres");
      }
    }
  }
  // Plugins
  {
    const del = await client
      .from("product_plugins")
      .delete()
      .eq("product_id", productId);
    if (del.error) {
      return friendlyPostgresError(del.error, "sync product plugins");
    }
    if (plugins.length > 0) {
      const rows = plugins.map((p) => ({
        product_id: productId,
        plugin_id: p.id,
        min_version: emptyToNull(p.minVersion),
        required: p.required,
      }));
      const ins = await client.from("product_plugins").insert(rows);
      if (ins.error) {
        return friendlyPostgresError(ins.error, "sync product plugins");
      }
    }
  }
  return null;
}
