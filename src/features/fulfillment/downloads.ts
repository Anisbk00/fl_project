import "server-only";
import { cookies } from "next/headers";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { logInfo, logWarn } from "@/lib/observability/logger";
import { digestToken, generateAccessToken } from "./crypto";
import { getKeyRing } from "./delivery";
import { sanitizeDownloadFilename } from "./email-payload";
import { DOWNLOAD_SESSION_MINUTES, SIGNED_URL_TTL_SECONDS } from "./policy";

/**
 * Guest download access. The emailed access token is exchanged for a
 * short-lived, DB-backed session cookie; each file click then asks the server
 * for a 120-second signed Storage URL. Authorization is ALWAYS re-derived
 * from server records — never from ids, emails or paths the client sends.
 *
 * Every failure returns the same generic result so callers cannot probe
 * whether other orders, files or tokens exist.
 */

const secureCookies = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = secureCookies ? "__Host-dl_session" : "dl_session";

const PAID_STATES = ["paid", "partially_refunded"];

/** Exchange an emailed access token for a download session. */
export async function exchangeAccessToken(token: string): Promise<boolean> {
  const keyRing = getKeyRing();
  const digest = digestToken(token, keyRing);
  if (!digest) return false;
  const db = getPrivilegedClient();
  const { data: row, error } = await db
    .from("download_access_tokens")
    .select("id, order_id, generation_id")
    .eq("token_digest", digest)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("token_lookup_failed");
  if (!row) {
    logWarn("download.token_rejected", { objectType: "download_access_token" });
    return false;
  }
  if (!(await orderAllowsAccess(row.order_id))) return false;

  // First use is recorded; the link stays valid until it expires or is revoked.
  await db.from("download_access_tokens").update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id).is("consumed_at", null);

  const sessionToken = generateAccessToken(keyRing.current.version);
  const sessionDigest = digestToken(sessionToken, keyRing);
  if (!sessionDigest) throw new Error("session_crypto_failed");
  const expiresAt = new Date(Date.now() + DOWNLOAD_SESSION_MINUTES * 60_000);
  const { error: sErr } = await db.from("download_access_sessions").insert({
    order_id: row.order_id,
    generation_id: row.generation_id,
    token_digest: sessionDigest,
    expires_at: expiresAt.toISOString(),
  });
  if (sErr) throw new Error("session_create_failed");

  (await cookies()).set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: DOWNLOAD_SESSION_MINUTES * 60,
  });
  logInfo("download.session_created", { objectType: "download_access_session" });
  return true;
}

async function orderAllowsAccess(orderId: string): Promise<boolean> {
  const { data, error } = await getPrivilegedClient()
    .from("orders").select("payment_state, dispute_state").eq("id", orderId).single();
  if (error) throw new Error("order_lookup_failed");
  return PAID_STATES.includes(data.payment_state) && data.dispute_state !== "open" && data.dispute_state !== "lost";
}

/** Resolve the current request's valid download session, or null. */
export async function currentSession(): Promise<{ id: string; orderId: string; expiresAt: string } | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const digest = digestToken(raw, getKeyRing());
  if (!digest) return null;
  const { data, error } = await getPrivilegedClient()
    .from("download_access_sessions")
    .select("id, order_id, expires_at")
    .eq("token_digest", digest)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("session_lookup_failed");
  return data ? { id: data.id, orderId: data.order_id, expiresAt: data.expires_at } : null;
}

export interface DownloadItem {
  entitlementId: string;
  title: string;
  productType: string;
  filename: string;
  bytes: number;
  state: "active" | "held" | "revoked";
  remaining: number;
}

