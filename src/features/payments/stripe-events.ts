import "server-only";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { getStripeClient } from "@/lib/stripe/server";
import { stripeKeyIsLive } from "@/lib/env/server";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { refundOutcome } from "./refund-policy";

/**
 * Processes one signature-verified event from `webhook_inbox`.
 *
 * Idempotent by construction: every handler re-reads the object from Stripe
 * (so out-of-order or replayed events converge on current truth) and every
 * write is either a conditional update or the idempotent mark_order_paid RPC.
 * The inbox row is claimed with a conditional state transition, so two
 * concurrent deliveries of the same event cannot both run it.
 */

const MAX_ATTEMPTS = 8;

export interface ProcessResult {
  state: "processed" | "failed" | "dead_letter" | "skipped";
  /** Set when this event produced (or re-confirmed) a paid order. */
  paidOrderId?: string;
}

export async function processStripeEvent(eventId: string): Promise<ProcessResult> {
  const db = getPrivilegedClient();
  const now = new Date();
  const { data: claimed, error } = await db
    .from("webhook_inbox")
    .update({ state: "processing", lease_until: new Date(now.getTime() + 60_000).toISOString() })
    .eq("stripe_event_id", eventId)
    // Expired leases are reclaimable: a crashed function never strands an event.
    .or(`state.in.(received,failed),and(state.eq.processing,lease_until.lt.${now.toISOString()})`)
    .select("stripe_event_id, event_type, related_object_id, attempt_count")
    .maybeSingle();
  if (error) throw new Error("inbox_claim_failed");
  if (!claimed) return { state: "skipped" }; // already processed or in flight

  try {
    const paidOrderId = await dispatch(claimed.event_type, claimed.related_object_id);
    await db.from("webhook_inbox")
      .update({ state: "processed", processed_at: new Date().toISOString(), last_error: null, lease_until: null })
      .eq("stripe_event_id", eventId);
    return { state: "processed", paidOrderId };
  } catch (e) {
    const attempts = claimed.attempt_count + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    const errorClass = e instanceof Error ? e.message.slice(0, 80) : "unknown";
    await db.from("webhook_inbox").update({
      state: dead ? "dead_letter" : "failed",
      attempt_count: attempts,
      last_error: errorClass,
      lease_until: null,
      next_attempt_at: new Date(Date.now() + 2 ** attempts * 30_000).toISOString(),
    }).eq("stripe_event_id", eventId);
    logError("stripe.event_failed", { objectType: claimed.event_type, reasonCode: errorClass, attempt: attempts });
    return { state: dead ? "dead_letter" : "failed" };
  }
}

async function dispatch(type: string, objectId: string | null): Promise<string | undefined> {
  if (!objectId) throw new Error("missing_object_id");
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleSessionPaid(objectId);
    case "checkout.session.async_payment_failed":
      await setAttemptState(objectId, "failed");
      return;
    case "checkout.session.expired":
      await setAttemptState(objectId, "expired");
      return;
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      await handleRefund(objectId);
      return;
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
      await handleDispute(objectId);
      return;
    default:
      return; // verified but unsupported: acknowledged without side effects
  }
}

/** Crockford base32, ~40 bits: non-sequential, unguessable-enough public ref. */
function newOrderNumber(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i]! % 32];
  return `FL-${out}`;
}

async function handleSessionPaid(sessionId: string): Promise<string | undefined> {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  // completed ≠ paid: delayed methods complete first and pay later.
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const attemptId = session.metadata?.attempt_id ?? session.client_reference_id;
  if (!attemptId) throw new Error("session_without_attempt");

  const db = getPrivilegedClient();
  const { data: items, error } = await db
    .from("checkout_attempt_items")
    .select("product_id, product_row_version, deliverable_asset_id, title, slug, product_type, unit_amount, currency, license_version")
    .eq("attempt_id", attemptId);
  if (error) throw new Error("attempt_items_failed");
  if (items.length === 0) throw new Error("attempt_items_missing");

  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const { data, error: rpcErr } = await db.rpc("mark_order_paid", {
    p_attempt_id: attemptId,
    p_stripe_session_id: session.id,
    p_stripe_payment_intent: paymentIntent ?? "",
    p_stripe_charge_id: "",
    p_stripe_livemode: session.livemode,
    p_expected_environment: stripeKeyIsLive() ? "live" : "test",
    p_expected_currency: session.currency ?? "",
    p_expected_subtotal: items.reduce((s, i) => s + i.unit_amount, 0),
    p_stripe_subtotal: session.amount_subtotal ?? -1,
    p_stripe_tax: session.total_details?.amount_tax ?? 0,
    p_stripe_discount: session.total_details?.amount_discount ?? 0,
    p_stripe_total: session.amount_total ?? -1,
    p_buyer_email: session.customer_details?.email ?? "",
    p_order_number: newOrderNumber(),
    p_items: items,
  });
  if (rpcErr) throw new Error("mark_order_paid_failed");
  const result = data?.[0];
  if (!result?.ok || !result.order_id) {
    // Mismatch → the attempt is parked in manual_review by the RPC. Not a
    // retryable failure: retrying would give the same answer.
    logWarn("order.manual_review", { objectType: "checkout_attempt", reasonCode: JSON.stringify(result?.errors ?? []) });
    return;
  }
  logInfo("order.paid", { objectType: "order" });
  return result.order_id;
}

