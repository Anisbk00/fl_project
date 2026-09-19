import { cn } from "@/lib/utils";

/**
 * Original abstract technical visual for the home hero — a wide waveform
 * envelope with routing nodes and a faint grid, authored locally as inline
 * SVG/CSS. No stock or copyrighted artwork. Decorative (hidden from AT).
 */
export function HeroVisual({ className }: { className?: string }) {
  const bars = Array.from({ length: 48 }, (_, i) => {
    // deterministic pseudo-envelope (sine + harmonics), never random
    const t = i / 47;
    const env =
      0.5 +
      0.35 * Math.sin(Math.PI * t * 2.0) +
      0.12 * Math.sin(Math.PI * t * 6.0 + 1.3);
    const h = Math.max(0.04, Math.min(0.96, env)) * 100;
    return { x: i, h };
  });
  return (
    <div
      className={cn(
        "relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-line bg-surface-inset",
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 56"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.22 0.006 250)" />
            <stop offset="100%" stopColor="oklch(0.13 0.004 250)" />
          </linearGradient>
        </defs>
        <rect width="100" height="56" fill="url(#hero-bg)" />
        {/* routing grid */}
        {[8, 20, 32, 44].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="oklch(1 0 0 / 0.04)" strokeWidth="0.2" />
        ))}
        {[10, 25, 40, 55, 70, 85].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="56" stroke="oklch(1 0 0 / 0.03)" strokeWidth="0.15" />
        ))}
        {/* routing path */}
        <path
          d="M4 28 Q 20 8 36 28 T 68 28 T 96 28"
          fill="none"
          stroke="oklch(0.72 0.12 270 / 0.6)"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        {/* routing nodes */}
        {[
          [4, 28],
          [36, 28],
          [68, 28],
          [96, 28],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.1" fill="oklch(0.72 0.12 270)" />
        ))}
        {/* waveform bars */}
        {bars.map((b, i) => {
          const bw = 100 / bars.length;
          const x = i * bw + bw * 0.15;
          const w = bw * 0.7;
          const h = b.h * 0.42;
          const y = 28 - h / 2 + 8;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={w / 3}
              fill="oklch(0.86 0.19 128)"
              opacity="0.78"
            />
          );
        })}
      </svg>
    </div>
  );
}
