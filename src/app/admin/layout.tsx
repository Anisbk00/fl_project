import type { Metadata } from "next";
import { Container } from "@/components/site/container";
import { BrandMark } from "@/components/site/brand-mark";
import { siteConfig } from "@/lib/site-config";

/**
 * Admin area layout. Sets `noindex,nofollow` metadata + `no-store` for all
 * admin routes (these are crawl guidance + cache hints, NOT access control —
 * access is enforced by the central `requireAdmin({ aal2 })` guard and RLS).
 * The admin area is NOT linked from public navigation and is excluded from
 * the sitemap.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: `%s — Admin · ${siteConfig.name}` },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="border-b border-line">
        <Container as="div" className="flex h-14 items-center gap-2">
          <BrandMark className="h-6 w-6 text-brand" />
          <span className="t-label text-base font-semibold text-ink">
            {siteConfig.name} · Admin
          </span>
          <span className="t-caption text-ink-muted ml-auto">
            noindex · no-store · AAL2-enforced
          </span>
        </Container>
      </header>
      {children}
    </div>
  );
}
