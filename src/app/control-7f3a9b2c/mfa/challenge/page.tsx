import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/admin-path";
import { requireAdmin } from "@/lib/auth/require-admin";
import { MfaChallengeForm } from "@/components/admin/mfa-challenge-form";
import { Container } from "@/components/site/container";

export const metadata: Metadata = {
  title: "MFA challenge",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MfaChallengePage() {
  const outcome = await requireAdmin({ aal2: false });
  if (!outcome.ok) {
    if (outcome.reason !== "unconfigured") {
      redirect(outcome.redirectTo ?? ADMIN_LOGIN_PATH);
    }
  }
  return (
    <Container as="main" className="flex min-h-[60dvh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="t-heading-1 text-ink mb-1">Verify your TOTP</h1>
        <p className="t-body-sm text-ink-secondary mb-6">
          Enter a 6-digit code from your authenticator to reach AAL2 and access
          the CMS.
        </p>
        <MfaChallengeForm configured={outcome.ok} />
      </div>
    </Container>
  );
}
