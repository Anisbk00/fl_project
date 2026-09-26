import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/admin-path";
import { requireAdmin } from "@/lib/auth/require-admin";
import { MfaEnrollForm } from "@/components/admin/mfa-enroll-form";
import { Container } from "@/components/site/container";

export const metadata: Metadata = {
  title: "MFA enrollment",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MfaEnrollPage() {
  // An active AAL1 admin (no verified factor yet) enrolls here.
  const outcome = await requireAdmin({ aal2: false });
  if (!outcome.ok) {
    if (outcome.reason === "unconfigured") {
      // honest state rendered by the form below
    } else {
      redirect(outcome.redirectTo ?? ADMIN_LOGIN_PATH);
    }
  }
  return (
    <Container as="main" className="flex min-h-[60dvh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="t-heading-1 text-ink mb-1">Set up TOTP (MFA)</h1>
        <p className="t-body-sm text-ink-secondary mb-6">
          Scan the QR with an authenticator app, then verify a 6-digit code to
          reach AAL2 and access the CMS.
        </p>
        <MfaEnrollForm configured={outcome.ok} />
      </div>
    </Container>
  );
}
