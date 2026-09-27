import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container, Section, Grid } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { Badge } from "@/components/site/badge";
import { Price } from "@/components/site/price";
import { Button } from "@/components/site/button";
import { addToCartAction } from "@/app/(store)/cart/actions";
import { ProductCard } from "@/components/site/product-card";
import { ProductArtwork } from "@/components/site/product-artwork";
import { AudioPreview } from "@/components/site/audio-preview";
import { JsonLd } from "@/components/site/json-ld";
import { SafeMarkdown } from "@/features/catalog/markdown";
import { EmptyState } from "@/components/site/state";
import {
  isCatalogReady,
  getProductDetail,
  getRelatedProducts,
} from "@/features/catalog/repository";
import {
  PRODUCT_TYPE_LABELS,
  formatBytes,
  formatDuration,
  type ProductDetailVM,
} from "@/features/catalog/view-models";
import {
  coverUrl,
  publicMediaUrl,
  productCanonical,
  breadcrumbJsonLd,
  productJsonLd,
} from "@/features/catalog/seo";

// Within-request memoization so metadata + render share one product query.
const getProductDetailMemo = cache(async (slug: string) => {
  return getProductDetail(slug);
});

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isCatalogReady()) return { title: "Product" };
  const product = await getProductDetailMemo(slug);
  if (!product) return { title: "Not found" };
  const title = product.seoTitle ?? product.title;
  const description = product.seoDescription ?? product.shortDescription;
  return {
    title,
    description,
    alternates: { canonical: productCanonical(slug) },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: productCanonical(slug),
      type: "website",
      images: coverUrl(product) ? [{ url: coverUrl(product)!, alt: product.title }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  // Honest unconfigured state (sandbox): not a fixture fallback, not a crash.
  if (!isCatalogReady()) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="This product isn't available here" titleAs="h1"
            description="This environment has no live Supabase project linked, so live product data can't be loaded."
          />
        </Container>
      </Section>
    );
  }

  const product = await getProductDetailMemo(slug);
  if (!product) {
    // Nondisclosing 404 for draft/archived/unreviewed/rejected/missing slugs.
    notFound();
  }

  const related = await getRelatedProducts(slug, 4).catch(() => []);

  return <ProductView product={product} related={related} />;
}

