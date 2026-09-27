"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thin top progress bar shown between clicking an internal link and the new
 * route rendering. Starts on any same-origin <a> click that changes the URL,
 * finishes when pathname/search params change.
 */
export function NavProgress() {
  const url = `${usePathname()}?${useSearchParams().toString()}`;
  // URL the pending navigation started from; the bar finishes once we've left it.
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const state = startedFrom === null ? "idle" : startedFrom === url ? "loading" : "done";

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const next = new URL(a.href, location.href);
      if (next.origin !== location.origin) return;
      if (next.pathname === location.pathname && next.search === location.search) return;
      setStartedFrom(url);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [url]);

  return <div className="nav-progress" data-state={state} aria-hidden="true" />;
}
