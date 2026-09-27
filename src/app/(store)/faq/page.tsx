import type { Metadata } from "next";
import { Container, Section } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { LinkButton } from "@/components/site/button";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Buyer questions about file types, compatibility, licensing, and future delivery.",
};

const faqs: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "What exactly do I get when I buy a product?",
    a: "Each product page lists the included files and formats (e.g. .flp, stems, 24-bit WAV), the total download size, the DAW and version it was made in, and the plugins (and minimum versions) required to open it. You see all of this before purchase.",
  },
  {
    q: "Are these compatible with my DAW?",
    a: "Compatibility is shown per product: the DAW and version, required plugins, and included formats. There is no single compatibility guarantee — read the product's spec panel. DAW and plugin names are referenced factually for compatibility, not as affiliation.",
  },
  {
    q: "Can I use these sounds in released music?",
    a: "Each product carries a license summary on its page, and full draft license text is at /legal/license (currently under review). In short: original content you can use in your work; educational remakes are provided for study, not as masters to release.",
  },
  {
    q: "Is delivery secure?",
    a: "Paid deliverables are stored privately — never on a permanent public URL. The delivery architecture is designed to issue short-lived download links only after a verified payment. That flow is in progress; it is not live yet.",
  },
  {
    q: "Do I need an account?",
    a: "No. There are no customer accounts and no customer login. You browse publicly and check out as a guest. Only the store owner/admin authenticates, for managing the catalog.",
  },
  {
    q: "Can I get a refund?",
    a: "Draft refund policy text is at /legal/refunds and is under review. Statutory consumer rights in your jurisdiction are not waived by anything here.",
  },
  {
    q: "How do I get my files after paying?",
    a: "As soon as Stripe confirms your payment, we email a private download link to the address you entered at checkout. The link works for 72 hours; each file can be downloaded several times, and every download uses a fresh link that expires after two minutes. Nothing is attached to the email.",
  },
];

export default function FaqPage() {
  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading
            eyebrow="FAQ"
            title="Buyer questions"
            as="h1"
            description="Carefully worded so incomplete functionality is not claimed as live."
          />
        </Container>
      </Section>
      <Section className="pt-6">
        <Container>
          <div className="flex flex-col gap-3 max-w-3xl">
            {faqs.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-line bg-surface p-5 focus-within:ring-2 focus-within:ring-[var(--focus)]"
              >
                <summary className="t-heading-3 cursor-pointer list-none text-ink flex items-center justify-between gap-4">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="text-ink-muted transition-transform duration-[var(--duration-base)] group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 t-body-sm text-ink-secondary">{item.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8">
            <LinkButton href="/contact" variant="outline">
              Still need help?
            </LinkButton>
          </div>
        </Container>
      </Section>
    </>
  );
}
