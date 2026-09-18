import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, hasSupabaseServerConfig } from "@/lib/env/server";

/**
 * Privileged Supabase client (secret key).
 *
 * PURPOSE: narrowly-scoped, server-only operations that genuinely require
 * service-level access — e.g. provisioning a manually-created admin
 * allow-list row, or reconciling fulfillment after a verified Stripe
 * webhook. It is NEVER used to compensate for broken or missing RLS.
 *
 * HARD RULES:
 *  - This module imports `server-only`; importing it from any Client Component
 *    fails the build.
 *  - The secret key is read from validated server env, never from the browser.
 *  - It must never be logged, included in an error, or placed in a URL.
 *
 * Step 1 status: factory is typed and exported; no caller uses it yet.
 */
export function getPrivilegedClient(): SupabaseClient {
  if (!hasSupabaseServerConfig()) {
    throw new Error(
      "Privileged Supabase client requires SUPABASE_URL and SUPABASE_SECRET_KEY (server-only). Not configured in this environment.",
    );
  }
  const env = getServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
