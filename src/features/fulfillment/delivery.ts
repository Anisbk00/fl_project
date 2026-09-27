import "server-only";
import { Resend } from "resend";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { getServerEnv } from "@/lib/env/server";
import { publicEnv } from "@/lib/env/public";
import { logError, logInfo } from "@/lib/observability/logger";
import {
  buildKeyRing,
  decryptToken,
  digestToken,
  encryptToken,
  generateAccessToken,
  type EncryptedToken,
  type KeyRing,
  type TokenAAD,
} from "./crypto";
import { prepareEmailPayload } from "./email-payload";
import { ACCESS_TOKEN_EXPIRY_HOURS, WORKER_BATCH_SIZE, WORKER_LEASE_SECONDS, WORKER_MAX_ATTEMPTS } from "./policy";

/**
 * Delivery-email worker. Durable + idempotent:
 *  - a message is claimed with a conditional update (one sender at a time);
 *  - its access token is created ONCE and stored encrypted, so every retry
 *    sends the byte-identical link;
 *  - Resend receives the message's stable idempotency key;
 *  - the order becomes fulfillment_state = 'completed' only after Resend
 *    accepted the email. An attempted send is never recorded as a success.
 */

const TEMPLATE_VERSION = "v1";
const TOKEN_PURPOSE = "download_access";

export function getKeyRing(): KeyRing {
  const env = getServerEnv();
  if (!env.FULFILLMENT_ROOT_KEY_HEX) throw new Error("fulfillment_key_unconfigured");
  return buildKeyRing(
    { version: env.FULFILLMENT_KEY_VERSION, rootKeyHex: env.FULFILLMENT_ROOT_KEY_HEX },
    env.FULFILLMENT_PREV_KEY_HEX
      ? [{ version: env.FULFILLMENT_KEY_VERSION - 1, rootKeyHex: env.FULFILLMENT_PREV_KEY_HEX }]
      : [],
  );
}

export type SendOutcome = "sent" | "failed" | "dead" | "cancelled" | "skipped";

