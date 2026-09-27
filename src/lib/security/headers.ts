// Relative import: this module is loaded by next.config.ts, whose loader does
// not apply tsconfig path aliases to nested imports.
import { ADMIN_BASE_PATH } from "../admin-path";

/**
 * Security response headers, applied from next.config.ts.
 *
 * CSP lists exactly the origins this app uses:
 *  - Supabase: public cover/preview media (img/media) and the admin's direct
 *    Storage uploads + Auth calls (connect).
 *  - form-action: Server Actions redirect a form POST to Stripe Checkout, and
 *    /api/downloads/file 303-redirects to a signed Supabase Storage URL —
 *    browsers enforce form-action on those redirects.
 *  - External preview URLs are https-only (enforced at registration), hence
 *    `https:` for img/media.
 *
 * script-src keeps 'unsafe-inline': Next.js emits inline bootstrap scripts,
 * and a nonce-based policy would make every page dynamic (no static
 * caching). XSS defense rests on React escaping + no raw-HTML sinks
 * (JSON-LD is serialized with </script> escaping). 'unsafe-eval' is dev-only.
 */

export interface CspOptions {
  supabaseUrl: string;
  dev: boolean;
}

export function buildCsp({ supabaseUrl, dev }: CspOptions): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabase, ...(dev ? ["ws:"] : [])],
    "form-action": ["'self'", "https://checkout.stripe.com", supabase],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([k, v]) => [k, ...v.filter(Boolean)].join(" "))
    .join("; ");
}

export function securityHeaders(opts: CspOptions): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(opts) },
    // 2 years + subdomains; add `preload` only after submitting the domain.
    ...(opts.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/** Private, per-user routes: never stored by browsers, CDNs or proxies. */
export const PRIVATE_ROUTE_SOURCES = [
  `${ADMIN_BASE_PATH}/:path*`,
  ADMIN_BASE_PATH,
  "/downloads/:path*",
  "/downloads",
  "/cart",
  "/checkout/:path*",
  "/api/:path*",
];
export const noStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
