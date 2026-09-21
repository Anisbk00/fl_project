import { describe, it, expect } from "bun:test";
import {
  validateReviewInput,
  checkReviewEligibility,
  canSubmitReview,
  canTransitionReview,
  computeRatingAggregate,
  escapeReviewText,
  type ReviewEligibility,
} from "@/features/reviews/review-domain";
import {
  validateBundle,
  detectBundleCycles,
  detectCartOverlap,
  deduplicateCartOverlap,
  type BundleComponent,
} from "@/features/bundles/bundle-validation";
import {
  checkPriceIntervalOverlap,
  resolveEffectivePrice,
  checkPromotionEligibility,
  canTransitionRedemption,
  computeLowestPrice30Days,
  type PriceInterval,
  type Promotion,
} from "@/features/pricing/price-history";
import {
  deriveConsentState,
  isMarketingEligible,
  canApplyConfirmation,
  processUnsubscribe,
  type ConsentEvent,
} from "@/features/marketing/consent";
import {
  rankRecommendations,
  shouldShowCoPurchaseSignal,
  K_ANONYMITY_THRESHOLD,
  type RecommendationCandidate,
} from "@/features/recommendations/ranking";

const okElig: ReviewEligibility = {
  hasActiveSession: true, orderItemPaid: true, orderItemRefunded: false,
  orderItemEntitlementRevoked: false, isFreeAcquisition: false, alreadyReviewed: false,
};

describe("review validation", () => {
  it("accepts a valid review", () => {
    expect(validateReviewInput({ rating: 5, body: "Great project!" }).ok).toBe(true);
  });
  it("rejects out-of-range rating", () => {
    expect(validateReviewInput({ rating: 0, body: "x" }).errors).toContain("invalid_rating");
    expect(validateReviewInput({ rating: 6, body: "x" }).errors).toContain("invalid_rating");
  });
  it("rejects empty + too-long body", () => {
    expect(validateReviewInput({ rating: 3, body: "" }).errors).toContain("empty_body");
    expect(validateReviewInput({ rating: 3, body: "x".repeat(2001) }).errors).toContain("body_too_long");
  });
  it("rejects control chars + unsafe markup", () => {
    expect(validateReviewInput({ rating: 3, body: "a\u0000b" }).errors).toContain("control_chars");
    expect(validateReviewInput({ rating: 3, body: "<script>x</script>" }).errors).toContain("unsafe_markup");
  });
});

describe("review eligibility", () => {
  it("rejects without an active session", () => {
    expect(checkReviewEligibility({ ...okElig, hasActiveSession: false }).ok).toBe(false);
  });
  it("rejects free acquisitions (no verified badge)", () => {
    expect(checkReviewEligibility({ ...okElig, isFreeAcquisition: true }).ok).toBe(false);
  });
  it("rejects refunded/revoked items", () => {
    expect(checkReviewEligibility({ ...okElig, orderItemRefunded: true }).ok).toBe(false);
    expect(checkReviewEligibility({ ...okElig, orderItemEntitlementRevoked: true }).ok).toBe(false);
  });
  it("rejects double review", () => {
    expect(checkReviewEligibility({ ...okElig, alreadyReviewed: true }).ok).toBe(false);
  });
  it("accepts a fully eligible item", () => {
    expect(checkReviewEligibility(okElig).ok).toBe(true);
  });
});

describe("review state machine", () => {
  it("allows pending→published/rejected/hidden", () => {
    expect(canTransitionReview("pending", "published")).toBe(true);
    expect(canTransitionReview("pending", "rejected")).toBe(true);
    expect(canTransitionReview("pending", "hidden_for_safety")).toBe(true);
  });
  it("allows hidden→published (restore)", () => {
    expect(canTransitionReview("hidden_for_safety", "published")).toBe(true);
  });
  it("rejects rejected→published (no silent re-publish)", () => {
    expect(canTransitionReview("rejected", "published")).toBe(false);
  });
});

