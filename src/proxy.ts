import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env/public";

/**
 * Token-refresh middleware (proxy). Refreshes expired Supabase auth tokens
 * and propagates the updated cookies on the response. This is an early
 * routing convenience — NOT the sole authorization barrier. Every protected
 * page loader, Server Action, and Route Handler calls the central
 * `requireAdmin({ aal2 })` guard.
 *
 * Matcher excludes static assets, images, and the public API/webhook routes
 * (handled separately).
 */
async function middleware(req: NextRequest) {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  const res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        for (const c of toSet) {
          res.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });

  // Refresh the session (proves the token) without authorizing from it.
  await supabase.auth.getUser();
  return res;
}

export default middleware;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|og\\.svg|robots\\.txt|sitemap\\.xml|api).*)",
  ],
};
