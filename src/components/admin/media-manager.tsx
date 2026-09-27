"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/site/button";
import { Badge } from "@/components/site/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Trash2,
  UploadCloud,
  ExternalLink,
  FileAudio,
  FileVideo,
  ImageIcon,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { publicEnv } from "@/lib/env/public";
import {
  EXTENSION_ALLOWLISTS,
  MAX_BYTES,
  MIME_ALLOWLISTS,
  detectFileSignature,
  exceedsSize,
  extensionOf,
  signatureMatchesRole,
  validateExtension,
  validateFilename,
  type AssetRole,
} from "@/features/admin/uploads";
import {
  formatBytes,
  readFileHead,
  uploadToStorage,
  StorageUploadError,
  type UploadProgress,
} from "@/components/admin/storage-upload";
import {
  deleteMedia,
  registerMedia,
  updateMediaAltText,
} from "@/app/control-7f3a9b2c/(protected)/actions";
import type { ActionResult } from "@/lib/admin/product-schema";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Types — what the server passes down (camelCased from the DB row).
// ---------------------------------------------------------------------------

export type MediaKind = Database["public"]["Enums"]["media_kind"];

export interface MediaRow {
  id: string;
  kind: MediaKind;
  bucket: string;
  storageObjectPath: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  bytes: number | null;
  altText: string | null;
  createdAt: string;
}

interface MediaManagerProps {
  productId: string;
  initialMedia: MediaRow[];
}

// ---------------------------------------------------------------------------
// Per-kind configuration. Mirrors the server's MEDIA_PATH_REGEX + uploads.ts.
// ---------------------------------------------------------------------------

const KIND_CONFIG: Record<
  MediaKind,
  {
    role: AssetRole;
    title: string;
    description: string;
    accept: string; // <input accept> hint
    bucket: string;
    icon: typeof ImageIcon;
    allowExternal: boolean;
  }
> = {
  cover_image: {
    role: "cover_image",
    title: "Cover image",
    description: "PNG / WebP / JPEG, up to 12 MB. Used on the product card.",
    accept: ".png,.webp,.jpeg,.jpg",
    bucket: "product-public",
    icon: ImageIcon,
    allowExternal: true,
  },
  audio_preview: {
    role: "audio_preview",
    title: "Audio preview",
    description: "MP3 / M4A / AAC, up to 8 MB. Compressed previews only.",
    accept: ".mp3,.m4a,.aac",
    bucket: "product-public",
    icon: FileAudio,
    allowExternal: true,
  },
  video_preview: {
    role: "video_preview",
    title: "Video preview",
    description: "MP4 / WebM, up to 64 MB. A YouTube URL works too.",
    accept: ".mp4,.webm",
    bucket: "product-public",
    icon: FileVideo,
    allowExternal: true,
  },
};

