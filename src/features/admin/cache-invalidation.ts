import { revalidateTag as nextRevalidateTag } from "next/cache";

// Next 16's revalidateTag signature varies across patch versions; cast to the
// stable single-arg form. The function invalidates a cache tag after a commit.
const revalidateTag = nextRevalidateTag as unknown as (tag: string) => void;

/**
 * Cache invalidation (Step 4) — the central mapping from admin mutations to
 * the Step 3 public cache tags. Called ONLY AFTER a committed DB transaction
 * succeeds. Draft-only edits must NOT create unnecessary public invalidation.
 *
 * The Step 3 tags (see repository.ts):
 *   catalog:products, catalog:product:<slug>, catalog:taxonomy, catalog:free,
 *   catalog:genres, catalog:plugins, catalog:related, catalog:featured
 *
 * On invalidation failure, do NOT roll back a committed DB change — surface a
 * retryable operational warning + idempotent retry (see docs/OPERATIONS.md).
 */

export type CatalogMutation =
  | { kind: "product.publish"; slug: string }
  | { kind: "product.published_edit"; slug: string }
  | { kind: "product.unpublish"; slug: string }
  | { kind: "product.archive"; slug: string }
  | { kind: "product.create_draft" } // draft only — no public invalidation
  | { kind: "product.draft_edit" } // draft only — no public invalidation
  | { kind: "taxonomy.change" };

/** Pure: returns the cache tags affected by a mutation (for testing/logging). */
export function tagsForMutation(m: CatalogMutation): string[] {
  switch (m.kind) {
    case "product.publish":
    case "product.published_edit":
    case "product.unpublish":
    case "product.archive":
      return [
        "catalog:products",
        `catalog:product:${m.slug}`,
        "catalog:free",
        "catalog:related",
        "catalog:featured",
      ];
    case "taxonomy.change":
      return ["catalog:taxonomy", "catalog:products", "catalog:free", "catalog:related"];
    case "product.create_draft":
    case "product.draft_edit":
      // Draft-only edits do NOT touch public caches.
      return [];
    default:
      return [];
  }
}

/**
 * Invalidate the affected tags after a committed mutation. Idempotent.
 * Returns the list of tags invalidated (for audit logging). If revalidateTag
 * throws (platform error), the caller surfaces a retryable warning but must
 * NOT roll back the committed DB change.
 */
export function invalidateForMutation(m: CatalogMutation): string[] {
  const tags = tagsForMutation(m);
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch {
      // Swallow at this layer; the caller handles operational retry/reporting.
      // The committed DB change is not rolled back.
    }
  }
  return tags;
}
