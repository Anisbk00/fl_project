import type { MetadataRoute } from "next";
import { isCatalogReady, searchCatalog } from "@/features/catalog/repository";
import { siteUrl } from "@/features/catalog/seo";
import type { CatalogParams } from "@/features/catalog/url-params";

/**
 * Sitemap — canonical public routes + published product URLs.
 *
 * NEVER includes search/filter URLs, drafts, admin routes, cart, or APIs. Product `lastModified` comes from the
 * truthful `published_at`. With no live Supabase project linked, only the
 * static canonical routes are emitted.
 */
// Re-generate hourly so newly published products appear without a redeploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/catalog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/free`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    ...["terms", "privacy", "refunds", "license"].map((p) => ({
      url: `${base}/legal/${p}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];

  if (!isCatalogReady()) return staticRoutes;

  const productRoutes: MetadataRoute.Sitemap = [];
  try {
    // Page through published products. (A multi-sitemap index is a Step 8
    // concern for very large catalogs; Step 3 covers the seed volume.)
    const emptyParams = {
      q: "", types: [], genres: [], daw: "", plugins: [], pluginFree: false,
      key: "", sort: "newest" as const, page: 1,
    } as unknown as CatalogParams;
    for (let page = 1; page <= 50; page++) {
      const res = await searchCatalog({ ...emptyParams, page });
      for (const p of res.products) {
        productRoutes.push({
          url: `${base}/products/${encodeURIComponent(p.slug)}`,
          lastModified: p.publishedAt ? new Date(p.publishedAt) : now,
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
      if (res.products.length < res.pageSize) break;
    }
  } catch {
    // If the catalog can't be read, emit only static routes (no crash).
    return staticRoutes;
  }

  return [...staticRoutes, ...productRoutes];
}
