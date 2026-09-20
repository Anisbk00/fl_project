/**
 * Product lifecycle transition model (Step 4).
 *
 * The database `publish_product` / `unpublish_product` / `archive_product`
 * RPCs are authoritative; this pure mirror is used by the editor to show
 * allowed/disabled lifecycle actions BEFORE the mutation, so the UI never
 * offers an invalid transition.
 *
 * States: draft | published | archived
 */
export type LifecycleState = "draft" | "published" | "archived";

const ALLOWED: Readonly<Record<LifecycleState, ReadonlyArray<LifecycleState>>> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

export function canTransition(
  from: LifecycleState,
  to: LifecycleState,
): boolean {
  if (from === to) return false; // no-op transitions are handled explicitly
  return ALLOWED[from].includes(to);
}

export function nextStates(from: LifecycleState): LifecycleState[] {
  return [...ALLOWED[from]];
}

/** Human-readable label for a lifecycle action. */
export function lifecycleActionLabel(to: LifecycleState): string {
  switch (to) {
    case "published":
      return "Publish";
    case "draft":
      return "Unpublish to draft";
    case "archived":
      return "Archive";
    default:
      return to;
  }
}
