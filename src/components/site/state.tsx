import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TriangleAlert, SearchX, PackageOpen } from "lucide-react";
import { Grid } from "@/components/site/container";

/** Empty / error / loading presentation patterns. */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  titleAs = "h3",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Heading level for the title. Page-level empty states should use h1. */
  titleAs?: "h1" | "h2" | "h3";
}) {
  const Tag = titleAs;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-inset/40 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-ink-muted" aria-hidden="true">
        {icon ?? <PackageOpen className="h-8 w-8" />}
      </div>
      <Tag className={cn(titleAs === "h1" ? "t-heading-1" : "t-heading-3", "text-ink")}>
        {title}
      </Tag>
      {description ? (
        <p className="t-body-sm text-ink-secondary max-w-md">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred while rendering this page.",
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/40 bg-danger/5 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-danger" aria-hidden="true">
        <TriangleAlert className="h-8 w-8" />
      </div>
      <h3 className="t-heading-3 text-ink">{title}</h3>
      <p className="t-body-sm text-ink-secondary max-w-md">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** A neutral "no results" state for catalog contexts. */
export function NoResultsState({
  description,
  action,
}: {
  description?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={<SearchX className="h-8 w-8" />}
      title="No products found"
      description={
        description ??
        "There are no products matching this view yet. Try adjusting your filters."
      }
      action={action}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="aspect-[4/3] w-full skeleton rounded-none" />
      <div className="p-4 flex flex-col gap-2">
        <div className="h-4 w-2/3 skeleton" />
        <div className="h-3 w-1/2 skeleton" />
        <div className="mt-2 h-5 w-1/3 skeleton" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <Grid>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </Grid>
  );
}
