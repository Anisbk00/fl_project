import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import type { Database } from "@/types/database";

/**
 * Publishable Supabase client (anon/publishable role), typed against the
 * catalog `Database`.
 *
 * Purpose: server-side reads of PUBLIC, rights-cleared catalog data that is
 * protected by Row-Level Security. The publishable key is safe to use here
 * because RLS — not the key — is the real access boundary. RLS must allow this
 * client to read ONLY published + rights-cleared products, public taxonomy,
 * and public preview media; it must NEVER be able to read drafts, private
 * deliverables, or admin identities (see supabase/migrations/0002_rls_and_admin.sql).
 *
 * Step 1 status: the factory exists and is typed, but is not called by any
 * page yet. It throws a clear configuration error if Supabase has not been
 * linked, rather than silently returning a broken client.
 */
export function getPublishableClient(): SupabaseClient<Database> {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Publishable Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. (Supabase is not linked in the Step 1 sandbox.)",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
