import { publicEnv } from "@/lib/env/public";

/**
 * CSRF guard for cookie-authenticated POST route handlers: the browser-set
 * Origin header must be this site's canonical origin. (Server Actions get
 * Next.js's built-in Origin check; plain route handlers do not.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin.toLowerCase() === new URL(publicEnv.NEXT_PUBLIC_SITE_URL).origin.toLowerCase();
}
