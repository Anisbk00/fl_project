import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { getPrivilegedClient } from "@/lib/supabase/privileged";
import { processStripeEvent } from "@/features/payments/stripe-events";
import { drainOutbox } from "@/features/fulfillment/delivery";
import { logInfo } from "@/lib/observability/logger";

/**
 * Recovery worker (Vercel Cron, see vercel.json). Retries Stripe events that
 * failed inline processing, sends due/failed delivery emails, and prunes
 * expired rate-limit windows. Every step is idempotent, so overlapping runs
 * are safe. Authenticated by Vercel's `Authorization: Bearer $CRON_SECRET`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EVENT_BATCH = 25;

function authorized(req: Request, secret: string): boolean {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  if (!authorized(req, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getPrivilegedClient();
  const now = new Date().toISOString();

  // 1. Stripe events: never processed, due for retry, or with an expired lease.
  const { data: due, error } = await db
    .from("webhook_inbox")
    .select("stripe_event_id")
    .or(`state.eq.received,and(state.eq.failed,next_attempt_at.lte.${now}),and(state.eq.processing,lease_until.lt.${now})`)
    .order("received_at")
    .limit(EVENT_BATCH);
  if (error) return NextResponse.json({ error: "inbox_query_failed" }, { status: 500 });
  const events: Record<string, number> = {};
  for (const row of due) {
    const r = await processStripeEvent(row.stripe_event_id);
    events[r.state] = (events[r.state] ?? 0) + 1;
  }

  // 2. Delivery emails that are queued or whose retry backoff has elapsed.
  const emails = await drainOutbox();

  // 3. Prune rate-limit windows older than a day.
  const { error: pruneErr } = await db
    .from("rate_limits")
    .delete()
    .lt("window_start", new Date(Date.now() - 86400_000).toISOString());
  if (pruneErr) return NextResponse.json({ error: "prune_failed" }, { status: 500 });

  logInfo("cron.fulfillment_drain", { measurements: { events: due.length, emailsSent: emails.sent, emailsFailed: emails.failed } });
  return NextResponse.json({ events, emails });
}
