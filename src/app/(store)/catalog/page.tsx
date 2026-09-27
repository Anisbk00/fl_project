import { cn } from "@/lib/utils";
import { SORT_OPTIONS } from "@/features/catalog/sort";
import type { Metadata } from "next";
import { Container, Section, Grid } from "@/components/site/container";
import { SectionHeading } from "@/components/site/section-heading";
import { ProductCard } from "@/components/site/product-card";
import { CatalogFilters } from "@/components/site/catalog-filters";
import { EmptyState, NoResultsState } from "@/components/site/state";
import { LinkButton } from "@/components/site/button";
import { Badge } from "@/components/site/badge";
import {
  isCatalogReady,
  searchCatalog,
  listGenres,
  listPlugins,
  type CatalogResult,
} from "@/features/catalog/repository";
import {
  parseCatalogParams,
  withParam,
  withPage,
  hasActiveFilters,
  normalizeMulti,
  PAGE_SIZE,
  type CatalogParams,
} from "@/features/catalog/url-params";
import { catalogCanonical } from "@/features/catalog/seo";
import type { PublicGenre, PublicPlugin } from "@/features/catalog/data-access";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const parsed = parseCatalogParams(sp);
  const indexed = parsed.params ? !hasActiveFilters(parsed.params) : true;
  return {
    title: "Catalog",
    description:
      "Browse original DAW project files, stems, and sample packs. Filter by type, genre, plugin, BPM, and price.",
    alternates: { canonical: catalogCanonical() },
    // Filtered/search/sort combinations are non-canonical → noindex,follow.
    robots: indexed
      ? { index: true, follow: true }
      : { index: false, follow: true },
  };
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const parsed = parseCatalogParams(sp);

  if (!parsed.params) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="Filter error" titleAs="h1"
            description={
              parsed.error
                ? `One of the filter parameters was invalid (${parsed.error}). Clear the filters and try again.`
                : "The filter parameters were invalid. Clear the filters and try again."
            }
            action={<LinkButton href="/catalog">Clear filters</LinkButton>}
          />
        </Container>
      </Section>
    );
  }
  const params = parsed.params;

  // Honest unconfigured state (sandbox): not a fixture fallback, not a crash.
  if (!isCatalogReady()) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="Catalog isn't available here" titleAs="h1"
            description="This environment has no live Supabase project linked, so live catalog data can't be loaded. Link a Supabase project (see README) to browse real products."
            action={<LinkButton href="/" variant="outline">Back home</LinkButton>}
          />
        </Container>
      </Section>
    );
  }

  let result: CatalogResult;
  let genres: PublicGenre[];
  let plugins: PublicPlugin[];
  try {
    [result, genres, plugins] = await Promise.all([
      searchCatalog(params),
      listGenres(),
      listPlugins(),
    ]);
  } catch (err) {
    return (
      <Section className="py-20">
        <Container>
          <EmptyState
            title="Catalog couldn't be loaded" titleAs="h1"
            description={
              err instanceof Error
                ? err.message
                : "An unexpected error occurred. Please try again."
            }
            action={<LinkButton href="/catalog">Retry</LinkButton>}
          />
        </Container>
      </Section>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(Math.max(params.page, 1), totalPages);
  const active = hasActiveFilters(params);
  const showingFrom = result.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, result.total);

  return (
    <>
      <Section className="pb-0 pt-12 sm:pt-16 lg:pt-20">
        <Container>
          <SectionHeading
            eyebrow="Catalog"
            title="Production resources"
            as="h1"
            description="Original DAW project files, stems, and sample packs. Filter by type, genre, plugin, BPM, and price. Search is indexed and parameterized."
          />
        </Container>
      </Section>
      <Section className="pt-6">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
            <CatalogFilters params={params} genres={genres} plugins={plugins} />
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="t-body-sm text-ink-secondary">
                  {result.total === 0 ? (
                    "No products"
                  ) : (
                    <>
                      Showing <span className="tabular">{showingFrom}</span>–
                      <span className="tabular">{showingTo}</span> of{" "}
                      <span className="tabular">{result.total}</span>{" "}
                      {result.total === 1 ? "product" : "products"}
                      {active ? " matching" : ""}
                    </>
                  )}
                </p>
                <nav aria-label="Sort results" className="flex flex-wrap items-center gap-1.5">
                  {SORT_OPTIONS.map((opt) => {
                    const active = params.sort === opt.value || (opt.value === "newest" && (!params.sort || params.sort === "newest"));
                    return (
                      <a
                        key={opt.value}
                        href={withParam(params, { sort: opt.value, resetPage: true })}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "rounded-full px-3 py-1.5 t-label transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
                          active
                            ? "bg-brand text-brand-foreground"
                            : "bg-surface text-ink-secondary hover:text-ink border border-line",
                        )}
                      >
                        {opt.label}
                      </a>
                    );
                  })}
                </nav>
              </div>

              {active ? <ActiveFilterChips params={params} /> : null}

              {result.products.length === 0 ? (
                active ? (
                  <NoResultsState
                    description={`No published products match these filters. Try widening your search, or clear a filter.`}
                    action={<LinkButton href="/catalog">Clear all filters</LinkButton>}
                  />
                ) : (
                  <EmptyState
                    title="No products published yet"
                    description="The catalog is live but empty. New original resources will appear here once published."
                  />
                )
              ) : (
                <Grid min="16rem">
                  {result.products.map((p) => (
                    <ProductCard key={p.slug} product={p} />
                  ))}
                </Grid>
              )}

              {totalPages > 1 ? (
                <Pagination
                  current={params}
                  page={page}
                  totalPages={totalPages}
                />
              ) : null}
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

