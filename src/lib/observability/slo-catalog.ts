/**
 * SLI/SLO catalog (Step 8). Versioned, low-cardinality, owned, linked to
 * runbooks. Provisional targets are labeled; no claim that they were achieved
 * without measured evidence.
 */

export interface SloEntry {
  name: string;
  numerator: string;
  denominator: string;
  exclusions: string[];
  dimensions: string[];
  source: string;
  sampling: string;
  retention: string;
  warningThreshold: string;
  criticalThreshold: string;
  evaluationWindow: string;
  owner: string;
  runbook: string;
  limitations: string;
  provisional: boolean;
}

export const SLO_CATALOG: readonly SloEntry[] = [
  {
    name: "storefront_availability",
    numerator: "Successful public page responses (2xx)",
    denominator: "All public page requests",
    exclusions: ["Admin routes", "API/webhook endpoints", "Static assets"],
    dimensions: ["route_class", "device_class"],
    source: "Vercel runtime logs + edge metrics",
    sampling: "100% (server-side)",
    retention: "30 days",
    warningThreshold: "99.5% over 5 min",
    criticalThreshold: "99% over 5 min",
    evaluationWindow: "rolling 5 min / 1 hour / 24 hours",
    owner: "REQUIRES_HUMAN_OWNER",
    runbook: "docs/operations/incident-elevated-5xx.md",
    limitations: "Vercel plan affects availability guarantees",
    provisional: true,
  },
  {
    name: "checkout_creation_success",
    numerator: "Successful Checkout Session creations",
    denominator: "All checkout-attempt POSTs",
    exclusions: ["Buyer cancellations", "Cart validation failures"],
    dimensions: ["environment"],
    source: "Server structured logs",
    sampling: "100%",
    retention: "30 days",
    warningThreshold: "95% over 5 min",
    criticalThreshold: "90% over 5 min",
    evaluationWindow: "rolling 5 min",
    owner: "REQUIRES_HUMAN_OWNER",
    runbook: "docs/operations/incident-checkout-outage.md",
    limitations: "Stripe API availability affects this metric",
    provisional: true,
  },
  {
    name: "webhook_acceptance_latency",
    numerator: "Verified webhook events acknowledged within 2s",
    denominator: "All Stripe webhook deliveries",
    exclusions: ["Invalid signatures (rejected before 2xx)"],
    dimensions: ["event_type", "environment"],
    source: "Webhook endpoint logs",
    sampling: "100%",
    retention: "30 days",
    warningThreshold: "p95 < 2s",
    criticalThreshold: "p99 < 5s",
    evaluationWindow: "rolling 5 min",
    owner: "REQUIRES_HUMAN_OWNER",
    runbook: "docs/operations/incident-webhook-backlog.md",
    limitations: "Supabase persistence latency affects this metric",
    provisional: true,
  },
  {
    name: "fulfillment_email_latency",
    numerator: "Paid-to-provider-acceptance under 60s",
    denominator: "All confirmed-paid orders",
    exclusions: ["Delayed payment methods", "Manual-review orders"],
    dimensions: ["environment"],
    source: "Outbox worker logs + provider webhook",
    sampling: "100%",
    retention: "30 days",
    warningThreshold: "p75 > 60s",
    criticalThreshold: "p95 > 120s",
    evaluationWindow: "rolling 15 min",
    owner: "REQUIRES_HUMAN_OWNER",
    runbook: "docs/operations/incident-fulfillment-delay.md",
    limitations: "Resend API latency + DNS/inbox delivery are separate",
    provisional: true,
  },
  {
    name: "dead_letter_count",
    numerator: "Dead-letter outbox/webhook events",
    denominator: "All processed events",
    exclusions: [],
    dimensions: ["job_type", "provider"],
    source: "Outbox + inbox state",
    sampling: "100%",
    retention: "90 days",
    warningThreshold: "> 0 in 1 hour",
    criticalThreshold: "> 5 in 1 hour",
    evaluationWindow: "rolling 1 hour",
    owner: "REQUIRES_HUMAN_OWNER",
    runbook: "docs/operations/incident-dead-letters.md",
    limitations: "Dead-letter requires manual review or reconciliation",
    provisional: false,
  },
  {
    name: "csp_violations",
    numerator: "CSP violation reports",
    denominator: "All page loads with CSP-Report-Only",
    exclusions: [],
    dimensions: ["route_class", "directive"],
    source: "CSP report endpoint",
    sampling: "100% (rate-limited)",
    retention: "7 days",
    warningThreshold: "> 0 in 1 hour",
    criticalThreshold: "> 10 in 1 hour",
    evaluationWindow: "rolling 1 hour",
    owner: "REQUIRES_HUMAN_OWNER",
    runbook: "docs/operations/incident-csp-violations.md",
    limitations: "Report-Only mode does not block; enforcement requires resolution",
    provisional: false,
  },
];

/** Low-cardinality event names for telemetry. */
export const TELEMETRY_EVENT_NAMES = [
  "page.view",
  "catalog.search",
  "cart.add",
  "cart.remove",
  "checkout.create",
  "checkout.success",
  "webhook.receive",
  "webhook.process",
  "fulfillment.send",
  "fulfillment.delivered",
  "access.exchange",
  "download.issue",
  "review.submit",
  "review.moderate",
  "promotion.redeem",
  "free.acquire",
  "consent.confirm",
  "consent.withdraw",
  "admin.auth",
  "admin.mutate",
  "policy.publish",
  "error.5xx",
  "rate_limit.hit",
] as const;
