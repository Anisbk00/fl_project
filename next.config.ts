import type { NextConfig } from "next";
import { securityHeaders } from "@/lib/security/headers";

/**
 * Next.js configuration for the Music Project Store.
 *
 * Security posture for Step 1:
 *  - poweredByHeader disabled (no framework fingerprint).
 *  - reactStrictMode on.
 *  - TypeScript build errors are NOT ignored: a type error fails the build/dev
 *    server so type drift can never ship silently.
 *  - A baseline set of security response headers is applied globally.
 *    Content-Security-Policy is intentionally NOT shipped yet: a real CSP must
 *    enumerate every known origin (fonts, analytics, Stripe.js, Supabase
 *    storage CDN, etc.). Shipping a restrictive CSP that breaks the app, or a
 *    permissive one that protects nothing, would be worse than deferring it to
 *    Step 8 once all origins are known. See docs/SECURITY.md.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...securityHeaders],
      },
    ];
  },
};

export default nextConfig;
