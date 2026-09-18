import "server-only";
import { z } from "zod";

/**
 * Server-only environment variables.
 *
 * IMPORTANT: this module imports `server-only`, so any Client Component that
 * accidentally imports it will fail at build time. The secret key lives here.
 *
 * Validation strategy: secrets are validated LAZILY — only when a server
 * module actually needs them (i.e. when instantiating the privileged Supabase
 * client or sending a webhook response). This lets the production build and
 * the development server succeed WITHOUT real secrets present, while still
 * refusing to run privileged operations if the configuration is missing or
 * malformed. We never print secret values; errors describe which variable is
 * missing, never its contents.
 */

const serverEnvSchema = z.object({
  // Optional-empty: an unset env var is undefined; coerce to "" so the schema
  // accepts it. Downstream code (hasSupabaseServerConfig / privileged client)
  // decides whether an empty value is acceptable and fails closed otherwise.
  SUPABASE_URL: z
    .string()
    .trim()
    .url("SUPABASE_URL must be an absolute URL when set")
    .or(z.literal(""))
    .default(""),
  SUPABASE_SECRET_KEY: z
    .string()
    .trim()
    .or(z.literal(""))
    .default(""),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function readServerEnv(): ServerEnv {
  // parse() throws ZodError on invalid input; we rethrow with a non-secret
  // message so the missing/malformed VARIABLE name is surfaced without its
  // value ever being logged.
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Server environment configuration is invalid — ${issues}`);
  }
  return parsed.data;
}

/**
 * Returns the validated server environment. Throws if required server
 * variables are missing or malformed. Never logs the returned values.
 */
export function getServerEnv(): ServerEnv {
  return readServerEnv();
}

/**
 * True only when BOTH the Supabase secret URL and secret key are configured.
 * Used by callers that want to gracefully skip Supabase-dependent work in
 * environments where Supabase has not been linked yet (e.g. Step 1 sandbox).
 */
export function hasSupabaseServerConfig(): boolean {
  const env = readServerEnv();
  return env.SUPABASE_URL.length > 0 && env.SUPABASE_SECRET_KEY.length > 0;
}