async function setAttemptState(sessionId: string, state: "failed" | "expired") {
  const { error } = await getPrivilegedClient()
    .from("checkout_attempts")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("stripe_session_id", sessionId)
    .in("state", ["creating", "open"]); // never regress completed/manual_review
  if (error) throw new Error("attempt_state_failed");
}

async function findOrderByPaymentIntent(pi: string | Stripe.PaymentIntent | null) {
  const id = typeof pi === "string" ? pi : pi?.id;
  if (!id) return null;
  const { data, error } = await getPrivilegedClient()
    .from("orders")
    .select("id, payment_state, dispute_state")
    .eq("stripe_payment_intent_id", id)
    .maybeSingle();
  if (error) throw new Error("order_lookup_failed");
  return data;
}

async function applyAccess(orderId: string, action: "revoke" | "hold" | "release" | "none", reason: string) {
  if (action === "none") return;
  const { error } = await getPrivilegedClient().rpc("revoke_fulfillment", {
    p_order_id: orderId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error("access_change_failed");
}

async function handleRefund(refundId: string) {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.retrieve(refundId);
  const order = await findOrderByPaymentIntent(refund.payment_intent);
  if (!order) throw new Error("refund_order_not_found"); // retry: order may not exist yet
  const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
  if (!chargeId) throw new Error("refund_without_charge");
  // Authoritative cumulative totals from the charge, not the single refund.
  const charge = await stripe.charges.retrieve(chargeId);
  const outcome = refundOutcome(charge.amount, charge.amount_refunded);

  const db = getPrivilegedClient();
  const { error } = await db.from("orders").update({
    payment_state: outcome.paymentState,
    amount_refunded: charge.amount_refunded,
    refund_state: charge.amount_refunded > 0 ? "succeeded" : refund.status === "failed" ? "failed" : "pending",
    stripe_charge_id: charge.id,
    updated_at: new Date().toISOString(),
  }).eq("id", order.id);
  if (error) throw new Error("refund_order_update_failed");
  // Reconcile an admin-requested refund row (no-op for Dashboard refunds).
  const refundState = refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending";
  const { error: rErr } = await db.from("refunds")
    .update({ state: refundState, updated_at: new Date().toISOString() })
    .eq("stripe_refund_id", refund.id);
  if (rErr) throw new Error("refund_row_update_failed");
  await applyAccess(order.id, outcome.access, `refund:${refund.id}`);
  logInfo("order.refund_applied", { objectType: "order", outcome: outcome.paymentState, reasonCode: outcome.access });
}

async function handleDispute(disputeId: string) {
  const stripe = getStripeClient();
  const dispute = await stripe.disputes.retrieve(disputeId);
  const order = await findOrderByPaymentIntent(dispute.payment_intent);
  if (!order) throw new Error("dispute_order_not_found");

  const state = dispute.status === "won" ? "won" : dispute.status === "lost" ? "lost" : "open";
  // Open → hold all access; lost → revoke; won → restore (only if not refunded).
  const action =
    state === "open" ? "hold"
    : state === "lost" ? "revoke"
    : order.payment_state === "paid" ? "release" : "none";

  const { error } = await getPrivilegedClient().from("orders")
    .update({ dispute_state: state, updated_at: new Date().toISOString() })
    .eq("id", order.id);
  if (error) throw new Error("dispute_order_update_failed");
  await applyAccess(order.id, action, `dispute:${dispute.id}`);
  logInfo("order.dispute_applied", { objectType: "order", outcome: state });
}
