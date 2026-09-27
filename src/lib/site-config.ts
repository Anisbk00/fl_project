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
 */
export const siteConfig = {
  /** Working label only — not an approved brand name. Replace via env. */
  name: publicEnv.NEXT_PUBLIC_SITE_NAME,
  shortDescription:
    "Original DAW project files, stems, and sample packs for music producers — with full technical details before you buy.",
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  /** Monitored support mailbox ("" until configured — pages say so honestly). */
  supportAddress: publicEnv.NEXT_PUBLIC_SUPPORT_EMAIL,
} as const;

export type SiteConfig = typeof siteConfig;
