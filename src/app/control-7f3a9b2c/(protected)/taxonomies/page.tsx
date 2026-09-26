import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";

export const metadata: Metadata = { title: "Taxonomies", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TaxonomiesPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="Taxonomies" as="h1" description="Genres & plugins. Referenced entries are archived/disabled, not deleted. Mutations are authorized, audited, concurrency-safe, and invalidate the public catalog cache." />
      <div className="mt-8"><EmptyState title="Taxonomy management needs a linked project" /></div>
    </Container>
  );
}
