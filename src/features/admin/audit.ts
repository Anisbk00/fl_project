/**
 * Audit redaction (Step 4). Audit payloads record a compact changed-field list
 * and non-secret context. This helper scrubs keys that must NEVER appear in an
 * audit payload: passwords, TOTP secrets, tokens, signed URLs, full rights
 * evidence, API keys. It is a defense-in-depth filter; callers must already
 * avoid placing these values.
 */
const REDACT_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /otp/i,
  /totp/i,
  /mfa/i,
  /cookie/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /signed[-_]?url/i,
  /evidence[-_]?(doc|file|content)/i,
  /internal[-_]?notes/i, // redact raw notes; keep a reference if present
];

const REDACT = "[REDACTED]";

/** Deep-clone + redact any key matching a secret pattern. Pure. */
export function redactAuditContext(input: unknown): unknown {
  return walk(input);
}

function walk(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEY_PATTERNS.some((re) => re.test(k))) {
        out[k] = REDACT;
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }
  return value;
}

/** Build a compact changed-field summary from before/after (safe keys only). */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const b = JSON.stringify(before[k] ?? null);
    const a = JSON.stringify(after[k] ?? null);
    if (b !== a) {
      // Never include raw secret-ish fields; mark as changed only.
      out[k] = REDACT_KEY_PATTERNS.some((re) => re.test(k)) ? REDACT : "changed";
    }
  }
  return out;
}
