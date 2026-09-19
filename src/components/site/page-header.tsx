import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/site/container";

/** Inner-page hero: eyebrow + H1 + supporting description. */
export function PageHeader({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <Container as="section" className={cn("py-12 sm:py-16 lg:py-20", className)}>
      <div className="flex flex-col gap-4 max-w-2xl">
        {eyebrow ? <span className="t-eyebrow">{eyebrow}</span> : null}
        <h1 className="t-display text-ink">{title}</h1>
        {description ? (
          <p className="t-body-lg text-ink-secondary">{description}</p>
        ) : null}
      </div>
    </Container>
  );
}

/** Long-form prose wrapper with a sensible line length. */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Container as="div" width="prose" className={cn("py-8 sm:py-12", className)}>
      <div className="flex flex-col gap-4 t-body text-ink [&_h2]:t-heading-1 [&_h2]:mt-8 [&_h2]:text-ink [&_h3]:t-heading-2 [&_h3]:mt-6 [&_h3]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </div>
    </Container>
  );
}
