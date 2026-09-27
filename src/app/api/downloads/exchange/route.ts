import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangeAccessToken } from "@/features/fulfillment/downloads";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().min(40).max(200) }).strict();
const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/** Exchange the emailed access token for a short-lived download session cookie. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  if (!(await checkRateLimit(RATE_LIMITS.downloadExchange, req.headers))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  // Same response for malformed, unknown, expired and revoked tokens.
  if (!parsed.success) return NextResponse.json({ error: "invalid_or_expired" }, { status: 400, headers: NO_STORE });
  try {
    const ok = await exchangeAccessToken(parsed.data.token.trim());
    return ok
      ? NextResponse.json({ ok: true }, { headers: NO_STORE })
      : NextResponse.json({ error: "invalid_or_expired" }, { status: 400, headers: NO_STORE });
  } catch (e) {
    logError("download.exchange_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
