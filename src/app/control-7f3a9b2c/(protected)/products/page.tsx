import type { Metadata } from "next";
import { ADMIN_NEW_PRODUCT_PATH } from "@/lib/admin-path";
import { LinkButton } from "@/components/site/button";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";

export const metadata: Metadata = { title: "Products", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  return (
    <Container>
      <div className="flex items-center justify-between gap-4">
        <SectionHeading eyebrow="Admin" title="Products" as="h1" />
        <LinkButton href={ADMIN_NEW_PRODUCT_PATH} size="sm">New product</LinkButton>
      </div>
      <div className="mt-8">
        <EmptyState
          title="No products to show here"
          description="The product table loads server-side (paginated, filterable by title/type/lifecycle/rights/genre) from a linked Supabase project. Server-side pagination keeps the full catalog out of the browser."
        />
      </div>
    </Container>
  );
}
