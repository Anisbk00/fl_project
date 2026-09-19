import { publicEnv } from "@/lib/env/public";
import { siteConfig } from "@/lib/site-config";
import { PRODUCT_TYPE_LABELS, type ProductDetailVM } from "./view-models";

/**
 * SEO builders (Step 3). All structured data is TRUTHFUL:
 *   - `Product` includes only visible, public fields (name, description, image,
 *     category). It NEVER includes fabricated Review/AggregateRating, brand
 *     claims, SKU, inventory, shipping, or return info.
 *   - `Offer`/merchant properties are OMITTED until commerce is genuinely
 *     enabled (Step 5). Step 3 must not falsely advertise availability or
 *     checkout capability.
 *   - JSON-LD is serialized with `<`/`>`/`&` escaped to unicode to prevent
 *     `</script>` injection, then rendered as a single
 *     `application/ld+json` script.
 */

export function siteUrl(): string {
  return publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

/** Public Supabase storage object URL for a path in a public bucket, or null. */
export function publicMediaUrl(path?: string | null): string | null {
  if (!path) return null;
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  // Strip a leading slash to avoid double slashes; the path is bucket/...
  const clean = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${clean}`;
}

/** Build a public cover URL for a product (live data) or a deterministic fallback. */
export function coverUrl(product: { coverPath?: string; slug: string }): string | null {
  const live = publicMediaUrl(product.coverPath);
  if (live) return live;
  // Fallback to the local abstract mark (deterministic, original).
  return `${siteUrl()}/icon.svg`;
}

export function productCanonical(slug: string): string {
  return `${siteUrl()}/products/${encodeURIComponent(slug)}`;
}

export function catalogCanonical(): string {
  return `${siteUrl()}/catalog`;
}

export function freeCanonical(): string {
  return `${siteUrl()}/free`;
}

/** BreadcrumbList JSON-LD matching the visible breadcrumb. */
export function breadcrumbJsonLd(
  crumbs: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${siteUrl()}${c.path}`,
    })),
  };
}

/** Product JSON-LD — visible + truthful only. No fake offers/reviews. */
export function productJsonLd(product: ProductDetailVM) {
  const image = coverUrl(product) ?? undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.shortDescription,
    ...(image ? { image } : {}),
    category: PRODUCT_TYPE_LABELS[product.productType],
    // No offers, no brand claims, no reviews, no aggregateRating, no SKU/
    // inventory/shipping/return info — Step 3 does not falsely advertise
    // commerce capability.
  };
}

/**
 * Serialize a JSON-LD object to a safe HTML string for a single
 * `application/ld+json` script. Escapes `<`, `>`, and `&` to unicode escapes
 * so stored content cannot break out of the script element.
 */
export function serializeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
