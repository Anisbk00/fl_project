"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, LinkButton } from "@/components/site/button";
import { Badge } from "@/components/site/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/components/site/price";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin-path";
import { saveProduct } from "@/app/control-7f3a9b2c/(protected)/actions";
import { type ActionResult, type FieldErrors } from "@/lib/admin/product-schema";

// ---------------------------------------------------------------------------
// Types — match the database row shapes (camelCased for the form's internal
// state). The Server Action converts back to snake_case before insert.
// ---------------------------------------------------------------------------

export interface ProductFormGenre {
  id: string;
  slug: string;
  name: string;
}

export interface ProductFormPlugin {
  id: string;
  slug: string;
  name: string;
  vendor: string | null;
}

export interface ProductFormPluginLink {
  id: string;
  minVersion: string | null;
  required: boolean;
}

export interface ProductFormValues {
  id?: string;
  rowVersion?: number;
  title: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  productType: "project_file" | "remake" | "stems" | "sample_pack";
  rightsStatus: "unreviewed" | "original" | "licensed" | "rejected";
  price: number;
  priceCurrency: string;
  compareAtPrice: number | null;
  dawName: string;
  dawVersion: string;
  bpm: number | null;
  musicalKey: string;
  durationSeconds: number | null;
  totalSizeBytes: number | null;
  includedFormats: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  selectedGenreIds: string[];
  selectedPlugins: ProductFormPluginLink[];
}

interface ProductFormProps {
  /** Initial values for the form. Omit (or pass `newProductDefaults`) for create. */
  initialValues: ProductFormValues;
  /** All genres, server-fetched. */
  genres: ProductFormGenre[];
  /** All plugins, server-fetched. */
  plugins: ProductFormPlugin[];
  /** Submit label (e.g. "Create product" vs "Save changes"). */
  submitLabel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG_REGEX = /^(?!-)[a-z0-9]+(?:-[a-z0-9]+)*(?<!-)$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 160);
}

