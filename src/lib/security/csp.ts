/**
 * Content Security Policy builder (Step 8).
 *
 * Strict baseline: `default-src 'none'`, explicit required directives,
 * `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`,
 * narrow `form-action`, restrictive `connect-src`, no production
 * `'unsafe-eval'` or unjustified `'unsafe-inline'`.
 *
 * Route-aware: separate policies for cacheable public pages and sensitive
 * dynamic access/download/admin pages. CSP starts in Report-Only mode and
 * enforces only after violations are resolved.
 */

export interface CspDirectives {
  "default-src": string[];
  "script-src": string[];
  "style-src": string[];
  "font-src": string[];
  "img-src": string[];
  "connect-src": string[];
  "frame-src": string[];
  "object-src": string[];
  "base-uri": string[];
  "form-action": string[];
  "frame-ancestors": string[];
  "media-src": string[];
  "worker-src": string[];
}

/** Public storefront CSP (cacheable, no inline scripts). */
export function buildPublicCsp(nonce?: string): string {
  const scriptSrc = ["'self'"];
  if (nonce) scriptSrc.push(`'nonce-${nonce}'`);
  const styleSrc = ["'self'", "'unsafe-inline'"]; // Tailwind requires inline styles
  const directives: CspDirectives = {
    "default-src": ["'none'"],
    "script-src": scriptSrc,
    "style-src": styleSrc,
    "font-src": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "media-src": ["'self'"],
    "worker-src": ["'self'"],
  };
  return serializeCsp(directives);
}

/** Sensitive dynamic pages (admin, access, download) — even stricter. */
export function buildSensitiveCsp(): string {
  const directives: CspDirectives = {
    "default-src": ["'none'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'"],
    "img-src": ["'self'"],
    "connect-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "media-src": ["'none'"],
    "worker-src": ["'none'"],
  };
  return serializeCsp(directives);
}

/** Webhook endpoints — no scripts, no styles, no frames. */
export function buildWebhookCsp(): string {
  const directives: CspDirectives = {
    "default-src": ["'none'"],
    "script-src": ["'none'"],
    "style-src": ["'none'"],
    "font-src": ["'none'"],
    "img-src": ["'none'"],
    "connect-src": ["'none'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
    "frame-ancestors": ["'none'"],
    "media-src": ["'none'"],
    "worker-src": ["'none'"],
  };
  return serializeCsp(directives);
}

function serializeCsp(d: CspDirectives): string {
  return Object.entries(d)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

/** Build a CSP Report-Only header (start in report-only before enforcement). */
export function buildCspReportOnly(csp: string): string {
  return csp; // The header name `Content-Security-Policy-Report-Only` controls this.
}
