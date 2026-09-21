/**
 * Privacy-preserving recommendations (Step 7).
 *
 * Deterministic, explainable, public-catalog-fact-based. No behavioral
 * tracking, fingerprinting, or email-based profiles. Optional co-purchase
 * signals suppressed below a k-anonymity threshold.
 */

export interface RecommendationCandidate {
  productId: string;
  slug: string;
  title: string;
  productType: string;
  genres: string[];
  dawName: string | null;
  bpm: number | null;
  musicalKey: string | null;
  lifecycle: string;
  rightsStatus: string;
  hasReadyDeliverable: boolean;
  isMarketAvailable: boolean;
  featured: boolean;
  publishedAt: string | null;
}

export interface RecommendationResult {
  productId: string;
  slug: string;
  title: string;
  reason: string;
  score: number;
}

/** k-anonymity threshold for co-purchase signals. */
export const K_ANONYMITY_THRESHOLD = 5;

/**
 * Rank related products by shared genre + DAW + type (deterministic, public
 * catalog facts). Exclude the current product, non-public, rights-blocked,
 * market-unavailable, missing-deliverable, or archived items.
 */
export function rankRecommendations(
  candidates: readonly RecommendationCandidate[],
  current: {
    productId: string;
    productType: string;
    genres: string[];
    dawName: string | null;
  },
  limit: number,
): RecommendationResult[] {
  const currentGenres = new Set(current.genres);
  const eligible = candidates.filter(
    (c) =>
      c.productId !== current.productId &&
      c.lifecycle === "published" &&
      (c.rightsStatus === "original" || c.rightsStatus === "licensed") &&
      c.hasReadyDeliverable &&
      c.isMarketAvailable,
  );

  const scored = eligible.map((c) => {
    let score = 0;
    const reasons: string[] = [];
    // Shared genre.
    const sharedGenres = c.genres.filter((g) => currentGenres.has(g));
    if (sharedGenres.length > 0) {
      score += sharedGenres.length * 3;
      reasons.push("genre");
    }
    // Shared DAW.
    if (c.dawName && current.dawName && c.dawName === current.dawName) {
      score += 2;
      reasons.push("DAW");
    }
    // Same product type.
    if (c.productType === current.productType) {
      score += 1;
      reasons.push("type");
    }
    // Featured boost.
    if (c.featured) score += 1;
    return {
      productId: c.productId,
      slug: c.slug,
      title: c.title,
      reason: `Related by ${reasons.join(", ") || "catalog"}`,
      score,
    };
  });

  // Deterministic sort: score desc, then slug asc (stable tie-breaker).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.slug.localeCompare(b.slug);
  });

  return scored.slice(0, limit);
}

/** Suppress co-purchase signals below the k-anonymity threshold. */
export function shouldShowCoPurchaseSignal(cohortSize: number): boolean {
  return cohortSize >= K_ANONYMITY_THRESHOLD;
}
