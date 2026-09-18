import { describe, it, expect } from "bun:test";
import {
  redactKnownSecrets,
  redactPatterns,
  redactForLog,
} from "@/lib/security/redact";

describe("redact", () => {
  it("scrubs a known secret value verbatim", () => {
    const secret = "sb_secret_abcdefghijklmnop";
    const out = redactKnownSecrets(`key=${secret}`, [secret]);
    expect(out).toBe("key=[REDACTED]");
  });

  it("does not redact very short values (avoids clobbering common substrings)", () => {
    const out = redactKnownSecrets("status: ok", ["ok"]);
    expect(out).toBe("status: ok");
  });

  it("pattern-redacts a Supabase secret key shape", () => {
    const out = redactPatterns(
      "Error calling Supabase with sb_secret_0123456789abcdef",
    );
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sb_secret_0123456789abcdef");
  });

  it("pattern-redacts a Bearer token without leaking it", () => {
    const out = redactPatterns("Authorization: Bearer abc.def.ghi");
    expect(out).toBe("Authorization: Bearer [REDACTED]");
  });

  it("redactForLog applies both known-secrets and patterns", () => {
    const secret = "sb_secret_zzzzzzzzzzzz123";
    const out = redactForLog(
      `token=Bearer aaa.bbb.ccc key=${secret} also sb_secret_987visible`,
      [secret],
    );
    expect(out).not.toContain(secret);
    expect(out).not.toContain("aaa.bbb.ccc");
    expect(out).not.toContain("sb_secret_987visible");
    expect(out).toContain("[REDACTED]");
  });
});
