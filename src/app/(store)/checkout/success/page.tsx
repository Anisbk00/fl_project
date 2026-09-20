import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";
import { isStripeConfigured } from "@/lib/stripe/server";

export const metadata: Metadata = {
  title: "Order status",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!isStripeConfigured()) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="Order status isn't available here"
            titleAs="h1"
            description="This environment has no Stripe keys configured, so order status can't be loaded. The success page is read-only and never creates an order, marks a payment paid, or triggers fulfillment."
            action={<LinkButton href="/" variant="outline">Back home</LinkButton>}
          />
        </Container>
      </Section>
    );
  }
  // The session_id is a LOOKUP HINT only; the page is bound to the guest cart
  // cookie (a high-entropy capability). Possession of a guessed session id alone
  // reveals nothing. It reads ONLY a narrow local status DTO (no-store) and
  // never calls Stripe / mutates payment state / fulfills.
  return (
    <Section className="py-20">
      <Container>
        <SectionHeading eyebrow="Order status" title="Processing your payment" as="h1" description="Payment confirmation is pending. Delivery occurs only after confirmation. Secure delivery is not enabled until Step 6." />
        <p className="t-caption text-ink-muted mt-4 break-all">
          {session_id ? `Reference: ${session_id.slice(0, 8)}…` : "No session reference."}
        </p>
      </Container>
    </Section>
  );
}
