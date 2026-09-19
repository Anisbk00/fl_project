import type { Metadata } from "next";
import { Container, Section, Grid } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { ProductCard } from "@/components/site/product-card";
import { listFixtureProducts } from "@/features/catalog/fixtures/products";

export const metadata: Metadata = {
  title: "Catalog",
  description:
    "Browse original DAW project files, stems, and sample packs. Live catalog filtering and search arrive in Step 3.",
};

export default function CatalogPage() {
  const products = listFixtureProducts();
  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading
            eyebrow="Catalog"
            title="Production resources"
            description="A typed presentation set. Live catalog data, filtering, sorting, and search arrive in Step 3 — no filter widgets are shown until they work."
          />
        </Container>
      </Section>
      <Section className="pt-6">
        <Container>
          <Grid min="16rem">
            {products.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </Grid>
        </Container>
      </Section>
    </>
  );
}
