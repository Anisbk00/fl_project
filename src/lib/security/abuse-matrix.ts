/**
 * Endpoint abuse matrix + rate-limit policy (Step 8).
 *
 * Documents every endpoint's trust level, identifier strategy, cost, privacy
 * sensitivity, burst/sustained/concurrency limits, response behavior, storage,
 * retention, fail-open/closed decision, and legitimate retry handling.
 */

export interface AbuseMatrixEntry {
  endpoint: string;
  trustLevel: "public" | "capability" | "webhook" | "cron" | "admin";
  identifierStrategy: string;
  cost: "low" | "medium" | "high" | "critical";
  privacySensitivity: "low" | "medium" | "high";
  burstLimit: number;
  sustainedLimit: number;
  concurrencyLimit: number;
  responseBehavior: string;
  storage: string;
  retention: string;
  failOpenOrClosed: "fail_open" | "fail_closed";
  legitimateRetries: string;
}

export const ABUSE_MATRIX: readonly AbuseMatrixEntry[] = [
  {
    endpoint: "POST /api/stripe/webhook",
    trustLevel: "webhook",
    identifierStrategy: "Stripe event ID + signature verification",
    cost: "high",
    privacySensitivity: "high",
    burstLimit: 100,
    sustainedLimit: 50,
    concurrencyLimit: 1,
    responseBehavior: "2xx after durable persist; 4xx invalid sig; 5xx persistence failure",
    storage: "webhook_inbox (unique event ID)",
    retention: "30 days (payload purged after processing)",
    failOpenOrClosed: "fail_closed",
    legitimateRetries: "Stripe retries up to 3 days; tolerate duplicates",
  },
  {
    endpoint: "POST /api/resend/webhook",
    trustLevel: "webhook",
    identifierStrategy: "Svix event ID + signature verification",
    cost: "medium",
    privacySensitivity: "high",
    burstLimit: 50,
    sustainedLimit: 20,
    concurrencyLimit: 1,
    responseBehavior: "2xx after durable persist; 4xx invalid sig; 5xx persistence failure",
    storage: "email_webhook_inbox (unique provider event ID)",
    retention: "30 days (payload purged after processing)",
    failOpenOrClosed: "fail_closed",
    legitimateRetries: "Resend/Svix retries; tolerate duplicates + out-of-order",
  },
  {
    endpoint: "POST /api/cron/fulfillment-drain",
    trustLevel: "cron",
    identifierStrategy: "Bearer CRON_SECRET (timing-safe)",
    cost: "medium",
    privacySensitivity: "low",
    burstLimit: 5,
    sustainedLimit: 1,
    concurrencyLimit: 1,
    responseBehavior: "200 ok; 401 unauthorized; 503 unconfigured",
    storage: "lease in fulfillment_outbox",
    retention: "lease expires in 30s",
    failOpenOrClosed: "fail_closed",
    legitimateRetries: "Vercel Cron may miss/duplicate; idempotent",
  },
  {
    endpoint: "POST /downloads/access (token exchange)",
    trustLevel: "capability",
    identifierStrategy: "Token digest + privacy-preserving network key",
    cost: "medium",
    privacySensitivity: "high",
    burstLimit: 5,
    sustainedLimit: 3,
    concurrencyLimit: 1,
    responseBehavior: "302 redirect on success; 400 invalid/expired/used",
    storage: "download_access_tokens (consumed_at)",
    retention: "consumed + ciphertext wiped",
    failOpenOrClosed: "fail_closed",
    legitimateRetries: "Single-use; replay = uniform failure",
  },
  {
    endpoint: "POST /downloads (signed-URL issuance)",
    trustLevel: "capability",
    identifierStrategy: "Session digest + entitlement ID + idempotency key",
    cost: "medium",
    privacySensitivity: "high",
    burstLimit: 10,
    sustainedLimit: 5,
    concurrencyLimit: 1,
    responseBehavior: "200 signed URL (no-store); 429 quota exceeded",
    storage: "download_url_issuances (quota count)",
    retention: "issuance records retained for audit",
    failOpenOrClosed: "fail_closed",
    legitimateRetries: "Double-click/two-tab → one idempotent reservation",
  },
  {
    endpoint: "POST /cart (add/remove/clear)",
    trustLevel: "public",
    identifierStrategy: "Cart token digest + privacy-preserving network key",
    cost: "low",
    privacySensitivity: "low",
    burstLimit: 30,
    sustainedLimit: 10,
    concurrencyLimit: 1,
    responseBehavior: "200 cart state; 429 rate limited",
    storage: "guest_carts (version)",
    retention: "30 days idle expiry",
    failOpenOrClosed: "fail_open",
    legitimateRetries: "Idempotent add/remove; version conflict → 409",
  },
  {
    endpoint: "POST /checkout (create session)",
    trustLevel: "public",
    identifierStrategy: "Cart token digest + privacy-preserving network key",
    cost: "high",
    privacySensitivity: "medium",
    burstLimit: 5,
    sustainedLimit: 2,
    concurrencyLimit: 1,
    responseBehavior: "302 to Stripe; 409 stale cart; 429 rate limited",
    storage: "checkout_attempts (idempotency key)",
    retention: "attempt + session records retained",
    failOpenOrClosed: "fail_closed",
    legitimateRetries: "Double-click → same attempt + Session",
  },
  {
    endpoint: "POST /admin/login",
    trustLevel: "public",
    identifierStrategy: "Email + IP hash",
    cost: "medium",
    privacySensitivity: "high",
    burstLimit: 5,
    sustainedLimit: 3,
    concurrencyLimit: 1,
    responseBehavior: "302 on success; 401 generic error (non-enumerating)",
    storage: "rate-limit counter (email + IP hash)",
    retention: "15 min window",
    failOpenOrClosed: "fail_closed",
    legitimateRetries: "Supabase Auth endpoint rate limits are authoritative",
  },
];

/** Performance budget constants (Step 8). */
export const PERF_BUDGETS = {
  home: { jsKb: 80, cssKb: 30, lcpMs: 2500, inpMs: 200, cls: 0.1 },
  catalog: { jsKb: 120, cssKb: 30, lcpMs: 2500, inpMs: 200, cls: 0.1 },
  product: { jsKb: 100, cssKb: 30, lcpMs: 2500, inpMs: 200, cls: 0.1 },
  cart: { jsKb: 60, cssKb: 20, lcpMs: 2500, inpMs: 200, cls: 0.1 },
  admin: { jsKb: 200, cssKb: 40, lcpMs: 3000, inpMs: 200, cls: 0.1 },
  access: { jsKb: 20, cssKb: 10, lcpMs: 1500, inpMs: 200, cls: 0.1 },
} as const;
