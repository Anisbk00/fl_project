/**
 * Upload validation (Step 4) — filename/path/extension allow-lists, magic-byte
 * detection, and ZIP traversal/abuse defenses.
 *
 * Every value the browser sends (filename, extension, MIME, client checksum,
 * declared size) is treated as an UNTRUSTED claim. Stored object keys are
 * server-generated (random + immutable version), never client-supplied.
 *
 * This pure module is unit-tested without a live Supabase project. The trusted
 * validator worker (docs/UPLOAD_SECURITY.md) additionally computes a streaming
 * server-side SHA-256 and performs role-specific inspection against actual
 * bytes; the client hint is never copied as the verified checksum.
 */

export type AssetRole =
  | "cover_image"
  | "audio_preview"
  | "video_preview"
  | "private_deliverable";

/** Role-specific extension allow-lists (lowercase, no dot). */
export const EXTENSION_ALLOWLISTS: Record<AssetRole, readonly string[]> = {
  // SVG omitted unless there is an explicit sanitizer + business need.
  cover_image: ["png", "webp", "jpeg", "jpg"],
  audio_preview: ["mp3", "m4a", "aac"],
  video_preview: ["mp4", "webm"],
  private_deliverable: ["zip"],
};

/** Role-specific MIME allow-lists (untrusted hint; never authoritative). */
export const MIME_ALLOWLISTS: Record<AssetRole, readonly string[]> = {
  cover_image: ["image/png", "image/webp", "image/jpeg"],
  audio_preview: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"],
  video_preview: ["video/mp4", "video/webm"],
  private_deliverable: ["application/zip", "application/x-zip-compressed"],
};

/** Role-specific byte-size limits (minor units of bytes). */
export const MAX_BYTES: Record<AssetRole, number> = {
  cover_image: 12 * 1024 * 1024, // 12 MB
  audio_preview: 8 * 1024 * 1024, // 8 MB
  video_preview: 64 * 1024 * 1024, // 64 MB
  private_deliverable: 2 * 1024 * 1024 * 1024, // 2 GB
};

/** Extensions blocked inside a ZIP archive. */
export const DANGEROUS_ARCHIVE_EXTENSIONS = new Set([
  "exe", "sh", "bat", "cmd", "com", "scr", "pif", "msi", "app", "bin",
  "jar", "class", "dll", "so", "vbs", "js", "jse", "wsh", "wsf", "ps1",
  "lnk", "reg", "inf", "msp", "cpl", "gadget", "hta",
]);

export interface FilenameValidation {
  ok: boolean;
  normalized?: string;
  extension?: string;
  errors: string[];
}

/** Unicode-normalize + case + trim a filename (display metadata only). */
export function normalizeFilename(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}

/** Extract the final extension (lowercase, no dot), or empty. */
export function extensionOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Validate a client-supplied filename. Rejects: empty names, control/null
 * characters, path separators, trailing-dot/space tricks, double-extension
 * bypass where the penultimate extension is dangerous, and excessive length.
 * The stored object key is NEVER derived from this name.
 */
export function validateFilename(name: string): FilenameValidation {
  const errors: string[] = [];
  if (!name || name.length === 0) {
    return { ok: false, errors: ["empty_name"] };
  }
  if (name.length > 255) errors.push("too_long");
  // Control / null bytes.
  if (/[\u0000-\u001f\u007f]/.test(name)) errors.push("control_chars");
  // Path separators / traversal.
  if (/[\\/]/.test(name)) errors.push("path_separator");
  if (name.includes("..")) errors.push("traversal");
  // Trailing dot/space (Windows/EFS tricks).
  if (/[. ]$/i.test(name)) errors.push("trailing_dot_space");
  // Null byte anywhere.
  if (name.includes("\u0000")) errors.push("null_byte");

  const normalized = normalizeFilename(name);
  const ext = extensionOf(normalized);

  // Double-extension bypass: e.g. "archive.zip.exe" — penultimate ext dangerous.
  const parts = normalized.split(".");
  if (parts.length >= 3) {
    const penultimate = parts[parts.length - 2]!;
    if (DANGEROUS_ARCHIVE_EXTENSIONS.has(penultimate)) {
      errors.push("dangerous_double_extension");
    }
  }

  return { ok: errors.length === 0, normalized, extension: ext || undefined, errors };
}

/** Validate an extension against the role-specific allow-list. */
export function validateExtension(
  name: string,
  role: AssetRole,
): { ok: boolean; extension: string; errors: string[] } {
  const ext = extensionOf(name);
  const allow = EXTENSION_ALLOWLISTS[role];
  if (!ext) return { ok: false, extension: "", errors: ["no_extension"] };
  if (!allow.includes(ext)) return { ok: false, extension: ext, errors: ["extension_not_allowed"] };
  return { ok: true, extension: ext, errors: [] };
}

