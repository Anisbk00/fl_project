import { describe, it, expect } from "bun:test";
import {
  generateCorrelationId,
  validateCorrelationId,
  resolveCorrelationId,
  generateSpanId,
  generateTraceId,
} from "@/lib/observability/correlation";
import {
  redactForTelemetry,
  redactString,
  sanitizeLogValue,
} from "@/lib/observability/redaction";
import { log, logInfo, logError } from "@/lib/observability/logger";
import { buildPublicCsp, buildSensitiveCsp, buildWebhookCsp } from "@/lib/security/csp";
import { SLO_CATALOG, TELEMETRY_EVENT_NAMES } from "@/lib/observability/slo-catalog";
import { ABUSE_MATRIX, PERF_BUDGETS } from "@/lib/security/abuse-matrix";

describe("correlation IDs", () => {
  it("generates random IDs (22+ chars base64url)", () => {
    const id = generateCorrelationId();
    expect(id.length).toBeGreaterThanOrEqual(22);
    expect(/^[A-Za-z0-9_-]+$/.test(id)).toBe(true);
  });
  it("validates + rejects malformed/short/long", () => {
    expect(validateCorrelationId("short")).toBeNull();
    expect(validateCorrelationId("x".repeat(100))).toBeNull();
    expect(validateCorrelationId("has spaces here")).toBeNull();
    expect(validateCorrelationId(generateCorrelationId())).not.toBeNull();
  });
  it("resolves to a fresh ID when external is invalid", () => {
    expect(resolveCorrelationId(null)).not.toBeNull();
    expect(resolveCorrelationId("bad input")).not.toBeNull();
    expect(resolveCorrelationId(generateCorrelationId())).not.toBeNull();
  });
  it("generates trace/span IDs", () => {
    expect(generateSpanId().length).toBe(16);
    expect(generateTraceId().length).toBe(32);
  });
});

describe("redaction canary tests", () => {
  it("redacts emails + IPs + fragments from strings", () => {
    const s = "contact alice@example.com from 10.0.0.1 #t=v1.secret";
    const red = redactString(s);
    expect(red).not.toContain("alice@example.com");
    expect(red).toContain("[EMAIL_REDACTED]");
    expect(red).not.toContain("10.0.0.1");
    expect(red).toContain("[IP_REDACTED]");
    expect(red).not.toContain("#t=v1.secret");
    expect(red).toContain("[FRAGMENT_REDACTED]");
  });
  it("redacts secret-ish keys recursively in objects", () => {
    const obj = {
      user: "alice",
      password: "hunter2",
      api_key: "sk_test_123",
      token: "abc",
      data: { cookie: "xyz", ok: "keep" },
    };
    const red = redactForTelemetry(obj) as Record<string, unknown>;
    expect(red.password).toBe("[REDACTED]");
    expect(red.api_key).toBe("[REDACTED]");
    expect(red.token).toBe("[REDACTED]");
    expect((red.data as Record<string, unknown>).cookie).toBe("[REDACTED]");
    expect((red.data as Record<string, unknown>).ok).toBe("keep");
    expect(red.user).toBe("alice");
  });
  it("canary: fake PII + secret cannot survive redaction", () => {
    const canary = {
      buyer_email: "buyer@evil.com",
      stripe_secret: "sk_live_abc123",
      webhook_secret: "whsec_xyz",
      access_token: "v1.sensitive",
      signed_url: "https://supabase.co/storage/v1/object/sign/...",
      private_path: "product-private/p1/v1/archive.zip",
      ip_address: "203.0.113.1",
      fragment: "#t=v1.leaked",
    };
    const red = JSON.stringify(redactForTelemetry(canary));
    expect(red).not.toContain("buyer@evil.com");
    expect(red).not.toContain("sk_live_abc123");
    expect(red).not.toContain("whsec_xyz");
    expect(red).not.toContain("v1.sensitive");
    expect(red).not.toContain("product-private");
    expect(red).not.toContain("203.0.113.1");
    expect(red).not.toContain("#t=v1.leaked");
  });
  it("sanitizes CR/LF/control for log injection defense", () => {
    expect(sanitizeLogValue("a\r\nBcc:evil")).toBe("aBcc:evil");
    expect(sanitizeLogValue("a\u0000b")).toBe("ab");
  });
});

describe("logger (non-fatal, bounded, redacted)", () => {
  it("does not throw on logging failures", () => {
    expect(() => log({ event: "test", severity: "info" })).not.toThrow();
    expect(() => logInfo("test.event")).not.toThrow();
    expect(() => logError("test.error", { message: "x" })).not.toThrow();
  });
});

describe("CSP builders", () => {
  it("public CSP has strict baseline (default-src none, object-src none)", () => {
    const csp = buildPublicCsp();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });
  it("sensitive CSP is stricter (no media-src, no worker-src)", () => {
    const csp = buildSensitiveCsp();
    expect(csp).toContain("media-src 'none'");
    expect(csp).toContain("worker-src 'none'");
    expect(csp).toContain("frame-src 'none'");
  });
  it("webhook CSP denies everything", () => {
    const csp = buildWebhookCsp();
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("style-src 'none'");
    expect(csp).toContain("img-src 'none'");
  });
  it("public CSP with nonce includes the nonce in script-src", () => {
    const csp = buildPublicCsp("abc123");
    expect(csp).toContain("'nonce-abc123'");
  });
});

describe("SLO catalog", () => {
  it("has entries for key metrics", () => {
    const names = SLO_CATALOG.map((s) => s.name);
    expect(names).toContain("storefront_availability");
    expect(names).toContain("fulfillment_email_latency");
    expect(names).toContain("dead_letter_count");
    expect(names).toContain("csp_violations");
  });
  it("all entries have an owner (even if REQUIRES_HUMAN_OWNER)", () => {
    expect(SLO_CATALOG.every((s) => s.owner.length > 0)).toBe(true);
  });
  it("all entries link to a runbook", () => {
    expect(SLO_CATALOG.every((s) => s.runbook.length > 0)).toBe(true);
  });
  it("provisional entries are labeled honestly", () => {
    expect(SLO_CATALOG.some((s) => s.provisional)).toBe(true);
  });
  it("telemetry event names are low-cardinality", () => {
    expect(TELEMETRY_EVENT_NAMES.length).toBeLessThan(30);
    expect(new Set(TELEMETRY_EVENT_NAMES).size).toBe(TELEMETRY_EVENT_NAMES.length);
  });
});

describe("abuse matrix + performance budgets", () => {
  it("documents key endpoints", () => {
    const endpoints = ABUSE_MATRIX.map((a) => a.endpoint);
    expect(endpoints).toContain("POST /api/stripe/webhook");
    expect(endpoints).toContain("POST /checkout (create session)");
    expect(endpoints).toContain("POST /downloads/access (token exchange)");
  });
  it("webhook endpoints are fail-closed", () => {
    const webhooks = ABUSE_MATRIX.filter((a) => a.trustLevel === "webhook");
    expect(webhooks.every((w) => w.failOpenOrClosed === "fail_closed")).toBe(true);
  });
  it("performance budgets have CWV targets", () => {
    expect(PERF_BUDGETS.home.lcpMs).toBe(2500);
    expect(PERF_BUDGETS.home.inpMs).toBe(200);
    expect(PERF_BUDGETS.home.cls).toBe(0.1);
  });
});
