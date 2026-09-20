import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="Orders" as="h1" description="Server-side paginated + filterable by order number, date, payment state, refund state, hold/manual-review. No public caching; AAL2-only." />
      <div className="mt-8"><EmptyState title="No orders to show here" description="Orders load from a linked Supabase project + verified Stripe webhooks." /></div>
    </Container>
  );
}
