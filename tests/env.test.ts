import { describe, it, expect } from "bun:test";
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

describe("server environment (Supabase-only; no local DB)", () => {
  const original = { ...process.env };

  function restore() {
    for (const k of Object.keys(process.env)) {
      if (!(k in original)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(original)) process.env[k] = v;
  }

  it("returns empty Supabase values (not an error) when unset", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe("");
    expect(env.SUPABASE_SECRET_KEY).toBe("");
    expect(hasSupabaseServerConfig()).toBe(false);
    restore();
  });

  it("reports no Supabase config when only the URL is set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SECRET_KEY;
    expect(hasSupabaseServerConfig()).toBe(false);
    restore();
  });

  it("reports Supabase configured when both URL and secret key are set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_abcdefghijklmnopqrstuvwxyz";
    expect(hasSupabaseServerConfig()).toBe(true);
    const env = getServerEnv();
    expect(env.SUPABASE_URL).toBe("https://example.supabase.co");
    restore();
  });

  it("never exposes a local DATABASE_URL (there is no local DB)", () => {
    expect(
      (getServerEnv() as unknown as Record<string, unknown>).DATABASE_URL,
    ).toBeUndefined();
    restore();
  });
});
