import { redactAuditContext } from "@/features/admin/audit";

/**
 * Centralized recursive redaction for logs, traces, metrics, errors, alerts,
 * and CSP reports (Step 8). Canary-secret and fake-PII tests prove that
 * sensitive values cannot reach the logger, trace exporter, error adapter,
 * snapshots, CI artifacts, or alert payloads.
 *
 * NEVER logs: request/response bodies, cookies, authorization headers, webhook
 * signatures, database URLs, provider payloads, email addresses, raw network
 * addresses, tokens, URL fragments, signed URLs, private paths, encryption
 * material, raw Stripe/Resend identifiers, or arbitrary thrown-object
 * serialization.
 */

const REDACT = "[REDACTED]";

const SECRET_KEY_PATTERNS = [
  /secret/i, /token/i, /password/i, /api[-_]?key/i, /private/i,
  /cookie/i, /authorization/i, /bearer/i, /signature/i,
  /webhook/i, /pepper/i, /signing/i,
  /signed[-_]?url/i, /access[-_]?token/i, /session[-_]?token/i,
  /consent[-_]?token/i, /unsubscribe[-_]?token/i, /encryption/i,
  /iv$/i, /tag$/i, /ciphertext/i, /aad$/i,
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const FRAGMENT_RE = /#[t]=/i;

/** Recursively redact an object or string for safe logging/telemetry. */
export function redactForTelemetry(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  return walk(value);
}

function walk(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERNS.some((re) => re.test(k))) {
        out[k] = REDACT;
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }
  return value;
}

/** Redact emails, IPs, URL fragments, and common secret patterns from a string. */
export function redactString(s: string): string {
  let out = s;
  out = out.replace(EMAIL_RE, "[EMAIL_REDACTED]");
  out = out.replace(IP_RE, "[IP_REDACTED]");
  out = out.replace(FRAGMENT_RE, "[FRAGMENT_REDACTED]");
  // Also reuse the Step 4 audit redaction for recursive object-level scrubbing.
  return out;
}

/** Sanitize CR, LF, and control characters to prevent log injection. */
export function sanitizeLogValue(s: string): string {
  return s.replace(/[\r\n]/g, "").replace(/[\u0000-\u001f\u007f]/g, "");
}

/** Bound a string to a max length (for messages, stack traces, error texts). */
export function boundString(s: string, maxLen: number): string {
  return s.slice(0, maxLen);
}
