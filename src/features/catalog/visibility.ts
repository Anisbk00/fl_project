import type { Lifecycle, RightsStatus } from "./schema";

/**
 * The public visibility rule.
 *
 * A product is visible to anonymous/public visitors ONLY when ALL of these
 * hold:
 *   - lifecycle === "published"
 *   - rightsStatus is "original" or "licensed" (rights-cleared)
 *
 * Draft, archived, unreviewed, and rejected products are NEVER public.
 *
 * In production this rule is enforced by Supabase RLS policies. In this
 * sandbox (SQLite, no RLS) it is enforced HERE, by the data-access layer,
 * for every public read path. The pure function is unit-tested directly so
 * the rule cannot silently regress.
 */

export interface VisibilityCheckable {
  lifecycle: Lifecycle | string;
  rightsStatus: RightsStatus | string;
}

export function isPubliclyVisible(
  product: VisibilityCheckable,
): boolean {
  return (
    product.lifecycle === "published" &&
    (product.rightsStatus === "original" ||
      product.rightsStatus === "licensed")
  );
}

export function filterPublic<T extends VisibilityCheckable>(
  products: readonly T[],
): T[] {
  return products.filter(isPubliclyVisible);
}
