"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { IconButton } from "@/components/site/button";
import { BrandMark, Wordmark } from "@/components/site/brand-mark";
import { primaryNav } from "@/components/site/nav";
import { siteConfig } from "@/lib/site-config";

/**
 * Mobile navigation. Uses Radix Dialog (via shadcn Sheet), which provides:
 * focus trapping, Escape-to-close, focus return to the trigger, and
 * background-interaction prevention while open. The trigger is an icon-only
 * button with an accessible name. Keyboard operable; remains fully usable if
 * animation is disabled (prefers-reduced-motion strips transitions in CSS).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <IconButton aria-label="Open navigation menu" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </IconButton>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(20rem,85vw)] border-l border-line bg-canvas p-4"
      >
        <div className="flex items-center gap-2 px-2 pt-2">
          <BrandMark className="h-7 w-7 text-brand" />
          <Wordmark name={siteConfig.name} />
        </div>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Primary navigation for {siteConfig.name}.
        </SheetDescription>
        <nav
          aria-label="Primary"
          className="mt-4 flex flex-col gap-1 border-t border-line pt-4"
        >
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 t-body text-ink hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4 px-2">
          <Link
            href="/cart"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-3 t-body text-ink-secondary hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] block"
          >
            Cart (0)
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
