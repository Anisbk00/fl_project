/**
 * Rate limiting — Step 1 DOCUMENTATION STUB ONLY.
 *
 * The plan is explicit: "Add placeholders/documentation for later rate
 * limiting; do not pretend an in-memory limiter in a serverless process is
 * production protection." A single in-memory counter inside an ephemeral
 * Vercel Function instance provides NO real protection against distributed
 * abuse, because each instance has its own memory and instances scale to
 * zero between requests.
 *
 * A real rate limiter for this store (Step 5 checkout, Step 6 downloads,
 * Step 8 hardening) must be backed by shared, durable state — e.g. an
 * Upstash Redis counter, a Supabase row incremented in a transaction, or
 * Vercel's edge rate-limit product — keyed by IP + delivery email + route.
 *
 * This file deliberately provides ONLY types + a documented TODO so future
 * call sites have a stable signature to implement against. It does NOT
 * provide a fake in-memory limiter.
 */

export interface RateLimitInput {
  /** A stable identifier (IP, hashed email, or admin user id). */
  key: string;
  /** The protected route/action, e.g. "checkout:create", "download:sign". */
  action: string;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining attempts in the current window. */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
}

/**
 * Not implemented in Step 1. Implementing this against durable shared state
 * is a Step 5 / Step 8 task. Callers must not assume it protects anything
 * until that wiring lands.
 */
export async function checkRateLimit(
  _input: RateLimitInput,
): Promise<RateLimitResult> {
  throw new Error(
    "Rate limiting is not implemented in Step 1. See src/lib/security/rate-limit.ts.",
  );
}
