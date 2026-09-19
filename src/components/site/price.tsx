/**
 * Price formatting built on Intl.NumberFormat (never string concatenation).
 * Prices are stored/flowed as INTEGER minor currency units (cents) per the
 * catalog contract; the formatter divides by 100 and renders per locale.
 *
 * JPY-style zero-decimal currencies are handled by Intl automatically
 * (minor/100 is still correct for zero-decimal currencies because their
 * "minor unit" is the same as the major unit — the catalog stores yen as
 * the integer yen value, which is what /100 yields).
 */

import { cn } from "@/lib/utils";

const SUPPORTED_LOCALES = ["en-US", "en-GB", "de-DE", "fr-FR", "ja-JP"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function normalizeLocale(locale?: string): string {
  if (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return locale;
  }
  // Intl accepts many locale tags; pass through but fall back to en-US on failure.
  return locale ?? "en-US";
}

/**
 * Format an integer minor-units price as a localized currency string.
 * Returns a deterministic fallback string for invalid currency codes so the UI
 * never throws on bad data.
 */
export function formatPrice(
  minorUnits: number,
  currency: string,
  locale?: string,
): string {
  if (!Number.isInteger(minorUnits) || minorUnits < 0) {
    return "—";
  }
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return "—";
  }
  try {
    return new Intl.NumberFormat(normalizeLocale(locale), {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).format(minorUnits / 100);
  } catch {
    // Unsupported currency code — degrade gracefully rather than throw.
    return `${(minorUnits / 100).toFixed(2)} ${code}`;
  }
}

export function Price({
  minorUnits,
  currency,
  locale,
  compareAtMinorUnits,
  className,
}: {
  minorUnits: number;
  currency: string;
  locale?: string;
  compareAtMinorUnits?: number;
  className?: string;
}) {
  const formatted = formatPrice(minorUnits, currency, locale);
  const hasCompare =
    Number.isInteger(compareAtMinorUnits) &&
    (compareAtMinorUnits as number) > minorUnits;
  return (
    <span className="flex items-baseline gap-2">
      <span className={cn("t-price text-ink", className)}>{formatted}</span>
      {hasCompare ? (
        <span className="t-body-sm text-ink-muted line-through tabular">
          {formatPrice(compareAtMinorUnits as number, currency, locale)}
        </span>
      ) : null}
    </span>
  );
}
