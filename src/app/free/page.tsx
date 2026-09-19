import { Container, Section, Grid } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { ProductCard } from "@/components/site/product-card";
import { Badge } from "@/components/site/badge";
import { LinkButton } from "@/components/site/button";
import { listFreeFixtureProducts } from "@/features/catalog/fixtures/products";

export const metadata = {
  title: "Free Downloads",
  description:
    "Free original sample packs to try the catalog. No account required to browse.",
};

export default function FreePage() {
  const free = listFreeFixtureProducts();
  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading
            eyebrow="Free"
            title="Free downloads"
            description="A small set of original free sample packs. No account is required to browse. Free delivery wiring arrives in a later step — there is no download button until it works."
          />
        </Container>
      </Section>
      <Section className="pt-6">
        <Container>
          {free.length ? (
            <Grid min="16rem">
              {free.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </Grid>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-strong bg-surface-inset/40 px-6 py-12 text-center">
              <Badge tone="success">Free</Badge>
              <p className="t-body-sm text-ink-secondary max-w-md">
                No free downloads are configured yet.
              </p>
              <LinkButton href="/catalog" variant="outline">
                Browse the full catalog
              </LinkButton>
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}
