import { describe, it, expect } from "bun:test";
import {
  canTransitionRevision,
  canPublishRevision,
  resolveEffectiveRevision,
  checkOneEffectiveVersion,
  sanitizeLegalMarkdown,
  isMarketAvailable,
  type LegalRevision,
} from "@/features/trust/legal-revisions";
import {
  COOKIE_INVENTORY,
  shouldShowCookieBanner,
  hasTrackingStorage,
} from "@/features/trust/cookie-inventory";

const base: LegalRevision = {
  id: "r1", documentKey: "terms", locale: "en", market: "global",
  semanticVersion: "1.0.0", markdownSource: "# Terms\n\nBody text.",
  contentHash: "abc123", status: "in_review", effectiveFrom: null,
  publishedBy: null, reviewMetadata: null, createdAt: "2026-01-01T00:00:00Z",
  publishedAt: null, supersededAt: null,
};

describe("legal revision state machine", () => {
  it("allows draft→in_review→published→superseded", () => {
    expect(canTransitionRevision("draft", "in_review")).toBe(true);
    expect(canTransitionRevision("in_review", "published")).toBe(true);
    expect(canTransitionRevision("published", "superseded")).toBe(true);
  });
  it("rejects backwards transitions", () => {
    expect(canTransitionRevision("published", "draft")).toBe(false);
    expect(canTransitionRevision("superseded", "published")).toBe(false);
  });
});

describe("canPublishRevision", () => {
  it("rejects without approved review metadata", () => {
    expect(canPublishRevision(base).ok).toBe(false);
  });
  it("accepts with approved review + content", () => {
    const ok = canPublishRevision({
      ...base,
      reviewMetadata: { reviewerName: "Legal Team", reviewedAt: "2026-01-02", notes: "OK", approved: true },
    });
    expect(ok.ok).toBe(true);
  });
  it("rejects placeholder content", () => {
    const r = canPublishRevision({
      ...base,
      markdownSource: "text",
      contentHash: "REQUIRES_HUMAN_INPUT",
      reviewMetadata: { reviewerName: "X", reviewedAt: "2026-01-02", notes: "", approved: true },
    });
    expect(r.errors).toContain("placeholder_content");
  });
});

describe("resolveEffectiveRevision + one-effective", () => {
  const now = "2026-06-01T00:00:00Z";
  const r1: LegalRevision = { ...base, id: "r1", status: "published", effectiveFrom: "2026-01-01T00:00:00Z" };
  const r2: LegalRevision = { ...base, id: "r2", status: "published", effectiveFrom: "2026-03-01T00:00:00Z" };

  it("resolves the latest effective revision", () => {
    const eff = resolveEffectiveRevision([r1, r2], "terms", "en", "global", now);
    expect(eff?.id).toBe("r2");
  });
  it("checks one-effective-version constraint", () => {
    const check = checkOneEffectiveVersion([r1, r2], now);
    // Both are published with effectiveFrom ≤ now → conflict
    expect(check.ok).toBe(false);
    expect(check.conflicts.length).toBe(1);
    expect(check.conflicts[0]!.count).toBe(2);
  });
  it("passes when only one is effective", () => {
    const check = checkOneEffectiveVersion([r1], now);
    expect(check.ok).toBe(true);
  });
});

describe("sanitizeLegalMarkdown", () => {
  it("rejects script tags + iframes + event handlers", () => {
    expect(sanitizeLegalMarkdown("<script>x</script>").errors).toContain("script_tag");
    expect(sanitizeLegalMarkdown("<iframe>").errors).toContain("iframe_tag");
    expect(sanitizeLegalMarkdown("javascript:alert(1)").errors).toContain("javascript_protocol");
    expect(sanitizeLegalMarkdown('onload="x"').errors).toContain("event_handler");
    expect(sanitizeLegalMarkdown("<form>").errors).toContain("form_tag");
  });
  it("accepts clean Markdown", () => {
    expect(sanitizeLegalMarkdown("# Terms\n\nBody.").ok).toBe(true);
  });
});

describe("market availability", () => {
  it("allows explicit allow + denies explicit deny", () => {
    expect(isMarketAvailable([{ market: "EU", allow: true }], "EU")).toBe(true);
    expect(isMarketAvailable([{ market: "EU", allow: false }], "EU")).toBe(false);
  });
  it("falls back to global rules", () => {
    expect(isMarketAvailable([{ market: "global", allow: true }], "US")).toBe(true);
    expect(isMarketAvailable([{ market: "global", allow: false }], "US")).toBe(false);
  });
  it("default denies when no rules match", () => {
    expect(isMarketAvailable([{ market: "EU", allow: true }], "JP")).toBe(false);
  });
});

describe("cookie inventory", () => {
  it("has no tracking storage", () => {
    expect(hasTrackingStorage()).toBe(false);
  });
  it("does not show a cookie banner (only strictly-necessary)", () => {
    expect(shouldShowCookieBanner()).toBe(false);
  });
  it("documents all cookies as strictly necessary", () => {
    expect(COOKIE_INVENTORY.every((c) => c.strictlyNecessary)).toBe(true);
  });
});
