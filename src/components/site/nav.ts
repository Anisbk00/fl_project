/** Shared public navigation destinations for header + mobile menu. */

export interface NavItem {
  label: string;
  href: string;
}

/**
 * Category links are represented as query targets (`?type=`) that Step 3 will
 * honor against the live catalog. They are NOT non-working filter widgets —
 * they are plain links to a valid route.
 */
export const primaryNav: readonly NavItem[] = [
  { label: "Catalog", href: "/catalog" },
  { label: "Project Files", href: "/catalog?type=project_file" },
  { label: "Stems", href: "/catalog?type=stems" },
  { label: "Sample Packs", href: "/catalog?type=sample_pack" },
  { label: "Free", href: "/free" },
  { label: "About", href: "/about" },
];

export const footerNav: ReadonlyArray<{ heading: string; items: readonly NavItem[] }> = [
  {
    heading: "Shop",
    items: [
      { label: "Catalog", href: "/catalog" },
      { label: "Free Downloads", href: "/free" },
      { label: "Cart", href: "/cart" },
    ],
  },
  {
    heading: "Store",
    items: [
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Legal",
    items: [
      { label: "License", href: "/legal/license" },
      { label: "Refunds", href: "/legal/refunds" },
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
];
