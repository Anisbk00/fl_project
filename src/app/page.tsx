import { publicEnv } from "@/lib/env/public";
import { CheckCircle2, Circle, Construction } from "lucide-react";

/**
 * Step 1 placeholder home page.
 *
 * This page proves the application builds and boots with NO production
 * secrets present. It does not query the database or Supabase. It is the
 * ONLY user-visible route in Step 1. The real storefront (catalog, product
 * pages, audio previews, cart, checkout) is Steps 2–6.
 */
export default function HomePage() {
  const implemented = [
    "Domain-oriented folder structure (src/app, src/features, src/lib, src/types)",
    "TypeScript strict mode with noUncheckedIndexedAccess",
    "Validated environment module (public vs server-only, Zod) with safe build defaults",
    "Three separated Supabase clients (publishable / cookie server / privileged), each server-only-guarded",
    "Catalog Prisma schema: products, genres, plugins, joins, public media, private deliverables, admin allow-list",
    "Application-layer access matrix mirroring Supabase RLS (anon sees only published + rights-cleared rows)",
    "Publication guardrail: a product cannot be published until rights-cleared and valid",
    "Baseline security headers (nosniff, frame DENY, referrer, permissions-policy); poweredByHeader off",
    "Unit + DB-backed access-matrix tests proving allow/deny behavior",
    "Architecture, security, roadmap, and decision-record documentation",
  ];
  const pending = [
    "Step 2 — Brand system and responsive storefront shell",
    "Step 3 — Catalog, product pages, filters, SEO, audio previews",
    "Step 4 — Admin authentication (MFA/AAL2) and product CMS",
    "Step 5 — Guest cart and Stripe-hosted checkout",
    "Step 6 — Secure digital fulfillment (signed download URLs)",
    "Step 7 — Trust, legal, reviews, growth features",
    "Step 8 — Observability, security & performance hardening",
    "Step 9 — Vercel production deployment and release",
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-4xl px-4 py-6 flex items-center gap-3">
          <Construction className="h-7 w-7 text-primary" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">
            {publicEnv.NEXT_PUBLIC_SITE_NAME}
          </span>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-10">
        <p className="text-sm font-medium text-muted-foreground mb-2">
          Step 1 — Foundation, architecture & secure catalog data layer
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          The store foundation is built. The storefront is on its way.
        </h1>
        <p className="text-muted-foreground mb-10 max-w-2xl">
          This is a worldwide digital-product store for music producers. Step 1
          delivers only the technical foundation and secure catalog data layer:
          the schema, the access-control model, environment validation, and the
          project plumbing. No storefront, cart, or checkout exists yet.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          <section aria-labelledby="implemented-heading" className="rounded-xl border p-5">
            <h2
              id="implemented-heading"
              className="text-base font-semibold flex items-center gap-2 mb-3"
            >
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
              Implemented in Step 1
            </h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {implemented.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-primary mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="pending-heading" className="rounded-xl border p-5">
            <h2
              id="pending-heading"
              className="text-base font-semibold flex items-center gap-2 mb-3"
            >
              <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
              Not yet implemented (Steps 2–9)
            </h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {pending.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-muted-foreground mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="mt-8 text-xs text-muted-foreground border-t pt-6">
          Independent project. Not affiliated with or endorsed by any DAW vendor,
          artist, label, or sample-pack creator. All products listed in future
          steps will be original or legally licensed for distribution.
        </p>
      </main>

      <footer className="mt-auto border-t">
        <div className="mx-auto max-w-4xl px-4 py-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {publicEnv.NEXT_PUBLIC_SITE_NAME}. All
            products original or licensed for distribution.
          </p>
          <p>Foundation build · Step 1 of 9</p>
        </div>
      </footer>
    </div>
  );
}
