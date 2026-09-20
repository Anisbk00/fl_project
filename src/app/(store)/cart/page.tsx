import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";
import { ShoppingCart } from "lucide-react";

export const metadata: Metadata = {
  title: "Cart",
  description: "Your cart is empty.",
};

export default function CartPage() {
  return (
    <Section className="py-12 sm:py-16 lg:py-20">
      <Container>
        <SectionHeading
          eyebrow="Cart"
          title="Your cart"
          as="h1"
          description="There is nothing in your cart yet."
        />
        <div className="mt-8 max-w-md">
          <EmptyState
            icon={<ShoppingCart className="h-8 w-8" />}
            title="Your cart is empty"
            description="Browse the catalog to add production resources. Cart persistence and checkout arrive in Step 5 — for now the cart shows an honest empty state."
            action={
              <LinkButton href="/catalog" variant="primary">
                Browse the catalog
              </LinkButton>
            }
          />
        </div>
      </Container>
    </Section>
  );
}
