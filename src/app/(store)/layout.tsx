import { SkipLink } from "@/components/site/skip-link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

/**
 * Storefront chrome for all public routes (route group `(store)` does not affect
 * URLs). The admin area uses its own layout and does NOT render this chrome.
 * The footer sticks to the viewport bottom on short pages and is pushed down
 * naturally on long pages (min-h-screen flex flex-col + mt-auto).
 */
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SkipLink />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
