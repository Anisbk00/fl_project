import { createHmac, randomBytes } from "node:crypto";

/**
 * Correlation ID (Step 8). Random, non-secret, never provides authorization.
 * Regenerated when invalid external values are supplied. Contains no order,
 * buyer, email, or token data. Propagated safely through jobs/outbox processing.
 */

export function generateCorrelationId(): string {
  return randomBytes(16).toString("base64url");
}

/** Validate an external correlation ID; reject if malformed or too short/long. */
export function validateCorrelationId(input: string | null | undefined): string | null {
  if (!input) return null;
  // Reject anything that's not base64url, too short, or too long.
  const trimmed = input.trim();
  if (trimmed.length < 16 || trimmed.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Resolve a correlation ID from an external input, generating a fresh one if invalid. */
export function resolveCorrelationId(external: string | null | undefined): string {
  return validateCorrelationId(external) ?? generateCorrelationId();
}

/**
 * Derive a safe, non-secret trace span ID for OpenTelemetry spans.
 * Never contains PII or order data.
 */
export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}
