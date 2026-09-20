import { createHash } from "node:crypto";

/**
 * Deterministic cart fingerprint (Step 5). Built from SORTED trusted product,
 * version, price, currency, asset, and license facts — never from
 * browser-supplied values. Used to:
 *   - reuse an existing unexpired open Checkout Session only when the
 *     fingerprint AND consent versions match exactly;
 *   - require re-consent / a new attempt when the cart changed;
 *   - partial-unique-index one open attempt per fingerprint.
 *
 * The fingerprint is an opaque hex digest; it is NOT sensitive (no PII, no
 * tokens), so it may be stored/indexed.
 */

export interface CartFingerprintItem {
  productId: string;
  productRowVersion: number;
  slug: string;
  unitAmount: number; // integer minor units
  currency: string; // lowercase ISO
  deliverableAssetId: string; // the selected immutable ready deliverable version
  licenseVersion: string | null;
  taxCode: string | null;
}

export interface CartFingerprintInput {
  items: readonly CartFingerprintItem[];
  currency: string;
  policyVersion: string | null;
}

/** Canonical, sorted serialization of trusted cart facts. */
function canonicalFingerprintSource(input: CartFingerprintInput): string {
  const sorted = [...input.items].sort((a, b) =>
    a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
  );
  const itemLines = sorted.map((i) =>
    [
      i.productId,
      i.productRowVersion,
      i.slug,
      i.unitAmount,
      i.currency,
      i.deliverableAssetId,
      i.licenseVersion ?? "",
      i.taxCode ?? "",
    ].join("|"),
  );
  return [
    "v1",
    input.currency,
    input.policyVersion ?? "",
    itemLines.join(";"),
  ].join("\n");
}

/** Compute the deterministic cart fingerprint (hex SHA-256). */
export function cartFingerprint(input: CartFingerprintInput): string {
  return createHash("sha256").update(canonicalFingerprintSource(input)).digest("hex");
}

/**
 * Consent fingerprint — binds a pre-checkout acknowledgement to the exact cart
 * fingerprint + policy version. Re-consent is required when the cart or policy
 * version changes (server-enforced; bypassing the checkbox UI cannot create a
 * Checkout Session).
 */
export function consentFingerprint(cartFp: string, policyVersion: string | null): string {
  return createHash("sha256")
    .update(`${cartFp}\n${policyVersion ?? ""}`)
    .digest("hex");
}

/** Re-consent required when the consent fingerprint changed. */
export function requiresReConsent(
  prevConsentFp: string | null,
  cartFp: string,
  policyVersion: string | null,
): boolean {
  return prevConsentFp !== consentFingerprint(cartFp, policyVersion);
}
