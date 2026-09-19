import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A section eyebrow + heading + optional supporting description. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  id,
  align = "left",
  as: Tag = "h2",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  id?: string;
  align?: "left" | "center";
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 max-w-2xl",
        align === "center" && "mx-auto text-center items-center",
        className,
      )}
    >
      {eyebrow ? <span className="t-eyebrow">{eyebrow}</span> : null}
      <Tag id={id} className={cn(Tag === "h1" ? "t-display" : "t-heading-1", "text-ink")}>
        {title}
      </Tag>
      {description ? (
        <p className="t-body text-ink-secondary">{description}</p>
      ) : null}
    </div>
  );
}
