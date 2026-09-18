import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";

/**
 * Publishable Supabase client (anon/publishable role).
 *
 * Purpose: server-side reads of PUBLIC, rights-cleared catalog data that is
 * protected by Row-Level Security. The publishable key is safe to use here
 * because RLS — not the key — is the real access boundary. This client must
 * NEVER be able to read drafts, private deliverables, or admin identities;
 * that is enforced by RLS in production and by the application-layer access
 * matrix (src/features/catalog/data-access.ts) in this sandbox.
 *
 * Step 1 status: the factory exists and is typed, but is not called by any
 * page yet. It throws a clear configuration error if Supabase has not been
 * linked, rather than silently returning a broken client.
 */
export function getPublishableClient(): SupabaseClient {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Publishable Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. (Supabase is not linked in the Step 1 sandbox.)",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
