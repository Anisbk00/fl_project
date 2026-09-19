import "server-only";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Cookie-aware Supabase server client.
 *
 * Purpose: used by Server Components / Route Handlers / Server Actions that
 * need to read the authenticated admin session (the future admin CMS in
 * Step 4). It pairs the publishable key with the request's cookies so that
 * `auth.getUser()` reflects the real signed-in admin.
 *
 * The adapter follows @supabase/ssr's modern getAll/setAll shape. In Next.js
 * 16 `cookies()` is async; the caller awaits it and passes a small adapter
 * (read from the awaited `ReadonlyRequestCookies`, write via
 * `cookies().set(...)`). See Step 4 for the real wiring.
 *
 * Step 1 status: factory is typed and exported; no page calls it yet. It
 * throws a clear configuration error if Supabase is not linked.
 */
export interface ServerCookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(
    cookies: Array<{
      name: string;
      value: string;
      options?: Record<string, unknown>;
    }>,
  ): Promise<void> | void;
}

export function createSupabaseServerClient(cookies: ServerCookieAdapter) {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Cookie-aware Supabase server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. (Supabase is not linked in the Step 1 sandbox.)",
    );
  }
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(toSet) {
        return cookies.setAll(toSet);
      },
    },
  });
}
