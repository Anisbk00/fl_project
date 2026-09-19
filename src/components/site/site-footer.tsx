import Link from "next/link";
import { Container } from "@/components/site/container";
import { BrandMark } from "@/components/site/brand-mark";
import { footerNav } from "@/components/site/nav";
import { siteConfig } from "@/lib/site-config";

/**
 * Global site footer. Reflows into a clear hierarchy rather than a compressed
 * row on small screens. The footer sticks to the viewport bottom on short
 * pages and is pushed down naturally on long pages (root layout uses
 * min-h-screen flex flex-col).
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <Container as="div" className="py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              aria-label={`${siteConfig.name} — home`}
              className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              <BrandMark className="h-7 w-7 text-brand" />
              <span className="t-label text-base font-semibold text-ink">
                {siteConfig.name}
              </span>
            </Link>
            <p className="t-body-sm text-ink-muted max-w-xs">
              {siteConfig.shortDescription}
            </p>
            <p className="t-caption text-ink-muted">
              Independent. Not affiliated with or endorsed by any DAW vendor,
              artist, label, or sample-pack creator.
            </p>
          </div>

          {footerNav.map((col) => (
            <nav
              key={col.heading}
              aria-label={col.heading}
              className="flex flex-col gap-2"
            >
              <h2 className="t-eyebrow">{col.heading}</h2>
              {col.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="t-body-sm text-ink-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded w-fit"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-caption text-ink-muted">
            © {new Date().getFullYear()} {siteConfig.name}. Brand name is a
            working label pending approval.
          </p>
          <p className="t-caption text-ink-muted">
            Storefront shell · Step 2 of 9 — live catalog, checkout & delivery
            arrive in later steps.
          </p>
        </div>
      </Container>
    </footer>
  );
}
