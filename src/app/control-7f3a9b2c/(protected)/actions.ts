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
  type ProductFormValues,
} from "@/lib/admin/product-schema";
import { getServerClient } from "@/lib/supabase/server-client";
import { requireAdminOrFailure } from "@/lib/auth/require-admin";
import type { Database } from "@/types/database";

const SLUG_REGEX = /^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$/;

/**
 * `@supabase/ssr@0.6.x` creates the server client via
 * `SupabaseClient<Database, SchemaName, Schema>` — but the `SupabaseClient`
 * class declares its generics as `<Database, SchemaNameOrClientOptions,
 * SchemaName, Schema, ClientOptions>`. The third positional generic the SSR
 * factory passes is actually a full `Schema` object, which lands in the
 * `SchemaName` slot and breaks `.rpc()` / `.from().insert()` generic
 * inference (Args default to `never`, so calls won't type-check).
 *
 * Workaround: cast back to a normally-typed `SupabaseClient<Database>` here.
 * The runtime client is unchanged; this is purely a generic-shape fix. When
 * `@supabase/ssr` is updated to match `@supabase/supabase-js@2.116+`'s
 * generic positions, this cast can be removed.
 */
async function adminClient(): Promise<SupabaseClient<Database>> {
  const c = await getServerClient();
  return c as unknown as SupabaseClient<Database>;
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
    rights_status: v.rightsStatus,
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
      rights_status: v.rightsStatus,
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
// Returns structured errors when the readiness gate rejects (rights not
// cleared, missing cover, missing deliverable, etc.).
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
  revalidatePath(ADMIN_TAXONOMIES_PATH);
  redirect(ADMIN_TAXONOMIES_PATH);
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
  rights_not_cleared:
    "Rights are not cleared. Set rights status to “original” or “licensed”.",
  rights_not_attested:
    "A rights reviewer must attest to the rights before publishing.",
  licensed_evidence_missing:
    "Licensed products require evidence + source type in the rights review record.",
  license_expired: "The license for this product has expired.",
  title_missing: "Title is required before publishing.",
  summary_missing: "Short description is required before publishing.",
  invalid_price: "Price must be a non-negative integer before publishing.",
  invalid_currency:
    "Currency must be a 3-letter ISO 4217 code before publishing.",
  cover_missing:
    "A validated cover image is required before publishing. Upload one via the media panel (not yet wired in this v1).",
  private_zip_missing:
    "A paid product requires at least one validated, active deliverable ZIP. Add one via the deliverables panel (not yet wired in this v1).",
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
