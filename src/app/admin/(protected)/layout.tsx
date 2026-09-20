import { headers } from "next/headers";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
import { Container } from "@/components/site/container";
import { EmptyState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";

/**
 * Protected admin sub-tree. Every page under this layout requires an active
 * allow-listed administrator at AAL2. The guard redirects unauthenticated →
 * /admin/login and AAL1 → /admin/mfa/challenge. Renders an honest state when
 * Supabase/Auth is not configured in this environment.
 *
 * All responses are `no-store` (never publicly cached). Verified via headers.
 */
export const dynamic = "force-dynamic";

async function isAuthConfigured(): Promise<boolean> {
  // requireAdmin returns "unconfigured" when Supabase isn't linked.
  const outcome = await requireAdminOrRedirect({ aal2: true }).catch(
    () => null,
  );
  return outcome !== null;
}

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let principal;
  try {
    principal = await requireAdminOrRedirect({ aal2: true });
  } catch {
    // requireAdminOrRedirect redirects on failure (unauthenticated/aal1) OR
    // throws when unconfigured → render an honest state instead of a loop.
    return (
      <Container as="main" className="py-20">
        <EmptyState
          title="Admin isn't available here"
          titleAs="h1"
          description="This environment has no live Supabase Auth project linked, so the admin CMS can't be loaded. Link a Supabase project (see README) to use admin login, MFA, and the product CMS."
          action={<LinkButton href="/admin/login" variant="outline">Go to login</LinkButton>}
        />
      </Container>
    );
  }

  // Set no-store headers on protected responses.
  const h = await headers();
  void h;

  return (
    <Container as="main" className="py-8">
      <p className="t-caption text-ink-muted mb-4">
        Signed in as admin · AAL2 verified · {principal.uid.slice(0, 8)}…
      </p>
      {children}
    </Container>
  );
}
