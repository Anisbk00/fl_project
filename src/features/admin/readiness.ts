/**
 * Publish-readiness gate (Step 4) — a PURE mirror of the database
 * `publish_product` transactional check. Used by the editor to render a
 * pre-flight checklist. The DB RPC remains authoritative; this never grants.
 */
export interface ReadinessInput {
  rightsStatus: string; // unreviewed | original | licensed | rejected
  rightsAttested: boolean; // reviewer_uid + reviewed_at present
  rightsReviewedAt: string | null;
  licensedSourceType: string | null;
  licensedEvidenceRef: string | null;
  licenseExpiresAt: string | null; // ISO or null
  title: string;
  shortDescription: string;
  price: number; // integer minor units
  priceCurrency: string;
  hasValidatedCover: boolean;
  isPaid: boolean; // price > 0
  hasActiveValidatedZip: boolean;
  hasPendingUploads: boolean;
}

export type ReadinessError =
  | "unauthorized"
  | "conflict"
  | "not_found"
  | "rights_not_cleared"
  | "rights_not_attested"
  | "licensed_evidence_missing"
  | "license_expired"
  | "title_missing"
  | "summary_missing"
  | "invalid_price"
  | "invalid_currency"
  | "cover_missing"
  | "private_zip_missing"
  | "pending_uploads";

export interface ReadinessResult {
  ok: boolean;
  errors: ReadinessError[];
}

export function checkPublishReadiness(input: ReadinessInput): ReadinessResult {
  const errors: ReadinessError[] = [];

  // Rights: original or licensed, with current admin attestation + review.
  if (input.rightsStatus !== "original" && input.rightsStatus !== "licensed") {
    errors.push("rights_not_cleared");
  }
  if (!input.rightsAttested || !input.rightsReviewedAt) {
    errors.push("rights_not_attested");
  }
  if (
    input.rightsStatus === "licensed" &&
    (!input.licensedSourceType || !input.licensedEvidenceRef)
  ) {
    errors.push("licensed_evidence_missing");
  }
  if (input.licenseExpiresAt && new Date(input.licenseExpiresAt) < new Date()) {
    errors.push("license_expired");
  }

  // Required public data.
  if (!input.title || input.title.trim().length < 1) errors.push("title_missing");
  if (!input.shortDescription || input.shortDescription.trim().length < 1)
    errors.push("summary_missing");
  if (!Number.isInteger(input.price) || input.price < 0)
    errors.push("invalid_price");
  if (!/^[A-Z]{3}$/.test(input.priceCurrency)) errors.push("invalid_currency");

  // Required public cover (validated + active).
  if (!input.hasValidatedCover) errors.push("cover_missing");

  // Paid/downloadable: at least one active, immutable, validated private ZIP.
  if (input.isPaid && !input.hasActiveValidatedZip)
    errors.push("private_zip_missing");

  // No pending uploads.
  if (input.hasPendingUploads) errors.push("pending_uploads");

  return { ok: errors.length === 0, errors };
}

/** Human-readable, non-secret labels for the editor checklist. */
export const READINESS_LABELS: Record<ReadinessError, string> = {
  unauthorized: "You are not authorized to publish.",
  conflict: "Another edit changed this product — reload to reconcile.",
  not_found: "Product not found.",
  rights_not_cleared: "Rights status must be original or licensed.",
  rights_not_attested: "A current administrator rights attestation is required.",
  licensed_evidence_missing: "Licensed products need a source/evidence reference.",
  license_expired: "The recorded license has expired.",
  title_missing: "A title is required.",
  summary_missing: "A short summary is required.",
  invalid_price: "Price must be a non-negative integer (minor units).",
  invalid_currency: "Currency must be a 3-letter ISO 4217 code.",
  cover_missing: "A validated public cover image is required.",
  private_zip_missing: "A paid product needs at least one validated private ZIP deliverable.",
  pending_uploads: "Resolve pending uploads before publishing.",
};
