import { z } from "zod";

/**
 * Public environment variables.
 *
 * These are safe to expose to the browser (they use the Supabase publishable
 * key, and Row-Level Security is the real access boundary — never the key).
 *
 * Validation strategy: these variables are validated EAGERLY at module load
 * with safe development defaults. This means the application builds and the
 * development server boots WITHOUT any real production secrets present, which
 * satisfies the "build succeeds without real production secrets" acceptance
 * criterion while still surfacing invalid configurations at runtime.
 *
 * The Supabase URL / publishable key are OPTIONAL in Step 1 because the
 * minimal placeholder home page does not query Supabase. Step 3 (catalog) and
 * Step 4 (admin) will require them; at that point they should be treated as
 * required and validated accordingly.
 */

/**
 * Normalize a raw env value: treat `undefined`, empty string, and
 * whitespace-only strings as "unset" (return undefined) so Zod's `.default()`
 * kicks in. This is the difference between a build that succeeds with safe
 * fallbacks and a build that CRASHES during prerender when an env var is
 * present-but-empty — a common Vercel misconfiguration (env var added with no
 * value, or set in the wrong scope).
 *
 * Non-empty strings are returned as-is so real configuration still flows
 * through and is validated normally.
 */
function emptyToUndefined<T>(v: T | undefined): T | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url("NEXT_PUBLIC_SITE_URL must be an absolute URL")
    .default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z
    .string()
    .min(1, "NEXT_PUBLIC_SITE_NAME must not be empty")
    .default("Audio Project Store"),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .url("NEXT_PUBLIC_SUPABASE_URL must be an absolute URL when set")
    .or(z.literal(""))
    .default(""),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .trim()
    .or(z.literal(""))
    .default(""),
  /** Monitored support mailbox, shown on the site and in delivery emails. */
  NEXT_PUBLIC_SUPPORT_EMAIL: z
    .string()
    .trim()
    .email("NEXT_PUBLIC_SUPPORT_EMAIL must be an email address when set")
    .or(z.literal(""))
    .default(""),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validated, frozen public environment. Safe to import anywhere — including
 * Client Components — because every field is intentionally browser-safe.
 *
 * Empty/whitespace env values are normalized to undefined before parsing so
 * the safe defaults apply (rather than crashing the build prerender).
 */
export const publicEnv: Readonly<PublicEnv> = Object.freeze(
  publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: emptyToUndefined(process.env.NEXT_PUBLIC_SITE_URL),
    NEXT_PUBLIC_SITE_NAME: emptyToUndefined(process.env.NEXT_PUBLIC_SITE_NAME),
    NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: emptyToUndefined(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    NEXT_PUBLIC_SUPPORT_EMAIL: emptyToUndefined(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
  }),
);
