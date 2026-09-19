"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button, IconButton } from "@/components/site/button";
import { cn } from "@/lib/utils";
import {
  PRODUCT_TYPES,
  type ProductType,
} from "@/features/catalog/schema";
import { SORT_OPTIONS } from "@/features/catalog/sort";
import type { CatalogParams } from "@/features/catalog/url-params";
import type { PublicGenre, PublicPlugin } from "@/features/catalog/data-access";

/**
 * Catalog filter UI (client island, progressive enhancement).
 *
 * The form is a semantic GET form (`method="get" action="/catalog"`) so the
 * core flow works WITHOUT JavaScript: checkbox/text/select fields submit as a
 * query string and the server re-renders authoritatively. JS only enhances the
 * mobile disclosure (a Radix Sheet) and the sort control.
 *
 * Field names match the canonical URL contract. Multi-select uses repeated
 * field names (e.g. multiple `type` checkboxes). Empty fields are stripped by
 * `parseCatalogParams` on the server. `sort` is a hidden field preserving the
 * current sort; `page` is intentionally omitted so filter changes reset to 1.
 */

function FilterFields({
  params,
  genres,
  plugins,
  idPrefix,
}: {
  params: CatalogParams;
  genres: PublicGenre[];
  plugins: PublicPlugin[];
  idPrefix: string;
}) {
  const typeSet = new Set(params.types);
  const genreSet = new Set(params.genres);
  const pluginSet = new Set(params.plugins);
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="t-eyebrow mb-1">Search</legend>
        <label className="t-body-sm text-ink-secondary" htmlFor={`${idPrefix}-q`}>
          Keywords
        </label>
        <input
          id={`${idPrefix}-q`}
          name="q"
          type="search"
          defaultValue={params.q}
          maxLength={200}
          className="h-10 rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          aria-label="Search by keywords"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="t-eyebrow mb-1">Product type</legend>
        <div className="flex flex-col gap-1.5">
          {PRODUCT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 t-body-sm text-ink">
              <input
                type="checkbox"
                name="type"
                value={t}
                defaultChecked={typeSet.has(t as ProductType)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              {t.replace("_", " ")}
            </label>
          ))}
        </div>
      </fieldset>

      {genres.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="t-eyebrow mb-1">Genre</legend>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {genres.map((g) => (
              <label key={g.slug} className="flex items-center gap-2 t-body-sm text-ink">
                <input
                  type="checkbox"
                  name="genre"
                  value={g.slug}
                  defaultChecked={genreSet.has(g.slug)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                {g.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {plugins.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="t-eyebrow mb-1">Required plugin</legend>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {plugins.map((p) => (
              <label key={p.slug} className="flex items-center gap-2 t-body-sm text-ink">
                <input
                  type="checkbox"
                  name="plugin"
                  value={p.slug}
                  defaultChecked={pluginSet.has(p.slug)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="t-eyebrow mb-1">BPM range</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${idPrefix}-bpmMin`}>Minimum BPM</label>
          <input
            id={`${idPrefix}-bpmMin`}
            name="bpmMin"
            type="number"
            min={1}
            max={400}
            inputMode="numeric"
            defaultValue={params.bpmMin ?? ""}
            placeholder="Min"
            className="h-10 w-full rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor={`${idPrefix}-bpmMax`}>Maximum BPM</label>
          <input
            id={`${idPrefix}-bpmMax`}
            name="bpmMax"
            type="number"
            min={1}
            max={400}
            inputMode="numeric"
            defaultValue={params.bpmMax ?? ""}
            placeholder="Max"
            className="h-10 w-full rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="t-eyebrow mb-1">Price (requires currency)</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${idPrefix}-priceMin`}>Minimum price</label>
          <input
            id={`${idPrefix}-priceMin`}
            name="priceMin"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={params.priceMin ?? ""}
            placeholder="Min"
            className="h-10 w-full rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor={`${idPrefix}-priceMax`}>Maximum price</label>
          <input
            id={`${idPrefix}-priceMax`}
            name="priceMax"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={params.priceMax ?? ""}
            placeholder="Max"
            className="h-10 w-full rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
        </div>
        <label className="t-body-sm text-ink-secondary" htmlFor={`${idPrefix}-currency`}>
          Currency
        </label>
        <select
          id={`${idPrefix}-currency`}
          name="currency"
          defaultValue={params.currency ?? ""}
          className="h-10 rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <option value="">Select currency…</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
        <p className="t-caption text-ink-muted">
          Prices can&apos;t be compared across currencies — pick one.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="t-eyebrow mb-1">Plugins</legend>
        <label className="flex items-center gap-2 t-body-sm text-ink">
          <input
            type="checkbox"
            name="pluginFree"
            value="1"
            defaultChecked={params.pluginFree}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          No required plugins only
        </label>
      </fieldset>

      {/* Preserve current sort; page intentionally omitted → resets to 1. */}
      <input type="hidden" name="sort" value={params.sort} />
    </>
  );
}

function FilterForm({
  params,
  genres,
  plugins,
  idPrefix,
  onSubmitted,
}: {
  params: CatalogParams;
  genres: PublicGenre[];
  plugins: PublicPlugin[];
  idPrefix: string;
  onSubmitted?: () => void;
}) {
  return (
    <form
      method="get"
      action="/catalog"
      className="flex flex-col gap-5"
      onSubmit={onSubmitted}
    >
      <FilterFields params={params} genres={genres} plugins={plugins} idPrefix={idPrefix} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">Apply filters</Button>
        <a
          href="/catalog"
          className="t-body-sm text-ink-secondary underline underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
        >
          Clear all
        </a>
      </div>
    </form>
  );
}

export interface CatalogFiltersProps {
  params: CatalogParams;
  genres: PublicGenre[];
  plugins: PublicPlugin[];
}

export function CatalogFilters({ params, genres, plugins }: CatalogFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {/* Mobile trigger */}
      <div className="lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <IconButton
              aria-label="Open filters"
              variant="outline"
              className="w-auto justify-start gap-2 px-4"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="t-body-sm">Filters</span>
            </IconButton>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(22rem,90vw)] overflow-y-auto border-r border-line bg-canvas p-4">
            <SheetTitle className="sr-only">Filters</SheetTitle>
            <SheetDescription className="sr-only">
              Filter the catalog by type, genre, plugin, BPM, and price.
            </SheetDescription>
            <h2 className="t-heading-3 mb-4 text-ink">Filters</h2>
            <FilterForm
              params={params}
              genres={genres}
              plugins={plugins}
              idPrefix="m"
              onSubmitted={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="t-heading-3 mb-4 text-ink">Filters</h2>
          <FilterForm params={params} genres={genres} plugins={plugins} idPrefix="d" />
        </div>
      </aside>
    </div>
  );
}

/** Sort pill links (progressive-enhancement: links, no JS). */
export function SortPills({
  current,
  hrefFor,
}: {
  current: CatalogParams;
  hrefFor: (sort: CatalogParams["sort"]) => string;
}) {
  return (
    <nav aria-label="Sort results" className="flex flex-wrap items-center gap-1.5">
      {SORT_OPTIONS.map((opt) => {
        const active = current.sort === opt.value || (opt.value === "newest" && (!current.sort || current.sort === "newest"));
        return (
          <a
            key={opt.value}
            href={hrefFor(opt.value)}
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
  );
}
