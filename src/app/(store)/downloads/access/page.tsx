import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { AccessTokenExchange } from "@/components/fulfillment/access-token-exchange";

export const metadata: Metadata = {
  title: "Access your downloads",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AccessPage() {
  return (
    <Section className="py-16">
      <Container>
        <div className="max-w-md mx-auto">
          <SectionHeading eyebrow="Downloads" title="Access your downloads" as="h1" />
          <p className="t-body-sm text-ink-secondary mt-4 mb-6">
            If you arrived from your delivery email, press Continue. The access
            code in the URL fragment is never sent to the server on this page.
          </p>
          <AccessTokenExchange />
        </div>
      </Container>
    </Section>
  );
}
