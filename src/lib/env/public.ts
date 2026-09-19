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

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url("NEXT_PUBLIC_SITE_URL must be an absolute URL")
    .default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z
    .string()
    .min(1, "NEXT_PUBLIC_SITE_NAME must not be empty")
    .default("Music Project Store"),
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
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validated, frozen public environment. Safe to import anywhere — including
 * Client Components — because every field is intentionally browser-safe.
 */
export const publicEnv: Readonly<PublicEnv> = Object.freeze(
  publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }),
);