function ActiveFilterChips({ params }: { params: CatalogParams }) {
  const chips: { label: string; removeHref: string }[] = [];
  if (params.q.trim()) {
    chips.push({
      label: `“${params.q.trim()}”`,
      removeHref: withParam(params, { q: "", resetPage: true }),
    });
  }
  for (const t of params.types) {
    chips.push({
      label: t.replace("_", " "),
      removeHref: withParam(params, {
        types: params.types.filter((x) => x !== t),
        resetPage: true,
      }),
    });
  }
  for (const g of params.genres) {
    chips.push({
      label: g,
      removeHref: withParam(params, {
        genres: params.genres.filter((x) => x !== g),
        resetPage: true,
      }),
    });
  }
  for (const p of params.plugins) {
    chips.push({
      label: p,
      removeHref: withParam(params, {
        plugins: params.plugins.filter((x) => x !== p),
        resetPage: true,
      }),
    });
  }
  if (params.daw) {
    chips.push({ label: `DAW: ${params.daw}`, removeHref: withParam(params, { daw: "", resetPage: true }) });
  }
  if (params.key) {
    chips.push({ label: `Key: ${params.key}`, removeHref: withParam(params, { key: "", resetPage: true }) });
  }
  if (params.bpmMin != null || params.bpmMax != null) {
    chips.push({
      label: `BPM ${params.bpmMin ?? "—"}–${params.bpmMax ?? "—"}`,
      removeHref: withParam(params, { bpmMin: undefined, bpmMax: undefined, resetPage: true }),
    });
  }
  if (params.currency && (params.priceMin != null || params.priceMax != null)) {
    chips.push({
      label: `Price ${params.priceMin ?? "—"}–${params.priceMax ?? "—"} ${params.currency}`,
      removeHref: withParam(params, {
        priceMin: undefined,
        priceMax: undefined,
        currency: undefined,
        resetPage: true,
      }),
    });
  }
  if (params.pluginFree) {
    chips.push({ label: "No required plugins", removeHref: withParam(params, { pluginFree: false, resetPage: true }) });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c, i) => (
        <Badge key={i} tone="neutral" className="gap-1.5">
          <span>{c.label}</span>
          <a
            href={c.removeHref}
            aria-label={`Remove filter ${c.label}`}
            className="text-ink-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
          >
            ×
          </a>
        </Badge>
      ))}
      <a
        href="/catalog"
        className="t-caption text-ink-secondary underline underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
      >
        Clear all
      </a>
    </div>
  );
}

function Pagination({
  current,
  page,
  totalPages,
}: {
  current: CatalogParams;
  page: number;
  totalPages: number;
}) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1.5">
      {page > 1 ? (
        <LinkButton href={withPage(current, page - 1)} variant="outline" size="sm">
          Previous
        </LinkButton>
      ) : null}
      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const gap = prev && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1.5">
            {gap ? <span aria-hidden="true" className="t-caption text-ink-muted">…</span> : null}
            {p === page ? (
              <span
                aria-current="page"
                className="flex h-9 min-w-9 items-center justify-center rounded-md bg-brand px-3 t-label text-brand-foreground"
              >
                {p}
              </span>
            ) : (
              <LinkButton href={withPage(current, p)} variant="ghost" size="sm" className="h-9 min-w-9">
                {p}
              </LinkButton>
            )}
          </span>
        );
      })}
      {page < totalPages ? (
        <LinkButton href={withPage(current, page + 1)} variant="outline" size="sm">
          Next
        </LinkButton>
      ) : null}
    </nav>
  );
}

// Re-export to keep tree-shaking honest (normalizeMulti is used in tests).
export { normalizeMulti };
