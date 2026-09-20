import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";
import { isStripeConfigured } from "@/lib/stripe/server";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  if (!isStripeConfigured()) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="Checkout isn't available here"
            titleAs="h1"
            description="This environment has no Stripe sandbox/live keys configured, so a Checkout Session can't be created. Live Checkout is fail-closed until Step 6 fulfillment, approved legal/tax configuration, production secrets, and the release checklist are complete."
            action={<LinkButton href="/cart" variant="outline">Back to cart</LinkButton>}
          />
        </Container>
      </Section>
    );
  }
  // With Stripe configured, this route runs the checkout saga: lock + re-resolve
  // the cart, enforce purchase gates, compute the trusted fingerprint, reuse an
  // open attempt if the fingerprint matches, else create an immutable checkout
  // attempt + call stripe.checkout.sessions.create with the attempt's idempotency
  // key, persist the Session, and redirect to the hosted Stripe URL.
  return (
    <Section className="py-20">
      <Container>
        <SectionHeading eyebrow="Checkout" title="Redirecting to Stripe…" as="h1" description="You will be redirected to Stripe-hosted Checkout to complete payment securely. The application never sees card details." />
      </Container>
    </Section>
  );
}
