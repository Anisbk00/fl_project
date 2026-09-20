import { describe, it, expect } from "bun:test";
import {
  validateFilename,
  validateExtension,
  hasPathTraversal,
  exceedsSize,
  detectFileSignature,
  signatureMatchesRole,
  validateZip,
  EXTENSION_ALLOWLISTS,
  MAX_BYTES,
  generateStagingKey,
  type ZipEntryManifest,
} from "@/features/admin/uploads";

describe("filename validation", () => {
  it("accepts a clean name + extracts extension", () => {
    const r = validateFilename("Cover.PNG");
    expect(r.ok).toBe(true);
    expect(r.extension).toBe("png");
  });
  it("rejects empty", () => {
    expect(validateFilename("").ok).toBe(false);
  });
  it("rejects control/null bytes", () => {
    expect(validateFilename("na\u0000me.png").errors).toContain("null_byte");
    expect(validateFilename("na\u0001me.png").errors).toContain("control_chars");
  });
  it("rejects path separators + traversal", () => {
    expect(validateFilename("../evil.png").errors).toContain("traversal");
    expect(validateFilename("a/b.png").errors).toContain("path_separator");
    expect(validateFilename("a\\b.png").errors).toContain("path_separator");
  });
  it("rejects trailing dot/space tricks", () => {
    expect(validateFilename("name.png ").errors).toContain("trailing_dot_space");
    expect(validateFilename("name.").errors).toContain("trailing_dot_space");
  });
  it("rejects dangerous double extensions", () => {
    // Penultimate extension is dangerous (hidden behind a safe final ext).
    expect(validateFilename("malware.exe.png").errors).toContain(
      "dangerous_double_extension",
    );
  });
});

describe("extension allow-list", () => {
  it("accepts role-allowed extensions", () => {
    expect(validateExtension("cover.png", "cover_image").ok).toBe(true);
    expect(validateExtension("preview.mp3", "audio_preview").ok).toBe(true);
    expect(validateExtension("clip.mp4", "video_preview").ok).toBe(true);
    expect(validateExtension("pack.zip", "private_deliverable").ok).toBe(true);
  });
  it("rejects disallowed extensions", () => {
    expect(validateExtension("cover.svg", "cover_image").ok).toBe(false);
    expect(validateExtension("preview.wav", "audio_preview").ok).toBe(false);
    expect(validateExtension("pack.rar", "private_deliverable").ok).toBe(false);
    expect(validateExtension("noext", "cover_image").ok).toBe(false);
  });
  it("SVG is omitted from cover allow-list unless a sanitizer exists", () => {
    expect(EXTENSION_ALLOWLISTS.cover_image).not.toContain("svg");
  });
});

describe("path traversal + size", () => {
  it("detects traversal/absolute/backslash", () => {
    expect(hasPathTraversal("../x")).toBe(true);
    expect(hasPathTraversal("/abs/x")).toBe(true);
    expect(hasPathTraversal("\\\\x")).toBe(true);
    expect(hasPathTraversal("a/b/c")).toBe(false);
  });
  it("exceedsSize bounds by role", () => {
    expect(exceedsSize("cover_image", 1)).toBe(false);
    expect(exceedsSize("cover_image", MAX_BYTES.cover_image + 1)).toBe(true);
    expect(exceedsSize("cover_image", -1)).toBe(true);
    expect(exceedsSize("private_deliverable", MAX_BYTES.private_deliverable)).toBe(false);
  });
});

describe("magic-byte detection", () => {
  const hex = (s: string) => new Uint8Array(s.split(" ").map((x) => parseInt(x, 16)));
  it("detects png/jpeg/webp/mp4/webm/zip/mp3", () => {
    expect(detectFileSignature(hex("89 50 4E 47 0D 0A 1A 0A"))).toBe("png");
    expect(detectFileSignature(hex("FF D8 FF E0"))).toBe("jpeg");
    expect(detectFileSignature(hex("52 49 46 46 00 00 00 00 57 45 42 50"))).toBe("webp");
    expect(detectFileSignature(hex("00 00 00 00 66 74 79 70"))).toBe("mp4");
    expect(detectFileSignature(hex("1A 45 DF A3"))).toBe("webm");
    expect(detectFileSignature(hex("50 4B 03 04"))).toBe("zip");
    expect(detectFileSignature(hex("49 44 33"))).toBe("mp3");
    expect(detectFileSignature(hex("00 00 00 00"))).toBe("unknown");
  });
  it("signature matches role", () => {
    expect(signatureMatchesRole("png", "cover_image")).toBe(true);
    expect(signatureMatchesRole("png", "audio_preview")).toBe(false);
    expect(signatureMatchesRole("zip", "private_deliverable")).toBe(true);
  });
});

describe("ZIP abuse detection", () => {
  const entry = (over: Partial<ZipEntryManifest> = {}): ZipEntryManifest => ({
    name: "safe.txt",
    isDirectory: false,
    uncompressedSize: 10,
    compressedSize: 8,
    isEncrypted: false,
    isSymlink: false,
    externalAttrs: 0,
    ...over,
  });
  it("accepts a clean zip", () => {
    const r = validateZip([entry()]);
    expect(r.ok).toBe(true);
  });
  it("rejects traversal entries", () => {
    expect(validateZip([entry({ name: "../evil.txt" })]).errors).toContain("traversal_entry");
    expect(validateZip([entry({ name: "/abs.txt" })]).errors).toContain("absolute_entry");
  });
  it("rejects symlinks + encrypted entries", () => {
    expect(validateZip([entry({ isSymlink: true })]).errors).toContain("symlink_entry");
    expect(validateZip([entry({ isEncrypted: true })]).errors).toContain("encrypted_entry");
  });
  it("rejects dangerous embedded extensions + nested archives", () => {
    expect(validateZip([entry({ name: "setup.exe" })]).errors.some((e) => e.startsWith("dangerous_entry"))).toBe(true);
    expect(validateZip([entry({ name: "inner.zip" })]).errors).toContain("nested_archive");
  });
  it("rejects compression bombs", () => {
    const r = validateZip([
      entry({ name: "a.txt", uncompressedSize: 1_000_000, compressedSize: 1 }),
    ]);
    expect(r.errors).toContain("compression_bomb");
  });
  it("rejects too many entries", () => {
    const many = Array.from({ length: 10_001 }, () => entry());
    expect(validateZip(many).errors).toContain("too_many_entries");
  });
});

describe("staging key generation", () => {
  it("generates an opaque, versioned, role-bucketed key", () => {
    const k = generateStagingKey("private_deliverable", "p1", 1, "zip");
    expect(k.startsWith("product-private/p1/v1/")).toBe(true);
    expect(k.endsWith(".zip")).toBe(true);
  });
  it("uses the staging bucket for public roles", () => {
    const k = generateStagingKey("cover_image", "p1", 2, "png");
    expect(k.startsWith("product-public-staging/p1/v2/")).toBe(true);
  });
});
