import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared button styling. Used by both <Button> (a real <button>) and
 * <LinkButton> (a Next <Link> styled as a button), so interactive and
 * navigational affordances stay visually consistent.
 *
 * States: hover, active, focus-visible (2px chartreuse ring), disabled
 * (reduced opacity + not-allowed + inert), and loading-safe (a spinner that
 * does not shift layout, and the label is kept for screen readers).
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold",
    "transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-standard)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas)]",
    "disabled:opacity-50 disabled:pointer-events-none aria-busy:opacity-80",
    "active:scale-[0.97] active:duration-[var(--duration-fast)]",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-foreground hover:brightness-110 shadow-[var(--shadow-sm)]",
        secondary:
          "bg-surface-elevated text-ink border border-line-strong hover:border-brand/60",
        outline:
          "bg-transparent text-ink border border-line-strong hover:border-brand hover:text-brand",
        ghost: "bg-transparent text-ink hover:bg-surface-elevated",
        danger:
          "bg-danger text-danger-foreground hover:brightness-110 shadow-[var(--shadow-sm)]",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant,
  size,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner label="Loading" /> : null}
      {children}
    </button>
  );
}

export interface LinkButtonProps {
  href: string;
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** Icon-only button. An accessible name is required (no visual label). */
export function IconButton({
  href,
  variant = "ghost",
  size = "icon",
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps & { href?: string }) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={ariaLabel} {...props}>
      {children}
    </button>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <title>{label}</title>
    </svg>
  );
}
