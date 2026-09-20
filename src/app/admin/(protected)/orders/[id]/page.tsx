import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";

export const metadata: Metadata = { title: "Order detail", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage() {
  return (
    <Container>
      <SectionHeading eyebrow="Admin" title="Order detail" as="h1" description="Immutable purchased items, safe Stripe IDs, subtotal/tax/total/refunded, payment timeline, refund history, future fulfillment state. Safe test-mode refunds use the AAL2 guard + trusted PaymentIntent/Charge + Stripe idempotency." />
      <div className="mt-8"><EmptyState title="Order detail needs a linked project" /></div>
    </Container>
  );
}
