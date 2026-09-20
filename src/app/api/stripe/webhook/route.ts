import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/server";
import { getServerEnv } from "@/lib/env/server";
import { isSupportedEventType } from "@/features/payments/webhook-events";

/**
 * Stripe webhook endpoint (Step 5).
 *
 * Intentionally public. Authentication = Stripe signature verification against
 * the UNTOUCHED RAW request body (never `request.json()` or a re-serialized
 * body). Uses the official Stripe SDK `constructEvent` with normal timestamp
 * tolerance.
 *
 * Ingress behavior:
 *   1. Reject non-POST / oversized bodies.
 *   2. Read the raw body ONCE.
 *   3. Require `Stripe-Signature`.
 *   4. Verify raw payload + signature + endpoint-specific secret.
 *   5. Nondisclosing 400 for malformed/invalid/expired signatures.
 *   6. Persist the VERIFIED event in the private webhook inbox (unique by
 *      Stripe event ID) BEFORE returning 2xx. Duplicate event ID → 2xx after
 *      confirming the existing record. Persistence failure → 5xx (retryable).
 *   7. Safe-acknowledge verified-but-unsupported events (2xx, no side effects).
 *
 * NEVER logs the signing secret, full signature, raw payload, customer email,
 * billing address, Checkout URL, cart token, or PaymentIntent client secret.
 *
 * NOT runnable end-to-end in the sandbox (no live Stripe webhook secret + no
 * live Supabase to persist the inbox). Returns honest 400/500 when unconfigured.
 */
export const runtime = "nodejs"; // required by the official Stripe SDK
export const dynamic = "force-dynamic"; // never cached; webhooks must not be served from a shared cache

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export async function POST(req: Request) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "method" }, { status: 405 });
  }

  const webhookSecret = getServerEnv().STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // No endpoint secret configured → cannot verify. Fail closed (503).
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  // Reject excessive request sizes.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // Read the raw body ONCE as text. Never call req.json() or re-serialize.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  // Verify the signature against the untouched raw body + endpoint secret.
  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch {
    // Nondisclosing: any malformed/invalid/expired signature → same 400.
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Persist the VERIFIED event in the private webhook inbox before 2xx.
  // (Inbox persistence uses the server-secret Supabase boundary; in the sandbox
  // this is unavailable → return a retryable 5xx so Stripe retries.)
  try {
    const { getPrivilegedClient } = await import("@/lib/supabase/privileged");
    const db = getPrivilegedClient();
    const { error } = await db
      .from("webhook_inbox")
      .upsert(
        {
          stripe_event_id: event.id,
          event_type: event.type,
          related_object_id:
            (event.data.object as { id?: string } | null)?.id ?? null,
          livemode: event.livemode,
          api_version: event.api_version ?? null,
          payload: event.data.object, // private; purged after retention
          state: "received",
        },
        { onConflict: "stripe_event_id", ignoreDuplicates: true },
      );
    if (error) {
      // Persistence failed → retryable 5xx.
      return NextResponse.json({ error: "persist_failed" }, { status: 500 });
    }
  } catch {
    // No live Supabase (sandbox) → retryable 5xx. Stripe will retry.
    return NextResponse.json({ error: "inbox_unavailable" }, { status: 500 });
  }

  // Safe-acknowledge verified-but-unsupported events (2xx, no side effects).
  if (!isSupportedEventType(event.type)) {
    return NextResponse.json({ received: true, processed: false });
  }

  // Durable processing happens through the webhook worker/reconciliation path
  // (not in this request's critical path). 2xx acknowledges durable receipt.
  return NextResponse.json({ received: true });
}