/** The files the session's order is entitled to. */
export async function listDownloads(orderId: string): Promise<{ orderNumber: string; items: DownloadItem[] }> {
  const db = getPrivilegedClient();
  const [order, ents, items] = await Promise.all([
    db.from("orders").select("order_number").eq("id", orderId).single(),
    db.from("fulfillment_entitlements")
      .select("id, order_item_id, state, successful_issuances, issuance_quota_snapshot, product_deliverables(customer_filename, bytes)")
      .eq("order_id", orderId),
    db.from("order_items").select("product_id, title, product_type").eq("order_id", orderId),
  ]);
  if (order.error || ents.error || items.error) throw new Error("downloads_load_failed");
  return {
    orderNumber: order.data.order_number,
    items: ents.data.map((e) => {
      const item = items.data.find((i) => i.product_id === e.order_item_id);
      return {
        entitlementId: e.id,
        title: item?.title ?? "Purchased item",
        productType: item?.product_type ?? "",
        filename: sanitizeDownloadFilename(e.product_deliverables?.customer_filename ?? "download.zip"),
        bytes: e.product_deliverables?.bytes ?? 0,
        state: e.state as DownloadItem["state"],
        remaining: Math.max(0, e.issuance_quota_snapshot - e.successful_issuances),
      };
    }),
  };
}

export type IssueResult = { ok: true; url: string } | { ok: false; reason: "denied" | "quota_exhausted" };

/** Issue a 120-second signed URL for one entitlement of the session's order. */
export async function issueDownloadUrl(entitlementId: string): Promise<IssueResult> {
  const session = await currentSession();
  if (!session) return { ok: false, reason: "denied" };
  const db = getPrivilegedClient();

  const { data: ent, error } = await db
    .from("fulfillment_entitlements")
    .select("id, order_id, state, successful_issuances, issuance_quota_snapshot, deliverable_asset_id")
    .eq("id", entitlementId)
    .eq("order_id", session.orderId) // bound to THIS session's order
    .maybeSingle();
  if (error) throw new Error("entitlement_lookup_failed");
  if (!ent || ent.state !== "active" || !(await orderAllowsAccess(ent.order_id))) {
    logWarn("download.denied", { objectType: "fulfillment_entitlement" });
    return { ok: false, reason: "denied" };
  }
  if (ent.successful_issuances >= ent.issuance_quota_snapshot) return { ok: false, reason: "quota_exhausted" };

  // Optimistic quota reservation: only succeeds if nobody else incremented.
  const { data: reserved, error: qErr } = await db
    .from("fulfillment_entitlements")
    .update({ successful_issuances: ent.successful_issuances + 1, last_issuance_at: new Date().toISOString() })
    .eq("id", ent.id)
    .eq("successful_issuances", ent.successful_issuances)
    .select("id")
    .maybeSingle();
  if (qErr) throw new Error("quota_reserve_failed");
  if (!reserved) return { ok: false, reason: "denied" }; // concurrent click; user can retry

  const { data: file, error: fErr } = await db
    .from("product_deliverables")
    .select("bucket, storage_object_path, customer_filename")
    .eq("id", ent.deliverable_asset_id)
    .single();
  if (fErr) throw new Error("deliverable_lookup_failed");

  const { data: signed, error: sErr } = await db.storage
    .from(file.bucket)
    .createSignedUrl(file.storage_object_path, SIGNED_URL_TTL_SECONDS, {
      download: sanitizeDownloadFilename(file.customer_filename),
    });
  if (sErr || !signed) {
    // Give the reservation back: a failed signing must not burn quota.
    await db.from("fulfillment_entitlements")
      .update({ successful_issuances: ent.successful_issuances })
      .eq("id", ent.id).eq("successful_issuances", ent.successful_issuances + 1);
    throw new Error("sign_failed");
  }

  const now = new Date();
  await db.from("download_url_issuances").insert({
    entitlement_id: ent.id,
    session_id: session.id,
    idempotency_key: crypto.randomUUID(),
    state: "issued",
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  });
  await db.from("download_access_sessions").update({ last_used_at: now.toISOString() }).eq("id", session.id);
  logInfo("download.url_issued", { objectType: "fulfillment_entitlement" });
  return { ok: true, url: signed.signedUrl };
}
