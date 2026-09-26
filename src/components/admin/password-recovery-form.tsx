"use client";
import { useState } from "react";
import { ADMIN_PASSWORD_RECOVERY_PATH } from "@/lib/admin-path";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/site/button";

export function PasswordRecoveryForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) { setError("Authentication isn't configured in this environment."); return; }
    setLoading(true); setError(null);
    try {
      const client = getBrowserClient();
      const { error: rErr } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}${ADMIN_PASSWORD_RECOVERY_PATH}/callback`,
      });
      // Always show the same response (non-enumerating).
      setDone(true);
      if (rErr) setError("Could not send recovery email."); // generic
    } catch {
      setDone(true); // still generic
    } finally { setLoading(false); }
  }

  if (done && !error) {
    return <p className="t-body-sm text-ink-secondary">If that email is a registered administrator, a recovery link has been sent. Complete MFA after recovering.</p>;
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="recovery-email" className="t-label text-ink">Email</label>
        <input id="recovery-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" />
      </div>
      {error ? <p role="alert" className="t-body-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={loading} className="w-full">Send recovery link</Button>
    </form>
  );
}
