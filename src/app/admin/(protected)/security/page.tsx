import type { Metadata } from "next";
import { logout } from "../actions";
import { Button } from "@/components/site/button";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";

export const metadata: Metadata = { title: "Security", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="Security" as="h1" description="Current session/factor status. No secrets are exposed on this page." />
      <div className="mt-8 flex flex-col gap-3 max-w-md">
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="t-eyebrow">AAL</p>
          <p className="t-heading-2 text-brand mt-1">AAL2 verified</p>
          <p className="t-caption text-ink-muted">CMS access requires AAL2, enforced by the server guard, RLS, and Storage policies.</p>
        </div>
        <form action={logout}><Button type="submit" variant="outline" size="sm">Sign out</Button></form>
      </div>
    </Container>
  );
}
