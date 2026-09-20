import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { Badge } from "@/components/site/badge";

export const metadata: Metadata = { title: "Product editor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ProductEditorPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="Product editor" as="h1" description="Sections: basics, pricing/classification, compatibility, media previews, private deliverables, rights/license, SEO, publication readiness. Optimistic concurrency (row_version) + explicit Save Draft / lifecycle actions. Dirty/submitting/error/conflict states." />
      <div className="mt-8 flex flex-wrap gap-2">
        <Badge tone="brand">Draft</Badge>
        <Badge tone="warning">Rights: unreviewed</Badge>
        <Badge tone="neutral">row_version: optimistic concurrency</Badge>
      </div>
      <p className="t-body-sm text-ink-secondary mt-6 max-w-2xl">
        The editor loads from a linked Supabase project. The publication
        readiness gate is a pure mirror of the transactional{" "}
        <code className="t-technical">publish_product()</code> RPC; the database
        remains authoritative. A failed requirement returns structured,
        non-secret readiness errors and leaves the product unchanged.
      </p>
    </Container>
  );
}
