import { createHash } from "node:crypto";
import { formatPrice } from "@/components/site/price";
import {
  ACCESS_TOKEN_EXPIRY_HOURS,
} from "./policy";

/**
 * Immutable email-payload preparation (Step 6).
 *
 * One immutable provider payload is prepared BEFORE the first network send so
 * every retry is byte/semantically stable. A payload hash rejects a retry whose
 * payload unexpectedly changed under the same provider idempotency key.
 *
 * All variable content (product titles, order fields, support strings) is
 * escaped for its context. Never render arbitrary product HTML/Markdown into
 * email. No tracking pixel, third-party image, remote font, private Storage
 * path, signed URL, rights evidence, Stripe ID, internal UUID, or unnecessary
 * PII.
 */

const MAX_TITLE_LENGTH = 80;
const MAX_ORDER_NUMBER_LENGTH = 40;

/** Escape a string for safe inclusion in HTML text content. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Reject CRLF injection (email headers / content). */
export function sanitizeLine(s: string, maxLen: number): string {
  return s
    .replace(/[\r\n]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLen);
}

/** Build a safe canonical access URL with the token in the fragment. */
export function buildAccessUrl(canonicalOrigin: string, token: string): string {
  return `${canonicalOrigin}/downloads/access#t=${token}`;
}

export interface EmailItemSnapshot {
  title: string;
  productType: string;
  unitAmount: number;
  currency: string;
}

export interface EmailPayloadInput {
  orderNumber: string;
  items: readonly EmailItemSnapshot[];
  totalAmount: number;
  currency: string;
  accessToken: string;
  canonicalOrigin: string;
  supportEmail: string;
  licenseUrl: string;
  refundUrl: string;
  templateVersion: string;
}

export interface PreparedEmailPayload {
  html: string;
  text: string;
  subject: string;
  from: string;
  to: string; // set by the caller from the trusted order buyer_email
  payloadHash: string;
  idempotencyKey: string; // derived from the delivery-message ID
  templateVersion: string;
}

/** Compute a SHA-256 payload hash for immutability verification. */
export function payloadHash(payload: { html: string; text: string; subject: string }): string {
  return createHash("sha256")
    .update(`${payload.html}\n${payload.text}\n${payload.subject}`)
    .digest("hex");
}

/**
 * Prepare one immutable email payload. Every retry sends the exact same bytes.
 * The token is placed only in the fragment of the access URL — never in the
 * HTML body text, subject, or visible body content (it IS in the href of the
 * access button, which is the intended behavior).
 */
