"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/site/button";

/**
 * Access-token exchange (client island). Reads the #t= fragment into memory,
 * removes the fragment from browser history, and waits for an explicit
 * "Continue to downloads" POST action. Never interpolates the token into HTML,
 * DOM, or analytics. Provides a manual paste fallback.
 */
export function AccessTokenExchange() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/^[#]t=(.+)$/);
    if (match && match[1]) {
      setToken(match[1]);
      // Remove the fragment so the token doesn't persist in history/address bar.
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function exchange(t: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/downloads/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      if (res.ok) {
        router.push("/downloads");
        router.refresh();
      } else {
        setError("Your access link is invalid, expired, or already used.");
      }
    } catch {
      setError("A network error occurred. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {token ? (
        <>
          <p className="t-body-sm text-ink-secondary">
            Press the button below to access your downloads securely.
          </p>
          <Button onClick={() => exchange(token)} loading={loading} className="w-full">
            Continue to downloads
          </Button>
        </>
      ) : (
        <>
          <p className="t-body-sm text-ink-secondary">
            If your email client stripped the link, paste your access code below.
          </p>
          <input
            type="text"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            autoComplete="off"
            placeholder="v1.abc123…"
            className="h-11 rounded-md border border-line-strong bg-canvas px-3 t-body-sm text-ink font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
          <Button onClick={() => exchange(manualToken)} loading={loading} disabled={!manualToken} className="w-full">
            Continue
          </Button>
        </>
      )}
      {error ? <p role="alert" className="t-body-sm text-danger">{error}</p> : null}
    </div>
  );
}