describe("review aggregate", () => {
  it("computes from eligible + published only", () => {
    const reviews = [
      { rating: 5, state: "published" as const, orderItemRefunded: false, orderItemEntitlementRevoked: false },
      { rating: 3, state: "published" as const, orderItemRefunded: false, orderItemEntitlementRevoked: false },
      { rating: 1, state: "published" as const, orderItemRefunded: true, orderItemEntitlementRevoked: false },
      { rating: 4, state: "pending" as const, orderItemRefunded: false, orderItemEntitlementRevoked: false },
    ];
    const agg = computeRatingAggregate(reviews);
    expect(agg.count).toBe(2);
    expect(agg.average).toBe(4);
    expect(agg.distribution[5]).toBe(1);
    expect(agg.distribution[3]).toBe(1);
  });
  it("returns empty for no eligible reviews", () => {
    const agg = computeRatingAggregate([]);
    expect(agg.count).toBe(0);
  });
});

describe("bundle validation", () => {
  const good: BundleComponent = {
    productId: "p1", productType: "project_file", lifecycle: "published",
    rightsStatus: "original", hasReadyDeliverable: true, isMarketAvailable: true,
  };
  it("accepts a valid bundle", () => {
    expect(validateBundle([good, { ...good, productId: "p2" }]).ok).toBe(true);
  });
  it("rejects duplicates", () => {
    expect(validateBundle([good, good]).errors).toContain("duplicate_components");
  });
  it("rejects unpublished / rights-blocked / missing-deliverable", () => {
    expect(validateBundle([{ ...good, lifecycle: "draft" }]).errors).toContain("unpublished_component");
    expect(validateBundle([{ ...good, rightsStatus: "unreviewed" }]).errors).toContain("rights_blocked_component");
    expect(validateBundle([{ ...good, hasReadyDeliverable: false }]).errors).toContain("missing_deliverable");
  });
  it("detects cart overlap", () => {
    const overlap = detectCartOverlap(["b1", "p1", "p2"], ["p1", "p2"]);
    expect(overlap.ok).toBe(false);
    expect(overlap.overlap).toEqual(["p1", "p2"]);
  });
  it("deduplicates cart overlap", () => {
    const deduped = deduplicateCartOverlap(["b1", "p1", "p2"], "b1", ["p1", "p2"]);
    expect(deduped).toEqual(["b1"]);
  });
  it("detects cycles", () => {
    expect(detectBundleCycles("b1", { b1: ["b2"], b2: ["b1"] })).toBe(true);
    expect(detectBundleCycles("b1", { b1: ["b2"], b2: ["b3"] })).toBe(false);
  });
});

describe("price history + promotions", () => {
  const intervals: PriceInterval[] = [
    { sellableId: "p1", currency: "usd", amount: 2000, priceType: "normal", validFrom: "2026-01-01T00:00:00Z", validUntil: null, reason: "initial", publishedBy: null },
    { sellableId: "p1", currency: "usd", amount: 1500, priceType: "promotional", validFrom: "2026-03-01T00:00:00Z", validUntil: "2026-03-31T00:00:00Z", reason: "spring sale", publishedBy: null },
  ];
  it("resolves the effective normal price", () => {
    const eff = resolveEffectivePrice(intervals, "p1", "usd", "2026-06-01T00:00:00Z");
    expect(eff?.amount).toBe(2000);
  });
  it("resolves a promotional price within its window", () => {
    const eff = resolveEffectivePrice(intervals, "p1", "usd", "2026-03-15T00:00:00Z");
    expect(eff?.amount).toBe(1500);
  });
  it("detects overlapping intervals", () => {
    const overlapping: PriceInterval[] = [
      { ...intervals[0]!, validUntil: "2026-04-01T00:00:00Z" },
      intervals[1]!,
    ];
    const check = checkPriceIntervalOverlap(overlapping, "p1", "usd");
    expect(check.ok).toBe(false);
  });
  it("checks promotion eligibility + discount", () => {
    const promo: Promotion = {
      codeDigest: "d1", label: "SPRING", currency: "usd", market: "global",
      startTime: "2026-03-01", endTime: "2026-03-31", state: "active",
      discountType: "percentage", discountValue: 10, minSubtotal: 100, totalUsageLimit: 100, totalUsageCount: 0,
    };
    const r = checkPromotionEligibility(promo, 3000, "usd", "2026-03-15T00:00:00Z");
    expect(r.ok).toBe(true);
    expect(r.discountAmount).toBe(300);
  });
  it("rejects discount that exceeds subtotal (no free product)", () => {
    const promo: Promotion = {
      codeDigest: "d1", label: "BIG", currency: "usd", market: "global",
      startTime: "2026-01-01", endTime: "2026-12-31", state: "active",
      discountType: "fixed_amount", discountValue: 5000, minSubtotal: 0, totalUsageLimit: 10, totalUsageCount: 0,
    };
    const r = checkPromotionEligibility(promo, 3000, "usd", "2026-06-01T00:00:00Z");
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("discount_exceeds_subtotal");
  });
  it("redemption state machine: reserved→consumed/released/expired; consumed is terminal", () => {
    expect(canTransitionRedemption("reserved", "consumed")).toBe(true);
    expect(canTransitionRedemption("reserved", "released")).toBe(true);
    expect(canTransitionRedemption("consumed", "released")).toBe(false);
  });
  it("computes lowest price in 30 days", () => {
    const r = computeLowestPrice30Days(intervals, "p1", "usd", "2026-03-15T00:00:00Z");
    expect(r.hasReference).toBe(true);
    expect(r.lowest).toBe(1500);
  });
});

