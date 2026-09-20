import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { Prose } from "@/components/site/page-header";
import { Badge } from "@/components/site/badge";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: "Support guidance and how to reach the store.",
};

export default function ContactPage() {
  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading
            eyebrow="Contact"
            title="Support guidance"
            as="h1"
            description="How to get help — and what is still being built."
          />
        </Container>
      </Section>
      <Prose>
        <div className="flex items-center gap-2 not-prose">
          <Badge tone="warning">Placeholder</Badge>
          <span className="t-caption text-ink-muted">
            Support address is a placeholder until a monitored mailbox is configured.
          </span>
        </div>
        <h2>Before you write</h2>
        <p>
          Please check the <a href="/faq">FAQ</a> first — most common questions
          about file types, compatibility, licensing, and delivery timing are
          answered there.
        </p>
        <h2>Email</h2>
        <p>
          For order, access, and licensing questions, write to{" "}
          <a href={`mailto:${siteConfig.supportAddress}`}>
            {siteConfig.supportAddress}
          </a>
          . <strong>This address is a placeholder</strong> until a monitored
          mailbox is configured before launch.
        </p>
        <h2>What is not ready yet</h2>
        <p>
          There is no live support-ticket system, no in-app chat, and no contact
          form on this page. A contact form is intentionally omitted until it
          can actually submit and route. Do not include payment information in
          any message.
        </p>
      </Prose>
    </>
  );
}
