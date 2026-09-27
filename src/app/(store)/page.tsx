import Link from "next/link";
import {
  FileAudio2,
  Layers,
  PackageOpen,
  Gift,
  Gauge,
  ShieldCheck,
  Boxes,
  ChevronRight,
} from "lucide-react";
import { Container, Section, Grid } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { LinkButton } from "@/components/site/button";
import { Badge } from "@/components/site/badge";
import { HeroVisual } from "@/components/site/hero-visual";
import { FeaturedProducts } from "@/components/site/featured-products";
import { PRODUCT_TYPE_LABELS, type ProductTypeVM } from "@/features/catalog/view-models";
import { siteConfig } from "@/lib/site-config";

const productTypeDiscovery: ReadonlyArray<{
  type: ProductTypeVM;
  href: string;
  blurb: string;
  icon: typeof FileAudio2;
}> = [
  { type: "project_file", href: "/catalog?type=project_file", blurb: "Full DAW sessions with routing, automation, and arrangement.", icon: FileAudio2 },
  { type: "stems", href: "/catalog?type=stems", blurb: "Mixed-down stems ready to drop into your own sessions.", icon: Layers },
  { type: "sample_pack", href: "/catalog?type=sample_pack", blurb: "Original one-shots and loops in 24-bit WAV.", icon: PackageOpen },
  { type: "sample_pack", href: "/free", blurb: "Free downloads to try the catalog before you buy.", icon: Gift, /* overridden below */ },
];

const trustPrinciples = [
  {
    icon: Gauge,
    title: "Transparent compatibility",
    body: "DAW, version, BPM, key, plugins, formats, and file size are visible before you buy — not buried in the small print.",
  },
  {
    icon: ShieldCheck,
    title: "Original or properly licensed",
    body: "We publish only original material or content we have the right to distribute. No copied third-party audio, branding, or artwork.",
  },
  {
    icon: Boxes,
    title: "Secure delivery architecture",
    body: "Paid files live in private storage and will be delivered through a verified, webhook-authoritative flow — currently in progress.",
  },
] as const;

const faqPreview = [
  {
    q: "What exactly do I get?",
    a: "Each product lists its included files and formats, total download size, and the DAW + plugins required to open it.",
  },
  {
    q: "Can I use these in released music?",
    a: "Each product carries a license summary (draft legal text is under review). In short: original content you can use; remakes are for study.",
  },
  {
    q: "How is delivery secured?",
    a: "Paid deliverables are private — never on a permanent public URL. A verified-payment flow issues short-lived download links.",
  },
] as const;

