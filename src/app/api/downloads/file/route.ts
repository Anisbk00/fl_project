import { NextResponse } from "next/server";
import { z } from "zod";
import { issueDownloadUrl } from "@/features/fulfillment/downloads";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { publicEnv } from "@/lib/env/public";
import { logError } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function backToDownloads(error: string) {
  const url = new URL("/downloads", publicEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303, headers: NO_STORE });
}

/**
 * Form POST from /downloads → 303 redirect to a fresh 120-second signed URL.
 * The signed URL is never logged, stored or rendered into a page.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  if (!(await checkRateLimit(RATE_LIMITS.downloadSign, req.headers))) return backToDownloads("rate_limited");

  const form = await req.formData().catch(() => null);
  const id = z.string().uuid().safeParse(form?.get("entitlementId"));
  if (!id.success) return backToDownloads("denied");
  try {
    const result = await issueDownloadUrl(id.data);
    if (!result.ok) return backToDownloads(result.reason);
    return NextResponse.redirect(result.url, { status: 303, headers: NO_STORE });
  } catch (e) {
    logError("download.issue_failed", { reasonCode: e instanceof Error ? e.message : "unknown" });
    return backToDownloads("unavailable");
  }
}
