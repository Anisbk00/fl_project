/**
 * Marketing consent state machine (Step 7).
 *
 * Separate from transactional delivery. Unchecked by default. Double opt-in.
 * A later confirmation must never override a newer withdrawal/complaint/suppression.
 */

export type ConsentState = "pending" | "confirmed" | "withdrawn" | "suppressed";

export interface ConsentEvent {
  state: ConsentState;
  timestamp: string;
  source: string;
}

/** Derive the current consent state from the append-only event history. */
export function deriveConsentState(events: readonly ConsentEvent[]): ConsentState {
  if (events.length === 0) return "pending";
  // The LATEST event wins — a newer withdrawal/suppression overrides an older confirmation.
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return sorted[sorted.length - 1]!.state;
}

/** Suppression (from provider bounce/complaint) takes precedence over confirmation. */
export function isMarketingEligible(events: readonly ConsentEvent[]): boolean {
  return deriveConsentState(events) === "confirmed";
}

/** A later confirmation must NOT override a newer withdrawal or suppression. */
export function canApplyConfirmation(events: readonly ConsentEvent[], now: string): boolean {
  const current = deriveConsentState(events);
  // Only pending can move to confirmed. A withdrawn/suppressed user must re-consent
  // (create a new pending event first, not directly re-confirm).
  return current === "pending";
}

/** Double-opt-in confirmation capability: single-use, expiring. */
export interface ConfirmationCapability {
  digest: string;       // HMAC digest of the capability token
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export function isCapabilityValid(cap: ConfirmationCapability, now: string): boolean {
  if (cap.consumedAt !== null) return false; // single-use
  if (now > cap.expiresAt) return false;    // expired
  return true;
}

/** One-click unsubscribe: returns the new state after processing the capability. */
export function processUnsubscribe(events: readonly ConsentEvent[]): ConsentState {
  const current = deriveConsentState(events);
  if (current === "withdrawn" || current === "suppressed") return current; // already withdrawn
  return "withdrawn";
}
