"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ADMIN_DASHBOARD_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_MFA_ENROLL_PATH,
} from "@/lib/admin-path";
import { Button, LinkButton } from "@/components/site/button";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

type Phase = "checking" | "no-factor" | "ready" | "unconfigured";

/**
 * TOTP challenge (client island). Lists the user's verified TOTP factors,
 * challenges one, and verifies the 6-digit code. On success the session is
 * AAL2 and the user is routed to the admin dashboard.
 *
 * IMPORTANT UX: This system uses TOTP (authenticator apps like Google
 * Authenticator, Authy, 1Password) — NOT email or SMS. The 6-digit code comes
 * FROM the user's authenticator app, not from a message we send. On mount, we
 * check whether the user has any enrolled factors. If not, we IMMEDIATELY show
 * the "Set up my authenticator" screen (no need to click Verify first).
 */
export function MfaChallengeForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(configured ? "checking" : "unconfigured");

  // Check for enrolled factors on mount. If none, immediately show the
  // enrollment CTA — the user should NOT have to click Verify first.
  // (Initial phase is already "unconfigured" when !configured, so the effect
  // only runs the factor check when configured.)
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    (async () => {
      try {
        const client = getBrowserClient();
        const { data, error: listError } = await client.auth.mfa.listFactors();
        if (cancelled) return;
        if (listError || !data?.totp?.length) {
          setPhase("no-factor");
        } else {
          setPhase("ready");
        }
      } catch {
        if (!cancelled) setPhase("no-factor");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const client = getBrowserClient();
      const { data: factors } = await client.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (!factor) {
        setPhase("no-factor");
        setLoading(false);
        return;
      }
      const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error) {
        setError("Could not issue an MFA challenge.");
        setLoading(false);
        return;
      }
      const verifyRes = await client.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verifyRes.error) {
        setError("Invalid code. Try again.");
        setLoading(false);
        return;
      }
      // Keep spinner spinning during navigation (no setLoading(false) on success).
      router.push(ADMIN_DASHBOARD_PATH);
      router.refresh();
    } catch {
      setError("Verification failed.");
      setLoading(false);
    }
  }

  // --- Unconfigured: no Supabase env vars -----------------------------------
  if (phase === "unconfigured") {
    return (
      <p className="t-body-sm text-ink-secondary">
        Authentication isn't configured in this environment, so the MFA
        challenge can't run.
      </p>
    );
  }

  // --- Checking: spinner while we list factors ------------------------------
  if (phase === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin text-ink-muted" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p className="t-caption text-ink-muted">Checking your authenticator…</p>
      </div>
    );
  }

  // --- No factor: explain TOTP + send to enrollment -------------------------
  if (phase === "no-factor") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
          <p className="t-body text-ink">
            You haven't set up an authenticator yet.
          </p>
          <p className="t-body-sm text-ink-secondary">
            This admin area requires a Time-based One-Time Password (TOTP) from
            an authenticator app like <strong>Google Authenticator</strong>,{" "}
            <strong>Authy</strong>, <strong>1Password</strong>, or{" "}
            <strong>Microsoft Authenticator</strong>. No codes are sent to you
            by email or SMS — the code is generated by the app on your phone.
          </p>
        </div>
        <LinkButton href={ADMIN_MFA_ENROLL_PATH} size="lg" className="w-full">
          Set up my authenticator
        </LinkButton>
        <button
          type="button"
          onClick={() => router.push(ADMIN_LOGIN_PATH)}
          className="t-caption text-ink-secondary underline underline-offset-4 hover:text-ink text-center"
        >
          Back to login
        </button>
      </div>
    );
  }

  // --- Ready: user has an enrolled factor, show the 6-digit challenge -------
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={loading || undefined}>
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
        <p className="t-caption text-ink-muted">
          Open your authenticator app and enter the current 6-digit code.
        </p>
      </div>
      {error ? <p role="alert" className="t-body-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={loading} className="w-full">
        {loading ? "Verifying…" : "Verify"}
      </Button>
      <button
        type="button"
        onClick={() => router.push(ADMIN_LOGIN_PATH)}
        className={cn(
          "t-caption text-ink-secondary underline underline-offset-4 hover:text-ink text-center",
          "transition-opacity duration-[var(--duration-fast)]",
          loading && "pointer-events-none opacity-50",
        )}
      >
        Back to login
      </button>
    </form>
  );
}
