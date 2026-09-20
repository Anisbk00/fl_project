"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/site/button";

/**
 * TOTP challenge (client island). Lists the user's verified TOTP factors,
 * challenges one, and verifies the 6-digit code. On success the session is
 * AAL2 and the user is routed to `/admin`. Unverified in the sandbox.
 */
export function MfaChallengeForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) {
      setError("Authentication isn't configured in this environment.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = getBrowserClient();
      const { data: factors, error: listError } =
        await client.auth.mfa.listFactors();
      if (listError || !factors?.totp?.length) {
        setError("No verified MFA factor found. Enroll first.");
        return;
      }
      const factor = factors.totp[0]!;
      const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error) {
        setError("Could not issue an MFA challenge.");
        return;
      }
      const verifyRes = await client.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verifyRes.error) {
        setError("Invalid code. Try again.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mfa-challenge-code" className="t-label text-ink">
          6-digit code
        </label>
        <input
          id="mfa-challenge-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        />
      </div>
      {error ? <p role="alert" className="t-body-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={loading} className="w-full">
        Verify
      </Button>
      <button
        type="button"
        onClick={() => router.push("/admin/login")}
        className="t-caption text-ink-secondary underline underline-offset-4 hover:text-ink"
      >
        Back to login
      </button>
    </form>
  );
}
