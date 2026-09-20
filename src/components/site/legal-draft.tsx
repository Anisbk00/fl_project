import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { Prose } from "@/components/site/page-header";
import { Badge } from "@/components/site/badge";

/**
 * Shared metadata + layout for draft legal pages. All carry `noindex` until
 * approved by legal review. They are clearly draft structure, not final
 * policies or legal advice.
 */
export function legalMetadata(title: string): Metadata {
  return {
    title,
    description: `Draft ${title.toLowerCase()} text — under legal review before launch. Not final.`,
    robots: { index: false, follow: true },
  };
}

export function LegalDraft({
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
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">Draft — under legal review</Badge>
              <span className="t-caption text-ink-muted">
                Last updated {lastUpdated}
              </span>
            </div>
            <SectionHeading title={title} as="h1" />
          </div>
        </Container>
      </Section>
      <Prose>
        <p className="t-body-sm text-ink-muted">
          This page is draft structure for later legal review. It is not legal
          advice and not a final policy. Statutory consumer rights in your
          jurisdiction are not waived by anything here.
        </p>
        {children}
      </Prose>
    </>
  );
}
