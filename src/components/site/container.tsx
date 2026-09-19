import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Page-wide container with controlled gutters and a max width. */
export function Container({
  children,
  className,
  as: Tag = "div",
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "main" | "article" | "header" | "footer" | "nav";
  width?: "wide" | "narrow" | "prose";
}) {
  return (
    <Tag
      className={cn(
        width === "prose" ? "container-prose" : "container-shell",
        width === "narrow" && "max-w-[var(--container-narrow)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** A vertical section with consistent vertical rhythm. */
export function Section({
  children,
  className,
  id,
  "aria-labelledby": ariaLabelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={cn("py-12 sm:py-16 lg:py-20", className)}
    >
      {children}
    </section>
  );
}

/** Flex stack with a configurable gap (defaults to a content gap). */
export function Stack({
  children,
  className,
  gap = "1rem",
  direction = "col",
}: {
  children: ReactNode;
  className?: string;
  gap?: string;
  direction?: "col" | "row";
}) {
  return (
    <div
      className={cn("flex", direction === "col" ? "flex-col" : "flex-row", className)}
      style={{ gap }}
    >
      {children}
    </div>
  );
}

/** Responsive grid that collapses to one column on small screens. */
export function Grid({
  children,
  className,
  min = "16rem",
}: {
  children: ReactNode;
  className?: string;
  min?: string;
}) {
  return (
    <div
      className={cn("grid", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))`,
        gap: "1.25rem",
      }}
    >
      {children}
    </div>
  );
}
