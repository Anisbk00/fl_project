import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="Audit log" as="h1" description="Append-only. Written by trusted DB triggers/functions from auth.uid(). Clients cannot insert/update/delete audit rows." />
      <div className="mt-8"><EmptyState title="Audit log needs a linked project" /></div>
    </Container>
  );
}
