"use client";

import { publicEnv } from "@/lib/env/public";
import { getBrowserClient } from "@/lib/supabase/browser-client";

/**
 * Browser-direct Supabase Storage uploader with REAL progress (XHR-based, so
 * we get upload progress events — `fetch()` has no native progress API).
 *
 * The bytes go straight browser → Supabase Storage. No Server Action round-
 * trip for the body, so there's no body-size cap and large audio/video ZIPs
 * don't block the action runtime. The Storage RLS policy
 * `product_public_admin_write` / `product_private_admin_all` checks
 * `is_admin()` on the cookie-session, so the user must be an authenticated
 * AAL2 admin — exactly the same identity the (protected) layout already
 * verified before rendering the page.
 *
 * After a successful upload, the client calls the `registerMedia` /
 * `registerDeliverable` Server Action to INSERT the DB row. The action re-
 * validates everything (never trusts the client claim).
 */

export interface UploadProgress {
  /** 0..100 (inclusive). `null` if length is unknown. */
  percent: number | null;
  loaded: number;
  total: number | null;
}

export interface UploadOptions {
  bucket: string;
  /** Storage object key — must already be URL-safe (lowercase, no spaces). */
  path: string;
  body: Blob | ArrayBuffer | File;
  mimeType: string;
  /** Called on every XHR progress event. */
  onProgress?: (p: UploadProgress) => void;
  /**
   * Optional abort signal — when aborted, the XHR is terminated and the
   * promise rejects with an `AbortError`-style message.
   */
  signal?: AbortSignal;
}

export class StorageUploadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StorageUploadError";
    this.status = status;
  }
}

/**
 * Upload a body to Supabase Storage, returning when the upload completes.
 * Throws `StorageUploadError` on any non-2xx response (with the Storage
 * error message parsed where possible) or `Error` for network/abort.
 */
export async function uploadToStorage(
  opts: UploadOptions,
): Promise<void> {
  const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new StorageUploadError(
      "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      0,
    );
  }

  // Get the user's session access token (their AAL2 admin cookie is sent
  // automatically by the Supabase browser client). Storage RLS uses this
  // to authorize the write via `is_admin()`.
  const client = getBrowserClient();
  const { data } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new StorageUploadError(
      "You're not signed in. Refresh the page and try again.",
      401,
    );
  }

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // POST + x-upsert:false = create-only (no overwrite). Path collisions
    // are astronomically unlikely for media (random UUID) and an operator
    // signal for deliverables (different version → different path).
    const url = `${supabaseUrl}/storage/v1/object/${opts.bucket}/${encodeURI(
      opts.path,
    )}`;
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Content-Type", opts.mimeType);
    xhr.setRequestHeader("x-upsert", "false");

    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
      });
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (!opts.onProgress) return;
      const total = e.lengthComputable ? e.total : null;
      const percent = total ? Math.min(100, (e.loaded / total) * 100) : null;
      opts.onProgress({ percent, loaded: e.loaded, total });
    });

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Try to parse the Storage error JSON for a friendlier message.
      let message = `Storage upload failed (HTTP ${xhr.status})`;
      try {
        const json = JSON.parse(xhr.responseText) as
          | { message?: string; error?: string; error_description?: string }
          | null;
        const picked = json?.message ?? json?.error ?? json?.error_description;
        if (typeof picked === "string" && picked.length > 0) {
          message = `Storage upload failed: ${picked}`;
        }
      } catch {
        // ignore — use the generic message
      }
      reject(new StorageUploadError(message, xhr.status));
    };

    xhr.onerror = () => {
      reject(
        new StorageUploadError(
          "Network error during upload. Check your connection and try again.",
          0,
        ),
      );
    };

    xhr.send(opts.body);
  });
}

/**
 * Compute the SHA-256 hex digest of a File via the Web Crypto API.
 * Used for deliverable uploads (the client checksum is a hint — the server
 * action never copies it as authoritative without re-verifying; in v1 we
 * trust it because the bytes are client-identical to what was uploaded).
 */
export async function computeSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Read the first N bytes of a File as a Uint8Array for magic-byte detection. */
export async function readFileHead(
  file: File,
  bytes = 16,
): Promise<Uint8Array> {
  const slice = file.slice(0, bytes);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Human-readable byte formatter (B / KB / MB / GB). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

/** Truncate a hex string for display (e.g. SHA-256 → first 8…last 4). */
export function truncateHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}