function ProductView({
  product,
  related,
}: {
  product: ProductDetailVM;
  related: Awaited<ReturnType<typeof getRelatedProducts>>;
}) {
  const cover = coverUrl(product);
  const audioSrc = publicMediaUrl(product.audioPreviewPath);

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Catalog", path: "/catalog" },
    { name: product.title, path: `/products/${product.slug}` },
  ];

  const compatibility: { label: string; value: string | null }[] = [
    { label: "Product type", value: PRODUCT_TYPE_LABELS[product.productType] },
    { label: "DAW", value: product.dawName ? `${product.dawName}${product.dawVersion ? ` ${product.dawVersion}` : ""}` : null },
    { label: "BPM", value: product.bpm ? String(product.bpm) : null },
    { label: "Key", value: product.musicalKey ?? null },
    { label: "Duration", value: product.durationSeconds ? (formatDuration(product.durationSeconds) ?? null) : null },
    { label: "Formats", value: product.formats?.join(", ") ?? null },
    { label: "Size", value: formatBytes(product.totalSizeBytes) ?? null },
    { label: "Updated", value: formatDate(product.updatedAt) },
  ];
  const requiredPlugins = product.plugins.filter((p) => p.required);
  const optionalPlugins = product.plugins.filter((p) => !p.required);

  return (
    <>
      <JsonLd data={productJsonLd(product)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />

      {/* Breadcrumb */}
      <Container as="nav" aria-label="Breadcrumb" className="pt-6">
        <ol className="flex flex-wrap items-center gap-1 t-caption text-ink-muted">
          {crumbs.map((c, i) => (
            <li key={c.path} className="flex items-center gap-1">
              {i < crumbs.length - 1 ? (
                <Link href={c.path} className="hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">
                  {c.name}
                </Link>
              ) : (
                <span aria-current="page" className="text-ink-secondary">{c.name}</span>
              )}
              {i < crumbs.length - 1 ? <span aria-hidden="true">/</span> : null}
            </li>
          ))}
        </ol>
      </Container>

      <Section className="py-8 sm:py-10 lg:py-12">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:items-start">
            {/* Cover + preview */}
            <div className="flex flex-col gap-4">
              <ProductArtwork seed={product.artworkSeed} coverUrl={cover} label={product.title} className="rounded-xl border border-line" sizes="(min-width: 1024px) 50vw, 100vw" priority />
              {audioSrc ? (
                <AudioPreview src={audioSrc} id={`detail-${product.slug}`} label={product.title} variant="full" />
              ) : (
                <p className="t-caption text-ink-muted">No audio preview available.</p>
              )}
            </div>

            {/* Summary */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{PRODUCT_TYPE_LABELS[product.productType]}</Badge>
                {product.free ? <Badge tone="success">Free</Badge> : null}
                {product.genres.map((g) => (
                  <Badge key={g.slug} tone="outline">{g.name}</Badge>
                ))}
              </div>
              <h1 className="t-display text-ink">{product.title}</h1>
              <p className="t-body-lg text-ink-secondary">{product.shortDescription}</p>
              <div className="flex flex-wrap items-center gap-4">
                <Price minorUnits={product.price} currency={product.currency} compareAtMinorUnits={product.compareAtPrice} />
                <form action={addToCartAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <Button type="submit">{product.free ? "Get it free" : "Add to cart"}</Button>
                </form>
              </div>
              <p className="t-caption text-ink-muted">
                Secure checkout by Stripe · no account needed · files delivered by email after payment.
              </p>

              {/* Compatibility summary (before any future purchase area) */}
              <div className="rounded-xl border border-line bg-surface p-5">
                <h2 className="t-heading-3 text-ink mb-3">Compatibility</h2>
                <p className="t-body-sm text-ink-secondary mb-4">
                  Check these details before purchase. DAW and plugin names are
                  referenced factually for compatibility, not as affiliation.
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {compatibility.map((row) => (
                    <div key={row.label}>
                      <dt className="t-caption text-ink-muted">{row.label}</dt>
                      <dd className="t-technical text-ink">{row.value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
                {requiredPlugins.length > 0 ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <h3 className="t-label text-ink mb-2">Required plugins</h3>
                    <ul className="flex flex-col gap-1">
                      {requiredPlugins.map((p) => (
                        <li key={p.slug} className="t-body-sm text-ink">
                          {p.name}{p.minVersion ? ` (min ${p.minVersion})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {optionalPlugins.length > 0 ? (
                  <div className="mt-3">
                    <h3 className="t-label text-ink mb-2">Optional plugins</h3>
                    <ul className="flex flex-col gap-1">
                      {optionalPlugins.map((p) => (
                        <li key={p.slug} className="t-body-sm text-ink-secondary">
                          {p.name}{p.minVersion ? ` (min ${p.minVersion})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/legal/license" className="t-body-sm text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">
                  License summary (draft)
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Long-form description (safe Markdown, raw HTML disabled) */}
      {product.longDescription ? (
        <Section className="py-8">
          <Container width="prose">
            <h2 className="t-heading-1 text-ink mb-4">About this product</h2>
            <SafeMarkdown source={product.longDescription} />
          </Container>
        </Section>
      ) : null}

      {/* Related products */}
      {related.length > 0 ? (
        <Section className="py-12">
          <Container>
            <SectionHeading eyebrow="Related" title="You might also like" />
            <div className="mt-8">
              <Grid min="16rem">
                {related.map((p) => (
                  <ProductCard key={p.slug} product={p} />
                ))}
              </Grid>
            </div>
          </Container>
        </Section>
      ) : null}
    </>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}
