import { publicEnv } from "@/lib/env/public";

/**
 * Central site configuration.
 *
 * The brand name is NOT approved. Per the master plan, `Audio Project Store`
 * is an explicitly documented *working label* only, replaceable in one place
 * (the NEXT_PUBLIC_SITE_NAME env var; default in src/lib/env/public.ts).
 * Do not invent a company history, social accounts, awards, sales counts,
 * ratings, or customer quotes.
 *
 * No support address is configured yet — `supportAddress` is a placeholder
 * flagged for replacement before launch.
 */
export const siteConfig = {
  /** Working label only — not an approved brand name. Replace via env. */
  name: publicEnv.NEXT_PUBLIC_SITE_NAME,
  shortDescription:
    "Original DAW project files, stems, and sample packs for music producers — with full technical details before you buy.",
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  /**
   * Placeholder. Replace with a real monitored mailbox before launch. Until
   * then the contact page clearly labels this as a placeholder.
   */
  supportAddress: "support@example.com",
  /** Truthful, restrained announcement shown in the header. No fake scarcity. */
  announcement:
    "Storefront shell in progress — catalog, checkout, and delivery arrive in later steps.",
} as const;

export type SiteConfig = typeof siteConfig;
