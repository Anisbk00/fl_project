import type { Metadata } from "next";
import { requireAdminOrRedirect } from "@/lib/auth/require-admin";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin-path";
import { getServerClient } from "@/lib/supabase/server-client";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { LinkButton } from "@/components/site/button";
import { ErrorState } from "@/components/site/state";
import {
  ProductForm,
  type ProductFormGenre,
  type ProductFormPlugin,
  type ProductFormValues,
} from "@/components/admin/product-form";

export const metadata: Metadata = {
  title: "New product",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function getTaxonomy(): Promise<{
  genres: ProductFormGenre[];
  plugins: ProductFormPlugin[];
  error?: string;
}> {
  try {
    const client = await getServerClient();
    const [genresRes, pluginsRes] = await Promise.all([
      client.from("genres").select("id,slug,name").order("name"),
      client.from("plugins").select("id,slug,name,vendor").order("name"),
    ]);
    if (genresRes.error) {
      return {
        genres: [],
        plugins: [],
        error: `Could not load genres: ${genresRes.error.message}`,
      };
    }
    if (pluginsRes.error) {
      return {
        genres: [],
        plugins: [],
        error: `Could not load plugins: ${pluginsRes.error.message}`,
      };
    }
    return {
      genres: (genresRes.data ?? []) as ProductFormGenre[],
      plugins: (pluginsRes.data ?? []) as ProductFormPlugin[],
    };
  } catch (e) {
    return {
      genres: [],
      plugins: [],
      error:
        e instanceof Error
          ? e.message
          : "Supabase is not configured in this environment.",
    };
  }
}

export default async function NewProductPage() {
  await requireAdminOrRedirect({ aal2: true });
  const tax = await getTaxonomy();

  // If Supabase isn't linked, show the honest error rather than a "loads from
  // a linked project" placeholder.
  if (tax.error) {
    return (
      <Container>
        <SectionHeading
          eyebrow="Admin"
          title="New product"
          as="h1"
          description="Create a draft. Publication requires validated assets (enforced by the transactional publish_product RPC)."
        />
        <div className="mt-8">
          <ErrorState
            title="Couldn't load the taxonomy"
            description={tax.error}
            action={
              <LinkButton href={ADMIN_PRODUCTS_PATH} variant="outline">
                Back to products
              </LinkButton>
            }
          />
        </div>
      </Container>
    );
  }

  const initialValues: ProductFormValues = {
    title: "",
    slug: "",
    shortDescription: "",
    longDescription: "",
    productType: "project_file",
    price: 0,
    priceCurrency: "USD",
    compareAtPrice: null,
    dawName: "",
    dawVersion: "",
    bpm: null,
    musicalKey: "",
    durationSeconds: null,
    totalSizeBytes: null,
    includedFormats: "",
    featured: false,
    seoTitle: "",
    seoDescription: "",
    selectedGenreIds: [],
    selectedPlugins: [],
  };

  // `ProductForm` is a client component; the action it dispatches will
  // redirect to the new product's edit page on success.
  return (
    <Container>
      <SectionHeading
        eyebrow="Admin"
        title="New product"
        as="h1"
        description="Create a draft. Publication requires validated assets (enforced by the transactional publish_product RPC)."
      />
      <p className="t-body-sm text-ink-secondary mt-6 max-w-2xl">
        Server-side validation is authoritative — the client checks improve UX
        only. Slug, slug uniqueness, and price (integer minor currency units)
        mirror the database CHECK constraints.
      </p>
      <div className="mt-8">
        <ProductForm
          initialValues={initialValues}
          genres={tax.genres}
          plugins={tax.plugins}
          submitLabel="Create product"
        />
      </div>
    </Container>
  );
}
