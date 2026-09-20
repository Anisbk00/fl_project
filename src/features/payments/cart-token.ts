import { createHmac, randomBytes } from "node:crypto";

/**
 * Guest cart token (Step 5).
 *
 * - At least 256 bits of cryptographically secure server-side randomness.
 * - The DATABASE stores only a SHA-256 HMAC digest (with a server-only pepper);
 *   the raw token never persists.
 * - The raw token is sent only in an HttpOnly, SameSite=Lax, Path=/ cookie with
 *   no Domain, Secure in production, prefer `__Host-` where possible.
 * - The token never appears in a URL, HTML, analytics payload, client JS,
 *   log, error report, Stripe metadata, or plaintext column.
 * - The client never chooses its cart id.
 */

export const CART_COOKIE_NAME = "__Host-mp_cart";
export const CART_COOKIE_NAME_DEV = "mp_cart"; // localhost can't use __Host- (no Secure)
export const CART_TOKEN_BYTES = 32; // 256 bits
/** Idle + absolute expiry ~30 days. */
export const CART_IDLE_EXPIRY_DAYS = 30;
export const CART_ABSOLUTE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_CART_ITEMS = 20;

/** Generate a fresh 256-bit cart token (raw, base64url-encoded for a cookie). */
export function generateCartToken(): string {
  return randomBytes(CART_TOKEN_BYTES).toString("base64url");
}

/**
 * Digest a raw cart token with a server-only pepper (HMAC-SHA-256). Store ONLY
 * this digest in the database. The pepper must come from a validated server-only
 * env var and is never logged.
 */
export function digestCartToken(rawToken: string, pepper: string): string {
  if (!rawToken) throw new Error("empty cart token");
  if (!pepper || pepper.length < 16) throw new Error("cart pepper not configured");
  return createHmac("sha256", pepper).update(rawToken).digest("hex");
}

/** Cookie options for the cart token. `secure` is false only for localhost dev. */
export function cartCookieOptions(opts: {
  secure: boolean;
  maxAgeSeconds: number;
}) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: opts.secure,
    // No domain → host-only cookie. __Host- requires Secure + no Domain + Path=/.
    maxAge: opts.maxAgeSeconds,
  };
}

/** Resolve the cookie name for the environment. */
export function cartCookieName(secure: boolean): string {
  return secure ? CART_COOKIE_NAME : CART_COOKIE_NAME_DEV;
}
