import "server-only";
import { z } from "zod";

/**
 * Server-only environment variables.
 *
 * IMPORTANT: this module imports `server-only`, so any Client Component that
 * accidentally imports it will fail at build time. The secret key lives here.
 *
 * Validation strategy: secrets are validated LAZILY — only when a server
 * module actually needs them (i.e. when instantiating the privileged Supabase
 * client or sending a webhook response). This lets the production build and
 * the development server succeed WITHOUT real secrets present, while still
 * refusing to run privileged operations if the configuration is missing or
 * malformed. We never print secret values; errors describe which variable is
 * missing, never its contents.
 *
 * NOTE: there is NO local database and NO Prisma. Supabase is the only data
 * platform. The only server-side data configuration is the Supabase URL +
 * secret key (plus the publishable pair, which is in public.ts).
 */

const serverEnvSchema = z.object({
  // Optional-empty: an unset env var is undefined; coerce to "" so the schema
  // accepts it. Downstream code (hasSupabaseServerConfig / privileged client)
  // decides whether an empty value is acceptable and fails closed otherwise.
  SUPABASE_URL: z
    .string()
    .trim()
    .url("SUPABASE_URL must be an absolute URL when set")
    .or(z.literal(""))
    .default(""),
  SUPABASE_SECRET_KEY: z
    .string()
    .trim()
    .or(z.literal(""))
    .default(""),
  // --- Step 5 payment secrets (server-only; never NEXT_PUBLIC_) ---
  STRIPE_SECRET_KEY: z.string().trim().or(z.literal("")).default(""),
  STRIPE_WEBHOOK_SECRET: z.string().trim().or(z.literal("")).default(""),
  CART_TOKEN_PEPPER: z.string().trim().or(z.literal("")).default(""),
  // Comma-separated canonical checkout origins (no trailing slash).
  CHECKOUT_ORIGIN_ALLOWLIST: z.string().trim().or(z.literal("")).default(""),
  // Fail-closed live-payment gate. Default false → only test/sandbox works.
  LIVE_CHECKOUT_ENABLED: z
    .preprocess((v) => v === "1" || v === "true" || v === true, z.boolean())
    .default(false),
  // --- Step 6 email/cron secrets (server-only) ---
  RESEND_API_KEY: z.string().trim().or(z.literal("")).default(""),
  RESEND_WEBHOOK_SECRET: z.string().trim().or(z.literal("")).default(""),
  RESEND_FROM_EMAIL: z.string().trim().or(z.literal("")).default(""),
  CRON_SECRET: z.string().trim().or(z.literal("")).default(""),
  FULFILLMENT_ROOT_KEY_HEX: z.string().trim().or(z.literal("")).default(""),
  FULFILLMENT_PREV_KEY_HEX: z.string().trim().or(z.literal("")).default(""),
  FULFILLMENT_KEY_VERSION: z.coerce.number().int().min(0).default(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function readServerEnv(): ServerEnv {
  // parse() throws ZodError on invalid input; we rethrow with a non-secret
  // message so the missing/malformed VARIABLE name is surfaced without its
  // value ever being logged.
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Server environment configuration is invalid — ${issues}`);
  }
  return parsed.data;
}

/**
 * Returns the validated server environment. Throws if required server
 * variables are malformed. Never logs the returned values.
 */
export function getServerEnv(): ServerEnv {
  return readServerEnv();
}

/**
 * True only when BOTH the Supabase secret URL and secret key are configured.
 * Used by callers that want to gracefully skip Supabase-dependent work in
 * environments where Supabase has not been linked yet (e.g. Step 1 sandbox).
 */
export function hasSupabaseServerConfig(): boolean {
  const env = readServerEnv();
  return env.SUPABASE_URL.length > 0 && env.SUPABASE_SECRET_KEY.length > 0;
}

/** True when a Stripe secret key + webhook secret are configured (sandbox or live). */
export function hasStripeConfig(): boolean {
  const env = readServerEnv();
  return env.STRIPE_SECRET_KEY.length > 0 && env.STRIPE_WEBHOOK_SECRET.length > 0;
}

/** True when a Stripe LIVE key (sk_live_) is configured. */
export function stripeKeyIsLive(): boolean {
  return readServerEnv().STRIPE_SECRET_KEY.startsWith("sk_live_");
}

/** The cart-token pepper (server-only). Empty if not configured. */
export function getCartPepper(): string {
  return readServerEnv().CART_TOKEN_PEPPER;
}

/** Canonical checkout origin allow-list (lowercased, no trailing slash). */
export function getOriginAllowlist(): string[] {
  return readServerEnv()
    .CHECKOUT_ORIGIN_ALLOWLIST.split(",")
    .map((s) => s.trim().replace(/\/$/, "").toLowerCase())
    .filter(Boolean);
}

/** Fail-closed live-checkout flag. Default false → only test/sandbox works. */
export function isLiveCheckoutEnabled(): boolean {
  return readServerEnv().LIVE_CHECKOUT_ENABLED;
}
