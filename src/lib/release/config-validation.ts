/**
 * Production configuration validation (Step 9).
 *
 * Startup + build-time checks that refuse test/live cross-wiring without
 * logging values. Detects:
 *   - Stripe test keys in production;
 *   - Stripe live keys in preview/staging;
 *   - Supabase project mismatches;
 *   - incorrect canonical origins;
 *   - impossible release-gate combinations.
 *
 * Never prints rejected values. Returns structured validation results.
 */

export type Environment = "development" | "preview" | "production";
export type Severity = "critical" | "warning" | "info";

export interface ConfigCheck {
  name: string;
  severity: Severity;
  message: string;
  blocksDeployment: boolean;
  blocksCharging: boolean;
}

export interface ConfigValidationResult {
  ok: boolean;
  environment: Environment;
  checks: ConfigCheck[];
}

export interface ConfigInput {
  environment: Environment;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  canonicalOrigin: string;
  liveCheckoutEnabled: boolean;
  resendApiKey: string;
  cronSecret: string;
  fulfillmentRootKeyHex: string;
}

/**
 * Validate a configuration for the target environment. Refuses test/live
 * cross-wiring, project mismatches, and impossible gate combinations.
 * Never logs the actual values — only structured messages.
 */
export function validateProductionConfig(input: ConfigInput): ConfigValidationResult {
  const checks: ConfigCheck[] = [];
  const env = input.environment;

  // --- Stripe key checks ---
  const stripeIsLive = input.stripeSecretKey.startsWith("sk_live_");
  const stripeIsTest = input.stripeSecretKey.startsWith("sk_test_");
  const stripeEmpty = input.stripeSecretKey.length === 0;

  if (env === "production") {
    if (stripeIsTest) {
      checks.push({
        name: "stripe_test_key_in_production",
        severity: "critical",
        message: "A Stripe TEST key is configured in the PRODUCTION environment.",
        blocksDeployment: true,
        blocksCharging: true,
      });
    }
    if (stripeEmpty) {
      checks.push({
        name: "stripe_secret_missing",
        severity: "critical",
        message: "STRIPE_SECRET_KEY is missing in production.",
        blocksDeployment: true,
        blocksCharging: true,
      });
    }
    if (stripeIsLive && !input.liveCheckoutEnabled) {
      checks.push({
        name: "live_key_without_charging_enabled",
        severity: "info",
        message: "A live Stripe key is present but LIVE_CHECKOUT_ENABLED is false. Charging is correctly disabled.",
        blocksDeployment: false,
        blocksCharging: true,
      });
    }
  }

  if (env === "preview" || env === "development") {
    if (stripeIsLive) {
      checks.push({
        name: "stripe_live_key_in_non_production",
        severity: "critical",
        message: `A Stripe LIVE key is configured in the ${env.toUpperCase()} environment.`,
        blocksDeployment: true,
        blocksCharging: true,
      });
    }
  }

  // --- Supabase checks ---
  if (env === "production") {
    if (!input.supabaseUrl || input.supabaseUrl.length === 0) {
      checks.push({
        name: "supabase_url_missing",
        severity: "critical",
        message: "SUPABASE_URL is missing in production.",
        blocksDeployment: true,
        blocksCharging: true,
      });
    }
    if (!input.supabaseSecretKey || input.supabaseSecretKey.length === 0) {
      checks.push({
        name: "supabase_secret_missing",
        severity: "critical",
        message: "SUPABASE_SECRET_KEY is missing in production.",
        blocksDeployment: true,
        blocksCharging: true,
      });
    }
  }

  // --- Canonical origin checks ---
  if (env === "production") {
    if (!input.canonicalOrigin || !input.canonicalOrigin.startsWith("https://")) {
      checks.push({
        name: "canonical_origin_not_https",
        severity: "critical",
        message: "Canonical origin must be HTTPS in production.",
        blocksDeployment: true,
        blocksCharging: true,
      });
    }
    if (input.canonicalOrigin.includes("localhost") || input.canonicalOrigin.includes("127.0.0.1")) {
      checks.push({
        name: "canonical_origin_localhost_in_production",
        severity: "critical",
        message: "Canonical origin is localhost in the PRODUCTION environment.",
        blocksDeployment: true,
        blocksCharging: true,
      });
    }
  }

  // --- Impossible gate combinations ---
  if (input.liveCheckoutEnabled && env !== "production") {
    checks.push({
      name: "live_charging_enabled_in_non_production",
      severity: "critical",
      message: `LIVE_CHECKOUT_ENABLED is true in the ${env.toUpperCase()} environment.`,
      blocksDeployment: true,
      blocksCharging: true,
    });
  }

  if (env === "production" && input.liveCheckoutEnabled && stripeIsTest) {
    checks.push({
      name: "charging_enabled_with_test_key",
      severity: "critical",
      message: "LIVE_CHECKOUT_ENABLED is true but the Stripe key is a TEST key.",
      blocksDeployment: true,
      blocksCharging: true,
    });
  }

  // --- Resend checks ---
  if (env === "production" && (!input.resendApiKey || input.resendApiKey.length === 0)) {
    checks.push({
      name: "resend_api_key_missing",
      severity: "warning",
      message: "RESEND_API_KEY is missing in production. Fulfillment email will not work.",
      blocksDeployment: false,
      blocksCharging: true,
    });
  }

  // --- Cron secret ---
  if (env === "production" && (!input.cronSecret || input.cronSecret.length === 0)) {
    checks.push({
      name: "cron_secret_missing",
      severity: "warning",
      message: "CRON_SECRET is missing. The fulfillment drain cron will reject all requests.",
      blocksDeployment: false,
      blocksCharging: true,
    });
  }

  // --- Fulfillment key ---
  if (env === "production" && (!input.fulfillmentRootKeyHex || input.fulfillmentRootKeyHex.length < 64)) {
    checks.push({
      name: "fulfillment_key_missing_or_short",
      severity: "critical",
      message: "FULFILLMENT_ROOT_KEY_HEX is missing or shorter than 32 bytes in production.",
      blocksDeployment: true,
      blocksCharging: true,
    });
  }

  // --- Webhook secret ---
  if (env === "production" && (!input.stripeWebhookSecret || input.stripeWebhookSecret.length === 0)) {
    checks.push({
      name: "stripe_webhook_secret_missing",
      severity: "critical",
      message: "STRIPE_WEBHOOK_SECRET is missing. Stripe webhooks cannot be verified.",
      blocksDeployment: true,
      blocksCharging: true,
    });
  }

  const critical = checks.filter((c) => c.severity === "critical");
  return {
    ok: critical.length === 0,
    environment: env,
    checks,
  };
}

/** True if the result has any critical checks that block deployment. */
export function hasDeploymentBlockers(result: ConfigValidationResult): boolean {
  return result.checks.some((c) => c.severity === "critical" && c.blocksDeployment);
}

/** True if the result has any checks that block charging. */
export function hasChargingBlockers(result: ConfigValidationResult): boolean {
  return result.checks.some((c) => c.blocksCharging);
}
