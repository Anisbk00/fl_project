import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/site/badge";
import { Price } from "@/components/site/price";
import { ProductArtwork } from "@/components/site/product-artwork";
import { AudioPreview } from "@/components/site/audio-preview";
import { coverUrl, publicMediaUrl } from "@/features/catalog/seo";
import {
  PRODUCT_TYPE_LABELS,
  formatBytes,
  formatDuration,
  type ProductCardVM,
} from "@/features/catalog/view-models";

/**
 * Product card presentation component.
 *
 * Accessibility contract: the artwork and the title are SEPARATE sibling links
 * to the product detail page; the audio preview control is a separate sibling
 * too. There are NO nested interactive elements (no <button>/<input> inside an
 * <a>). This keeps the card keyboard-operable and avoids nested-focus issues.
 *
 * The card surfaces useful truthful metadata before purchase: product type,
 * DAW/version, BPM, key, duration, formats, file size, price. A compact audio
 * preview control renders ONLY when public preview audio exists.
 */
export function ProductCard({
  product,
  locale,
  className,
}: {
  product: ProductCardVM;
  locale?: string;
  className?: string;
}) {
  const meta = [
    product.dawName ? `${product.dawName}${product.dawVersion ? ` ${product.dawVersion}` : ""}` : null,
    product.bpm ? `${product.bpm} BPM` : null,
    product.musicalKey ?? null,
    product.durationSeconds ? formatDuration(product.durationSeconds) : null,
    product.totalSizeBytes ? formatBytes(product.totalSizeBytes) : null,
  ].filter(Boolean) as string[];

  const cover = coverUrl(product);
  const audioUrl = publicMediaUrl(product.audioPreviewPath);

  return (
    <article
      className={cn(
        "card-lift group flex flex-col overflow-hidden rounded-xl border border-line bg-surface",
        "focus-within:ring-2 focus-within:ring-[var(--focus)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--canvas)]",
        className,
      )}
    >
      <Link
        href={product.href}
        aria-label={`${product.title} — ${PRODUCT_TYPE_LABELS[product.productType]}`}
        className="relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)]"
      >
        <ProductArtwork seed={product.artworkSeed} coverUrl={cover} label={product.title} />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Badge tone="brand">{PRODUCT_TYPE_LABELS[product.productType]}</Badge>
          {product.free ? <Badge tone="success">Free</Badge> : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="t-heading-3 text-ink">
          <Link
            href={product.href}
            className="rounded hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] transition-colors duration-[var(--duration-base)]"
          >
            {product.title}
          </Link>
        </h3>
        {product.genres?.length ? (
          <p className="t-caption">{product.genres.join(" · ")}</p>
        ) : null}
        {meta.length ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 t-technical text-ink-muted">
            {meta.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : null}
        {product.formats?.length ? (
          <p className="t-caption text-ink-muted">{product.formats.join(" · ")}</p>
        ) : null}
        <div className="mt-2 flex items-end justify-between gap-3">
          <Price
            minorUnits={product.price}
            currency={product.currency}
            locale={locale}
            compareAtMinorUnits={product.compareAtPrice}
          />
          {audioUrl ? (
            <AudioPreview
              src={audioUrl}
              id={`card-${product.slug}`}
              label={product.title}
              variant="compact"
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
