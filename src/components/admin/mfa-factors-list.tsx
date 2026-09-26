"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser-client";
import { ADMIN_MFA_ENROLL_PATH } from "@/lib/admin-path";
import { LinkButton } from "@/components/site/button";

interface Factor {
  id: string;
  friendly_name: string | null;
  factor_type: string;
  status: string;
  created_at: string;
}

export function MfaFactorsList() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = getBrowserClient();
        const { data, error: listError } = await client.auth.mfa.listFactors();
        if (cancelled) return;
        if (listError) {
          setError(listError.message);
          return;
        }
        setFactors((data?.totp ?? []) as Factor[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not list MFA factors.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="t-body-sm text-danger">{error}</p>;
  }
  if (factors === null) {
    return <p className="t-body-sm text-ink-muted">Loading…</p>;
  }
  if (factors.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="t-body-sm text-ink-secondary">No authenticator enrolled.</p>
        <LinkButton href={ADMIN_MFA_ENROLL_PATH} size="sm" className="self-start">Enroll now</LinkButton>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {factors.map((f) => (
        <li key={f.id} className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2">
          <span className="t-technical text-ink">{f.friendly_name ?? "TOTP authenticator"}</span>
          <span className="t-caption text-ink-muted">{f.status} · {f.factor_type}</span>
        </li>
      ))}
    </ul>
  );
}
