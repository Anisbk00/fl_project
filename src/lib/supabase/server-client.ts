import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Cookie-aware Supabase server client for Next.js 16 (async `cookies()`).
 * Uses the publishable/anon key + the request's cookies so `auth.getUser()`
 * reflects the real signed-in admin. `set` failures during static render are
 * swallowed (the middleware handles token refresh instead).
 *
 * Throws if Supabase is not linked — callers render an honest state.
 */
export async function getServerClient(): Promise<SupabaseClient<Database>> {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  const cookieStore = await cookies();
  // @supabase/ssr passes its Schema generic into supabase-js's SchemaName
  // slot, which collapses .from()/.rpc() types to `never`. The runtime client
  // is a normal SupabaseClient; restore its type here, once, for all callers.
  const client = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        for (const c of toSet) {
          try {
            cookieStore.set(c.name, c.value, c.options);
          } catch {
            // Called during a render where cookies can't be set (e.g. a Server
            // Component); the middleware refreshes the session instead.
          }
        }
      },
    },
  });
  return client as unknown as SupabaseClient<Database>;
}

/**
 * Unwrap a Supabase response: throw on error (with the safe PostgREST code,
 * never the message) and return non-null data. For lists, PostgREST returns
 * [] — so a null here is a real failure, not an empty result.
 */
export function must<T>(res: { data: T | null; error: { code?: string } | null }): T {
  if (res.error) throw new Error(res.error.code || "query_failed");
  if (res.data === null) throw new Error("no_data");
  return res.data;
}
