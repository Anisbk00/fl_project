import { redactAuditContext } from "@/features/admin/audit";

/**
 * Payment redaction (Step 5). Logs/diagnostics must never contain buyer email,
 * raw webhook payload, cart token, Stripe secrets/signatures, Checkout URLs,
 * or private asset references.
 */

/** Mask an email for admin lists / logs: `a***@example.com`. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

/** Redact a Stripe identifier to a short prefix for logs: `cs_test_…`. */
export function redactStripeId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 12) return "…";
  return `${id.slice(0, 8)}…`;
}

/** Scrub a structured log/diagnostics object of secret-ish keys (defense in depth). */
export function redactPaymentLog(input: unknown): unknown {
  return redactAuditContext(input);
}