export function prepareEmailPayload(input: EmailPayloadInput): PreparedEmailPayload {
  const orderNumber = sanitizeLine(input.orderNumber, MAX_ORDER_NUMBER_LENGTH);
  const supportEmail = sanitizeLine(input.supportEmail, 200);
  const licenseUrl = sanitizeLine(input.licenseUrl, 500);
  const refundUrl = sanitizeLine(input.refundUrl, 500);
  const accessUrl = buildAccessUrl(input.canonicalOrigin, input.accessToken);
  const totalFormatted = formatPrice(input.totalAmount, input.currency);

  const itemLines = input.items.map((item) => {
    const title = escapeHtml(sanitizeLine(item.title, MAX_TITLE_LENGTH));
    const type = escapeHtml(sanitizeLine(item.productType, 40));
    const amount = formatPrice(item.unitAmount, item.currency);
    return `<tr><td style="padding:4px 0">${title}</td><td style="padding:4px 0;color:#888">${type}</td><td style="padding:4px 0;text-align:right">${amount}</td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your downloads are ready</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1a1a1a;background:#fff">
  <h1 style="font-size:20px;margin:0 0 16px">Your downloads are ready</h1>
  <p style="font-size:14px;line-height:1.5;color:#444">Your payment has been confirmed. Access your purchased files below.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0">${itemLines}</table>
  <p style="font-size:14px;font-weight:700;margin:16px 0 8px">Total: ${escapeHtml(totalFormatted)}</p>
  <p style="font-size:12px;color:#888;margin:0 0 16px">Order: ${escapeHtml(orderNumber)}</p>
  <p style="margin:24px 0">
    <a href="${escapeHtml(accessUrl)}" style="display:inline-block;background:#d6f23c;color:#1a1a1a;font-weight:600;font-size:15px;padding:12px 24px;border-radius:6px;text-decoration:none">Continue to downloads</a>
  </p>
  <p style="font-size:12px;color:#888;margin:16px 0;line-height:1.5">
    Or copy this link: ${escapeHtml(accessUrl)}<br>
    This link expires in ${ACCESS_TOKEN_EXPIRY_HOURS} hours. Do not forward this email — the link grants access to your files.
  </p>
  <p style="font-size:12px;color:#888;line-height:1.5">
    The package is downloaded from the secure page and is not attached to this email.<br>
    <a href="${escapeHtml(licenseUrl)}" style="color:#888">License terms</a> · <a href="${escapeHtml(refundUrl)}" style="color:#888">Refund policy</a> · Support: ${escapeHtml(supportEmail)}
  </p>
</body>
</html>`;

  const text = `Your downloads are ready

Your payment has been confirmed.

${input.items.map((i) => `- ${sanitizeLine(i.title, MAX_TITLE_LENGTH)} (${sanitizeLine(i.productType, 40)}): ${formatPrice(i.unitAmount, i.currency)}`).join("\n")}

Total: ${totalFormatted}
Order: ${orderNumber}

Continue to downloads: ${accessUrl}

This link expires in ${ACCESS_TOKEN_EXPIRY_HOURS} hours.
Do not forward this email — the link grants access to your files.
The package is downloaded from the secure page and is not attached to this email.

License: ${licenseUrl}
Refund policy: ${refundUrl}
Support: ${supportEmail}`;

  const subject = `Your downloads are ready — order ${orderNumber}`;

  const hash = payloadHash({ html, text, subject });

  return {
    html,
    text,
    subject,
    from: "", // set by the adapter from the configured verified sender
    to: "", // set by the caller from the trusted order buyer_email
    payloadHash: hash,
    idempotencyKey: "", // set by the caller from the delivery-message ID
    templateVersion: input.templateVersion,
  };
}

/**
 * Recovery/resend logic (Step 6). Determines whether to reuse the current
 * valid token or create a new one. A pure resend reuses the current valid
 * token; only replacement/rotation creates a new access generation.
 */
export type RecoveryAction =
  | { kind: "reuse_token"; message: "reuse" }
  | { kind: "create_new_token"; reason: "consumed" | "expired" | "revoked" | "none" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

export function decideRecoveryAction(input: {
  hasUnconsumedUnexpiredToken: boolean;
  hasConsumedToken: boolean;
  hasExpiredToken: boolean;
  hasRevokedToken: boolean;
  activeTokenCount: number;
  activeTokenCap: number;
  cooldownElapsed: boolean;
}): RecoveryAction {
  if (!input.cooldownElapsed) {
    return { kind: "rate_limited", retryAfterSeconds: 300 };
  }
  if (input.hasUnconsumedUnexpiredToken) {
    return { kind: "reuse_token", message: "reuse" };
  }
  if (input.activeTokenCount >= input.activeTokenCap) {
    return { kind: "rate_limited", retryAfterSeconds: 300 };
  }
  let reason: "consumed" | "expired" | "revoked" | "none";
  if (input.hasConsumedToken) reason = "consumed";
  else if (input.hasExpiredToken) reason = "expired";
  else if (input.hasRevokedToken) reason = "revoked";
  else reason = "none";
  return { kind: "create_new_token", reason };
}

/** Sanitize a customer-facing download filename. */
export function sanitizeDownloadFilename(name: string): string {
  return name
    .replace(/[\r\n]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "")
    .replace(/\.\./g, "")
    .replace(/^\.+/, "")
    .replace(/ +$/g, "")
    .trim()
    .slice(0, 255) || "download";
}
