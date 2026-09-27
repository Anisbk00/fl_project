import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getServerEnv } from "@/lib/env/server";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { logError, logWarn } from "@/lib/observability/logger";

/**
 * Resend delivery webhook (Svix-signed). Verifies the signature against the
 * raw body, de-duplicates by svix-id, and advances `delivery_messages` state.
 * Transitions are monotonic: a late "sent"/"delayed" never overwrites
 * "delivered", and terminal failures are recorded so admins can resend.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

// Which prior states each event may advance from.
const TRANSITIONS: Record<string, { to: string; from: string[]; stamp?: string }> = {
  "email.delivered": { to: "delivered", from: ["accepted", "sent", "delayed", "sending"], stamp: "delivered_at" },
  "email.delivery_delayed": { to: "delayed", from: ["accepted", "sent", "sending"] },
  "email.bounced": { to: "bounced", from: ["accepted", "sent", "delayed", "delivered", "sending"], stamp: "bounced_at" },
  "email.complained": { to: "complained", from: ["accepted", "sent", "delayed", "delivered"] },
  "email.failed": { to: "failed", from: ["accepted", "sent", "delayed", "sending"], stamp: "failed_at" },
};

export async function POST(req: Request) {
  const env = getServerEnv();
  if (!env.RESEND_WEBHOOK_SECRET || !env.RESEND_API_KEY) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    event = new Resend(env.RESEND_API_KEY).webhooks.verify({
      payload: raw,
      headers: { id, timestamp, signature },
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const transition = TRANSITIONS[event.type];
  const emailId = transition && "email_id" in event.data ? event.data.email_id : null;

  const db = getPrivilegedClient();
  const { data: inserted, error: inboxErr } = await db
    .from("email_webhook_inbox")
    .upsert(
      { provider_event_id: id, event_type: event.type, provider_message_id: emailId, state: "processing" },
      { onConflict: "provider_event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (inboxErr) {
    logError("email.webhook_persist_failed", { reasonCode: inboxErr.code });
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }
  if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });

  if (transition && emailId) {
    const ts = new Date().toISOString();
    const { error } = await db
      .from("delivery_messages")
      .update({ state: transition.to, updated_at: ts, ...(transition.stamp ? { [transition.stamp]: ts } : {}) })
      .eq("provider_message_id", emailId)
      .in("state", transition.from);
    if (error) {
      // Drop the dedupe row and 5xx, so Resend's retry is processed afresh.
      await db.from("email_webhook_inbox").delete().eq("provider_event_id", id);
      logError("email.webhook_apply_failed", { reasonCode: error.code });
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    if (transition.to !== "delivered" && transition.to !== "delayed") {
      logWarn("email.delivery_problem", { objectType: "delivery_message", outcome: transition.to });
    }
  }
  await db.from("email_webhook_inbox")
    .update({ state: "processed", processed_at: new Date().toISOString() })
    .eq("provider_event_id", id);
  return NextResponse.json({ received: true });
}
