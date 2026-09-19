import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Admin authorization.
 *
 * PRODUCTION PATTERN: admin status is determined by the `is_admin()` Postgres
 * SECURITY DEFINER function (see supabase/migrations/0002_rls_and_admin.sql),
 * which consults `auth.uid()` against the private `admin_users` allow-list —
 * never an email or a browser-supplied claim. We call it via the authenticated
 * admin client's `rpc('is_admin')`. RLS then permits the catalog mutation
 * because the `is_admin()` policy returns true.
 *
 * This means NO privileged/secret client is used for catalog mutations — the
 * authenticated admin client + RLS is the real boundary. The privileged client
 * remains reserved for genuinely service-level server-only work (e.g. webhook
 * reconciliation in Step 6) and is never a crutch for RLS.
 *
 * Step 4 (admin auth + MFA/AAL2) obtains the admin client from the cookie
 * server client and passes it here. Step 1 provides the typed gate so the
 * moment a real admin client is threaded through, the gate is already enforced.
 */

export class UnauthorizedError extends Error {}

export type AdminClient = SupabaseClient<Database>;

/**
 * True iff the admin client's session is an allow-listed admin, per `is_admin()`.
 */
export async function isAdminSession(
  adminClient: AdminClient,
): Promise<boolean> {
  const { data, error } = await adminClient.rpc("is_admin");
  if (error) return false;
  return data === true;
}

/**
 * Throws `UnauthorizedError` unless the admin client's session is an
 * allow-listed admin. Every catalog mutation calls this first.
 */
export async function requireAdmin(
  adminClient: AdminClient,
): Promise<true> {
  if (await isAdminSession(adminClient)) return true;
  throw new UnauthorizedError(
    "Unauthorized: this action requires an allow-listed admin session.",
  );
}
