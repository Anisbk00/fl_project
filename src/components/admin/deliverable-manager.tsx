"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/site/button";
import { Badge } from "@/components/site/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Trash2,
  UploadCloud,
  Loader2,
  AlertTriangle,
  Package,
  CheckCircle2,
  FileArchive,
} from "lucide-react";
import {
  EXTENSION_ALLOWLISTS,
  MAX_BYTES,
  MIME_ALLOWLISTS,
  SIGNATURE_ALLOWLISTS,
  detectFileSignature,
  exceedsSize,
  extensionOf,
  signatureMatchesRole,
  validateExtension,
  validateFilename,
} from "@/features/admin/uploads";
import {
  computeSha256Hex,
  formatBytes,
  readFileHead,
  truncateHash,
  uploadToStorage,
  StorageUploadError,
  type UploadProgress,
} from "@/components/admin/storage-upload";
import {
  deleteDeliverable,
  registerDeliverable,
  toggleDeliverableActive,
} from "@/app/control-7f3a9b2c/(protected)/actions";
import type { ActionResult } from "@/lib/admin/product-schema";

// ---------------------------------------------------------------------------
// Types — what the server passes down (camelCased from the DB row).
// ---------------------------------------------------------------------------

export interface DeliverableRow {
  id: string;
  bucket: string;
  storageObjectPath: string;
  customerFilename: string;
  mimeType: string;
  bytes: number;
  version: number;
  sha256: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeliverableManagerProps {
  productId: string;
  slug: string;
  initialDeliverables: DeliverableRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE = "private_deliverable" as const;

/**
 * Sanitize a customer-supplied filename into a Storage-safe key segment.
 * - Lowercase (case is not significant in Storage keys)
 * - NFC normalize
 * - Replace anything outside [a-z0-9._-] with a single hyphen
 * - Collapse consecutive hyphens
 * - Strip leading non-alphanumeric (avoid paths starting with `.` or `-`)
 *
 * The DB's `customer_filename` keeps the ORIGINAL name — this sanitized
 * version is only used for the Storage object key (so the operator can find
 * the file on the bucket and the CDN serves it with the right content-type).
 */
function sanitizeFilenameForPath(original: string): string {
  const nfc = original.normalize("NFC");
  const lower = nfc.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9._-]+/g, "-");
  const collapsed = stripped.replace(/-{2,}/g, "-");
  const trimmed = collapsed.replace(/^[.-]+/, "");
  if (trimmed.length === 0) {
    // The whole filename was non-ASCII — use a fallback stem.
    return "deliverable.zip";
  }
  return trimmed.slice(0, 250);
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type UploadStatus =
  | "idle"
  | "validating"
  | "hashing"
  | "uploading"
  | "registering"
  | "done"
  | "error";

interface UploadState {
  status: UploadStatus;
  progress: UploadProgress | null;
  error: string | null;
  fileName: string | null;
}

const INITIAL_STATE: UploadState = {
  status: "idle",
  progress: null,
  error: null,
  fileName: null,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * DeliverableManager renders the existing deliverables list (with active
 * toggle + delete) + an upload widget. The browser uploads directly to
 * Supabase Storage (product-private bucket), computes SHA-256 via Web Crypto
 * API before uploading, then calls `registerDeliverable` to INSERT the DB
 * row. The action re-validates the path, MIME, size, and sha256 server-side.
 */
export function DeliverableManager({
  productId,
  slug,
  initialDeliverables,
}: DeliverableManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>(INITIAL_STATE);
  const [rows, setRows] = useState<DeliverableRow[]>(initialDeliverables);

  // The next version number for a NEW upload = max(existing versions) + 1.
  // The server action revalidates the path's version segment — if two
  // concurrent uploads pick the same vN, the second's POST will collide on
  // the storage key (no upsert) and surface a clear error.
  const nextVersion = useMemo(() => {
    const max = rows.reduce((m, r) => Math.max(m, r.version), 0);
    return max + 1;
  }, [rows]);

  function setError(message: string) {
    setState((s) => ({ ...s, status: "error", error: message }));
  }

  function reset() {
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // --- File selection → validate → hash → upload → register ---
  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({
      status: "validating",
      progress: null,
      error: null,
      fileName: file.name,
    });

    // 1) Filename + extension + size (uploads.ts).
    const fn = validateFilename(file.name);
    if (!fn.ok) {
      setError(`Filename rejected (${fn.errors.join(", ")}).`);
      return;
    }
    const extCheck = validateExtension(file.name, ROLE);
    if (!extCheck.ok) {
      setError(
        `Extension ".${extCheck.extension || "?"}" not allowed. Only .${EXTENSION_ALLOWLISTS[ROLE].join(", .")} is accepted.`,
      );
      return;
    }
    if (exceedsSize(ROLE, file.size)) {
      setError(
        `File is ${formatBytes(file.size)}. Max for deliverables is ${formatBytes(MAX_BYTES[ROLE])}.`,
      );
      return;
    }

    // 2) Magic-byte detection — must look like a ZIP.
    try {
      const head = await readFileHead(file, 16);
      const detected = detectFileSignature(head);
      if (!signatureMatchesRole(detected, ROLE)) {
        setError(
          `File header doesn't look like a ZIP (detected: ${detected}). Deliverables must be ZIP archives.`,
        );
        return;
      }
    } catch (err) {
      setError(
        `Could not read the file header: ${err instanceof Error ? err.message : "unknown error"}.`,
      );
      return;
    }

    // 3) Compute SHA-256 via Web Crypto API.
    setState((s) => ({ ...s, status: "hashing" }));
    let sha256: string;
    try {
      sha256 = await computeSha256Hex(file);
    } catch (err) {
      setError(
        `Could not compute the file checksum: ${err instanceof Error ? err.message : "unknown error"}.`,
      );
      return;
    }

    // 4) Construct the Storage path. Server revalidates that the slug in
    //    the path === the product's actual slug (looked up from the DB by
    //    productId — the client can't lie about it).
    const ext = extCheck.extension || extensionOf(file.name) || "zip";
    const safeName = sanitizeFilenameForPath(file.name);
    // If the sanitizer stripped the extension, re-append it.
    const stem = safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`;
    const storageObjectPath = `products/${slug}/v${nextVersion}/${stem}`;
    const mimeType =
      file.type && MIME_ALLOWLISTS[ROLE].includes(file.type)
        ? file.type
        : MIME_ALLOWLISTS[ROLE][0]!;

    // 5) Upload to Storage via XHR (real progress for large ZIPs).
    setState((s) => ({
      ...s,
      status: "uploading",
      progress: { percent: 0, loaded: 0, total: file.size },
    }));
    try {
      await uploadToStorage({
        bucket: "product-private",
        path: storageObjectPath,
        body: file,
        mimeType,
        onProgress: (p) => setState((s) => ({ ...s, progress: p })),
      });
    } catch (err) {
      const msg =
        err instanceof StorageUploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Upload failed.";
      setError(msg);
      return;
    }

    // 6) Register the DB row.
    setState((s) => ({ ...s, status: "registering" }));
    const result: ActionResult = await registerDeliverable(productId, {
      bucket: "product-private",
      storageObjectPath,
      customerFilename: file.name,
      mimeType,
      bytes: file.size,
      sha256,
      version: nextVersion,
    });
    if (!result.ok) {
      setError(result.message ?? "Could not register the deliverable.");
      return;
    }

    // Success — the server revalidated the page; show a brief success state
    // then reset the widget for the next upload.
    setState((s) => ({ ...s, status: "done", error: null }));
    setTimeout(() => reset(), 1500);
  }

  async function onToggleActive(id: string, active: boolean) {
    // Optimistic update — if the server action fails, we'll roll back.
    const prev = rows;
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, active } : r)),
    );
    const result: ActionResult = await toggleDeliverableActive(id, active);
    if (!result.ok) {
      setRows(prev); // roll back
      window.alert(result.message ?? "Could not toggle the deliverable.");
    }
  }

  async function onDelete(id: string) {
    if (
      !window.confirm(
        "Delete this deliverable? The Storage object will be removed too. Buyers who already paid keep their existing download links.",
      )
    ) {
      return;
    }
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    const result: ActionResult = await deleteDeliverable(id);
    if (!result.ok) {
      setRows(prev); // roll back
      window.alert(result.message ?? "Could not delete the deliverable.");
    }
  }

  const busy =
    state.status === "validating" ||
    state.status === "hashing" ||
    state.status === "uploading" ||
    state.status === "registering";

  const percent = state.progress?.percent ?? 0;

  return (
    <section
      aria-labelledby="deliverables-heading"
      className="rounded-xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="deliverables-heading" className="t-heading-3 text-ink">
          Deliverables
        </h3>
        <p className="t-body-sm text-ink-secondary">
          The actual downloadable ZIP a buyer gets after paying. Stored in the
          private <code className="t-technical">product-private</code> bucket —
          no public reads, signed URLs are issued by the fulfillment server
          only after a verified payment. Browser-direct upload (no server round
          trip for the bytes), with a SHA-256 computed client-side.
        </p>
      </div>

      {/* Upload widget */}
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-inset/40 px-4 py-8 text-center transition-colors hover:border-brand hover:bg-surface-elevated disabled:opacity-60"
          aria-label="Choose a ZIP deliverable to upload"
        >
          {busy ? (
            <Loader2 className="h-7 w-7 animate-spin text-brand" />
          ) : (
            <UploadCloud className="h-7 w-7 text-ink-muted" />
          )}
          <span className="t-body text-ink">
            {busy
              ? state.status === "validating"
                ? "Validating…"
                : state.status === "hashing"
                  ? "Computing checksum…"
                  : state.status === "uploading"
                    ? "Uploading…"
                    : "Registering…"
                : "Click to choose a ZIP file"}
          </span>
          <span className="t-caption text-ink-muted">
            .{EXTENSION_ALLOWLISTS[ROLE].join(", .")} · max{" "}
            {formatBytes(MAX_BYTES[ROLE])}
            {state.fileName ? ` · selected: ${state.fileName}` : ""}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="sr-only"
          onChange={onFileSelected}
          disabled={busy}
        />

        {/* Progress + status */}
        {state.status === "uploading" ? (
          <div className="flex flex-col gap-1.5">
            <Progress value={percent} className="h-2" />
            <div className="flex justify-between t-caption text-ink-muted">
              <span>
                {state.progress?.percent != null
                  ? `${state.progress.percent.toFixed(0)}%`
                  : "Uploading…"}
              </span>
              {state.progress?.total ? (
                <span>
                  {formatBytes(state.progress.loaded)} /{" "}
                  {formatBytes(state.progress.total)}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {state.status === "hashing" ? (
          <div className="flex items-center gap-2 t-caption text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Computing SHA-256
            checksum…
          </div>
        ) : null}
        {state.status === "validating" ? (
          <div className="flex items-center gap-2 t-caption text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Validating file…
          </div>
        ) : null}
        {state.status === "registering" ? (
          <div className="flex items-center gap-2 t-caption text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Registering in
            database…
          </div>
        ) : null}
        {state.status === "done" ? (
          <div className="flex items-center gap-2 t-caption text-success">
            <CheckCircle2 className="h-4 w-4" /> Uploaded. Reloading
            deliverables list…
          </div>
        ) : null}

        {/* Errors */}
        {state.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 t-caption text-danger"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}
      </div>

      {/* Existing rows */}
      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-surface-inset/30 px-3 py-4 text-center t-caption text-ink-muted">
            No deliverables yet. Upload the first ZIP above.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows
              .slice()
              .sort((a, b) => b.version - a.version)
              .map((row) => (
                <li key={row.id}>
                  <DeliverableRowCard
                    row={row}
                    onToggleActive={onToggleActive}
                    onDelete={onDelete}
                  />
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Row card
// ---------------------------------------------------------------------------

function DeliverableRowCard({
  row,
  onToggleActive,
  onDelete,
}: {
  row: DeliverableRow;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [toggling, setToggling] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-inset/30 p-3 sm:flex-row sm:items-center sm:gap-4">
      {/* Icon */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-canvas border border-line text-ink-secondary">
        <FileArchive className="h-6 w-6" aria-hidden="true" />
      </div>

      {/* Metadata */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-body-sm font-semibold text-ink break-all">
            {row.customerFilename}
          </span>
          {row.active ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="neutral">Inactive</Badge>
          )}
          <Badge tone="info">v{row.version}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-technical t-caption text-ink-muted">
          <span>{row.mimeType}</span>
          <span>{formatBytes(row.bytes)}</span>
          <span title={row.sha256 ?? "no checksum"}>
            SHA-256: {truncateHash(row.sha256)}
          </span>
        </div>
        <p className="t-technical t-caption text-ink-muted break-all">
          {row.bucket}/{row.storageObjectPath}
        </p>
      </div>

      {/* Active toggle */}
      <div className="flex shrink-0 items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch
            checked={row.active}
            disabled={toggling}
            onCheckedChange={async (v) => {
              setToggling(true);
              await onToggleActive(row.id, v);
              setToggling(false);
            }}
            aria-label={`Toggle active for ${row.customerFilename}`}
          />
          <span className="t-caption text-ink-muted sr-only">
            {row.active ? "Active" : "Inactive"}
          </span>
        </label>

        {/* Delete */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete deliverable"
          onClick={() => onDelete(row.id)}
        >
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      </div>
    </div>
  );
}

// Re-export the icon so the section header uses a consistent visual.
export const DeliverablesIcon = Package;
