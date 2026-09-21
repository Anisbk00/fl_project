/**
 * Bundle validation (Step 7). Acyclic, no self-reference, no duplicates,
 * component readiness + rights + market checks, cart-overlap dedup.
 */

export interface BundleComponent {
  productId: string;
  productType: string;
  lifecycle: string;     // draft | published | archived
  rightsStatus: string;  // unreviewed | original | licensed | rejected
  hasReadyDeliverable: boolean;
  isMarketAvailable: boolean;
}

export interface BundleValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateBundle(components: readonly BundleComponent[]): BundleValidationResult {
  const errors: string[] = [];
  if (components.length === 0) errors.push("empty_bundle");
  if (components.length > 50) errors.push("too_many_components");

  // Self-reference (same product ID appearing as both bundle and component).
  // (The caller provides only component IDs; self-ref check is on duplicates.)
  // Duplicate components.
  const ids = components.map((c) => c.productId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) errors.push("duplicate_components");

  // Unpublished / archived components.
  if (components.some((c) => c.lifecycle !== "published")) errors.push("unpublished_component");
  // Rights-blocked components.
  if (components.some((c) => c.rightsStatus !== "original" && c.rightsStatus !== "licensed"))
    errors.push("rights_blocked_component");
  // Missing ready deliverable.
  if (components.some((c) => !c.hasReadyDeliverable)) errors.push("missing_deliverable");
  // Market-unavailable.
  if (components.some((c) => !c.isMarketAvailable)) errors.push("market_unavailable");

  return { ok: errors.length === 0, errors };
}

/** Detect cycles in a bundle→component graph (DFS). */
export function detectBundleCycles(
  bundleId: string,
  adjacency: Record<string, readonly string[]>,
): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();
  function dfs(node: string): boolean {
    if (stack.has(node)) return true; // cycle
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    const neighbors = adjacency[node] ?? [];
    for (const n of neighbors) {
      if (dfs(n)) return true;
    }
    stack.delete(node);
    return false;
  }
  return dfs(bundleId);
}

/** Cart-overlap: reject a cart containing both a bundle and its individual components. */
export function detectCartOverlap(
  cartProductIds: readonly string[],
  bundleComponentIds: readonly string[],
): { ok: boolean; overlap: string[] } {
  const componentSet = new Set(bundleComponentIds);
  const overlap = cartProductIds.filter((id) => componentSet.has(id));
  return { ok: overlap.length === 0, overlap };
}

/** Deduplicate: remove individual products already in a bundle from the cart. */
export function deduplicateCartOverlap(
  cartProductIds: readonly string[],
  bundleProductId: string,
  bundleComponentIds: readonly string[],
): string[] {
  const componentSet = new Set(bundleComponentIds);
  // Keep the bundle; remove individual components that overlap.
  return cartProductIds.filter(
    (id) => id === bundleProductId || !componentSet.has(id),
  );
}
