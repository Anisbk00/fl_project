/**
 * Cookie + browser-storage inventory (Step 7).
 *
 * Documents every cookie/storage key actually used by the application.
 * At the end of Step 7: no advertising trackers, no social pixels, no
 * fingerprinting, no cross-site behavioral tracking, no heatmaps/session
 * recording, no optional analytics storage.
 */

export interface CookieEntry {
  name: string;
  purpose: string;
  scope: "session" | "first-party" | "admin";
  lifetime: string;
  dataCategory: "strictly_necessary" | "authentication" | "cart" | "download_access" | "analytics" | "marketing";
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
  strictlyNecessary: boolean;
}

export const COOKIE_INVENTORY: readonly CookieEntry[] = [
  {
    name: "__Host-mp_cart",
    purpose: "Guest shopping cart token (server-owned, HMAC-digested)",
    scope: "first-party",
    lifetime: "30 days",
    dataCategory: "cart",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    strictlyNecessary: true,
  },
  {
    name: "mp_cart",
    purpose: "Guest shopping cart token (localhost dev — __Host- requires Secure)",
    scope: "first-party",
    lifetime: "30 days",
    dataCategory: "cart",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
    strictlyNecessary: true,
  },
  {
    name: "sb-<project-ref>-auth-token",
    purpose: "Supabase Auth admin session (admin-only; no buyer auth)",
    scope: "admin",
    lifetime: "session + refresh",
    dataCategory: "authentication",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    strictlyNecessary: true,
  },
  {
    name: "__Host-mp_download_session",
    purpose: "Short-lived private download access session (Step 6)",
    scope: "first-party",
    lifetime: "30 minutes",
    dataCategory: "download_access",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    strictlyNecessary: true,
  },
];

/** True if any non-strictly-necessary storage exists. */
export function hasOptionalStorage(): boolean {
  return COOKIE_INVENTORY.some((c) => !c.strictlyNecessary);
}

/** True if any analytics/marketing/tracking storage exists. */
export function hasTrackingStorage(): boolean {
  return COOKIE_INVENTORY.some(
    (c) => c.dataCategory === "analytics" || c.dataCategory === "marketing",
  );
}

/** The site uses ONLY strictly-necessary cookies → no decorative cookie banner. */
export function shouldShowCookieBanner(): boolean {
  return hasOptionalStorage() || hasTrackingStorage();
}