describe("marketing consent", () => {
  it("derives the latest state", () => {
    const events: ConsentEvent[] = [
      { state: "pending", timestamp: "2026-01-01T00:00:00Z", source: "form" },
      { state: "confirmed", timestamp: "2026-01-02T00:00:00Z", source: "double_opt_in" },
    ];
    expect(deriveConsentState(events)).toBe("confirmed");
    expect(isMarketingEligible(events)).toBe(true);
  });
  it("newer withdrawal overrides older confirmation", () => {
    const events: ConsentEvent[] = [
      { state: "confirmed", timestamp: "2026-01-02T00:00:00Z", source: "double_opt_in" },
      { state: "withdrawn", timestamp: "2026-01-03T00:00:00Z", source: "unsubscribe" },
    ];
    expect(deriveConsentState(events)).toBe("withdrawn");
    expect(isMarketingEligible(events)).toBe(false);
  });
  it("can only confirm from pending (not from withdrawn)", () => {
    const events: ConsentEvent[] = [
      { state: "withdrawn", timestamp: "2026-01-01T00:00:00Z", source: "unsubscribe" },
    ];
    expect(canApplyConfirmation(events, "2026-01-02T00:00:00Z")).toBe(false);
  });
  it("processes unsubscribe", () => {
    const events: ConsentEvent[] = [
      { state: "confirmed", timestamp: "2026-01-01T00:00:00Z", source: "opt_in" },
    ];
    expect(processUnsubscribe(events)).toBe("withdrawn");
  });
});

describe("recommendations", () => {
  const candidates: RecommendationCandidate[] = [
    { productId: "p2", slug: "granite-room", title: "Granite Room", productType: "project_file", genres: ["Techno","Deep House"], dawName: "Ableton Live", bpm: 124, musicalKey: "D minor", lifecycle: "published", rightsStatus: "original", hasReadyDeliverable: true, isMarketAvailable: true, featured: true, publishedAt: "2026-01-01T00:00:00Z" },
    { productId: "p3", slug: "half-light", title: "Half-Light", productType: "stems", genres: ["Ambient"], dawName: null, bpm: 110, musicalKey: "E minor", lifecycle: "published", rightsStatus: "original", hasReadyDeliverable: true, isMarketAvailable: true, featured: false, publishedAt: "2026-02-01T00:00:00Z" },
    { productId: "p4", slug: "draft", title: "Draft", productType: "stems", genres: ["Techno"], dawName: null, bpm: 128, musicalKey: "A minor", lifecycle: "draft", rightsStatus: "unreviewed", hasReadyDeliverable: false, isMarketAvailable: true, featured: false, publishedAt: null },
  ];
  it("ranks by shared genre + DAW + type, excludes non-public", () => {
    const results = rankRecommendations(candidates, {
      productId: "p1", productType: "project_file", genres: ["Techno"], dawName: "Ableton Live",
    }, 3);
    // p2 has shared genre (Techno) + DAW (Ableton Live) + type (project_file) → highest score
    expect(results[0]!.productId).toBe("p2");
    expect(results[0]!.reason).toContain("genre");
    // p4 is draft → excluded
    expect(results.find((r) => r.productId === "p4")).toBeUndefined();
  });
  it("suppresses co-purchase signals below k-anonymity", () => {
    expect(shouldShowCoPurchaseSignal(3)).toBe(false);
    expect(shouldShowCoPurchaseSignal(K_ANONYMITY_THRESHOLD)).toBe(true);
  });
});
