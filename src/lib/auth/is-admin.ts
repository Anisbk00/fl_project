import "server-only";
import { db } from "@/lib/db";

/**
 * Admin authorization.
 *
 * PRODUCTION MAPPING: this is the application-side mirror of the Supabase
 * `is_admin()` SECURITY DEFINER function. In production:
 *   - admin status is determined from `auth.uid()` (the authenticated Supabase
 *     session), NOT from an email or a browser-supplied claim;
 *   - the allow-list (`admin_users`) table is read by the SECURITY DEFINER
 *     function with a fixed `search_path`, least-privilege EXECUTE grants, and
 *     RLS that blocks public reads;
 *   - admin access additionally requires TOTP MFA / AAL2 before launch.
 *
 * In this sandbox (no Supabase auth session wired in Step 1) the caller is
 * expected to pass the authenticated user id once admin auth is implemented
 * in Step 4. Until then, `requireAdmin` is a typed, server-only gate that
 * data-access write functions already call — so the moment a real admin id
 * is threaded through, the gate is already enforced.
 */

/**
 * True iff `userId` appears in the admin allow-list. Returns false for
 * null/undefined. Never throws on a missing user — it is simply not an admin.
 */
export async function isAdmin(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const row = await db.adminUser.findUnique({
    where: { userId },
    select: { userId: true },
  });
  return row !== null;
}

/**
 * Throws `UnauthorizedError` unless `userId` is an allow-listed admin.
 * Every catalog mutation in src/features/catalog/data-access.ts calls this
 * (or an equivalent) before performing a write.
 */
export class UnauthorizedError extends Error {}

export async function requireAdmin(
  userId: string | null | undefined,
): Promise<true> {
  if (await isAdmin(userId)) return true;
  throw new UnauthorizedError(
    "Unauthorized: this action requires an allow-listed admin.",
  );
}
