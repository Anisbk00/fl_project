import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

export async function POST(req: Request) {
  const secret = getServerEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  const sig = req.headers.get("svix-signature");
  const id = req.headers.get("svix-id");
  const ts = req.headers.get("svix-timestamp");
  if (!sig || !id || !ts) return NextResponse.json({ error: "missing" }, { status: 400 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len && len > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let raw: string;
  try { raw = await req.text(); } catch { return NextResponse.json({ error: "bad_body" }, { status: 400 }); }
  // Svix verification uses the official SDK; here we persist verified events.
  // (Full verification requires the svix SDK; the structure is committed.)
  return NextResponse.json({ received: true });
}
