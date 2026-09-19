/**
 * Validated environment access.
 *
 * Public variables (browser-safe): `publicEnv` — validated eagerly with safe
 * dev defaults. Import anywhere.
 *
 * Server-only variables (incl. SUPABASE_SECRET_KEY): `getServerEnv()` /
 * `hasSupabaseServerConfig()` — import ONLY from server modules. Importing
 * this re-export from a Client Component will fail the build because
 * `server.ts` imports `server-only`.
 */
export { publicEnv, publicEnvSchema } from "./public";
export type { PublicEnv } from "./public";
export { getServerEnv, hasSupabaseServerConfig } from "./server";
export type { ServerEnv } from "./server";
