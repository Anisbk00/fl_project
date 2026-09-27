import "server-only";
import { createHash } from "node:crypto";
import { getPrivilegedClient } from "@/lib/supabase/privileged";

/**
 * Durable, serverless-safe rate limiting backed by Postgres
 * (`rate_limit_hit`, migration 0010). One atomic upsert per hit, so every
 * Vercel instance shares the same counter — no in-memory state.
 *
 * Keys hash the client IP; raw IPs are never stored.
 */

export interface RateLimitRule {
  /** Protected action, e.g. "checkout:create". */
  action: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  cartMutate: { action: "cart:mutate", limit: 60, windowSeconds: 60 },
  checkoutCreate: { action: "checkout:create", limit: 10, windowSeconds: 600 },
  downloadExchange: { action: "download:exchange", limit: 10, windowSeconds: 600 },
  downloadSign: { action: "download:sign", limit: 30, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

/** Best-effort client IP from Vercel's proxy headers. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function rateLimitKey(rule: RateLimitRule, ip: string): string {
  const digest = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  return `${rule.action}:${digest}`;
}

/**
 * Returns true when the request may proceed. Fails CLOSED: if the limiter
 * cannot be reached the request is refused rather than let through unmetered.
 */
export async function checkRateLimit(rule: RateLimitRule, headers: Headers): Promise<boolean> {
  try {
    const { data, error } = await getPrivilegedClient().rpc("rate_limit_hit", {
      p_key: rateLimitKey(rule, clientIp(headers)),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
