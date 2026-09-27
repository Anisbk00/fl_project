import type Stripe from "stripe";
import { after, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/server";
import { getServerEnv } from "@/lib/env/server";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { isSupportedEventType } from "@/features/payments/webhook-events";
import { processStripeEvent } from "@/features/payments/stripe-events";
import { drainOutbox } from "@/features/fulfillment/delivery";
import { logError } from "@/lib/observability/logger";
import type { Json } from "@/types/database";

/**
 * Stripe webhook — the ONLY source of payment truth.
 *
 *  1. Verify the signature against the untouched raw body (fail closed).
 *  2. Persist the verified event in `webhook_inbox` (unique by event id)
 *     BEFORE acknowledging. Persistence failure → 5xx so Stripe retries.
 *  3. Process it inline (idempotent; duplicates are skipped by the inbox
 *     claim). A processing failure still returns 2xx: the event is durably
 *     stored and the cron retries it with backoff.
 *  4. After responding, send the delivery email for a newly paid order.
 *
 * Never logs the secret, signature, raw payload or customer data.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(req: Request) {
  const webhookSecret = getServerEnv().STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let event: Stripe.Event;
  try {
    event = await getStripeClient().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (!isSupportedEventType(event.type)) {
    return NextResponse.json({ received: true, processed: false });
  }

  const { error } = await getPrivilegedClient()
    .from("webhook_inbox")
    .upsert(
      {
        stripe_event_id: event.id,
        event_type: event.type,
        related_object_id: (event.data.object as { id?: string }).id ?? null,
        livemode: event.livemode,
        api_version: event.api_version ?? null,
        // Only the object's id is needed: handlers re-fetch current state
        // from Stripe. The full payload (with customer PII) is not stored.
        payload: { id: (event.data.object as { id?: string }).id ?? null } as Json,
        state: "received",
      },
      { onConflict: "stripe_event_id", ignoreDuplicates: true },
    );
  if (error) {
    logError("stripe.inbox_persist_failed", { objectType: event.type, reasonCode: error.code });
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  const result = await processStripeEvent(event.id).catch((e) => {
    logError("stripe.inline_process_failed", { objectType: event.type, reasonCode: e instanceof Error ? e.message : "unknown" });
    return null;
  });

  if (result?.paidOrderId) {
    after(async () => {
      await drainOutbox().catch((e) =>
        logError("email.inline_drain_failed", { reasonCode: e instanceof Error ? e.message : "unknown" }),
      );
    });
  }
  return NextResponse.json({ received: true });
}