// Construct the public CDN URL for a storage_object_path on the product-public
// bucket. Public reads are allowed by the `product_public_read` RLS policy,
// so we can use the unauthenticated CDN URL — no signed URL needed.
function publicStorageUrl(bucket: string, path: string): string | null {
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

// ---------------------------------------------------------------------------
// Subsection component (used 3× — one per kind)
// ---------------------------------------------------------------------------

interface SubsectionState {
  mode: "upload" | "external";
  /** Upload pipeline state machine. */
  status: "idle" | "validating" | "uploading" | "registering" | "done" | "error";
  progress: UploadProgress | null;
  error: string | null;
  externalUrl: string;
  altText: string; // for cover
}

const INITIAL_SUBSTATE: SubsectionState = {
  mode: "upload",
  status: "idle",
  progress: null,
  error: null,
  externalUrl: "",
  altText: "",
};

function MediaSubsection({
  kind,
  productId,
  rows,
}: {
  kind: MediaKind;
  productId: string;
  rows: MediaRow[];
}) {
  const cfg = KIND_CONFIG[kind];
  const Icon = cfg.icon;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SubsectionState>(INITIAL_SUBSTATE);
  // Local mirror of the rows so deletes/toggles feel instant (the server
  // action revalidates the page on success; if the optimistic update and
  // the revalidation disagree, the revalidation wins on next render).
  const [localRows, setLocalRows] = useState<MediaRow[]>(rows);

  function reset() {
    setState(INITIAL_SUBSTATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function setError(message: string) {
    setState((s) => ({ ...s, status: "error", error: message }));
  }

  // --- Validate a File client-side using uploads.ts (instant feedback) ---
  function validateFile(file: File): {
    ok: boolean;
    error?: string;
    extension?: string;
    mimeType?: string;
  } {
    const fn = validateFilename(file.name);
    if (!fn.ok) {
      return { ok: false, error: `Filename rejected (${fn.errors.join(", ")}).` };
    }
    const ext = validateExtension(file.name, cfg.role);
    if (!ext.ok) {
      return {
        ok: false,
        error: `Extension ".${ext.extension || "?"}" not allowed. Allowed: .${EXTENSION_ALLOWLISTS[cfg.role].join(", .")}.`,
      };
    }
    if (exceedsSize(cfg.role, file.size)) {
      return {
        ok: false,
        error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max for ${cfg.title.toLowerCase()} is ${(MAX_BYTES[cfg.role] / 1024 / 1024).toFixed(0)} MB.`,
      };
    }
    const mime = file.type || "";
    if (mime && !MIME_ALLOWLISTS[cfg.role].includes(mime)) {
      // Browser-reported MIME not in allowlist. Not fatal — magic bytes are
      // authoritative. Surface a warning, but continue.
      // (We don't reject here; the magic-byte check below is the real gate.)
    }
    return { ok: true, extension: ext.extension, mimeType: mime };
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState((s) => ({
      ...s,
      status: "validating",
      progress: null,
      error: null,
    }));

    // 1) Filename + extension + size checks (uploads.ts).
    const v = validateFile(file);
    if (!v.ok) {
      setError(v.error ?? "File rejected.");
      return;
    }

    // 2) Magic-byte detection — read first 16 bytes and check against the
    //    role's signature allowlist. This catches renamed exes etc.
    try {
      const head = await readFileHead(file, 16);
      const detected = detectFileSignature(head);
      if (!signatureMatchesRole(detected, cfg.role)) {
        setError(
          `File header doesn't look like a ${cfg.title.toLowerCase()} (detected: ${detected}).`,
        );
        return;
      }
    } catch (err) {
      setError(
        `Could not read the file header: ${err instanceof Error ? err.message : "unknown error"}.`,
      );
      return;
    }

    // 3) Upload to Storage via XHR (real progress).
    const ext = v.extension ?? extensionOf(file.name);
    const storageObjectPath = `products/${productId}/${kind}-${crypto.randomUUID()}.${ext}`;
    const mimeType =
      v.mimeType && MIME_ALLOWLISTS[cfg.role].includes(v.mimeType)
        ? v.mimeType
        : primaryMimeForRole(cfg.role);

    setState((s) => ({ ...s, status: "uploading", progress: { percent: 0, loaded: 0, total: file.size } }));

    try {
      await uploadToStorage({
        bucket: cfg.bucket,
        path: storageObjectPath,
        body: file,
        mimeType,
        onProgress: (p) =>
          setState((s) => ({ ...s, progress: p })),
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

    // 4) Register the DB row via Server Action.
    setState((s) => ({ ...s, status: "registering" }));
    const result: ActionResult = await registerMedia(productId, {
      kind,
      bucket: cfg.bucket,
      storageObjectPath,
      externalUrl: null,
      mimeType,
      bytes: file.size,
      altText: state.altText || null,
    });
    if (!result.ok) {
      setError(result.message ?? "Could not register the media row.");
      return;
    }

    // Success — the server action calls revalidatePath so the page
    // re-renders with fresh data. Reset local state for the next upload.
    setState((s) => ({ ...s, status: "done", error: null }));
    setTimeout(() => reset(), 800);
  }

  async function onRegisterExternal() {
    const url = state.externalUrl.trim();
    if (!url) {
      setError("Enter a URL first.");
      return;
    }
    try {
      // Basic URL sanity.
      new URL(url);
    } catch {
      setError("That doesn't look like a valid URL.");
      return;
    }
    setState((s) => ({ ...s, status: "registering", error: null }));
    const result: ActionResult = await registerMedia(productId, {
      kind,
      bucket: cfg.bucket,
      storageObjectPath: null,
      externalUrl: url,
      mimeType: null,
      bytes: null,
      altText: state.altText || null,
    });
    if (!result.ok) {
      setError(result.message ?? "Could not register the external URL.");
      return;
    }
    reset();
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this media? The Storage object will be removed too.")) {
      return;
    }
    const result: ActionResult = await deleteMedia(id);
    if (!result.ok) {
      window.alert(result.message ?? "Could not delete the media.");
      return;
    }
    // Optimistic local update (server revalidation will follow).
    setLocalRows((rs) => rs.filter((r) => r.id !== id));
  }

  async function onSaveAltText(id: string, alt: string) {
    const result: ActionResult = await updateMediaAltText(id, alt);
    if (!result.ok) {
      window.alert(result.message ?? "Could not save the alt text.");
      return;
    }
    setLocalRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, altText: alt.trim() || null } : r)),
    );
  }

  const busy =
    state.status === "validating" ||
    state.status === "uploading" ||
    state.status === "registering";

  const percent = state.progress?.percent ?? 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand/12 text-brand">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h4 className="t-label text-ink">{cfg.title}</h4>
            <p className="t-caption text-ink-muted mt-0.5">{cfg.description}</p>
          </div>
        </div>
        {cfg.allowExternal ? (
          <div className="flex rounded-md border border-line-strong p-0.5">
            <button
              type="button"
              onClick={() =>
                setState((s) => ({ ...s, mode: "upload", error: null }))
              }
              className={`rounded-sm px-2.5 py-1 t-caption transition-colors ${
                state.mode === "upload"
                  ? "bg-brand text-brand-foreground"
                  : "text-ink-secondary hover:text-ink"
              }`}
              aria-pressed={state.mode === "upload"}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() =>
                setState((s) => ({ ...s, mode: "external", error: null }))
              }
              className={`rounded-sm px-2.5 py-1 t-caption transition-colors ${
                state.mode === "external"
                  ? "bg-brand text-brand-foreground"
                  : "text-ink-secondary hover:text-ink"
              }`}
              aria-pressed={state.mode === "external"}
            >
              External URL
            </button>
          </div>
        ) : null}
      </div>

      {/* Upload widget — file picker */}
      {state.mode === "upload" ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-inset/40 px-4 py-6 text-center transition-colors hover:border-brand hover:bg-surface-elevated disabled:opacity-60"
            aria-label={`Choose a ${cfg.title.toLowerCase()} file to upload`}
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            ) : (
              <UploadCloud className="h-6 w-6 text-ink-muted" />
            )}
            <span className="t-body-sm text-ink">
              {busy ? "Uploading…" : "Click to choose a file"}
            </span>
            <span className="t-caption text-ink-muted">
              .{EXTENSION_ALLOWLISTS[cfg.role].join(", .")} · max{" "}
              {(MAX_BYTES[cfg.role] / 1024 / 1024).toFixed(0)} MB
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={cfg.accept}
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
                {state.progress?.total
                  ? (
                    <span>
                      {formatBytes(state.progress.loaded)} /{" "}
                      {formatBytes(state.progress.total)}
                    </span>
                  )
                  : null}
              </div>
            </div>
          ) : null}
          {state.status === "validating" ? (
            <div className="flex items-center gap-2 t-caption text-ink-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Validating…
            </div>
          ) : null}
          {state.status === "registering" ? (
            <div className="flex items-center gap-2 t-caption text-ink-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Registering in database…
            </div>
          ) : null}
          {state.status === "done" ? (
            <div className="flex items-center gap-2 t-caption text-success">
              ✓ Uploaded. Reloading media list…
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Upload widget — external URL */}
      {state.mode === "external" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`external-url-${kind}`} className="t-label text-ink">
              External URL
            </Label>
            <Input
              id={`external-url-${kind}`}
              type="url"
              placeholder="https://youtube.com/watch?v=…"
              value={state.externalUrl}
              onChange={(e) =>
                setState((s) => ({ ...s, externalUrl: e.target.value }))
              }
              disabled={busy}
              className="h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            />
          </div>
          {kind === "cover_image" ? (
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`external-alt-${kind}`}
                className="t-label text-ink"
              >
                Alt text
              </Label>
              <Input
                id={`external-alt-${kind}`}
                type="text"
                maxLength={500}
                placeholder="Cover art for the track"
                value={state.altText}
                onChange={(e) =>
                  setState((s) => ({ ...s, altText: e.target.value }))
                }
                disabled={busy}
                className="h-11 rounded-md border border-line-strong bg-canvas px-3 t-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              />
            </div>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={onRegisterExternal}
          >
            Add external URL
          </Button>
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

      {/* Existing rows */}
      <MediaList
        rows={localRows}
        kind={kind}
        onDelete={onDelete}
        onSaveAltText={onSaveAltText}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media list (existing rows for this kind)
// ---------------------------------------------------------------------------

function MediaList({
  rows,
  kind,
  onDelete,
  onSaveAltText,
}: {
  rows: MediaRow[];
  kind: MediaKind;
  onDelete: (id: string) => void;
  onSaveAltText: (id: string, alt: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line bg-surface-inset/30 px-3 py-4 text-center t-caption text-ink-muted">
        No {kind.replace("_", " ")} media yet.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <MediaRowCard
            row={row}
            onDelete={onDelete}
            onSaveAltText={onSaveAltText}
            kind={kind}
          />
        </li>
      ))}
    </ul>
  );
}

