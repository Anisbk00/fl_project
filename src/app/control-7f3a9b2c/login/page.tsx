import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_DASHBOARD_PATH } from "@/lib/admin-path";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LoginForm } from "@/components/admin/login-form";
import { Container } from "@/components/site/container";

export const metadata: Metadata = {
  title: "Admin login",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // Already a verified AAL2 admin → straight to the dashboard.
  const outcome = await requireAdmin({ aal2: true });
  if (outcome.ok) redirect(ADMIN_DASHBOARD_PATH);

  return (
    <Container as="main" className="flex min-h-[60dvh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="t-heading-1 text-ink mb-1">Admin sign in</h1>
        <p className="t-body-sm text-ink-secondary mb-6">
          Manually provisioned administrators only. No public sign-up.
        </p>
        <LoginForm configured={outcome.reason !== "unconfigured"} />
        <p className="t-caption text-ink-muted mt-6">
          Admin area is noindex and not linked from the storefront. Only the
          allow-listed, MFA-verified owner can sign in.
        </p>
      </div>
    </Container>
  );
}
