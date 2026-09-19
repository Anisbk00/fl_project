import { Grid } from "@/components/site/container";
import { ProductCard } from "@/components/site/product-card";
import { EmptyState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";
import {
  isCatalogReady,
  listFeaturedProducts,
} from "@/features/catalog/repository";

/**
 * Featured resources — live data (newest published rights-cleared products).
 * Renders an honest empty/error state when Supabase is not linked or the read
 * fails. Never a fixture fallback on a production page.
 */
export async function FeaturedProducts({ limit = 6 }: { limit?: number }) {
  if (!isCatalogReady()) {
    return (
      <EmptyState
        title="Featured products aren't available here"
        description="This environment has no live Supabase project linked, so live catalog data can't be loaded."
        action={<LinkButton href="/catalog" variant="outline">Go to catalog</LinkButton>}
      />
    );
  }

  let products;
  try {
    products = await listFeaturedProducts(limit);
  } catch {
    return (
      <EmptyState
        title="Featured products couldn't be loaded"
        description="An unexpected error occurred while loading recent products."
        action={<LinkButton href="/catalog">Browse the catalog</LinkButton>}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        title="No products published yet"
        description="New original resources will appear here once published."
      />
    );
  }

  return (
    <Grid min="16rem">
      {products.map((p) => (
        <ProductCard key={p.slug} product={p} />
      ))}
    </Grid>
  );
}
