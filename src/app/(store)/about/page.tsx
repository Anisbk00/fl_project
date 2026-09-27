import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { Prose } from "@/components/site/page-header";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "About",
  description: `The mission behind ${siteConfig.name}: original, technically transparent production resources for music producers.`,
};

export default function AboutPage() {
  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading
            eyebrow="About"
            title="Production resources, built for producers."
            as="h1"
            description={`${siteConfig.name} exists to give music producers detailed, honest, technically transparent production resources — original DAW project files, stems, and sample packs — with the compatibility information you need up front.`}
          />
        </Container>
      </Section>
      <Prose>
        <h2>Mission</h2>
        <p>
          The goal is simple: when you buy a production resource, you should
          know exactly what is inside and whether it fits your setup before you
          spend anything. Every product lists its DAW and version, required
          plugins and minimum versions, BPM, musical key, duration, included
          formats, and total download size.
        </p>
        <h2>Originality &amp; rights</h2>
        <p>
          We publish only original material, or content the owner has the
          explicit right to distribute. We do not sell extracted commercial
          stems, copied third-party sample-pack files, presets, MIDI, or
          artwork without redistribution rights, or a famous song remake
          merely because it was recreated by ear.
        </p>
        <p>
          A product can be publicly published only when its rights status is
          marked <strong>original</strong> or <strong>licensed</strong>. This
          is an engineering guardrail, not a substitute for legal advice.
        </p>
        <h2>Independence</h2>
        <p>
          {siteConfig.name} is independently operated. We are not affiliated
          with, sponsored by, or endorsed by any artist, record label, DAW
          vendor, or sample-pack creator. DAW and plugin names are referenced
          factually for compatibility only — never to imply affiliation or
          endorsement.
        </p>
        <h2>How buying works</h2>
        <p>
          No account needed. Add products to your cart and pay on Stripe’s
          secure checkout page — we never see your card details. Once Stripe
          confirms the payment, we email you a private download link.
        </p>
      </Prose>
    </>
  );
}
