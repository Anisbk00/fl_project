"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ADMIN_AUDIT_PATH,
  ADMIN_DASHBOARD_PATH,
  ADMIN_ORDERS_PATH,
  ADMIN_PRODUCTS_PATH,
  ADMIN_SECURITY_PATH,
  ADMIN_TAXONOMIES_PATH,
} from "@/lib/admin-path";
import { logout } from "@/app/control-7f3a9b2c/(protected)/actions";

const LINKS = [
  { href: ADMIN_DASHBOARD_PATH, label: "Dashboard" },
  { href: ADMIN_ORDERS_PATH, label: "Orders" },
  { href: ADMIN_PRODUCTS_PATH, label: "Products" },
  { href: ADMIN_TAXONOMIES_PATH, label: "Taxonomies" },
  { href: ADMIN_AUDIT_PATH, label: "Audit log" },
  { href: ADMIN_SECURITY_PATH, label: "Security" },
] as const;

/** Admin section navigation. Scrolls horizontally on narrow screens. */
export function AdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === ADMIN_DASHBOARD_PATH ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Admin" className="flex items-center gap-1 overflow-x-auto border-b border-line mb-6 -mx-1 px-1">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? "page" : undefined}
          className="whitespace-nowrap px-3 py-2.5 t-body-sm text-ink-secondary hover:text-ink border-b-2 border-transparent aria-[current=page]:border-brand aria-[current=page]:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded-t"
        >
          {l.label}
        </Link>
      ))}
      <form action={logout} className="ml-auto">
        <button type="submit" className="whitespace-nowrap px-3 py-2.5 t-body-sm text-ink-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded">
          Sign out
        </button>
      </form>
    </nav>
  );
}
