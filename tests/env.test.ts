import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { publicEnv, publicEnvSchema } from "@/lib/env/public";
import { getServerEnv, hasSupabaseServerConfig } from "@/lib/env/server";

describe("public environment", () => {
  it("provides safe development defaults when NEXT_PUBLIC_* unset", () => {
    expect(publicEnv.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(publicEnv.NEXT_PUBLIC_SITE_NAME).toBe("Music Project Store");
  });

  it("is frozen so callers cannot mutate configuration", () => {
    expect(Object.isFrozen(publicEnv)).toBe(true);
  });

  it("rejects an invalid NEXT_PUBLIC_SITE_URL", () => {
    expect(() =>
      publicEnvSchema.parse({
        NEXT_PUBLIC_SITE_URL: "not-a-url",
        NEXT_PUBLIC_SITE_NAME: "x",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow();
  });
});

describe("server environment", () => {
  const original = { ...process.env };

  beforeEach(() => {
    // Clear Supabase-related server env for predictable assertions.
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  afterEach(() => {
    // Restore only the keys we may have touched.
    for (const k of Object.keys(process.env)) {
      if (!(k in original)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(original)) process.env[k] = v;
  });

  it("reports no Supabase config when the secret key is absent", () => {
    expect(hasSupabaseServerConfig()).toBe(false);
  });

  it("throws when a required server variable (DATABASE_URL) is missing", () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(() => getServerEnv()).toThrow(/Server environment configuration/);
    process.env.DATABASE_URL = saved;
  });

  it("succeeds when DATABASE_URL is set and Supabase is optional-empty", () => {
    if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./tmp.db";
    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe("");
    expect(env.SUPABASE_SECRET_KEY).toBe("");
    expect(hasSupabaseServerConfig()).toBe(false);
  });

  it("reports Supabase configured when both URL and secret key are set", () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./tmp.db";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_abcdefghijklmnopqrstuvwxyz";
    expect(hasSupabaseServerConfig()).toBe(true);
  });
});
