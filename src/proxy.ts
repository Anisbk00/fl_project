import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env/public";
import {
  ADMIN_BASE_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_MFA_CHALLENGE_PATH,
  ADMIN_MFA_ENROLL_PATH,
  ADMIN_PASSWORD_RECOVERY_PATH,
} from "@/lib/admin-path";

/**
 * Admin gate (proxy). Refreshes the Supabase session cookies and, for every
 * protected admin route, requires a verified user + active-admin allow-list
 * membership + AAL2 BEFORE any page code runs — a real 307, not a streamed
 * redirect. (In the App Router a layout's redirect does not stop the page
 * from rendering in parallel, so the layout guard alone is not a boundary.)
 *
 * Defense in depth, not the only check: pages, Server Actions and route
 * handlers still call requireAdmin(), and RLS enforces the same rule in SQL.
 */

// Auth screens a not-yet-AAL2 admin must be able to reach.
const AUTH_PATHS = [ADMIN_LOGIN_PATH, ADMIN_MFA_CHALLENGE_PATH, ADMIN_MFA_ENROLL_PATH, ADMIN_PASSWORD_RECOVERY_PATH];

async function proxy(req: NextRequest) {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = req.nextUrl.pathname;
  const isAuthPath = AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // Fail closed: without Supabase config nothing protected can be served.
  if (!url || !key) {
    return isAuthPath ? NextResponse.next() : NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, req.url));
  }

  const res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => {
        for (const c of toSet) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });

  // getUser() verifies the token with Supabase Auth (never trust the cookie).
  const { data: { user } } = await supabase.auth.getUser();
  if (isAuthPath) return res;

  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, req.url));
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return r;
  };
  if (!user) return redirect(ADMIN_LOGIN_PATH);

  const [{ data: isAdmin }, { data: aal }] = await Promise.all([
    supabase.rpc("is_active_admin"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (isAdmin !== true) return redirect(ADMIN_LOGIN_PATH);
  if (aal?.currentLevel !== "aal2") return redirect(ADMIN_MFA_CHALLENGE_PATH);
  return res;
}

export default proxy;

// A literal (matchers are read at build time); must equal ADMIN_BASE_PATH.
export const config = {
  matcher: ["/control-7f3a9b2c", "/control-7f3a9b2c/:path*"],
};

// Compile-time guard that the literal above stays in sync with the constant.
const _matcherInSync: "/control-7f3a9b2c" = ADMIN_BASE_PATH;
