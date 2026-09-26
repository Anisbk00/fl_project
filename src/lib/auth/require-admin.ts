import "server-only";
import { redirect } from "next/navigation";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_MFA_CHALLENGE_PATH,
} from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";
import type { AdminPrincipal } from "@/features/admin/aal";

/**
 * Central admin authorization guard (Step 4).
 *
 * The single server-only check every protected page loader, Server Action,
 * Route Handler, upload-intent/finalization endpoint, and signed-URL operation
 * must call. The middleware redirect is NOT enforcement; this guard is.
 *
 * Verified-claims authorization — NEVER `getSession()` or an unverified cookie:
 *   1. `auth.getUser()` — verifies the access token server-side; yields the
 *      immutable Supabase Auth user UUID (the subject). We never trust an
 *      email-domain check; display email is descriptive only.
 *   2. `rpc('is_active_admin')` — the SECURITY DEFINER checks `auth.uid()`
 *      against the ACTIVE admin allow-list. A generic failure is returned for
 *      inactive, non-admin, and unauthenticated alike — the UI does NOT
 *      enumerate whether an email is an administrator.
 *   3. `auth.mfa.getAuthenticatorAssuranceLevel()` — the verified current AAL.
 *      CMS access requires `aal2` (a completed TOTP challenge).
 *
 * Returns a minimal typed principal on success. Page loaders redirect to
 * `/admin/login` (unauthenticated) or `/admin/mfa/challenge` (AAL1); actions/
 * handlers receive a typed `AuthFailure` to return nondisclosing 401/403.
 */

export type AuthFailureReason =
  | "unconfigured"
  | "unauthenticated"
  | "not_admin"
  | "aal1_required";

export interface AuthSuccess {
  ok: true;
  principal: AdminPrincipal;
}
export interface AuthFailure {
  ok: false;
  reason: AuthFailureReason;
  /** Where to send a browser navigation (page loaders redirect). */
  redirectTo?: string;
}
export type AuthOutcome = AuthSuccess | AuthFailure;

export async function requireAdmin(opts: {
  aal2: boolean;
}): Promise<AuthOutcome> {
  let client;
  try {
    client = await getServerClient();
  } catch {
    return { ok: false, reason: "unconfigured" };
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) {
    return { ok: false, reason: "unauthenticated", redirectTo: ADMIN_LOGIN_PATH };
  }

  const { data: isActiveAdmin } = await client.rpc("is_active_admin");
  if (isActiveAdmin !== true) {
    // Generic: covers inactive + non-admin without enumerating.
    return { ok: false, reason: "not_admin", redirectTo: ADMIN_LOGIN_PATH };
  }

  let aal2 = false;
  if (opts.aal2) {
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    aal2 = aal?.currentLevel === "aal2";
    if (!aal2) {
      return {
        ok: false,
        reason: "aal1_required",
        redirectTo: ADMIN_MFA_CHALLENGE_PATH,
      };
    }
  }

  return { ok: true, principal: { uid: user.id, aal2 } };
}

/**
 * Page-loader variant: returns the principal or redirects to the appropriate
 * admin auth route. Never streams protected data before authorization.
 */
export async function requireAdminOrRedirect(opts: {
  aal2: boolean;
}): Promise<AdminPrincipal> {
  const outcome = await requireAdmin(opts);
  if (outcome.ok) return outcome.principal;
  if (outcome.redirectTo) redirect(outcome.redirectTo);
  // Unconfigured: render an honest state rather than redirect-loop.
  redirect(ADMIN_LOGIN_PATH);
}

/** Action/handler variant: returns the typed outcome (no redirect). */
export async function requireAdminOrFailure(opts: {
  aal2: boolean;
}): Promise<AuthOutcome> {
  return requireAdmin(opts);
}
