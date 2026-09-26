import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { ErrorState } from "@/components/site/state";
import { Button } from "@/components/site/button";
import { getServerClient } from "@/lib/supabase/server-client";
import { logout } from "../actions";
import { MfaFactorsList } from "@/components/admin/mfa-factors-list";

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface AdminRow {
  user_id: string;
  display_name: string | null;
  active: boolean;
}

export default async function SecurityPage() {
  let email: string | null = null;
  let uid: string | null = null;
  let displayName: string | null = null;
  let active: boolean | null = null;
  let loadError: string | null = null;

  try {
    const client = await getServerClient();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw new Error(userError.message);
    email = user?.email ?? null;
    uid = user?.id ?? null;
    if (uid) {
      const { data, error } = await client
        .from("admin_users")
        .select("user_id, display_name, active")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as AdminRow | null;
      displayName = row?.display_name ?? null;
      active = row?.active ?? false;
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load security info.";
  }

  if (loadError) {
    return (
      <Container>
        <SectionHeading eyebrow="Admin" title="Security" as="h1" />
        <div className="mt-8">
          <ErrorState title="Couldn't load security info" description={loadError} />
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <SectionHeading
        eyebrow="Admin"
        title="Security"
        as="h1"
        description="Your signed-in admin identity + MFA factors."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="t-heading-2 text-ink mb-3">Identity</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-y-3 gap-x-4 t-technical text-ink">
            <dt className="text-ink-muted">Display name</dt>
            <dd>{displayName ?? "—"}</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd>{email ?? "—"}</dd>
            <dt className="text-ink-muted">User ID</dt>
            <dd className="break-all">{uid ?? "—"}</dd>
            <dt className="text-ink-muted">Active</dt>
            <dd>{active ? "Yes" : "No"}</dd>
            <dt className="text-ink-muted">AAL</dt>
            <dd>2 (TOTP verified)</dd>
          </dl>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="t-heading-2 text-ink mb-3">Authenticator (TOTP)</h2>
          <MfaFactorsList />
        </div>
      </div>
      <div className="mt-8">
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">Sign out</Button>
        </form>
      </div>
    </Container>
  );
}
