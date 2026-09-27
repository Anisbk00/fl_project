import type { NextConfig } from "next";
import { noStoreHeaders, PRIVATE_ROUTE_SOURCES, securityHeaders } from "./src/lib/security/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  images: {
    // Product covers are served from the public Supabase Storage bucket.
    remotePatterns: supabaseUrl
      ? [{ protocol: "https", hostname: new URL(supabaseUrl).hostname, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders({ supabaseUrl, dev: process.env.NODE_ENV !== "production" }) },
      ...PRIVATE_ROUTE_SOURCES.map((source) => ({ source, headers: noStoreHeaders })),
    ];
  },
};

export default nextConfig;
