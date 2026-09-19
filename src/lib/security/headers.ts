/**
 * Baseline security response headers.
 *
 * These are applied globally via next.config.ts `headers()`.
 *
 * Design notes:
 *  - X-Content-Type-Options: nosniff — prevents MIME sniffing.
 *  - Referrer-Policy: strict-origin-when-cross-origin — leaks no full URL to
 *    cross-origin destinations while still allowing same-origin full referrer.
 *  - Permissions-Policy — denies sensitive browser features the storefront
 *    does not need. Camera/microphone/geolocation are off by default.
 *  - X-Frame-Options: DENY — clickjacking protection (defense-in-depth alongside
 *    a future CSP frame-ancestors directive).
 *
 * Content-Security-Policy is DELIBERATELY ABSENT for Step 1. A production CSP
 * must enumerate every trusted origin (self, fonts, Stripe.js, Supabase storage
 * CDN, future analytics). Shipping a CSP before those origins are finalized
 * would either break the storefront or be so permissive as to be useless.
 * CSP is scheduled for Step 8 (hardening). See docs/SECURITY.md.
 *
 * This module contains no secrets and is safe to import in next.config.ts.
 */
export const securityHeaders: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "interest-cohort=()",
      "browsing-topics=()",
    ].join(", "),
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];
