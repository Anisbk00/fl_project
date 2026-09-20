# SEO

Canonical/indexing rules, metadata, Open Graph, sitemap, robots, JSON-LD
truthfulness/escaping, validation procedure, and the explicit prohibition on
fake ratings. See `src/features/catalog/seo.ts`, `src/app/sitemap.ts`,
`src/app/robots.ts`, and the route `generateMetadata` exports.

## Canonical / indexing policy

- `/catalog`, `/free`, and every published product get deliberate canonical
  URLs (`catalogCanonical()`, `freeCanonical()`, `productCanonical(slug)`).
- Host/protocol/trailing-slash/parameter ordering are normalized via
  `metadataBase` (from validated `NEXT_PUBLIC_SITE_URL`) and
  `serializeCatalogParams` (stable, sorted, default-stripped).
- Search/sort/faceted-filter combinations are non-canonical: the catalog page
  emits `robots: { index: false, follow: true }` when `hasActiveFilters()` is
  true. This prevents an indexable URL explosion. `robots.txt` is crawl
  guidance, never canonicalization.
- Self-referential canonicals on indexable pages; internal links use canonical
  URLs.
- Draft/archived/non-public products are nondisclosing 404s and are absent from
  all discovery outputs (sitemap, internal links, JSON-LD).

## Metadata

- App Router `metadata` API in Server Components. `title` template + default.
- Product `title`/`description`/canonical/OG/Twitter come only from public
  sanitized fields (`seo_title`/`seo_description` fall back to title/short
  description) and validated site config. No query strings, internal IDs,
  private media, or unsafe text leak into metadata.
- A deterministic local fallback (`/icon.svg`) is used when a product has no
  live cover.

## Open Graph / Twitter

- `openGraph`/`twitter` use only local original assets (`/og.svg`, `/icon.svg`,
  live public covers). No remote-image wildcard hosts.

## Sitemap & robots

- `src/app/sitemap.ts` emits canonical public routes
  (`/`, `/catalog`, `/free`, `/about`, `/faq`, `/contact`) + published
  rights-cleared product URLs with truthful `lastModified` from `published_at`.
  It NEVER includes search/filter URLs, drafts, admin routes, cart, APIs, or
  draft legal pages. Pages through the catalog; a multi-sitemap index is a
  Step 8 concern for very large catalogs.
- `src/app/robots.ts` allows all public crawling and references the sitemap.
  `Disallow` is crawl guidance only — never access control.

## Structured data (JSON-LD)

- Rendered as native `application/ld+json` via the `JsonLd` component.
  `serializeJsonLd()` escapes `<`, `>`, `&` and line/paragraph separators to
  unicode so stored content cannot break out of the script element.
- `BreadcrumbList` matches the visible breadcrumb trail.
- `Product` includes only visible, truthful fields: `name`, `description`,
  `image`, `category`. It NEVER includes fabricated `Review`,
  `AggregateRating`, brand claims, `SKU`, inventory, shipping, or return info.
- `Offer`/merchant properties are OMITTED until commerce is genuinely enabled
  (Step 5). Step 3 does not falsely advertise availability or checkout.
- When offers are enabled later, price/currency in JSON-LD will come from the
  same trusted fields rendered on the page.

## Content quality

- One meaningful H1 per page; logical heading order; descriptive link text;
  real `alt` for meaningful covers; empty `alt` for decorative motifs; no
  keyword stuffing. Category/filter labels help buyers choose rather than
  create thin doorway content.

## Validation

- JSON-LD shape + escaping is covered by automated unit tests
  (`tests/site/seo.test.ts`).
- Canonical/canonical helpers are unit-tested.
- On a linked project, validate representative output with Google's Rich
  Results Test / Schema Markup Validator. In this sandbox (no live Supabase),
  external validators could not be run against live product pages — this is a
  documented blocker; the JSON-LD shape is asserted by unit tests instead.

## Prohibition

No fabricated `Review`, `AggregateRating`, `offers` (until Step 5), brand,
SKU, inventory, shipping, or return data is ever emitted.
