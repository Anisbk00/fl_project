import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/site/badge";
import { Price } from "@/components/site/price";
import { ProductArtwork } from "@/components/site/product-artwork";
import {
  PRODUCT_TYPE_LABELS,
  formatBytes,
  formatDuration,
  type ProductCardVM,
} from "@/features/catalog/view-models";

/**
 * Product card presentation component. The entire card is a single Next <Link>
 * (the product title and artwork are inside it) — there are NO nested
 * interactive controls, per the accessibility contract. Secondary actions
 * (e.g. add-to-cart) belong to Step 5 and will be separate siblings, not
 * nested inside this card.
 *
 * The card surfaces useful technical metadata before purchase: product type,
 * DAW/version, BPM, key, duration, formats, file size, price.
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

  return (
    <Link
      href={product.href}
      aria-label={`${product.title} — ${PRODUCT_TYPE_LABELS[product.productType]}`}
      className={cn(
        "card-lift group flex flex-col overflow-hidden rounded-xl border border-line bg-surface",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)]",
        className,
      )}
    >
      <div className="relative">
        <ProductArtwork seed={product.artworkSeed} />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <Badge tone="brand">{PRODUCT_TYPE_LABELS[product.productType]}</Badge>
          {product.free ? <Badge tone="success">Free</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="t-heading-3 text-ink group-hover:text-brand transition-colors duration-[var(--duration-base)]">
          {product.title}
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
          <p className="t-caption text-ink-muted">
            {product.formats.join(" · ")}
          </p>
        ) : null}
        <div className="mt-auto pt-2">
          <Price
            minorUnits={product.price}
            currency={product.currency}
            locale={locale}
            compareAtMinorUnits={product.compareAtPrice}
          />
        </div>
      </div>
    </Link>
  );
}
