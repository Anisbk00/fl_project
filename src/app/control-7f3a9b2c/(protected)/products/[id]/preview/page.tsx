import type { Metadata } from "next";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { ErrorState } from "@/components/site/state";
import { Badge } from "@/components/site/badge";
import { LinkButton } from "@/components/site/button";
import { Price } from "@/components/site/price";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";

export const metadata: Metadata = {
  title: "Product preview",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  long_description: string | null;
  product_type: string;
  lifecycle: string;
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
  published_at: string | null;
}

interface GenreRow { slug: string; name: string }
interface PluginRow { slug: string; name: string; vendor: string | null }

function formatDuration(s: number | null): string | null {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatBytes(b: number | null): string | null {
  if (b == null) return null;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function ProductPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminOrRedirect({ aal2: true });
  const { id } = await params;

  let product: ProductRow | null = null;
  let genres: GenreRow[] = [];
  let plugins: PluginRow[] = [];
  let loadError: string | null = null;

  try {
    const client = await getServerClient();
    const [p, pg, pp] = await Promise.all([
      client
        .from("products")
        .select("id, slug, title, short_description, long_description, product_type, lifecycle, price, price_currency, compare_at_price, daw_name, daw_version, bpm, musical_key, duration_seconds, total_size_bytes, included_formats, featured, seo_title, seo_description, published_at")
        .eq("id", id)
        .maybeSingle(),
      client
        .from("product_genres")
        .select("genre:genres(slug, name)")
        .eq("product_id", id),
      client
        .from("product_plugins")
        .select("plugin:plugins(slug, name, vendor)")
        .eq("product_id", id),
    ]);
    if (p.error) throw new Error(p.error.message);
    if (pg.error) throw new Error(pg.error.message);
    if (pp.error) throw new Error(pp.error.message);
    if (!p.data) {
      notFound();
    }
    product = p.data as ProductRow;
    genres = ((pg.data ?? []) as unknown as { genre: GenreRow }[]).map((r) => r.genre).filter(Boolean);
    plugins = ((pp.data ?? []) as unknown as { plugin: PluginRow }[]).map((r) => r.plugin).filter(Boolean);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load the product.";
  }

  if (loadError) {
    return (
      <Container>
        <ErrorState title="Couldn't load the product" description={loadError} />
      </Container>
    );
  }
  if (!product) {
    return (
      <Container>
        <ErrorState title="Product not found" description="This product does not exist or was deleted." />
      </Container>
    );
  }

  const lifecycleTone: "neutral" | "success" | "warning" =
    product.lifecycle === "published" ? "success" : product.lifecycle === "draft" ? "warning" : "neutral";

  return (
    <Container>
      <Link href={`${ADMIN_PRODUCTS_PATH}/${id}`} className="t-caption text-ink-secondary hover:text-ink">← Back to editor</Link>
      <SectionHeading eyebrow="Admin preview" title="Product preview" as="h1" description="A read-only view of how this product appears. This page is noindex and not public." />
      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <article className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lifecycleTone}>{product.lifecycle}</Badge>
            {product.featured ? <Badge tone="brand">Featured</Badge> : null}
          </div>
          <h2 className="t-display text-ink">{product.title}</h2>
          <p className="t-body-lg text-ink-secondary">{product.short_description}</p>
          {product.long_description ? (
            <div className="t-body text-ink-secondary whitespace-pre-wrap rounded-xl border border-line bg-surface p-5">
              {product.long_description}
            </div>
          ) : null}
        </article>
        <aside className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <Price
            minorUnits={product.price}
            currency={product.price_currency}
            compareAtMinorUnits={product.compare_at_price ?? undefined}
          />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 t-technical text-ink">
            <dt className="text-ink-muted">Type</dt>
            <dd>{product.product_type}</dd>
            {product.daw_name ? (
              <>
                <dt className="text-ink-muted">DAW</dt>
                <dd>{product.daw_name}{product.daw_version ? ` ${product.daw_version}` : ""}</dd>
              </>
            ) : null}
            {product.bpm ? (
              <>
                <dt className="text-ink-muted">BPM</dt>
                <dd>{product.bpm}</dd>
              </>
            ) : null}
            {product.musical_key ? (
              <>
                <dt className="text-ink-muted">Key</dt>
                <dd>{product.musical_key}</dd>
              </>
            ) : null}
            {product.duration_seconds ? (
              <>
                <dt className="text-ink-muted">Duration</dt>
                <dd>{formatDuration(product.duration_seconds)}</dd>
              </>
            ) : null}
            {product.total_size_bytes ? (
              <>
                <dt className="text-ink-muted">Size</dt>
                <dd>{formatBytes(product.total_size_bytes)}</dd>
              </>
            ) : null}
            {product.included_formats ? (
              <>
                <dt className="text-ink-muted">Formats</dt>
                <dd>{product.included_formats}</dd>
              </>
            ) : null}
            {genres.length ? (
              <>
                <dt className="text-ink-muted">Genres</dt>
                <dd>{genres.map((g) => g.name).join(" · ")}</dd>
              </>
            ) : null}
            {plugins.length ? (
              <>
                <dt className="text-ink-muted">Plugins</dt>
                <dd>{plugins.map((p) => p.name).join(" · ")}</dd>
              </>
            ) : null}
            <dt className="text-ink-muted">Slug</dt>
                <dd className="break-all">{product.slug}</dd>
          </dl>
          {product.seo_title || product.seo_description ? (
            <div className="mt-2 border-t border-line pt-3">
              <p className="t-eyebrow">SEO</p>
              {product.seo_title ? <p className="t-body-sm text-ink mt-1">{product.seo_title}</p> : null}
              {product.seo_description ? <p className="t-caption text-ink-muted mt-1">{product.seo_description}</p> : null}
            </div>
          ) : null}
        </aside>
      </div>
      <div className="mt-6">
        <LinkButton href={`${ADMIN_PRODUCTS_PATH}/${id}`} variant="outline">Back to editor</LinkButton>
      </div>
    </Container>
  );
}
