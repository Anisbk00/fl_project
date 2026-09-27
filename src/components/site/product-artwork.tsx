import Image from "next/image";
import { cn } from "@/lib/utils";
import { publicEnv } from "@/lib/env/public";

/**
 * Original, locally authored abstract cover treatment.
 *
 * Given a deterministic `seed`, renders a waveform/EQ-envelope SVG on the
 * graphite canvas with chartreuse bars (and a sparing violet accent) — no
 * copied artwork, no external images. Stable aspect ratio (4:3) prevents
 * layout shift. Deterministic so screenshots/tests are stable.
 *
 * Decorative: it carries no information a screen reader needs, so it is
 * hidden from AT. The product title (real text) is the accessible label.
 */
function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BAR_COUNT = 16;

function barsFromSeed(seed: string): number[] {
  let h = seedHash(seed);
  const out: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    // LCG over the hash for stable pseudo-random heights 0..1.
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) + 0x9e3779b9;
    h = h >>> 0;
    out.push((h % 1000) / 1000);
  }
  return out;
}

export function ProductArtwork({
  seed,
  className,
  label,
  coverUrl,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  priority = false,
}: {
  seed: string;
  className?: string;
  label?: string;
  /** Live public cover URL. When provided, the cover renders; else abstract SVG. */
  coverUrl?: string | null;
  /** Rendered width hints for responsive image variants. */
  sizes?: string;
  /** Load eagerly (use for the above-the-fold product hero / LCP image). */
  priority?: boolean;
}) {
  if (coverUrl) {
    return (
      <div
        className={cn(
          "relative aspect-[4/3] w-full overflow-hidden bg-surface-inset",
          className,
        )}
      >
        <Image
          src={coverUrl}
          alt={label ? `${label} — cover` : "Product cover"}
          fill
          sizes={sizes}
          priority={priority}
          // Supabase-hosted covers are resized by the image optimizer; external
          // https covers (not in remotePatterns) are served as-is.
          unoptimized={!isOptimizable(coverUrl)}
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <AbstractWaveform seed={seed} className={cn("aspect-[4/3] w-full bg-surface-inset", className)} label={label} />
  );
}

function isOptimizable(url: string): boolean {
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  return !!base && url.startsWith(`${base.replace(/\/$/, "")}/storage/v1/object/public/`);
}

function AbstractWaveform({
  seed,
  className,
  label,
}: {
  seed: string;
  className?: string;
  label?: string;
}) {
  const heights = barsFromSeed(seed);
  const gap = 100 / (BAR_COUNT * 2 + 1);
  const bw = gap;
  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden bg-surface-inset",
        className,
      )}
      aria-hidden="true"
    >
      {/* subtle routing-line grid motif */}
      <svg
        viewBox="0 0 100 75"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id={`g-${seed}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.21 0.006 250)" />
            <stop offset="100%" stopColor="oklch(0.14 0.004 250)" />
          </linearGradient>
        </defs>
        <rect width="100" height="75" fill={`url(#g-${seed})`} />
        {/* faint horizontal routing lines */}
        {[15, 30, 45, 60].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="oklch(1 0 0 / 0.04)"
            strokeWidth="0.25"
          />
        ))}
        {/* waveform bars */}
        {heights.map((height, i) => {
          const x = gap + i * (bw + gap);
          const h = 4 + height * 60;
          const y = (75 - h) / 2;
          const isAccent = i === Math.floor(heights.length / 2);
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={bw}
              height={h}
              rx={bw / 3}
              fill={isAccent ? "oklch(0.72 0.12 270)" : "oklch(0.86 0.19 128)"}
              opacity={isAccent ? 0.85 : 0.55 + height * 0.4}
            />
          );
        })}
      </svg>
      {label ? (
        <span className="absolute bottom-2 left-2 t-caption rounded bg-canvas/70 px-1.5 py-0.5 text-ink-secondary backdrop-blur">
          {label}
        </span>
      ) : null}
    </div>
  );
}
