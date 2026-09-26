"use server";

import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";
import { requireAdminOrFailure } from "@/lib/auth/require-admin";
import { headers } from "next/headers";

/**
 * Logout (Server Action, POST semantics). Clears the Supabase session safely
 * and redirects to the login page. The central guard authorizes first
 * (defense in depth — a hostile client calling this directly just signs out
 * the caller). Never accepts a client-supplied actor.
 */
export async function logout() {
  const outcome = await requireAdminOrFailure({ aal2: false });
  if (!outcome.ok && outcome.reason !== "aal1_required") {
    // Already unauthenticated/inactive/unconfigured → just go to login.
    redirect(ADMIN_LOGIN_PATH);
  }
  try {
    const client = await getServerClient();
    await client.auth.signOut();
  } catch {
    // ignore — redirect to login regardless
  }
  const h = await headers();
  void h;
  redirect(ADMIN_LOGIN_PATH);
}
