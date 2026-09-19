/**
 * Secret redaction for safe logging / error messages.
 *
 * Golden rule: never log credentials, full payment/customer records, tokens,
 * or private storage URLs. This helper scrubs known secret values and common
 * secret-like patterns from arbitrary strings so that structured logs and
 * thrown-error' messages stay safe even if they accidentally include one.
 *
 * It is intentionally conservative: it prefers over-redaction (turning a real
 * secret into [REDACTED]) over leaking. Pattern-based redaction catches
 * Supabase secret keys (`sb_secret_...`), Bearer tokens, and long
 * high-entropy strings that look like access tokens.
 */

const REDACTED = "[REDACTED]";

/** Patterns that indicate a secret regardless of env configuration. */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsb_secret_[A-Za-z0-9._-]+/g, // Supabase secret API keys
  /\bsb_publishable_[A-Za-z0-9._-]+/g, // also redact publishable keys in logs
  /Bearer\s+[A-Za-z0-9._\-]+/gi, // Authorization: Bearer ...
  /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, // JWT-looking blobs
];

/**
 * Redact a known set of literal secret values from `input`. Pass the actual
 * configured secrets (read from server env at runtime) so that even if they
 * appear verbatim in a log line, they are scrubbed.
 */
export function redactKnownSecrets(
  input: string,
  secrets: ReadonlyArray<string | undefined>,
): string {
  let out = input;
  for (const s of secrets) {
    if (s && s.length >= 8) {
      // Only redact non-trivially-short values to avoid clobbering common
      // substrings. Replace globally; escape regex metacharacters.
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replaceAll(s, REDACTED).replace(
        new RegExp(escaped, "g"),
        REDACTED,
      );
    }
  }
  return out;
}

/**
 * Pattern-based redaction. Use this when you cannot enumerate every secret
 * (e.g. serializing an unknown error). It catches the well-known shapes.
 */
export function redactPatterns(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (m) => {
      // Keep the prefix where it aids debugging without leaking the secret.
      if (/^Bearer/i.test(m)) {
        return "Bearer " + REDACTED;
      }
      return REDACTED;
    });
  }
  return out;
}

/**
 * Convenience: apply known-secrets redaction first, then pattern redaction.
 */
export function redactForLog(
  input: string,
  knownSecrets: ReadonlyArray<string | undefined> = [],
): string {
  return redactPatterns(redactKnownSecrets(input, knownSecrets));
}