function emptyOrUndefined(v: string | null | undefined): boolean {
  if (v == null) return true;
  return v.trim() === "";
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Action wrapper — adapts the form's onSubmit values to the Server Action
// signature and re-shapes the genres/plugins arrays.
// ---------------------------------------------------------------------------

async function saveActionAdapter(
  _prev: ActionResult,
  values: ProductFormValues,
): Promise<ActionResult> {
  return saveProduct({
    id: values.id,
    rowVersion: values.rowVersion,
    title: values.title,
    slug: values.slug,
    shortDescription: values.shortDescription,
    longDescription: emptyOrUndefined(values.longDescription) ? null : values.longDescription,
    productType: values.productType,
    rightsStatus: values.rightsStatus,
    price: values.price,
    priceCurrency: values.priceCurrency,
    compareAtPrice: values.compareAtPrice,
    dawName: emptyOrUndefined(values.dawName) ? null : values.dawName,
    dawVersion: emptyOrUndefined(values.dawVersion) ? null : values.dawVersion,
    bpm: values.bpm,
    musicalKey: emptyOrUndefined(values.musicalKey) ? null : values.musicalKey,
    durationSeconds: values.durationSeconds,
    totalSizeBytes: values.totalSizeBytes,
    includedFormats: emptyOrUndefined(values.includedFormats) ? null : values.includedFormats,
    featured: values.featured,
    seoTitle: emptyOrUndefined(values.seoTitle) ? null : values.seoTitle,
    seoDescription: emptyOrUndefined(values.seoDescription) ? null : values.seoDescription,
    genres: values.selectedGenreIds,
    plugins: values.selectedPlugins.map((p) => ({
      id: p.id,
      minVersion: emptyOrUndefined(p.minVersion) ? null : p.minVersion,
      required: p.required,
    })),
  });
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function FieldRow({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="t-label text-ink">
        {label}
      </Label>
      {children}
      {hint ? <p className="t-caption text-ink-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="t-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const INPUT_CLASS = cn(
  "h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink",
  "transition-[border-color,opacity] duration-[var(--duration-fast)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
  "disabled:opacity-60 disabled:cursor-not-allowed",
  "aria-[invalid=true]:border-danger",
);

const SELECT_TRIGGER_CLASS = cn(INPUT_CLASS, "h-11 w-full");

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProductForm({
  initialValues,
  genres,
  plugins,
  submitLabel,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(initialValues);
  const [slugTouched, setSlugTouched] = useState(false);

  // `useActionState` (React 19) — wraps an async function (state, payload)
  // → state. We pre-validate that the user is signed in (the protected
  // layout's `requireAdmin({ aal2: true })` already did the page-level check;
  // the action re-checks), so when the action returns a value (not a
  // redirect), it must be an `ActionResult` describing a failure.
  const [actionResult, formAction, isPending] = useActionState<
    ActionResult,
    ProductFormValues
  >(saveActionAdapter, { ok: false });

  // When the action returns (i.e. doesn't redirect), surface its errors.
  // The success path never returns — the action calls `redirect()`, which
  // throws NEXT_REDIRECT and triggers a navigation before this state lands.
  const fieldErrors: FieldErrors = actionResult?.errors ?? {};
  // Derive top-level error and the submitting flag during render (no setState
  // in effects — the linter and React 19 frown on it).
  const topError: string | null =
    actionResult && !actionResult.ok ? actionResult.message ?? null : null;
  const submitting = isPending;

  // --- Local handlers ------------------------------------------------------

  function update<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function onTitleBlur() {
    // Auto-generate slug from title if slug is empty or matches the slugified
    // previous title (i.e. user hasn't manually edited). Once the user types
    // in the slug field, mark it touched and stop overriding.
    if (slugTouched) return;
    const slug = slugify(values.title);
    const current = values.slug;
    if (emptyOrUndefined(current) || current === slugify(current)) {
      update("slug", slug);
    }
  }

  function toggleGenre(id: string, checked: boolean) {
    setValues((v) => {
      const set = new Set(v.selectedGenreIds);
      if (checked) set.add(id);
      else set.delete(id);
      return { ...v, selectedGenreIds: Array.from(set) };
    });
  }

  function setPluginLink(id: string, patch: Partial<ProductFormPluginLink>) {
    setValues((v) => {
      const exists = v.selectedPlugins.find((p) => p.id === id);
      let next: ProductFormPluginLink[];
      if (exists) {
        next = v.selectedPlugins.map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        );
      } else {
        next = [
          ...v.selectedPlugins,
          { id, minVersion: null, required: true, ...patch },
        ];
      }
      return { ...v, selectedPlugins: next };
    });
  }

  function unsetPluginLink(id: string) {
    setValues((v) => ({
      ...v,
      selectedPlugins: v.selectedPlugins.filter((p) => p.id !== id),
    }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // `useActionState`'s `dispatch` is wrapped in a transition internally,
    // so `isPending` flips to true synchronously and the spinner shows until
    // either the action returns a failure result or the action navigates
    // (NEXT_REDIRECT) on success.
    formAction(values);
  }

  // --- Derived -------------------------------------------------------------

  const pricePreview = useMemo(() => {
    const p = Number(values.price);
    if (!Number.isFinite(p) || p < 0) return "—";
    return formatPrice(Math.trunc(p), values.priceCurrency.toUpperCase() || "USD");
  }, [values.price, values.priceCurrency]);

  // --- Render --------------------------------------------------------------

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8" aria-busy={submitting || undefined}>
      {topError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/5 p-4 t-body-sm text-danger"
        >
          {topError}
        </div>
      ) : null}

      {/* Section: Basics ----------------------------------------------------*/}
      <fieldset className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <legend className="t-heading-3 text-ink px-1">Basics</legend>
        <FieldRow
          id="title"
          label="Title"
          hint="Shown on the product card and detail page. 1–200 characters."
          error={fieldErrors.title}
        >
          <Input
            id="title"
            type="text"
            required
            maxLength={200}
            value={values.title}
            onChange={(e) => update("title", e.target.value)}
            onBlur={onTitleBlur}
            disabled={submitting}
            className={INPUT_CLASS}
            aria-invalid={!!fieldErrors.title || undefined}
          />
        </FieldRow>

        <FieldRow
          id="slug"
          label="Slug"
          hint="Lowercase kebab-case (a–z, 0–9, hyphens between segments). Used in the public URL /products/{slug}."
          error={fieldErrors.slug}
        >
          <Input
            id="slug"
            type="text"
            required
            pattern={SLUG_REGEX.source}
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update("slug", e.target.value.toLowerCase());
            }}
            disabled={submitting}
            className={cn(INPUT_CLASS, "t-technical")}
            aria-invalid={!!fieldErrors.slug || undefined}
          />
        </FieldRow>

        <FieldRow
          id="shortDescription"
          label="Short description"
          hint="1–300 characters. Shown on the product card."
          error={fieldErrors.shortDescription}
        >
          <Textarea
            id="shortDescription"
            required
            maxLength={300}
            value={values.shortDescription}
            onChange={(e) => update("shortDescription", e.target.value)}
            disabled={submitting}
            className={INPUT_CLASS}
            aria-invalid={!!fieldErrors.shortDescription || undefined}
          />
        </FieldRow>

        <FieldRow
          id="longDescription"
          label="Long description"
          hint="Optional, max 20,000 characters. Markdown is supported on the public detail page."
          error={fieldErrors.longDescription}
        >
          <Textarea
            id="longDescription"
            maxLength={20000}
            value={values.longDescription ?? ""}
            onChange={(e) => update("longDescription", e.target.value)}
            disabled={submitting}
            className={cn(INPUT_CLASS, "min-h-32")}
          />
        </FieldRow>
      </fieldset>

      {/* Section: Pricing + classification ----------------------------------*/}
      <fieldset className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <legend className="t-heading-3 text-ink px-1">Pricing &amp; classification</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow
            id="productType"
            label="Product type"
            error={fieldErrors.productType}
          >
            <Select
              value={values.productType}
              onValueChange={(v) =>
                update("productType", v as ProductFormValues["productType"])
              }
              disabled={submitting}
            >
              <SelectTrigger id="productType" className={SELECT_TRIGGER_CLASS} aria-invalid={!!fieldErrors.productType || undefined}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project_file">Project File</SelectItem>
                <SelectItem value="remake">Remake</SelectItem>
                <SelectItem value="stems">Stems</SelectItem>
                <SelectItem value="sample_pack">Sample Pack</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow
            id="rightsStatus"
            label="Rights status"
            hint="Required to be “original” or “licensed” before publishing."
            error={fieldErrors.rightsStatus}
          >
            <Select
              value={values.rightsStatus}
              onValueChange={(v) =>
                update("rightsStatus", v as ProductFormValues["rightsStatus"])
              }
              disabled={submitting}
            >
              <SelectTrigger id="rightsStatus" className={SELECT_TRIGGER_CLASS} aria-invalid={!!fieldErrors.rightsStatus || undefined}>
                <SelectValue placeholder="Select rights" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="original">Original</SelectItem>
                <SelectItem value="licensed">Licensed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldRow
            id="price"
            label="Price (minor units)"
            hint="Integer cents. 2400 = $24.00. Use 0 for free."
            error={fieldErrors.price}
          >
            <Input
              id="price"
              type="number"
              required
              min={0}
              step={1}
              value={Number.isFinite(values.price) ? values.price : 0}
              onChange={(e) => update("price", Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
              disabled={submitting}
              className={INPUT_CLASS}
              aria-invalid={!!fieldErrors.price || undefined}
            />
          </FieldRow>

          <FieldRow
            id="priceCurrency"
            label="Currency"
            hint="3-letter ISO 4217 (e.g. USD, EUR, GBP)."
            error={fieldErrors.priceCurrency}
          >
            <Input
              id="priceCurrency"
              type="text"
              required
              pattern="^[A-Z]{3}$"
              maxLength={3}
              value={values.priceCurrency}
              onChange={(e) => update("priceCurrency", e.target.value.toUpperCase())}
              disabled={submitting}
              className={cn(INPUT_CLASS, "t-technical uppercase")}
              aria-invalid={!!fieldErrors.priceCurrency || undefined}
            />
          </FieldRow>

          <FieldRow
            id="compareAtPrice"
            label="Compare-at price"
            hint="Optional. Must be ≥ price."
            error={fieldErrors.compareAtPrice}
          >
            <Input
              id="compareAtPrice"
              type="number"
              min={0}
              step={1}
              value={values.compareAtPrice ?? ""}
              onChange={(e) => update("compareAtPrice", numOrNull(e.target.value))}
              disabled={submitting}
              className={INPUT_CLASS}
              aria-invalid={!!fieldErrors.compareAtPrice || undefined}
            />
          </FieldRow>
        </div>

        <div className="rounded-md border border-line bg-surface-inset/40 p-3 flex items-center gap-3">
          <span className="t-caption text-ink-muted">Live preview:</span>
          <span className="t-price text-ink">{pricePreview}</span>
          {values.compareAtPrice != null && values.compareAtPrice > values.price ? (
            <span className="t-body-sm text-ink-muted line-through">
              {formatPrice(values.compareAtPrice, values.priceCurrency || "USD")}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="featured"
            checked={values.featured}
            onCheckedChange={(v) => update("featured", v)}
            disabled={submitting}
          />
          <Label htmlFor="featured" className="t-label text-ink cursor-pointer">
            Featured
          </Label>
          <span className="t-caption text-ink-muted">
            Featured products are surfaced on the home page.
          </span>
        </div>
      </fieldset>

      {/* Section: Compatibility ---------------------------------------------*/}
      <fieldset className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <legend className="t-heading-3 text-ink px-1">Compatibility &amp; technical</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow
            id="dawName"
            label="DAW name"
            hint="e.g. FL Studio, Ableton Live, Logic Pro."
            error={fieldErrors.dawName}
          >
            <Input
              id="dawName"
              type="text"
              maxLength={100}
              value={values.dawName ?? ""}
              onChange={(e) => update("dawName", e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </FieldRow>

          <FieldRow
            id="dawVersion"
            label="DAW version"
            hint="e.g. 21, 12.0.5."
            error={fieldErrors.dawVersion}
          >
            <Input
              id="dawVersion"
              type="text"
              maxLength={100}
              value={values.dawVersion ?? ""}
              onChange={(e) => update("dawVersion", e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </FieldRow>

          <FieldRow
            id="bpm"
            label="BPM"
            hint="1–400."
            error={fieldErrors.bpm}
          >
            <Input
              id="bpm"
              type="number"
              min={1}
              max={400}
              step={1}
              value={values.bpm ?? ""}
              onChange={(e) => update("bpm", numOrNull(e.target.value))}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </FieldRow>

          <FieldRow
            id="musicalKey"
            label="Musical key"
            hint="e.g. F# minor, C major."
            error={fieldErrors.musicalKey}
          >
            <Input
              id="musicalKey"
              type="text"
              maxLength={50}
              value={values.musicalKey ?? ""}
              onChange={(e) => update("musicalKey", e.target.value)}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </FieldRow>

          <FieldRow
            id="durationSeconds"
            label="Duration (seconds)"
            hint="≥ 1."
            error={fieldErrors.durationSeconds}
          >
            <Input
              id="durationSeconds"
              type="number"
              min={1}
              step={1}
              value={values.durationSeconds ?? ""}
              onChange={(e) => update("durationSeconds", numOrNull(e.target.value))}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </FieldRow>

          <FieldRow
            id="totalSizeBytes"
            label="Total size (bytes)"
            hint="≥ 0. Sum of all deliverable file sizes."
            error={fieldErrors.totalSizeBytes}
          >
            <Input
              id="totalSizeBytes"
              type="number"
              min={0}
              step={1}
              value={values.totalSizeBytes ?? ""}
              onChange={(e) => update("totalSizeBytes", numOrNull(e.target.value))}
              disabled={submitting}
              className={INPUT_CLASS}
            />
          </FieldRow>
        </div>

        <FieldRow
          id="includedFormats"
          label="Included formats"
          hint="Comma-separated, e.g. “.flp, .zip, stems”."
          error={fieldErrors.includedFormats}
        >
          <Input
            id="includedFormats"
            type="text"
            maxLength={300}
            value={values.includedFormats ?? ""}
            onChange={(e) => update("includedFormats", e.target.value)}
            disabled={submitting}
            className={INPUT_CLASS}
          />
        </FieldRow>
      </fieldset>

      {/* Section: Taxonomy --------------------------------------------------*/}
      <fieldset className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <legend className="t-heading-3 text-ink px-1">Genres &amp; plugins</legend>

        {genres.length === 0 && plugins.length === 0 ? (
          <p className="t-body-sm text-ink-secondary">
            No genres or plugins exist yet. Add some on the{" "}
            <LinkButton href="/control-7f3a9b2c/taxonomies" variant="outline" size="sm" className="px-0 py-0 border-0 bg-transparent hover:bg-transparent">
              taxonomies
            </LinkButton>{" "}
            page first.
          </p>
        ) : null}

        {genres.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label className="t-label text-ink">Genres</Label>
            <p className="t-caption text-ink-muted">
              Choose all the genres this product belongs to.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {genres.map((g) => {
                const checked = values.selectedGenreIds.includes(g.id);
                return (
                  <label
                    key={g.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer",
                      checked
                        ? "border-brand/50 bg-brand/5"
                        : "border-line bg-canvas",
                      "transition-colors duration-[var(--duration-fast)]",
                      "focus-within:ring-2 focus-within:ring-[var(--focus)]",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleGenre(g.id, v === true)}
                      disabled={submitting}
                      aria-label={g.name}
                    />
                    <span className="t-body-sm text-ink">{g.name}</span>
                    <span className="t-technical text-ink-muted ml-auto">{g.slug}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {plugins.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label className="t-label text-ink">Plugins</Label>
            <p className="t-caption text-ink-muted">
              Tick each plugin this product requires or recommends. Add a minimum
              version if relevant.
            </p>
            <div className="flex flex-col gap-2">
              {plugins.map((p) => {
                const link = values.selectedPlugins.find((x) => x.id === p.id);
                const checked = !!link;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center",
                      checked ? "border-brand/50 bg-brand/5" : "border-line bg-canvas",
                    )}
                  >
                    <label className="flex items-center gap-2.5 sm:w-64 flex-1 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          if (v === true) {
                            setPluginLink(p.id, { minVersion: null, required: true });
                          } else {
                            unsetPluginLink(p.id);
                          }
                        }}
                        disabled={submitting}
                        aria-label={p.name}
                      />
                      <span className="t-body-sm text-ink">{p.name}</span>
                      {p.vendor ? (
                        <Badge tone="neutral" className="ml-auto">
                          {p.vendor}
                        </Badge>
                      ) : null}
                    </label>

                    {checked ? (
                      <div className="flex items-center gap-3 sm:ml-auto">
                        <label className="flex items-center gap-2">
                          <span className="t-caption text-ink-muted">Min version</span>
                          <Input
                            type="text"
                            maxLength={50}
                            value={link?.minVersion ?? ""}
                            onChange={(e) =>
                              setPluginLink(p.id, { minVersion: e.target.value })
                            }
                            disabled={submitting}
                            className={cn(INPUT_CLASS, "h-9 w-32")}
                            placeholder="e.g. 1.3"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <Switch
                            checked={link?.required ?? true}
                            onCheckedChange={(v) =>
                              setPluginLink(p.id, { required: v })
                            }
                            disabled={submitting}
                            aria-label={`${p.name} required`}
                          />
                          <span className="t-caption text-ink-muted">
                            {link?.required ? "Required" : "Optional"}
                          </span>
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </fieldset>

      {/* Section: SEO -------------------------------------------------------*/}
      <fieldset className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <legend className="t-heading-3 text-ink px-1">SEO</legend>
        <FieldRow
          id="seoTitle"
          label="SEO title"
          hint="Optional. Defaults to the product title."
          error={fieldErrors.seoTitle}
        >
          <Input
            id="seoTitle"
            type="text"
            maxLength={200}
            value={values.seoTitle ?? ""}
            onChange={(e) => update("seoTitle", e.target.value)}
            disabled={submitting}
            className={INPUT_CLASS}
          />
        </FieldRow>
        <FieldRow
          id="seoDescription"
          label="SEO description"
          hint="Optional, max 300 characters."
          error={fieldErrors.seoDescription}
        >
          <Textarea
            id="seoDescription"
            maxLength={300}
            value={values.seoDescription ?? ""}
            onChange={(e) => update("seoDescription", e.target.value)}
            disabled={submitting}
            className={INPUT_CLASS}
          />
        </FieldRow>
      </fieldset>

      {/* Submit row --------------------------------------------------------*/}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={submitting} size="lg">
          {submitting ? "Saving…" : submitLabel}
        </Button>
        <LinkButton href={ADMIN_PRODUCTS_PATH} variant="outline" size="lg">
          Cancel
        </LinkButton>
        {values.id ? (
          <LinkButton
            href={`/control-7f3a9b2c/products/${values.id}/preview`}
            variant="ghost"
            size="lg"
          >
            Preview
          </LinkButton>
        ) : null}
      </div>
    </form>
  );
}
