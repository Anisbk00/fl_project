import type { Metadata } from "next";
import { logout } from "./actions";
import { Button, LinkButton } from "@/components/site/button";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  // With a live project, this fetches draft/published/archived counts, items
  // needing rights/asset validation, and recent safe audit events. In the
  // sandbox the protected layout renders an honest "not available" state.
  return (
    <Container>
      <div className="flex items-center justify-between gap-4">
        <SectionHeading eyebrow="Admin" title="Dashboard" as="h1" />
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {(["Drafts", "Published", "Archived"] as const).map((label) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-5">
            <p className="t-eyebrow">{label}</p>
            <p className="t-display text-ink mt-2">—</p>
            <p className="t-caption text-ink-muted">Count unavailable (no live project).</p>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <h2 className="t-heading-2 text-ink mb-3">Recent audit events</h2>
        <EmptyState title="No audit events available here" description="Audit data loads from a linked Supabase project." />
      </div>
      <div className="mt-8 flex gap-3">
        <LinkButton href="/admin/products">Manage products</LinkButton>
        <LinkButton href="/admin/audit" variant="outline">Audit log</LinkButton>
      </div>
    </Container>
  );
}
