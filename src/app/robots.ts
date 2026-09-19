import type { MetadataRoute } from "next";
import { siteUrl } from "@/features/catalog/seo";

/**
 * Robots policy. Allows all public crawling and references the sitemap.
 * A robots `Disallow` is crawl guidance only — NEVER access control. Access is
 * enforced by RLS + the application authorization layer.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
