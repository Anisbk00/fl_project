import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { Prose } from "@/components/site/page-header";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach support about orders, downloads and licensing.",
};

export default function ContactPage() {
  const email = siteConfig.supportAddress;
  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading eyebrow="Contact" title="Get help" as="h1" description="Questions about an order, a download or a license." />
        </Container>
      </Section>
      <Prose>
        <h2>Before you write</h2>
        <p>
          The <a href="/faq">FAQ</a> answers most questions about file types, compatibility, licensing and delivery.
        </p>
        <h2>Email</h2>
        {email ? (
          <p>
            Write to <a href={`mailto:${email}`}>{email}</a>. Include your order number (it starts with <code>FL-</code>{" "}
            and is in your delivery email) so we can find your purchase quickly.
          </p>
        ) : (
          <p>Email support is not set up yet. Please check back soon.</p>
        )}
        <h2>Didn’t get your download email?</h2>
        <p>
          Check your spam folder first. Delivery links expire 72 hours after they’re sent; if yours has expired, email us
          with your order number and we’ll send a fresh link.
        </p>
        <p>Never include card or payment details in a message — we never need them.</p>
      </Prose>
    </>
  );
}
