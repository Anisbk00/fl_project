import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";
import type { Database } from "@/types/database";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { LinkButton } from "@/components/site/button";
import { Badge } from "@/components/site/badge";
import { ErrorState } from "@/components/site/state";
import {
  ProductForm,
  type ProductFormGenre,
  type ProductFormPlugin,
  type ProductFormPluginLink,
  type ProductFormValues,
} from "@/components/admin/product-form";
import { ProductLifecycleButtons } from "@/components/admin/product-lifecycle-buttons";

export const metadata: Metadata = {
  title: "Edit product",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Data fetch — full product row + joined genres + plugins + the taxonomy
// lists (for the multi-select). All reads use the cookie-aware server client
// so RLS sees the AAL2 admin and allows access to drafts/archived rows.
// ---------------------------------------------------------------------------

interface ProductDetailRow {
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
  row_version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductGenreJoinRow {
  genre_id: string;
}
interface ProductPluginJoinRow {
  plugin_id: string;
  min_version: string | null;
  required: boolean;
}

async function adminClient(): Promise<SupabaseClient<Database>> {
  const c = await getServerClient();
  return c as unknown as SupabaseClient<Database>;
}

async function loadEditData(id: string) {
  try {
    const client = await adminClient();
    const [prodRes, genreJoinRes, pluginJoinRes, genresRes, pluginsRes] =
      await Promise.all([
        client
          .from("products")
          .select(
            "id,slug,title,short_description,long_description,product_type,lifecycle,rights_status,price,price_currency,compare_at_price,daw_name,daw_version,bpm,musical_key,duration_seconds,total_size_bytes,included_formats,featured,seo_title,seo_description,row_version,published_at,created_at,updated_at",
          )
          .eq("id", id)
          .maybeSingle(),
        client
          .from("product_genres")
          .select("genre_id")
          .eq("product_id", id),
        client
          .from("product_plugins")
          .select("plugin_id,min_version,required")
          .eq("product_id", id),
        client.from("genres").select("id,slug,name").order("name"),
        client
          .from("plugins")
          .select("id,slug,name,vendor")
          .order("name"),
      ]);

    if (prodRes.error) {
      return {
        error: `Could not load the product: ${prodRes.error.message}`,
      };
    }
    if (!prodRes.data) {
      return { error: "not_found" as const };
    }
    if (genreJoinRes.error || pluginJoinRes.error || genresRes.error || pluginsRes.error) {
      return {
        error: `Could not load the product's taxonomy: ${
          genreJoinRes.error?.message ||
          pluginJoinRes.error?.message ||
          genresRes.error?.message ||
          pluginsRes.error?.message
        }`,
      };
    }
    return {
      product: prodRes.data as ProductDetailRow,
      genreJoins: (genreJoinRes.data ?? []) as ProductGenreJoinRow[],
      pluginJoins: (pluginJoinRes.data ?? []) as ProductPluginJoinRow[],
      genres: (genresRes.data ?? []) as ProductFormGenre[],
      plugins: (pluginsRes.data ?? []) as ProductFormPlugin[],
    };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : "Supabase is not configured in this environment.",
    };
  }
}

export default async function ProductEditorPage({ params }: PageProps) {
  const { id } = await params;
  const data = await loadEditData(id);

  // Generic error (Supabase unconfigured, RLS denied, etc.).
  if ("error" in data) {
    if (data.error === "not_found") {
      notFound();
    }
    return (
      <Container>
        <SectionHeading eyebrow="Admin" title="Edit product" as="h1" />
        <div className="mt-8">
          <ErrorState
            title="Couldn't load this product"
            description={data.error}
            action={
              <LinkButton href={ADMIN_PRODUCTS_PATH} variant="outline">
                Back to products
              </LinkButton>
            }
          />
        </div>
      </Container>
    );
  }

  const { product, genreJoins, pluginJoins, genres, plugins } = data;

  const initialValues: ProductFormValues = {
    id: product.id,
    rowVersion: product.row_version,
    title: product.title,
    slug: product.slug,
    shortDescription: product.short_description,
    longDescription: product.long_description ?? "",
    productType: product.product_type,
    rightsStatus: product.rights_status,
    price: product.price,
    priceCurrency: product.price_currency,
    compareAtPrice: product.compare_at_price,
    dawName: product.daw_name ?? "",
    dawVersion: product.daw_version ?? "",
    bpm: product.bpm,
    musicalKey: product.musical_key ?? "",
    durationSeconds: product.duration_seconds,
    totalSizeBytes: product.total_size_bytes,
    includedFormats: product.included_formats ?? "",
    featured: product.featured,
    seoTitle: product.seo_title ?? "",
    seoDescription: product.seo_description ?? "",
    selectedGenreIds: genreJoins.map((g) => g.genre_id),
    selectedPlugins: pluginJoins.map<ProductFormPluginLink>((p) => ({
      id: p.plugin_id,
      minVersion: p.min_version,
      required: p.required,
    })),
  };

  // Lifecycle / rights summary badges + lifecycle action buttons.
  const lifecycleBadge =
    product.lifecycle === "published"
      ? <Badge tone="success">Published</Badge>
      : product.lifecycle === "archived"
        ? <Badge tone="neutral">Archived</Badge>
        : <Badge tone="warning">Draft</Badge>;
  const rightsBadge =
    product.rights_status === "original"
      ? <Badge tone="brand">Original</Badge>
      : product.rights_status === "licensed"
        ? <Badge tone="brand">Licensed</Badge>
        : product.rights_status === "rejected"
          ? <Badge tone="danger">Rejected</Badge>
          : <Badge tone="neutral">Unreviewed</Badge>;

  return (
    <Container>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={ADMIN_PRODUCTS_PATH}
          className="t-caption text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
        >
          ← Products
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          eyebrow="Admin"
          title={product.title}
          as="h1"
          description={`Slug: ${product.slug} · row_version: ${product.row_version}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          {lifecycleBadge}
          {rightsBadge}
          {product.featured ? <Badge tone="brand">Featured</Badge> : null}
        </div>
      </div>

      {/* Lifecycle actions (transactional RPCs). These call the publish /
          unpublish / archive Server Actions, which re-check AAL2 + the
          expected row_version and surface structured errors when the readiness
          gate rejects. */}
      <div className="mt-6 rounded-xl border border-line bg-surface p-4 flex flex-wrap items-center gap-3">
        <p className="t-label text-ink mr-auto">Lifecycle</p>
        <ProductLifecycleButtons
          productId={product.id}
          expectedVersion={product.row_version}
          lifecycle={product.lifecycle}
        />
        <LinkButton
          href={`/control-7f3a9b2c/products/${product.id}/preview`}
          variant="ghost"
          size="sm"
        >
          Preview
        </LinkButton>
      </div>

      <p className="t-body-sm text-ink-secondary mt-6 max-w-2xl">
        Editing uses optimistic concurrency: the form sends the last-read
        <code className="t-technical"> row_version</code> with each save. If
        another edit wins, the save is rejected and you must reload.
      </p>

      <div className="mt-8">
        <ProductForm
          initialValues={initialValues}
          genres={genres}
          plugins={plugins}
          submitLabel="Save changes"
        />
      </div>
    </Container>
  );
}
