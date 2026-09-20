/**
 * Payment + order state machine (Step 5).
 *
 * Separate states for checkout attempt, payment, refund, dispute/hold, and
 * fulfillment — never one overloaded Boolean. Monotonic transitions so older
 * failure/processing events cannot regress a paid or refunded order.
 *
 * The transactional `mark_paid` RPC is authoritative; this pure mirror is used
 * by the editor/admin UI and tests.
 */

export type CheckoutAttemptState =
  | "creating"
  | "open"
  | "completed"
  | "expired"
  | "failed"
  | "manual_review";

export type PaymentState =
  | "none"
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type RefundState = "none" | "pending" | "succeeded" | "failed";
export type DisputeState = "none" | "open" | "won" | "lost" | "challenged";
export type FulfillmentState = "not_started" | "blocked_until_step_6" | "hold";

// --- Checkout attempt transitions -------------------------------------------
const ATTEMPT_TRANSITIONS: Record<CheckoutAttemptState, readonly CheckoutAttemptState[]> = {
  creating: ["open", "failed", "manual_review"],
  open: ["completed", "expired", "failed", "manual_review"],
  completed: [], // terminal in Step 5 (fulfillment is Step 6)
  expired: [],
  failed: [],
  manual_review: ["open", "failed"],
};

export function canTransitionAttempt(
  from: CheckoutAttemptState,
  to: CheckoutAttemptState,
): boolean {
  if (from === to) return false;
  return ATTEMPT_TRANSITIONS[from].includes(to);
}

// --- Payment state (monotonic; no regression) -------------------------------
/** Payment-state rank. A transition is allowed only forward or to a
 * refund/hold state; never from paid → pending. */
const PAYMENT_RANK: Record<PaymentState, number> = {
  none: 0,
  pending: 1,
  paid: 2,
  failed: 1, // terminal-but-lower-than-paid (cannot regress paid)
  refunded: 3,
  partially_refunded: 3,
};

export function canTransitionPayment(
  from: PaymentState,
  to: PaymentState,
): boolean {
  if (from === to) return true; // idempotent no-op
  // paid → failed is forbidden (regression). paid → refunded/partial ok.
  if (from === "paid" && to === "failed") return false;
  if (from === "paid" && to === "pending") return false;
  if (from === "pending" && to === "none") return false;
  // refund states can move among themselves (partial → full).
  if (from === "refunded" && to === "partially_refunded") return true;
  if (from === "partially_refunded" && to === "refunded") return true;
  return PAYMENT_RANK[to] > PAYMENT_RANK[from];
}

// --- Refund state -----------------------------------------------------------
export function canTransitionRefund(from: RefundState, to: RefundState): boolean {
  if (from === to) return true;
  if (from === "succeeded") return false; // terminal
  return to === "pending" || to === "succeeded" || to === "failed";
}

// --- Dispute state ----------------------------------------------------------
export function canTransitionDispute(from: DisputeState, to: DisputeState): boolean {
  if (from === to) return false;
  return true; // disputes are externally-driven; allow forward transitions
}

// --- Fulfillment state ------------------------------------------------------
export function canTransitionFulfillment(from: FulfillmentState, to: FulfillmentState): boolean {
  if (from === to) return false;
  // Step 5: fulfillment stays not_started / blocked / hold. Step 6 starts it.
  if (to === "not_started" && from !== "hold") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Paid-transition match checks (mirror of the transactional RPC).
// Any mismatch routes to manual_review, never to silent acceptance/granting.
// ---------------------------------------------------------------------------
export interface PaidTransitionMatch {
  ok: boolean;
  errors: string[];
}

export interface PaidTransitionInput {
  attemptId: string;
  sessionFromAttempt: string;
  sessionFromStripe: string;
  expectedEnvironment: "test" | "live";
  stripeLivemode: boolean;
  expectedCurrency: string;
  stripeCurrency: string;
  expectedSubtotal: number;
  stripeSubtotal: number;
  expectedPaymentIntent: string | null;
  stripePaymentIntent: string | null;
  paymentStatus: "paid" | "unpaid" | "processing" | "no_payment_required";
  hasCustomerEmail: boolean;
}

export function checkPaidTransition(input: PaidTransitionInput): PaidTransitionMatch {
  const errors: string[] = [];
  if (input.sessionFromAttempt !== input.sessionFromStripe) errors.push("session_mismatch");
  const envOk =
    (input.expectedEnvironment === "test") !== input.stripeLivemode; // test = !livemode
  if (!envOk) errors.push("environment_mismatch");
  if (input.expectedCurrency !== input.stripeCurrency) errors.push("currency_mismatch");
  if (input.expectedSubtotal !== input.stripeSubtotal) errors.push("subtotal_mismatch");
  if (input.expectedPaymentIntent !== input.stripePaymentIntent)
    errors.push("payment_intent_mismatch");
  if (input.paymentStatus !== "paid")
    errors.push("not_paid"); // completed ≠ paid; delayed must re-check
  if (!input.hasCustomerEmail) errors.push("missing_email");
  return { ok: errors.length === 0, errors };
}
