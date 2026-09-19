/**
 * Catalog view models — the typed seam between presentation and data.
 *
 * Presentation components depend ONLY on these interfaces, never on raw
 * Supabase rows. Step 3 maps published Supabase products into these shapes
 * via a mapper; until then, Step 2 consumes deterministic fictional fixtures
 * that implement the same interfaces.
 *
 * Money is integer minor currency units (cents) everywhere.
 */

export type ProductTypeVM =
  | "project_file"
  | "remake"
  | "stems"
  | "sample_pack";

export type LifecycleVM = "draft" | "published" | "archived";

export interface ProductPluginVM {
  name: string;
  minVersion?: string;
  required?: boolean;
}

export interface ProductCardVM {
  /** Stable id / fixture key. */
  slug: string;
  title: string;
  productType: ProductTypeVM;
  /** Integer minor currency units. 0 = free. */
  price: number;
  currency: string; // ISO 4217
  compareAtPrice?: number;
  bpm?: number;
  musicalKey?: string;
  dawName?: string;
  dawVersion?: string;
  durationSeconds?: number;
  totalSizeBytes?: number;
  formats?: string[];
  genres?: string[];
  plugins?: ProductPluginVM[];
  featured?: boolean;
  free?: boolean;
  /** Deterministic seed for abstract artwork generation. */
  artworkSeed: string;
  /**
   * Destination for the card. In Step 2 this points at the catalog shell
   * (product detail pages arrive in Step 3). Step 3 swaps this to
   * `/catalog/[slug]`.
   */
  href: string;
}

/** Human-readable label for a product type. */
export const PRODUCT_TYPE_LABELS: Record<ProductTypeVM, string> = {
  project_file: "Project File",
  remake: "Remake",
  stems: "Stems",
  sample_pack: "Sample Pack",
};

/** Format a byte size as a compact human label. */
export function formatBytes(bytes?: number): string | undefined {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return undefined;
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format seconds as m:ss (or h:mm:ss). */
export function formatDuration(seconds?: number): string | undefined {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return undefined;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}