export default function HomePage() {
  const discovery = productTypeDiscovery.slice(0, 3);
  const free = productTypeDiscovery[3]!;

  return (
    <>
      {/* 1. Hero */}
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="flex flex-col gap-6 max-w-xl">
              <span className="t-eyebrow">Production resources for music producers</span>
              <h1 className="t-display text-ink">
                Study, reverse-engineer, and build with detailed production files.
              </h1>
              <p className="t-body-lg text-ink-secondary">
                {siteConfig.name} is a digital store for original DAW project
                files, stems, and sample packs — each shipped with the technical
                details you need to know it will work in your setup before you
                spend a cent.
              </p>
              <div className="flex flex-wrap gap-3">
                <LinkButton href="/catalog" size="lg">
                  Browse the catalog
                  <ChevronRight className="h-4 w-4" />
                </LinkButton>
                <LinkButton href="/free" variant="outline" size="lg">
                  Try the free downloads
                </LinkButton>
              </div>
              <p className="t-caption text-ink-muted">
                Secure checkout by Stripe · no account needed · download link emailed after payment.
              </p>
            </div>
            <HeroVisual className="lg:row-span-2" />
          </div>
        </Container>
      </Section>

      {/* 2. Trust / value strip */}
      <Section className="py-12 sm:py-16">
        <Container>
          <Grid min="15rem">
            {trustPrinciples.map((p) => (
              <div
                key={p.title}
                className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
              >
                <span className="text-brand" aria-hidden="true">
                  <p.icon className="h-6 w-6" />
                </span>
                <h2 className="t-heading-3 text-ink">{p.title}</h2>
                <p className="t-body-sm text-ink-secondary">{p.body}</p>
              </div>
            ))}
          </Grid>
        </Container>
      </Section>

      {/* 3. Product-type discovery */}
      <Section className="py-12 sm:py-16">
        <Container>
          <SectionHeading
            eyebrow="What you can buy"
            title="Browse by what you need"
            description="Four product types, each with its own format and purpose."
          />
          <div className="mt-8">
            <Grid min="15rem">
              {discovery.map((d) => (
                <Link
                  key={d.type + d.href}
                  href={d.href}
                  className="card-lift group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand/12 text-brand" aria-hidden="true">
                    <d.icon className="h-5 w-5" />
                  </span>
                  <h3 className="t-heading-3 text-ink group-hover:text-brand">
                    {PRODUCT_TYPE_LABELS[d.type]}
                  </h3>
                  <p className="t-body-sm text-ink-secondary">{d.blurb}</p>
                  <span className="mt-auto t-label text-brand">Explore →</span>
                </Link>
              ))}
            </Grid>
            <div className="mt-4">
              <Link
                href={free.href}
                className="card-lift group flex items-center gap-4 rounded-xl border border-line bg-surface-inset p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success/15 text-success" aria-hidden="true">
                  <free.icon className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <h3 className="t-heading-3 text-ink group-hover:text-brand">
                    Free Downloads
                  </h3>
                  <p className="t-body-sm text-ink-secondary">{free.blurb}</p>
                </div>
                <span className="t-label text-success">Browse free →</span>
              </Link>
            </div>
          </div>
        </Container>
      </Section>

      {/* 4. Featured resources */}
      <Section className="py-12 sm:py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Featured"
              title="Recent production resources"
              description="Newest original DAW projects, stems, and sample packs from the live catalog."
            />
            <LinkButton href="/catalog" variant="outline">
              View all
            </LinkButton>
          </div>
          <div className="mt-8">
            <FeaturedProducts limit={6} />
          </div>
        </Container>
      </Section>

      {/* 5. Technical transparency */}
      <Section className="py-12 sm:py-16 bg-surface-inset/30">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="flex flex-col gap-4 max-w-lg">
              <span className="t-eyebrow">Before you buy</span>
              <h2 className="t-heading-1 text-ink">
                Every compatibility detail, up front.
              </h2>
              <p className="t-body text-ink-secondary">
                No surprises after checkout. Each product page shows the DAW and
                version, required plugins (and minimum versions), BPM, musical
                key, duration, included formats, and total download size — so
                you know it fits your setup before you pay.
              </p>
              <p className="t-body-sm text-ink-muted">
                Below is a sample of the spec panel every product will carry.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-4">
                <span className="t-eyebrow">Specimen</span>
                <Badge tone="brand">Project File</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 t-technical text-ink-secondary">
                <SpecRow label="DAW" value="FL Studio 21" />
                <SpecRow label="BPM" value="126" />
                <SpecRow label="Key" value="F# minor" />
                <SpecRow label="Duration" value="5:12" />
                <SpecRow label="Formats" value=".flp · .zip · stems" />
                <SpecRow label="Size" value="56 MB" />
                <SpecRow label="Plugins" value="Serum 1.3 (req.) · Valhalla VintageVerb" span />
                <SpecRow label="License" value="Original — see /legal/license" span />
              </dl>
            </div>
          </div>
        </Container>
      </Section>

      {/* 6. Originality / licensing statement */}
      <Section className="py-12 sm:py-16">
        <Container>
          <div className="flex flex-col gap-4 max-w-2xl mx-auto text-center items-center">
            <span className="t-eyebrow">Independence &amp; rights</span>
            <h2 className="t-heading-1 text-ink">
              Original material, properly licensed, independently operated.
            </h2>
            <p className="t-body text-ink-secondary max-w-xl">
              {siteConfig.name} publishes only original content or material the
              owner has the right to distribute. We are independent of — and not
              endorsed by — any artist, label, DAW vendor, or sample-pack
              creator. DAW and plugin names are referenced factually for
              compatibility, not as affiliation.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <LinkButton href="/about" variant="outline">
                Read the mission
              </LinkButton>
              <LinkButton href="/legal/license" variant="ghost">
                License (draft)
              </LinkButton>
            </div>
          </div>
        </Container>
      </Section>

      {/* 7. Free-resource teaser */}
      <Section className="py-12 sm:py-16 bg-surface-inset/30">
        <Container>
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-line bg-surface p-8 text-center">
            <Badge tone="success">Free</Badge>
            <h2 className="t-heading-1 text-ink max-w-xl">
              Test the catalog with free downloads first.
            </h2>
            <p className="t-body text-ink-secondary max-w-lg">
              A small set of free original sample packs — no account needed.
              Check out with your email and we send you the download link.
            </p>
            <LinkButton href="/free" variant="secondary" size="lg">
              Browse free downloads
            </LinkButton>
          </div>
        </Container>
      </Section>

      {/* 8. Compact FAQ preview */}
      <Section className="py-12 sm:py-16">
        <Container>
          <SectionHeading
            eyebrow="FAQ"
            title="Quick answers"
            description="Carefully worded so nothing unfinished is presented as live."
          />
          <div className="mt-8 flex flex-col gap-3 max-w-3xl">
            {faqPreview.map((item) => (
              <div key={item.q} className="rounded-xl border border-line bg-surface p-5">
                <h3 className="t-heading-3 text-ink">{item.q}</h3>
                <p className="mt-2 t-body-sm text-ink-secondary">{item.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <LinkButton href="/faq" variant="outline">
              See all FAQs
            </LinkButton>
          </div>
        </Container>
      </Section>
    </>
  );
}

function SpecRow({
  label,
  value,
  span,
}: {
  label: string;
  value: string;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <dt className="t-caption text-ink-muted">{label}</dt>
      <dd className="t-technical text-ink">{value}</dd>
    </div>
  );
}
