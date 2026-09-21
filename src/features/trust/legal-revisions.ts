/**
 * Versioned legal/trust content revisions (Step 7).
 *
 * Published revisions are IMMUTABLE — corrections create new revisions.
 * Only one revision per (document_key, locale, market) may be effective at
 * once. Human-review gated before publication. No arbitrary HTML.
 */

export type RevisionStatus = "draft" | "in_review" | "published" | "superseded";

export interface LegalRevision {
  id: string;
  documentKey: string;     // e.g. "terms_of_sale", "privacy_notice"
  locale: string;          // e.g. "en", "en-US"
  market: string;          // e.g. "EU", "US", "global"
  semanticVersion: string; // e.g. "1.0.0"
  markdownSource: string;  // safe Markdown (no arbitrary HTML)
  contentHash: string;     // SHA-256 of the rendered content
  status: RevisionStatus;
  effectiveFrom: string | null; // ISO timestamp
  publishedBy: string | null;   // admin UID
  reviewMetadata: ReviewMetadata | null;
  createdAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
}

export interface ReviewMetadata {
  reviewerName: string;
  reviewedAt: string;
  notes: string;
  approved: boolean;
}

/** Revision transition rules (monotonic; no backwards). */
const ALLOWED: Record<RevisionStatus, readonly RevisionStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "published"],
  published: ["superseded"],
  superseded: [],
};

export function canTransitionRevision(from: RevisionStatus, to: RevisionStatus): boolean {
  if (from === to) return false;
  return ALLOWED[from].includes(to);
}

/** Publishing requires approved review metadata. */
export function canPublishRevision(revision: LegalRevision): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (revision.status !== "in_review") errors.push("not_in_review");
  if (!revision.reviewMetadata?.approved) errors.push("review_not_approved");
  if (!revision.reviewMetadata?.reviewerName) errors.push("reviewer_missing");
  if (!revision.reviewMetadata?.reviewedAt) errors.push("review_date_missing");
  if (!revision.markdownSource || revision.markdownSource.trim().length === 0)
    errors.push("empty_content");
  if (revision.contentHash.includes("REQUIRES_HUMAN_INPUT"))
    errors.push("placeholder_content");
  return { ok: errors.length === 0, errors };
}

/**
 * Resolve the one effective revision for a (documentKey, locale, market).
 * Among all `published` revisions for this key+locale+market, the one with
 * the latest `effectiveFrom` (≤ now) is effective; all others are superseded.
 */
export function resolveEffectiveRevision(
  revisions: readonly LegalRevision[],
  documentKey: string,
  locale: string,
  market: string,
  now: string,
): LegalRevision | null {
  const candidates = revisions.filter(
    (r) =>
      r.documentKey === documentKey &&
      r.locale === locale &&
      r.market === market &&
      r.status === "published" &&
      r.effectiveFrom !== null &&
      r.effectiveFrom <= now,
  );
  if (candidates.length === 0) return null;
  // Sort by effectiveFrom descending → latest is effective.
  candidates.sort((a, b) =>
    (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""),
  );
  return candidates[0] ?? null;
}

/**
 * Check the one-effective-version constraint: at most one `published` revision
 * per (documentKey, locale, market) may be effective at any given time.
 */
export function checkOneEffectiveVersion(
  revisions: readonly LegalRevision[],
  now: string,
): { ok: boolean; conflicts: { documentKey: string; locale: string; market: string; count: number }[] } {
  const groups = new Map<string, LegalRevision[]>();
  for (const r of revisions) {
    if (r.status !== "published" || !r.effectiveFrom || r.effectiveFrom > now) continue;
    const key = `${r.documentKey}|${r.locale}|${r.market}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const conflicts: { documentKey: string; locale: string; market: string; count: number }[] = [];
  for (const [key, arr] of groups) {
    if (arr.length > 1) {
      const [dk, loc, mkt] = key.split("|");
      conflicts.push({ documentKey: dk!, locale: loc!, market: mkt!, count: arr.length });
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

/** Sanitize legal Markdown (reuse the Step 3 SafeMarkdown rules). */
export function sanitizeLegalMarkdown(source: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (source.includes("<script")) errors.push("script_tag");
  if (source.includes("<iframe")) errors.push("iframe_tag");
  if (source.includes("javascript:")) errors.push("javascript_protocol");
  if (source.includes("onload=") || source.includes("onerror=")) errors.push("event_handler");
  if (source.includes("<form")) errors.push("form_tag");
  if (source.includes("<input")) errors.push("input_tag");
  return { ok: errors.length === 0, errors };
}

/** Market availability rules. */
export interface MarketRule {
  market: string;
  allow: boolean;
}

export function isMarketAvailable(rules: readonly MarketRule[], market: string): boolean {
  // Explicit deny takes precedence over explicit allow; default deny.
  const matching = rules.filter((r) => r.market === market || r.market === "global");
  if (matching.some((r) => r.market === market && !r.allow)) return false;
  if (matching.some((r) => r.market === market && r.allow)) return true;
  if (matching.some((r) => r.market === "global" && !r.allow)) return false;
  if (matching.some((r) => r.market === "global" && r.allow)) return true;
  return false; // default deny
}
