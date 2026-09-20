import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";

export const metadata: Metadata = { title: "New product", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="New product" as="h1" description="Create a draft. Publication requires rights attestation + validated assets (enforced by the transactional publish_product RPC)." />
      <p className="t-body-sm text-ink-secondary mt-6">The product editor loads from a linked Supabase project. Server validation is authoritative; client validation improves UX only.</p>
    </Container>
  );
}
