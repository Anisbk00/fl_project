import type { Metadata } from "next";
import { Container, Section, Grid } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { ProductCard } from "@/components/site/product-card";
import { EmptyState } from "@/components/site/state";
import { Badge } from "@/components/site/badge";
import { LinkButton } from "@/components/site/button";
import {
  isCatalogReady,
  listFreeProducts,
} from "@/features/catalog/repository";
import { freeCanonical } from "@/features/catalog/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free Downloads",
  description:
    "Free original sample packs to try the catalog. No account required to browse.",
  alternates: { canonical: freeCanonical() },
  robots: { index: true, follow: true },
};

export default async function FreePage() {
  if (!isCatalogReady()) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="Free downloads aren't available here"
            description="This environment has no live Supabase project linked, so live free-product data can't be loaded."
          />
        </Container>
      </Section>
    );
  }

  let free;
  try {
    free = await listFreeProducts();
  } catch (err) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="Free downloads couldn't be loaded"
            description={err instanceof Error ? err.message : "An unexpected error occurred."}
            action={<LinkButton href="/free">Retry</LinkButton>}
          />
        </Container>
      </Section>
    );
  }

  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading
            eyebrow="Free"
            title="Free downloads"
            description="Free original sample packs. No account is required to browse. Free secure delivery arrives in a later step — there is no download button until it works."
          />
        </Container>
      </Section>
      <Section className="pt-6">
        <Container>
          {free.length > 0 ? (
            <Grid min="16rem">
              {free.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </Grid>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-strong bg-surface-inset/40 px-6 py-12 text-center">
              <Badge tone="success">Free</Badge>
              <p className="t-body-sm text-ink-secondary max-w-md">
                No free downloads are published yet.
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
