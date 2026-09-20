import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { EmptyState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";

export const metadata: Metadata = {
  title: "Your downloads",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DownloadsPortal() {
  // With a linked project, this page validates the access-session cookie, loads
  // the bound order's entitlements, shows purchased items + download buttons,
  // and issues 120-second signed Storage URLs via POST. In the sandbox (no
  // Supabase), it shows an honest state.
  return (
    <Section className="py-16">
      <Container>
        <div className="max-w-md mx-auto">
          <EmptyState
            title="Downloads aren't available here"
            titleAs="h1"
            description="This environment has no live Supabase project linked, so private download sessions can't be created. The portal is private, no-store, no-referrer, and noindex."
            action={<LinkButton href="/" variant="outline">Back home</LinkButton>}
          />
        </div>
      </Container>
    </Section>
  );
}
