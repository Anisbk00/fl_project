/**
 * Price formatting built on Intl.NumberFormat (never string concatenation).
 * Prices are stored/flowed as INTEGER minor currency units (Stripe's
 * convention). Zero-decimal currencies (JPY, KRW, …) have no minor unit:
 * 1500 means ¥1500, so they must NOT be divided by 100 — otherwise the page
 * would show ¥15 while Stripe charges ¥1500.
 */

import { cn } from "@/lib/utils";
import { isZeroDecimalCurrency } from "@/features/payments/money";

const SUPPORTED_LOCALES = ["en-US", "en-GB", "de-DE", "fr-FR", "ja-JP"] as const;

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
  const major = isZeroDecimalCurrency(code) ? minorUnits : minorUnits / 100;
  try {
    return new Intl.NumberFormat(normalizeLocale(locale), {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).format(major);
  } catch {
    // Unsupported currency code — degrade gracefully rather than throw.
    return `${major} ${code}`;
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
