import { describe, it, expect } from "bun:test";
import {
  validateProductionConfig,
  hasDeploymentBlockers,
  hasChargingBlockers,
  type ConfigInput,
} from "@/lib/release/config-validation";

const baseProd: ConfigInput = {
  environment: "production",
  stripeSecretKey: "sk_live_abc123",
  stripeWebhookSecret: "whsec_live_xyz",
  supabaseUrl: "https://prod.supabase.co",
  supabasePublishableKey: "sb_publishable_prod",
  supabaseSecretKey: "sb_secret_prod",
  canonicalOrigin: "https://store.example.com",
  liveCheckoutEnabled: false,
  resendApiKey: "re_live_abc",
  cronSecret: "cron_secret_123",
  fulfillmentRootKeyHex: "a".repeat(64),
};

const basePreview: ConfigInput = {
  environment: "preview",
  stripeSecretKey: "sk_test_abc",
  stripeWebhookSecret: "whsec_test_xyz",
  supabaseUrl: "https://preview.supabase.co",
  supabasePublishableKey: "sb_publishable_preview",
  supabaseSecretKey: "sb_secret_preview",
  canonicalOrigin: "https://preview.example.com",
  liveCheckoutEnabled: false,
  resendApiKey: "re_test_abc",
  cronSecret: "cron_preview",
  fulfillmentRootKeyHex: "b".repeat(64),
};

describe("production config validation", () => {
  it("passes for a valid production config with live key + charging disabled", () => {
    const r = validateProductionConfig(baseProd);
    expect(r.ok).toBe(true);
    expect(hasDeploymentBlockers(r)).toBe(false);
    // Charging is blocked (live key + LIVE_CHECKOUT_ENABLED=false → correct).
    expect(hasChargingBlockers(r)).toBe(true);
  });

  it("blocks: Stripe TEST key in production", () => {
    const r = validateProductionConfig({ ...baseProd, stripeSecretKey: "sk_test_abc" });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name === "stripe_test_key_in_production")).toBe(true);
  });

  it("blocks: Stripe LIVE key in preview", () => {
    const r = validateProductionConfig({ ...basePreview, stripeSecretKey: "sk_live_abc" });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name === "stripe_live_key_in_non_production")).toBe(true);
  });

  it("blocks: localhost canonical origin in production", () => {
    const r = validateProductionConfig({ ...baseProd, canonicalOrigin: "http://localhost:3000" });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name === "canonical_origin_localhost_in_production")).toBe(true);
  });

  it("blocks: LIVE_CHECKOUT_ENABLED in preview", () => {
    const r = validateProductionConfig({ ...basePreview, liveCheckoutEnabled: true });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name === "live_charging_enabled_in_non_production")).toBe(true);
  });

  it("blocks: charging enabled with a TEST key in production", () => {
    const r = validateProductionConfig({
      ...baseProd,
      stripeSecretKey: "sk_test_abc",
      liveCheckoutEnabled: true,
    });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name === "charging_enabled_with_test_key")).toBe(true);
  });

  it("blocks: missing STRIPE_SECRET_KEY in production", () => {
    const r = validateProductionConfig({ ...baseProd, stripeSecretKey: "" });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name === "stripe_secret_missing")).toBe(true);
  });

  it("blocks: missing SUPABASE_SECRET_KEY in production", () => {
    const r = validateProductionConfig({ ...baseProd, supabaseSecretKey: "" });
    expect(r.ok).toBe(false);
  });

  it("warns: missing RESEND_API_KEY in production (blocks charging, not deployment)", () => {
    const r = validateProductionConfig({ ...baseProd, resendApiKey: "" });
    expect(r.ok).toBe(true); // No critical, just warning
    expect(hasChargingBlockers(r)).toBe(true);
    expect(hasDeploymentBlockers(r)).toBe(false);
  });

  it("blocks: short fulfillment root key in production", () => {
    const r = validateProductionConfig({ ...baseProd, fulfillmentRootKeyHex: "abc" });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.name === "fulfillment_key_missing_or_short")).toBe(true);
  });

  it("blocks: missing STRIPE_WEBHOOK_SECRET in production", () => {
    const r = validateProductionConfig({ ...baseProd, stripeWebhookSecret: "" });
    expect(r.ok).toBe(false);
  });

  it("info: live key present but charging correctly disabled", () => {
    const r = validateProductionConfig(baseProd);
    const info = r.checks.find((c) => c.name === "live_key_without_charging_enabled");
    expect(info?.severity).toBe("info");
    expect(info?.blocksDeployment).toBe(false);
    expect(info?.blocksCharging).toBe(true);
  });

  it("passes for a valid preview config", () => {
    const r = validateProductionConfig(basePreview);
    expect(r.ok).toBe(true);
  });
});
