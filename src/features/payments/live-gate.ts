/**
 * Canonical-origin allow-list + fail-closed live-payment gate (Step 5).
 *
 * Success/cancel URLs are derived ONLY from a validated server-side canonical
 * origin allow-list — never from request `Origin`, `Referer`, arbitrary host
 * text, or browser input. Live Checkout is fail-closed until Step 6 fulfillment,
 * approved legal/tax configuration, production secrets, monitoring, and the
 * release checklist are complete. Even with an accidental live key, Session
 * creation is refused until the flags are intentionally set.
 */

export interface OriginAllowlist {
  /** Lowercased origins without trailing slash, e.g. https://example.com. */
  origins: readonly string[];
}

/** Validate an origin against the allow-list; return the canonical origin or null. */
export function validateOrigin(
  candidate: string | undefined | null,
  allowlist: OriginAllowlist,
): string | null {
  if (!candidate) return null;
  const normalized = candidate.trim().replace(/\/$/, "").toLowerCase();
  return allowlist.origins.includes(normalized) ? normalized : null;
}

export interface LiveGateInput {
  liveCheckoutEnabled: boolean; // explicit server flag (default false)
  stripeKeyIsLive: boolean; // whether the configured key is a live key
  legalApproved: boolean;
  taxApproved: boolean;
  fulfillmentReady: boolean; // Step 6 not yet → false
  monitoringReady: boolean;
}

export interface LiveGateResult {
  allowed: boolean;
  /** True if running in test/sandbox mode (Stripe test key, live flag off). */
  testMode: boolean;
  blockers: string[];
}

/**
 * Fail-closed live-payment gate. Returns:
 *   - test mode allowed when the key is a test key (sandbox fully works);
 *   - live mode ONLY when `liveCheckoutEnabled` AND every release flag is true.
 * Even an accidental live key is refused until the flags are set.
 */
export function evaluateLiveGate(input: LiveGateInput): LiveGateResult {
  const isTestKey = !input.stripeKeyIsLive;

  // Test/sandbox mode: allowed with a test key + live flag off (no live charges).
  if (isTestKey && !input.liveCheckoutEnabled) {
    return { allowed: true, testMode: true, blockers: [] };
  }

  // Live mode requires the flag + a live key + every release gate.
  const blockers: string[] = [];
  if (input.stripeKeyIsLive && !input.liveCheckoutEnabled)
    blockers.push("live_key_present"); // accidental live key without the gate open
  if (!input.liveCheckoutEnabled) blockers.push("live_checkout_not_enabled");
  if (!input.stripeKeyIsLive) blockers.push("live_key_required");
  if (!input.legalApproved) blockers.push("legal_not_approved");
  if (!input.taxApproved) blockers.push("tax_not_approved");
  if (!input.fulfillmentReady) blockers.push("fulfillment_not_ready_step_6");
  if (!input.monitoringReady) blockers.push("monitoring_not_ready");

  return { allowed: blockers.length === 0, testMode: !input.stripeKeyIsLive, blockers };
}
