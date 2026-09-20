/**
 * Fulfillment policy + entitlement state machine + signed-URL quota logic
 * (Step 6). All values are centralized security/product policy defaults
 * snapshot into each fulfillment generation; tests are tied to these exports.
 */

// --- Policy defaults (snapshot into each fulfillment generation) ---
export const ACCESS_TOKEN_EXPIRY_HOURS = 72; // single-use, 72-hour default
export const ACCESS_TOKEN_MAX_EXPIRY_HOURS = 168; // 7-day hard max
export const DOWNLOAD_SESSION_MINUTES = 30; // absolute session lifetime
export const SIGNED_URL_TTL_SECONDS = 120; // default Storage signed-URL TTL
export const SIGNED_URL_MAX_TTL_SECONDS = 600; // 10-minute hard max
export const SIGNED_URL_ISSUANCE_QUOTA = 10; // per order item (successful/reserved)
export const RECOVERY_COOLDOWN_MINUTES = 15; // per order/email pair
export const RECOVERY_DAILY_MAX = 5; // per order/email pair per day
export const ACTIVE_TOKEN_CAP = 3; // max concurrent unconsumed tokens per order
export const WORKER_LEASE_SECONDS = 30;
export const WORKER_BATCH_SIZE = 10;
export const WORKER_MAX_ATTEMPTS = 8;

// --- Entitlement state machine ---
export type EntitlementState = "active" | "held" | "revoked";

/** Allowed entitlement transitions (monotonic; no auto-revive without authority). */
export function canTransitionEntitlement(
  from: EntitlementState,
  to: EntitlementState,
): boolean {
  if (from === to) return true; // idempotent
  if (from === "active" && (to === "held" || to === "revoked")) return true;
  if (from === "held" && (to === "active" || to === "revoked")) return true;
  if (from === "revoked" && to === "active") return true; // restore (e.g. dispute won)
  return false;
}

// --- Fulfillment generation state machine ---
export type GenerationState = "initial_paid" | "public_recovery_new_token" | "admin_rotate" | "reconciliation_repair";
export type GenerationStatus = "active" | "superseded";

// --- Delivery message state machine ---
export type MessageState =
  | "queued"
  | "sending"
  | "accepted"
  | "sent"
  | "delivered"
  | "delayed"
  | "bounced"
  | "failed"
  | "complained"
  | "suppressed"
  | "dead"
  | "cancelled";

const MESSAGE_TERMINAL = new Set<MessageState>(["delivered", "dead", "cancelled", "suppressed", "bounced", "failed"]);

export function isMessageTerminal(state: MessageState): boolean {
  return MESSAGE_TERMINAL.has(state);
}

// --- Signed-URL issuance quota ---
export interface QuotaCheck {
  ok: boolean;
  remaining: number;
  error?: string;
}

export function checkIssuanceQuota(
  successfulIssuances: number,
  reservedIssuances: number,
  quota: number,
): QuotaCheck {
  const used = successfulIssuances + reservedIssuances;
  if (used >= quota) {
    return { ok: false, remaining: 0, error: "quota_exhausted" };
  }
  return { ok: true, remaining: quota - used };
}

/** Consume a reservation: move from reserved → successful. */
export function finalizeIssuance(
  successfulIssuances: number,
  reservedIssuances: number,
  quota: number,
): { ok: boolean; successful: number; reserved: number; remaining: number } {
  if (reservedIssuances < 1) return { ok: false, successful: successfulIssuances, reserved: reservedIssuances, remaining: quota - successfulIssuances - reservedIssuances };
  return {
    ok: true,
    successful: successfulIssuances + 1,
    reserved: reservedIssuances - 1,
    remaining: quota - (successfulIssuances + 1) - (reservedIssuances - 1),
  };
}

/** Release a failed/expired reservation: does NOT permanently consume quota. */
export function releaseReservation(
  successfulIssuances: number,
  reservedIssuances: number,
  quota: number,
): { successful: number; reserved: number; remaining: number } {
  return {
    successful: successfulIssuances,
    reserved: Math.max(0, reservedIssuances - 1),
    remaining: quota - successfulIssuances - Math.max(0, reservedIssuances - 1),
  };
}

// --- Refund/dispute revocation transitions ---
export type RefundAction = "hold" | "revoke" | "release";
export type RefundKind = "full" | "item_mapped_partial" | "ambiguous_partial" | "dispute_open" | "dispute_won" | "dispute_lost" | "refund_failed";

/** Determine the fulfillment revocation action for a refund/dispute event. */
export function refundRevocationAction(kind: RefundKind): RefundAction {
  switch (kind) {
    case "full":
    case "dispute_lost":
      return "revoke"; // revoke ALL entitlements/tokens/sessions
    case "item_mapped_partial":
      return "revoke"; // revoke only mapped item entitlements
    case "ambiguous_partial":
    case "dispute_open":
      return "hold"; // hold ALL access until AAL2 resolution
    case "refund_failed":
      return "release"; // release the hold caused by this refund
    case "dispute_won":
      return "release"; // restore when order remains paid + no other hold
    default:
      return "hold"; // fail closed
  }
}
