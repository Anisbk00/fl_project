"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_DASHBOARD_PATH, ADMIN_PASSWORD_RECOVERY_PATH } from "@/lib/admin-path";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/site/button";
import { cn } from "@/lib/utils";

/**
 * Admin login form (client island). Uses Supabase email/password auth via the
 * browser client (publishable key only). On success, navigates to `/admin`,
 * which routes through MFA enrollment/challenge as needed.
 *
 * Generic, non-enumerating errors: any failure (wrong password, unknown
 * email, not an admin) shows the same message — the UI does not reveal
 * whether an email is registered as an administrator.
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
        return;
      }
      // Route through the guard, which enforces MFA/AAL2.
      router.push(ADMIN_DASHBOARD_PATH);
      router.refresh();
    } catch {
      setError("Invalid credentials or not authorized.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(
            "h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
          )}
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={cn(
            "h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
          )}
        />
      </div>
      {error ? (
        <p role="alert" className="t-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>
      <a
        href={ADMIN_PASSWORD_RECOVERY_PATH}
        className="t-caption text-ink-secondary underline underline-offset-4 hover:text-ink text-center"
      >
        Forgot password?
      </a>
    </form>
  );
}
