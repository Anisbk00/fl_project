import { cn } from "@/lib/utils";

/**
 * Original abstract brand mark — a rounded badge containing a stylized
 * waveform (EQ envelope). Authored locally as inline SVG; not copied from any
 * existing logo. Uses `currentColor` so it adapts to ink/brand contexts.
 *
 * Decorative by default (aria-hidden). Provide an `aria-label` via the parent
 * when the mark is the sole content of a link.
 */
export function BrandMark({
  className,
  decorative = true,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-7 w-7", className)}
      fill="none"
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
    >
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="8"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <g fill="currentColor">
        <rect x="8" y="14" width="2.5" height="6" rx="1.25" />
        <rect x="12" y="10" width="2.5" height="14" rx="1.25" />
        <rect x="16" y="7" width="2.5" height="18" rx="1.25" />
        <rect x="20" y="11" width="2.5" height="12" rx="1.25" />
        <rect x="24" y="14.5" width="2.5" height="5" rx="1.25" />
      </g>
    </svg>
  );
}

/** Wordmark stays real text (never an image). */
export function Wordmark({ name }: { name: string }) {
  return (
    <span className="t-label text-base font-semibold tracking-tight text-ink">
      {name}
    </span>
  );
}
