"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_MFA_CHALLENGE_PATH } from "@/lib/admin-path";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/site/button";
import { cn } from "@/lib/utils";

/**
 * TOTP enrollment (client island). Calls Supabase `auth.mfa.enroll()` to get a
 * TOTP factor + the authenticator URI. The QR is rendered LOCALLY from the URI
 * (the secret never leaves the browser for image/analytics/logging). After a
 * successful `verify`, the factor is forgotten from component state and the
 * user is routed to `/admin/mfa/challenge` to complete AAL2.
 *
 * Unverified in the sandbox (no live Supabase Auth). Honest state when
 * unconfigured.
 */
export function MfaEnrollForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!configured || !totpUri) return;
    // Render the QR locally via a tiny inline generator (no third-party image
    // service). `qrcode` is imported dynamically so it never reaches a client
    // bundle unnecessarily and the secret stays in the browser.
    import("qrcode")
      .then((mod) => mod.toDataURL(totpUri))
      .then(setQr)
      .catch(() => setQr(null));
  }, [configured, totpUri]);

  async function enroll() {
    setLoading(true);
    setError(null);
    try {
      const client = getBrowserClient();
      const { data, error: enrollError } = await client.auth.mfa.enroll({
        factorType: "totp",
      });
      if (enrollError || !data) {
        setError("Could not start enrollment.");
        setLoading(false);
        return;
      }
      setFactorId(data.id);
      setTotpUri(data.totp.uri);
      setSecret(data.totp.secret);
    } catch {
      setError("Could not start enrollment.");
    }
    setLoading(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError(null);
    try {
      const client = getBrowserClient();
      const challenge = await client.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        setError("Could not issue an MFA challenge.");
        return;
      }
      const verifyRes = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verifyRes.error) {
        setError("Invalid code. Try again.");
        setLoading(false);
        return;
      }
      // Forget the secret from state as far as practical.
      setSecret(null);
      setTotpUri(null);
      setQr(null);
      // Keep spinner spinning during navigation (no setLoading(false) on success).
      // Route through the guard, which now sees AAL2.
      router.push(ADMIN_MFA_CHALLENGE_PATH);
      router.refresh();
    } catch {
      setError("Verification failed.");
      setLoading(false);
    }
    // No finally: on success, spinner stays until navigation completes.
  }

  if (!configured) {
    return (
      <p className="t-body-sm text-ink-secondary">
        Authentication isn't configured in this environment, so MFA enrollment
        can't run.
      </p>
    );
  }

  if (!factorId) {
    return (
      <Button onClick={enroll} loading={loading} className="w-full">
        {loading ? "Starting…" : "Start enrollment"}
      </Button>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL QR code; nothing to optimize
        <img src={qr} alt="TOTP enrollment QR code" className="h-44 w-44 self-center rounded border border-line" />
      ) : (
        <p className="t-caption text-ink-muted">Rendering QR…</p>
      )}
      {secret ? (
        <p className="t-technical text-ink-muted break-all">
          Manual key: {secret}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mfa-code" className="t-label text-ink">
          6-digit code
        </label>
        <input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          required
          disabled={loading}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={cn(
            "h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink tracking-widest text-center",
            "transition-[border-color,opacity] duration-[var(--duration-fast)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
          placeholder="000000"
        />
      </div>
      {error ? <p role="alert" className="t-body-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={loading} className="w-full">
        {loading ? "Verifying…" : "Verify & continue"}
      </Button>
    </form>
  );
}
