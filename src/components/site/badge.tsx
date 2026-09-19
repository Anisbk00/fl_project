import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface text-ink-secondary border border-line",
        brand: "bg-brand/12 text-brand border border-brand/30",
        info: "bg-info/15 text-info border border-info/35",
        success: "bg-success/15 text-success border border-success/35",
        warning: "bg-warning/15 text-warning-foreground border border-warning/40",
        danger: "bg-danger/15 text-danger border border-danger/35",
        outline: "bg-transparent text-ink-secondary border border-line-strong",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

export function Badge({ tone, className, children }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}
