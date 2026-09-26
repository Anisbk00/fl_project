"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_DASHBOARD_PATH, ADMIN_PASSWORD_RECOVERY_PATH } from "@/lib/admin-path";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/site/button";
import { cn } from "@/lib/utils";

/**
 * Admin login form (client island). Uses Supabase email/password auth via the
 * browser client (publishable key only). On success, navigates to the admin
 * dashboard, which routes through MFA enrollment/challenge as needed.
 *
 * Generic, non-enumerating errors: any failure (wrong password, unknown
 * email, not an admin) shows the same message — the UI does not reveal
 * whether an email is registered as an administrator.
 *
 * Loading UX:
 *   - Button label flips to "Signing in…" with a spinner.
 *   - Button is disabled (can't double-submit).
 *   - Inputs are disabled + visually dimmed while the request is in flight.
 *   - On success, the spinner KEEPS spinning until the router navigation
 *     completes — no flicker back to "Sign in" before the page changes.
 *   - On error, the spinner stops and the form is re-enabled.
 */
export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("Invalid credentials or not authorized.");
        setLoading(false);
        return;
      }
      // Keep the spinner spinning during navigation — don't setLoading(false).
      // Route through the guard, which enforces MFA/AAL2.
      router.push(ADMIN_DASHBOARD_PATH);
      router.refresh();
    } catch {
      setError("Invalid credentials or not authorized.");
      setLoading(false);
    }
    // No finally block: on success, loading stays true until the page unmounts.
  }

  const inputClass = cn(
    "h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink",
    "transition-[border-color,opacity] duration-[var(--duration-fast)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={loading || undefined}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-email" className="t-label text-ink">
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          disabled={loading}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-password" className="t-label text-ink">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={loading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      {error ? (
        <p role="alert" className="t-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={loading} className="w-full">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <a
        href={ADMIN_PASSWORD_RECOVERY_PATH}
        className={cn(
          "t-caption text-ink-secondary underline underline-offset-4 hover:text-ink text-center",
          "transition-opacity duration-[var(--duration-fast)]",
          loading && "pointer-events-none opacity-50",
        )}
      >
        Forgot password?
      </a>
    </form>
  );
}
