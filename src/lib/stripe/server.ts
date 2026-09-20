import "server-only";
import Stripe from "stripe";
import { getServerEnv, hasStripeConfig } from "@/lib/env/server";

/**
 * Stripe SDK server client (Step 5). Server-only; the secret key never reaches
 * the browser. Uses the SDK's pinned stable GA API version (no preview/beta).
 *
 * Throws a clear configuration error if STRIPE_SECRET_KEY is absent, so the
 * checkout saga + webhook handler fail closed rather than calling Stripe with
 * an empty key.
 */
export function getStripeClient(): Stripe {
  const env = getServerEnv();
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook endpoint).",
    );
  }
  return new Stripe(key, {
    // The SDK's pinned stable GA API version. No preview/beta parameters.
    // typescript: true enables the generated types shipped with the SDK.
    typescript: true,
    // No undocumented parameters.
    maxNetworkRetries: 2,
  });
}

export function isStripeConfigured(): boolean {
  return hasStripeConfig();
}