export async function sendDeliveryMessage(messageId: string): Promise<SendOutcome> {
  const db = getPrivilegedClient();
  const now = new Date();
  const { data: msg, error: claimErr } = await db
    .from("delivery_messages")
    .update({ state: "sending", lease_until: new Date(now.getTime() + WORKER_LEASE_SECONDS * 1000).toISOString() })
    .eq("id", messageId)
    .or(`state.in.(queued,failed),and(state.eq.sending,lease_until.lt.${now.toISOString()})`)
    .select("id, order_id, generation_id, access_token_id, attempt_count, provider_idempotency_key")
    .maybeSingle();
  if (claimErr) throw new Error("message_claim_failed");
  if (!msg) return "skipped";

  try {
    const { data: order, error: oErr } = await db
      .from("orders")
      .select("id, order_number, buyer_email, total, currency, payment_state, dispute_state")
      .eq("id", msg.order_id)
      .single();
    if (oErr) throw new Error("order_load_failed");
    // Never deliver access for a reversed or disputed purchase.
    if (!(order.payment_state === "paid" || order.payment_state === "partially_refunded") || order.dispute_state === "open") {
      await db.from("delivery_messages").update({ state: "cancelled", lease_until: null, updated_at: new Date().toISOString() }).eq("id", msg.id);
      return "cancelled";
    }
    if (!order.buyer_email) throw new Error("order_without_email");

    const { data: items, error: iErr } = await db
      .from("order_items").select("title, product_type, unit_amount, currency").eq("order_id", order.id);
    if (iErr) throw new Error("items_load_failed");

    const token = await ensureAccessToken(msg.id, msg.order_id, msg.generation_id, msg.access_token_id);
    const env = getServerEnv();
    const supportEmail = publicEnv.NEXT_PUBLIC_SUPPORT_EMAIL;
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !supportEmail) throw new Error("email_unconfigured");

    const origin = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    const payload = prepareEmailPayload({
      orderNumber: order.order_number,
      items: items.map((i) => ({ title: i.title, productType: i.product_type, unitAmount: i.unit_amount, currency: i.currency })),
      totalAmount: order.total,
      currency: order.currency,
      accessToken: token,
      canonicalOrigin: origin,
      supportEmail,
      licenseUrl: `${origin}/legal/license`,
      refundUrl: `${origin}/legal/refunds`,
      templateVersion: TEMPLATE_VERSION,
    });

    const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send(
      { from: env.RESEND_FROM_EMAIL, to: order.buyer_email, subject: payload.subject, html: payload.html, text: payload.text },
      { idempotencyKey: msg.provider_idempotency_key },
    );
    if (error || !data) throw new Error(`resend_${error?.name ?? "no_data"}`);

    const sentAt = new Date().toISOString();
    const { error: upErr } = await db.from("delivery_messages").update({
      state: "sent",
      provider_message_id: data.id,
      payload_hash: payload.payloadHash,
      attempt_count: msg.attempt_count + 1,
      accepted_at: sentAt,
      sent_at: sentAt,
      lease_until: null,
      safe_error_class: null,
      updated_at: sentAt,
    }).eq("id", msg.id);
    if (upErr) throw new Error("message_mark_sent_failed");
    await db.from("orders").update({ fulfillment_state: "completed", updated_at: sentAt }).eq("id", order.id).eq("fulfillment_state", "started");
    logInfo("email.delivery_sent", { objectType: "delivery_message" });
    return "sent";
  } catch (e) {
    const attempts = msg.attempt_count + 1;
    const dead = attempts >= WORKER_MAX_ATTEMPTS;
    const errorClass = e instanceof Error ? e.message.slice(0, 80) : "unknown";
    await db.from("delivery_messages").update({
      state: dead ? "dead" : "failed",
      attempt_count: attempts,
      safe_error_class: errorClass,
      lease_until: null,
      next_attempt_at: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
      failed_at: new Date().toISOString(),
      ...(dead ? { dead_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", msg.id);
    logError("email.delivery_failed", { objectType: "delivery_message", reasonCode: errorClass, attempt: attempts });
    return dead ? "dead" : "failed";
  }
}

/** Create the message's access token once; afterwards decrypt the stored one. */
async function ensureAccessToken(
  messageId: string,
  orderId: string,
  generationId: string,
  existingTokenId: string | null,
): Promise<string> {
  const db = getPrivilegedClient();
  const keyRing = getKeyRing();
  const { data: gen, error: gErr } = await db
    .from("fulfillment_generations").select("generation").eq("id", generationId).single();
  if (gErr) throw new Error("generation_load_failed");

  if (existingTokenId) {
    const { data: row, error } = await db
      .from("download_access_tokens")
      .select("id, expires_at, key_version, encrypted_envelope, revoked_at")
      .eq("id", existingTokenId)
      .single();
    if (error) throw new Error("token_load_failed");
    if (row.revoked_at) throw new Error("token_revoked");
    const aad: TokenAAD = {
      tokenId: row.id, orderId, generation: gen.generation, purpose: TOKEN_PURPOSE,
      keyVersion: row.key_version, expiresAt: new Date(row.expires_at).toISOString(),
    };
    const token = decryptToken(row.encrypted_envelope as unknown as EncryptedToken, aad, keyRing);
    if (!token) throw new Error("token_decrypt_failed");
    return token;
  }

  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_HOURS * 3600_000).toISOString();
  const version = keyRing.current.version;
  const token = generateAccessToken(version);
  const aad: TokenAAD = { tokenId, orderId, generation: gen.generation, purpose: TOKEN_PURPOSE, keyVersion: version, expiresAt };
  const envelope = encryptToken(token, aad, keyRing);
  const digest = digestToken(token, keyRing);
  if (!envelope || !digest) throw new Error("token_crypto_failed");

  const { error: insErr } = await db.from("download_access_tokens").insert({
    id: tokenId, order_id: orderId, generation_id: generationId, token_digest: digest,
    key_version: version, encrypted_envelope: envelope as unknown as Record<string, string>, expires_at: expiresAt,
  });
  if (insErr) throw new Error("token_insert_failed");
  // Bind the token to this message only if no other worker already did.
  const { data: bound, error: bindErr } = await db
    .from("delivery_messages").update({ access_token_id: tokenId })
    .eq("id", messageId).is("access_token_id", null).select("id").maybeSingle();
  if (bindErr) throw new Error("token_bind_failed");
  if (!bound) {
    await db.from("download_access_tokens").update({ revoked_at: new Date().toISOString(), revocation_reason: "bind_race" }).eq("id", tokenId);
    const { data: m, error } = await db.from("delivery_messages").select("access_token_id").eq("id", messageId).single();
    if (error || !m.access_token_id) throw new Error("token_rebind_failed");
    return ensureAccessToken(messageId, orderId, generationId, m.access_token_id);
  }
  return token;
}

/** Process due delivery jobs. Called inline after payment and by the cron. */
export async function drainOutbox(limit = WORKER_BATCH_SIZE): Promise<Record<SendOutcome, number>> {
  const db = getPrivilegedClient();
  const { data: jobs, error } = await db
    .from("fulfillment_outbox")
    .select("id, aggregate_id, attempt_count")
    .eq("job_type", "send_delivery_email")
    .eq("state", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("priority").order("next_attempt_at")
    .limit(limit);
  if (error) throw new Error("outbox_load_failed");

  const tally: Record<SendOutcome, number> = { sent: 0, failed: 0, dead: 0, cancelled: 0, skipped: 0 };
  for (const job of jobs) {
    const outcome = await sendDeliveryMessage(job.aggregate_id);
    tally[outcome]++;
    const done = outcome === "sent" || outcome === "cancelled" || outcome === "dead";
    const ts = new Date().toISOString();
    await db.from("fulfillment_outbox").update(
      done
        ? { state: outcome === "dead" ? "dead" : "completed", completed_at: ts, updated_at: ts }
        : {
            attempt_count: job.attempt_count + 1,
            next_attempt_at: new Date(Date.now() + 2 ** (job.attempt_count + 1) * 60_000).toISOString(),
            last_error_class: outcome,
            updated_at: ts,
          },
    ).eq("id", job.id);
  }
  return tally;
}

/**
 * Queue a fresh delivery email (admin resend). Creates a new message with a
 * new access token; earlier links stay valid until their own expiry.
 */
export async function enqueueResend(orderId: string): Promise<string> {
  const db = getPrivilegedClient();
  const { data: gen, error: gErr } = await db
    .from("fulfillment_generations").select("id").eq("order_id", orderId).eq("state", "active")
    .order("generation", { ascending: false }).limit(1).single();
  if (gErr) throw new Error("no_active_generation");
  const { data: last, error: sErr } = await db
    .from("delivery_messages").select("send_sequence").eq("order_id", orderId).eq("message_kind", "admin_resend")
    .order("send_sequence", { ascending: false }).limit(1).maybeSingle();
  if (sErr) throw new Error("sequence_load_failed");
  const seq = (last?.send_sequence ?? 0) + 1;

  const { data: msg, error: mErr } = await db.from("delivery_messages").insert({
    order_id: orderId, generation_id: gen.id, message_kind: "admin_resend", template_version: TEMPLATE_VERSION,
    send_sequence: seq, provider_idempotency_key: `delivery_${orderId}_resend_${seq}`, state: "queued",
  }).select("id").single();
  if (mErr) throw new Error("resend_message_failed");
  const { error: jErr } = await db.from("fulfillment_outbox").insert({
    job_type: "send_delivery_email", aggregate_id: msg.id, idempotency_key: `outbox_${msg.id}`, state: "queued", priority: 1,
  });
  if (jErr) throw new Error("resend_job_failed");
  return msg.id;
}
