import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Container } from "@/components/site/container";
import { IconButton } from "@/components/site/button";
import { BrandMark, Wordmark } from "@/components/site/brand-mark";
import { MobileNav } from "@/components/site/mobile-nav";
import { primaryNav } from "@/components/site/nav";
import { siteConfig } from "@/lib/site-config";

/**
 * Global site header (Server Component). Contains the brand mark + wordmark,
 * desktop navigation, a cart link (no item count: a count would make every
 * page per-visitor dynamic and uncacheable), and the accessible mobile menu. No customer sign-in/account link.
 * The future admin entry point is deliberately private/unadvertised.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-line bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <Container
        as="div"
        className="flex h-16 items-center justify-between gap-4"
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          aria-label={`${siteConfig.name} — home`}
        >
          <BrandMark className="h-7 w-7 text-brand" />
          <Wordmark name={siteConfig.name} />
        </Link>

        <nav aria-label="Primary" className="hidden lg:flex items-center gap-1">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 t-label text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <IconButton
            href="/cart"
            variant="ghost"
            className="relative"
            aria-label="Cart"
          >
            <ShoppingCart className="h-5 w-5" />
          </IconButton>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