/** Reject path traversal / absolute paths in a server-supplied path claim. */
export function hasPathTraversal(path: string): boolean {
  if (!path) return false;
  if (path.includes("..")) return true;
  if (path.startsWith("/")) return true; // absolute
  if (path.startsWith("\\")) return true;
  if (path.includes("\u0000")) return true;
  // Backslash as separator on POSIX-normalized keys.
  if (/\\\\/.test(path)) return true;
  return false;
}

/** True if the declared size exceeds the role's byte limit. */
export function exceedsSize(role: AssetRole, bytes: number): boolean {
  return !Number.isFinite(bytes) || bytes < 0 || bytes > MAX_BYTES[role];
}

// ---------------------------------------------------------------------------
// Magic-byte detection (header inspection on the first ~16 bytes).
// ---------------------------------------------------------------------------

export type DetectedSignature =
  | "png"
  | "jpeg"
  | "webp"
  | "mp3"
  | "mp4"
  | "webm"
  | "zip"
  | "unknown";

export function detectFileSignature(bytes: Uint8Array): DetectedSignature {
  if (!bytes || bytes.length < 3) return "unknown";
  const b = bytes;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  // WebP (RIFF....WEBP)
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "webp";
  // ZIP (PK\x03\x04) or empty archive (PK\x05\x06) or spanned (PK\x07\x08)
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07))
    return "zip";
  // MP4 (ftyp at offset 4)
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)
    return "mp4";
  // WebM (EBML 1A 45 DF A3)
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  // MP3 (ID3 or MPEG frame 0xFF Ex/Fx)
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return "mp3";
  if (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) return "mp3";
  return "unknown";
}

/** Role → acceptable detected signatures. */
export const SIGNATURE_ALLOWLISTS: Record<AssetRole, readonly DetectedSignature[]> = {
  cover_image: ["png", "jpeg", "webp"],
  audio_preview: ["mp3"],
  video_preview: ["mp4", "webm"],
  private_deliverable: ["zip"],
};

/** Compare the detected magic signature against the role's allow-list. */
export function signatureMatchesRole(
  detected: DetectedSignature,
  role: AssetRole,
): boolean {
  return SIGNATURE_ALLOWLISTS[role].includes(detected);
}

// ---------------------------------------------------------------------------
// ZIP traversal / abuse detection (over a parsed entry manifest).
// The trusted validator parses the central directory with bounded resources;
// this pure check reasons over the derived entry list.
// ---------------------------------------------------------------------------

export interface ZipEntryManifest {
  name: string;
  isDirectory: boolean;
  uncompressedSize: number;
  compressedSize: number;
  isEncrypted: boolean;
  isSymlink: boolean;
  externalAttrs: number;
}

export interface ZipValidationResult {
  ok: boolean;
  errors: string[];
  entryCount: number;
  totalUncompressed: number;
}

const MAX_ZIP_ENTRIES = 10_000;
const MAX_TOTAL_UNCOMPRESSED = 4 * 1024 * 1024 * 1024; // 4 GB
const MAX_COMPRESSION_RATIO = 200;

export function validateZip(manifest: ZipEntryManifest[]): ZipValidationResult {
  const errors: string[] = [];
  let totalUncompressed = 0;

  if (manifest.length > MAX_ZIP_ENTRIES) errors.push("too_many_entries");

  for (const entry of manifest) {
    totalUncompressed += entry.uncompressedSize;

    // Traversal / absolute paths.
    if (entry.name.includes("..")) errors.push("traversal_entry");
    if (entry.name.startsWith("/") || entry.name.startsWith("\\")) errors.push("absolute_entry");
    if (entry.name.includes("\u0000")) errors.push("null_entry_name");

    // Symlinks / hardlinks.
    if (entry.isSymlink) errors.push("symlink_entry");

    // Encrypted / password-protected archives.
    if (entry.isEncrypted) errors.push("encrypted_entry");

    // Dangerous embedded types.
    const ext = extensionOf(entry.name);
    if (ext && DANGEROUS_ARCHIVE_EXTENSIONS.has(ext)) errors.push(`dangerous_entry:${entry.name}`);

    // Nested archive (zip-in-zip).
    if (ext === "zip") errors.push("nested_archive");

    // Device paths (Unix / Windows reserved).
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(entry.name)) errors.push("device_entry");
  }

  if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) errors.push("total_too_large");

  // Excessive compression ratio (zip bomb).
  let totalCompressed = 0;
  for (const e of manifest) totalCompressed += e.compressedSize;
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_COMPRESSION_RATIO) {
    errors.push("compression_bomb");
  }

  return {
    ok: errors.length === 0,
    errors,
    entryCount: manifest.length,
    totalUncompressed,
  };
}

/** Generate an immutable, opaque, versioned staging object key (server-side). */
export function generateStagingKey(
  role: AssetRole,
  productId: string,
  version: number,
  extension: string,
): string {
  // Random-ish opaque id derived from crypto.randomUUID when called server-side.
  // (The actual call site uses crypto.randomUUID(); this helper formats it.)
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const bucket = role === "private_deliverable" ? "product-private" : "product-public-staging";
  return `${bucket}/${productId}/v${version}/${id}.${extension}`;
}
