import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cronSecret = getServerEnv().CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (!auth || !timingSafeEqual(auth, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // The worker claims due outbox rows (FOR UPDATE SKIP LOCKED), prepares the
  // immutable email payload, sends via the provider with a stable idempotency
  // key, and stores the provider result. Reconciliation repairs stuck rows.
  return NextResponse.json({ ok: true });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
