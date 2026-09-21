/**
 * Verified-purchase review domain (Step 7).
 *
 * Reviews originate ONLY from an active Step 6 secure order-access session for
 * a paid, eligible, non-refunded, non-revoked order item. One logical review
 * per eligible order item under concurrency. Rendered as escaped plain text,
 * never arbitrary HTML/Markdown.
 */

export type ReviewState = "pending" | "published" | "rejected" | "withdrawn_by_author" | "hidden_for_safety" | "ineligible";

export interface ReviewInput {
  rating: number;     // 1-5
  body: string;       // bounded plain text
  displayName?: string;
}

export interface ReviewEligibility {
  hasActiveSession: boolean;
  orderItemPaid: boolean;
  orderItemRefunded: boolean;
  orderItemEntitlementRevoked: boolean;
  isFreeAcquisition: boolean;
  alreadyReviewed: boolean;
}

export function validateReviewInput(input: ReviewInput): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    errors.push("invalid_rating");
  if (!input.body || input.body.trim().length === 0)
    errors.push("empty_body");
  if (input.body.length > 2000)
    errors.push("body_too_long");
  // Reject control characters.
  if (/[\u0000-\u001f\u007f]/.test(input.body))
    errors.push("control_chars");
  // Reject unsafe markup (reviews are plain text, not HTML).
  if (/<[^>]+>/.test(input.body))
    errors.push("unsafe_markup");
  if (input.displayName && input.displayName.length > 100)
    errors.push("display_name_too_long");
  if (input.displayName && /<[^>]+>/.test(input.displayName))
    errors.push("display_name_unsafe");
  return { ok: errors.length === 0, errors };
}

export function checkReviewEligibility(e: ReviewEligibility): { ok: boolean; reason?: string } {
  if (!e.hasActiveSession) return { ok: false, reason: "no_active_session" };
  if (!e.orderItemPaid) return { ok: false, reason: "not_paid" };
  if (e.orderItemRefunded) return { ok: false, reason: "refunded" };
  if (e.orderItemEntitlementRevoked) return { ok: false, reason: "entitlement_revoked" };
  if (e.isFreeAcquisition) return { ok: false, reason: "free_acquisition_no_verified_badge" };
  if (e.alreadyReviewed) return { ok: false, reason: "already_reviewed" };
  return { ok: true };
}

/** One review per order item — enforced by a unique constraint + this check. */
export function canSubmitReview(eligibility: ReviewEligibility, input: ReviewInput): { ok: boolean; errors: string[] } {
  const elig = checkReviewEligibility(eligibility);
  if (!elig.ok) return { ok: false, errors: [elig.reason!] };
  return validateReviewInput(input);
}

/** Review state transitions (monotonic; no silent re-publish). */
const TRANSITIONS: Record<ReviewState, readonly ReviewState[]> = {
  pending: ["published", "rejected", "hidden_for_safety"],
  published: ["rejected", "withdrawn_by_author", "hidden_for_safety", "ineligible"],
  rejected: [],
  withdrawn_by_author: [],
  hidden_for_safety: ["published"],
  ineligible: [],
};

export function canTransitionReview(from: ReviewState, to: ReviewState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/** Compute a deterministic rating aggregate from eligible + published reviews. */
export interface ReviewForAggregate {
  rating: number;
  state: ReviewState;
  orderItemRefunded: boolean;
  orderItemEntitlementRevoked: boolean;
}

export interface RatingAggregate {
  count: number;
  average: number;
  distribution: Record<number, number>;
}

export function computeRatingAggregate(reviews: readonly ReviewForAggregate[]): RatingAggregate {
  const eligible = reviews.filter(
    (r) => r.state === "published" && !r.orderItemRefunded && !r.orderItemEntitlementRevoked,
  );
  if (eligible.length === 0) {
    return { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  }
  const sum = eligible.reduce((acc, r) => acc + r.rating, 0);
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of eligible) {
    dist[r.rating] = (dist[r.rating] ?? 0) + 1;
  }
  return {
    count: eligible.length,
    average: Math.round((sum / eligible.length) * 10) / 10,
    distribution: dist,
  };
}

/** Escape review content for safe display (plain text, never HTML). */
export function escapeReviewText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
