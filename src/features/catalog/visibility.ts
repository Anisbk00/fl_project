import type { Lifecycle } from "./schema";

/**
 * The public visibility rule: a product is visible to anonymous/public
 * visitors ONLY when lifecycle === "published". Draft and archived products
 * are NEVER public. Enforced by Supabase RLS in production and here for
 * every public read path.
 */

export interface VisibilityCheckable {
  lifecycle: Lifecycle | string;
}

export function isPubliclyVisible(
  product: VisibilityCheckable,
): boolean {
  return product.lifecycle === "published";
}

export function filterPublic<T extends VisibilityCheckable>(
  products: readonly T[],
): T[] {
  return products.filter(isPubliclyVisible);
}