function MediaRowCard({
  row,
  kind,
  onDelete,
  onSaveAltText,
}: {
  row: MediaRow;
  kind: MediaKind;
  onDelete: (id: string) => void;
  onSaveAltText: (id: string, alt: string) => void;
}) {
  const [altDraft, setAltDraft] = useState(row.altText ?? "");
  const [altDirty, setAltDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Render the public CDN URL for display purposes. product-public is
  // public-readable, so this works for covers/audio/video previews.
  const cdnUrl =
    row.externalUrl ??
    (row.storageObjectPath
      ? publicStorageUrl(row.bucket, row.storageObjectPath)
      : null);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-inset/30 p-3 sm:flex-row sm:items-start sm:gap-4">
      {/* Thumbnail / preview */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas">
        {kind === "cover_image" && cdnUrl ? (
          // Admin-only 80px thumbnail of a possibly external https URL that is
          // outside next/image remotePatterns; optimization isn't worth it here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cdnUrl}
            alt={row.altText ?? ""}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : kind === "audio_preview" ? (
          row.externalUrl ? (
            <a
              href={row.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-full w-full items-center justify-center text-brand hover:bg-brand/10"
              aria-label="Open audio preview"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
          ) : cdnUrl ? (
            <audio
              controls
              src={cdnUrl}
              className="h-8 w-full"
              aria-label="Audio preview"
            />
          ) : (
            <FileAudio className="h-6 w-6 text-ink-muted" />
          )
        ) : kind === "video_preview" ? (
          row.externalUrl ? (
            <a
              href={row.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-full w-full items-center justify-center text-brand hover:bg-brand/10"
              aria-label="Open video preview"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
          ) : cdnUrl ? (
            <video src={cdnUrl} className="h-full w-full object-contain" controls />
          ) : (
            <FileVideo className="h-6 w-6 text-ink-muted" />
          )
        ) : null}
      </div>

      {/* Metadata + alt-text editor */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={row.externalUrl ? "info" : "neutral"}>
            {row.externalUrl ? "External" : "Storage"}
          </Badge>
          {row.mimeType ? (
            <span className="t-technical t-caption text-ink-muted">
              {row.mimeType}
            </span>
          ) : null}
          {row.bytes != null ? (
            <span className="t-caption text-ink-muted">
              {formatBytes(row.bytes)}
            </span>
          ) : null}
        </div>
        <p className="t-technical t-caption text-ink-muted break-all">
          {row.externalUrl ?? row.storageObjectPath ?? "—"}
        </p>

        {/* Alt text editor — cover only */}
        {kind === "cover_image" ? (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
            <Input
              type="text"
              maxLength={500}
              placeholder="Alt text (accessibility)"
              value={altDraft}
              onChange={(e) => {
                setAltDraft(e.target.value);
                setAltDirty(true);
              }}
              className="h-9 flex-1 rounded-md border border-line-strong bg-canvas px-2.5 t-body-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              aria-label="Cover image alt text"
            />
            {altDirty ? (
              <Button
                variant="secondary"
                size="sm"
                loading={saving}
                onClick={async () => {
                  setSaving(true);
                  await onSaveAltText(row.id, altDraft);
                  setSaving(false);
                  setAltDirty(false);
                }}
              >
                Save alt
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete media"
          onClick={() => onDelete(row.id)}
        >
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a MIME for the role when the browser omits one or reports a non-standard one. */
function primaryMimeForRole(role: AssetRole): string {
  return MIME_ALLOWLISTS[role][0] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Top-level MediaManager
// ---------------------------------------------------------------------------

/**
 * MediaManager renders the 3 media subsections (cover, audio, video) with
 * upload widgets + existing-rows lists. The parent (product edit page)
 * server-renders this with `initialMedia` and passes the product id so
 * the client can construct canonical Storage paths.
 */
export function MediaManager({
  productId,
  initialMedia,
}: MediaManagerProps) {
  // Group by kind once on mount. After mutations, the server revalidates the
  // whole page (re-mounting this component with fresh `initialMedia`).
  const grouped: Record<MediaKind, MediaRow[]> = {
    cover_image: [],
    audio_preview: [],
    video_preview: [],
  };
  for (const r of initialMedia) {
    if (grouped[r.kind]) grouped[r.kind]!.push(r);
  }
  // Newest first for visibility.
  for (const k of Object.keys(grouped) as MediaKind[]) {
    grouped[k] = grouped[k]!.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  return (
    <section
      aria-labelledby="media-heading"
      className="rounded-xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="media-heading" className="t-heading-3 text-ink">
          Media
        </h3>
        <p className="t-body-sm text-ink-secondary">
          Cover images + compressed previews. Uploads go directly to Supabase
          Storage (product-public bucket). For audio/video you can also paste
          an external URL (e.g. a YouTube link) instead of uploading a file.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        <MediaSubsection
          kind="cover_image"
          productId={productId}
          rows={grouped.cover_image ?? []}
        />
        <MediaSubsection
          kind="audio_preview"
          productId={productId}
          rows={grouped.audio_preview ?? []}
        />
        <MediaSubsection
          kind="video_preview"
          productId={productId}
          rows={grouped.video_preview ?? []}
        />
      </div>
    </section>
  );
}
