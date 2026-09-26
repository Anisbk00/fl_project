import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_DASHBOARD_PATH } from "@/lib/admin-path";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PasswordRecoveryForm } from "@/components/admin/password-recovery-form";
import { Container } from "@/components/site/container";

export const metadata: Metadata = { title: "Password recovery", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PasswordRecoveryPage() {
  const outcome = await requireAdmin({ aal2: false });
  if (outcome.ok && outcome.principal.aal2) redirect(ADMIN_DASHBOARD_PATH);
  const configured = outcome.ok ? true : outcome.reason !== "unconfigured";
  return (
    <Container as="main" className="flex min-h-[60dvh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="t-heading-1 text-ink mb-1">Password recovery</h1>
        <p className="t-body-sm text-ink-secondary mb-6">
          Generic response for any email. The recovered administrator must
          complete MFA before CMS access.
        </p>
        <PasswordRecoveryForm configured={configured} />
      </div>
    </Container>
  );
}
