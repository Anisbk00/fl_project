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
        <h1 className="t-heading-1 text-ink mb-1">Set up your authenticator</h1>
        <p className="t-body-sm text-ink-secondary mb-2">
          This admin area requires a Time-based One-Time Password (TOTP) from an
          authenticator app. Click <strong>Start enrollment</strong> below to get
          a QR code, then:
        </p>
        <ol className="t-body-sm text-ink-secondary mb-6 flex flex-col gap-1.5 list-decimal pl-5">
          <li>Open your authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator).</li>
          <li>Add a new entry by scanning the QR code that appears.</li>
          <li>Enter the 6-digit code the app generates to verify.</li>
        </ol>
        <MfaEnrollForm configured={outcome.ok} />
      </div>
    </Container>
  );
}
