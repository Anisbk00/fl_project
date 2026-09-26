import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";

export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function DraftPreviewPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="Draft preview" as="h1" description="Protected (AAL2), no-store, noindex. Renders the real product-page presentation from private admin data — never via the public catalog repository." />
      <p className="t-body-sm text-ink-secondary mt-6">No publicly shareable preview token is created in Step 4.</p>
    </Container>
  );
}
