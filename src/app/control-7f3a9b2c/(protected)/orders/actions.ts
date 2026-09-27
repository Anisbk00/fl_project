"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminOrFailure } from "@/lib/auth/require-admin";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { getStripeClient } from "@/lib/stripe/server";
import { ADMIN_ORDERS_PATH } from "@/lib/admin-path";
import { drainOutbox, enqueueResend } from "@/features/fulfillment/delivery";
import { refundIdempotencyKey } from "@/features/payments/idempotency";
import type { ActionResult } from "@/lib/admin/product-schema";

/**
 * Order support actions. Order/fulfillment tables are read-only to admins via
 * RLS, so each action authorizes the AAL2 admin FIRST, then performs the write
 * through the server-only privileged client and records an audit event with
 * the verified admin UID (never a form field).
 */

const orderId = z.string().uuid();

type Authorized = { ok: true; uid: string } | { ok: false; result: ActionResult };

async function authorize(id: string): Promise<Authorized> {
  const auth = await requireAdminOrFailure({ aal2: true });
  if (!auth.ok) return { ok: false, result: { ok: false, message: "Unauthorized — AAL2 required." } };
  if (!orderId.safeParse(id).success) return { ok: false, result: { ok: false, message: "Invalid order id." } };
  return { ok: true, uid: auth.principal.uid };
}

async function audit(uid: string, action: string, id: string, context?: Record<string, string | number>) {
  const { error } = await getPrivilegedClient().from("audit_events").insert({
    actor_uid: uid, action, entity_type: "order", entity_id: id, context: context ?? null,
  });
  if (error) throw new Error("audit_write_failed");
}

async function changeAccess(id: string, action: "release" | "revoke", reason: string): Promise<ActionResult> {
  const a = await authorize(id);
  if (!a.ok) return a.result;
  const db = getPrivilegedClient();
  const { data: order, error } = await db.from("orders").select("payment_state, dispute_state").eq("id", id).maybeSingle();
  if (error) return { ok: false, message: "Could not load the order." };
  if (!order) return { ok: false, message: "Order not found." };
  if (action === "release" && (order.payment_state === "refunded" || order.dispute_state === "open" || order.dispute_state === "lost")) {
    return { ok: false, message: "Access can't be restored: the order is fully refunded or has an open/lost dispute." };
  }
  const { error: rpcErr } = await db.rpc("revoke_fulfillment", { p_order_id: id, p_action: action, p_reason: reason });
  if (rpcErr) return { ok: false, message: "The access change failed. Nothing was modified." };
  await audit(a.uid, `order.access_${action}`, id);
  revalidatePath(`${ADMIN_ORDERS_PATH}/${id}`);
  return { ok: true, message: action === "release" ? "Access restored." : "Access revoked." };
}

/** Release a hold (e.g. a goodwill partial refund) so the buyer can download again. */
export async function releaseAccessAction(id: string): Promise<ActionResult> {
  return changeAccess(id, "release", "admin_release");
}

/** Permanently revoke all download access for the order. */
export async function revokeAccessAction(id: string): Promise<ActionResult> {
  return changeAccess(id, "revoke", "admin_revoke");
}

/** Send a new delivery email with a fresh access link, immediately. */
export async function resendDeliveryAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if (!a.ok) return a.result;
  const db = getPrivilegedClient();
  const { data: order, error } = await db.from("orders").select("payment_state, dispute_state").eq("id", id).maybeSingle();
  if (error) return { ok: false, message: "Could not load the order." };
  if (!order) return { ok: false, message: "Order not found." };
  if (!(order.payment_state === "paid" || order.payment_state === "partially_refunded") || order.dispute_state === "open") {
    return { ok: false, message: "Only paid, undisputed orders can receive a delivery email." };
  }
  try {
    await enqueueResend(id);
    await audit(a.uid, "order.delivery_resend", id);
    const tally = await drainOutbox();
    revalidatePath(`${ADMIN_ORDERS_PATH}/${id}`);
    return tally.sent > 0
      ? { ok: true, message: "Delivery email sent." }
      : { ok: false, message: "The email was queued but not sent yet — check the delivery log below; the worker retries automatically." };
  } catch {
    return { ok: false, message: "Could not queue the delivery email." };
  }
}

/**
 * Refund the remaining balance through Stripe. The order + access change when
 * Stripe's refund webhook arrives (the single source of payment truth); this
 * action only requests the refund.
 */
export async function refundOrderAction(id: string): Promise<ActionResult> {
  const a = await authorize(id);
  if (!a.ok) return a.result;
  const db = getPrivilegedClient();
  const { data: order, error } = await db
    .from("orders").select("stripe_payment_intent_id, payment_state, total, amount_refunded").eq("id", id).maybeSingle();
  if (error) return { ok: false, message: "Could not load the order." };
  if (!order) return { ok: false, message: "Order not found." };
  const remaining = order.total - order.amount_refunded;
  if (!order.stripe_payment_intent_id || remaining <= 0 || order.payment_state === "refunded") {
    return { ok: false, message: "Nothing left to refund on this order." };
  }
  const { count, error: pErr } = await db
    .from("refunds").select("id", { count: "exact", head: true }).eq("order_id", id).eq("state", "pending");
  if (pErr) return { ok: false, message: "Could not check existing refunds." };
  if ((count ?? 0) > 0) return { ok: false, message: "A refund for this order is already in progress." };

  const requestId = crypto.randomUUID();
  const key = refundIdempotencyKey(requestId);
  const { data: refundRow, error: insErr } = await db.from("refunds").insert({
    order_id: id, internal_request_id: requestId, stripe_idempotency_key: key,
    amount: remaining, reason: "requested_by_customer", requesting_admin_uid: a.uid,
  }).select("id").single();
  if (insErr) return { ok: false, message: "Could not record the refund request." };

  try {
    const refund = await getStripeClient().refunds.create(
      { payment_intent: order.stripe_payment_intent_id, amount: remaining, reason: "requested_by_customer" },
      { idempotencyKey: key },
    );
    const { error: upErr } = await db.from("refunds").update({
      stripe_refund_id: refund.id,
      state: refund.status === "succeeded" ? "succeeded" : refund.status === "failed" ? "failed" : "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", refundRow.id);
    if (upErr) return { ok: false, message: "Stripe accepted the refund, but recording its id failed. The webhook will still update the order." };
    await audit(a.uid, "order.refund_requested", id, { amount: remaining });
    revalidatePath(`${ADMIN_ORDERS_PATH}/${id}`);
    return { ok: true, message: "Refund submitted to Stripe. Access is revoked when Stripe confirms it." };
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "stripe_error";
    await db.from("refunds").update({ state: "failed", stripe_failure_code: code.slice(0, 60), updated_at: new Date().toISOString() }).eq("id", refundRow.id);
    return { ok: false, message: `Stripe rejected the refund (${code}). Nothing was refunded.` };
  }
}
