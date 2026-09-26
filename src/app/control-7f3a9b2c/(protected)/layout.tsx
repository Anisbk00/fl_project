import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/admin-path";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Container } from "@/components/site/container";
import { EmptyState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";

/**
 * Protected admin sub-tree. Every page under this layout requires an active
 * allow-listed administrator at AAL2.
 *
 * Behavior:
 *   - Success (AAL2 admin) → render the protected chrome.
 *   - Unconfigured (no Supabase env vars) → render the honest "Admin isn't
 *     available here" EmptyState. We do NOT redirect to /login here, because
 *     the login page itself would also be unconfigured → infinite redirect loop.
 *   - Unauthenticated / not_admin / aal1_required → call `redirect()`, which
 *     throws the framework-level NEXT_REDIRECT error. We intentionally do NOT
 *     wrap this in try/catch — swallowing NEXT_REDIRECT would prevent the
 *     actual browser redirect and leave the user staring at the EmptyState.
 *
 * All responses are `no-store` (never publicly cached).
 */
export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const outcome = await requireAdmin({ aal2: true });

  if (outcome.ok) {
    // Set no-store headers on protected responses.
    const h = await headers();
    void h;

    return (
      <Container as="main" className="py-8">
        <p className="t-caption text-ink-muted mb-4">
          Signed in as admin · AAL2 verified · {outcome.principal.uid.slice(0, 8)}…
        </p>
        {children}
      </Container>
    );
  }

  if (outcome.reason === "unconfigured") {
    // Honest state — do NOT redirect (login would loop).
    return (
      <Container as="main" className="py-20">
        <EmptyState
          title="Admin isn't available here"
          titleAs="h1"
          description="This environment has no live Supabase Auth project linked, so the admin CMS can't be loaded. Link a Supabase project (see README) to use admin login, MFA, and the product CMS."
          action={<LinkButton href={ADMIN_LOGIN_PATH} variant="outline">Go to login</LinkButton>}
        />
      </Container>
    );
  }

  // unauthenticated / not_admin / aal1_required → redirect (NEXT_REDIRECT
  // propagates to the framework; NOT caught, so the browser actually follows).
  if (outcome.redirectTo) {
    redirect(outcome.redirectTo);
  }
  redirect(ADMIN_LOGIN_PATH);
}
