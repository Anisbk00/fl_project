import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { Prose } from "@/components/site/page-header";
import { siteConfig } from "@/lib/site-config";

/** Shared metadata + layout for the legal pages. */
export function legalMetadata(title: string, description: string): Metadata {
  return { title, description };
}

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <div className="flex flex-col gap-3 max-w-2xl">
            <span className="t-caption text-ink-muted">Last updated {lastUpdated}</span>
            <SectionHeading title={title} as="h1" />
          </div>
        </Container>
      </Section>
      <Prose>{children}</Prose>
    </>
  );
}

/** Support contact: the configured mailbox, or the contact page if none is set. */
export function SupportContact() {
  const email = siteConfig.supportAddress;
  return email ? <a href={`mailto:${email}`}>{email}</a> : <Link href="/contact">our contact page</Link>;
}
