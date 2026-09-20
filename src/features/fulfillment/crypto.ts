import {
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Access-token cryptography (Step 6).
 *
 * Uses audited Node.js `crypto` primitives — no custom cryptography.
 *
 * Token design:
 * - 32 random bytes, base64url-encoded, prefixed with a non-secret key version.
 * - HMAC-SHA-256 digest (with a versioned HKDF-derived subkey) for DB lookup;
 *   never a fast unkeyed digest.
 * - The recoverable raw token is encrypted with AES-256-GCM using a versioned
 *   HKDF-derived encryption subkey, with AAD bound to token ID, order ID,
 *   generation, purpose, key version, and expiry.
 * - Key rotation: current + explicitly configured previous keys. Never remove
 *   a previous key while ciphertext still depends on it.
 *
 * The root key, subkeys, and raw tokens NEVER appear in exceptions, logs, test
 * snapshots, audit rows, metric labels, queue inputs, or provider tags.
 */

export const TOKEN_BYTES = 32; // 256 bits
const DIGEST_INFO = "token-digest-v1";
const ENCRYPTION_INFO = "token-encryption-v1";
const HKDF_SALT = ""; // empty salt is fine for HKDF when the root key is already strong

export interface KeyVersion {
  version: number;
  rootKey: Buffer; // 32+ bytes
}

export interface KeyRing {
  current: KeyVersion;
  previous: KeyVersion[];
}

/** Derive the token-digest subkey from a root key via HKDF. */
export function deriveDigestKey(rootKey: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", rootKey, HKDF_SALT, DIGEST_INFO, 32));
}

/** Derive the token-encryption subkey from a root key via HKDF. */
export function deriveEncryptionKey(rootKey: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", rootKey, HKDF_SALT, ENCRYPTION_INFO, 32));
}

/** Generate a 256-bit access token with a non-secret key-version prefix. */
export function generateAccessToken(keyVersion: number): string {
  const raw = randomBytes(TOKEN_BYTES);
  const b64 = raw.toString("base64url");
  return `v${keyVersion}.${b64}`;
}

/** Parse the key version from a token (without HMAC/decrypt). Returns null on malformed input. */
export function parseTokenVersion(token: string): { version: number; raw: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot > 4) return null; // version prefix is short
  const prefix = token.slice(0, dot);
  const versionMatch = prefix.match(/^v(\d+)$/);
  if (!versionMatch) return null;
  const version = parseInt(versionMatch[1]!, 10);
  if (!Number.isFinite(version) || version < 0) return null;
  const raw = token.slice(dot + 1);
  if (!raw || raw.length < 32) return null; // base64url of 32 bytes is ~43 chars
  return { version, raw };
}

/** Compute the HMAC-SHA-256 digest for DB lookup (using the versioned subkey). */
export function digestToken(token: string, keyRing: KeyRing): string | null {
  const parsed = parseTokenVersion(token);
  if (!parsed) return null;
  const keyVersion = findKeyVersion(keyRing, parsed.version);
  if (!keyVersion) return null; // unknown key version
  const digestKey = deriveDigestKey(keyVersion.rootKey);
  return createHmac("sha256", digestKey).update(token).digest("hex");
}

/** Timing-safe comparison of two hex digests. */
export function safeEqualDigests(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export interface EncryptedToken {
  v: number; // key version
  ct: string; // base64 ciphertext
  iv: string; // base64 nonce
  tag: string; // base64 auth tag
}

/** AAD context bound to the token's identity + purpose + expiry. */
export interface TokenAAD {
  tokenId: string;
  orderId: string;
  generation: number;
  purpose: string;
  keyVersion: number;
  expiresAt: string;
}

function aadToString(aad: TokenAAD): string {
  return [
    aad.tokenId,
    aad.orderId,
    aad.generation,
    aad.purpose,
    aad.keyVersion,
    aad.expiresAt,
  ].join("\n");
}

/** Encrypt the raw token with AES-256-GCM + AAD. The ciphertext is safe to store. */
export function encryptToken(token: string, aad: TokenAAD, keyRing: KeyRing): EncryptedToken | null {
  const parsed = parseTokenVersion(token);
  if (!parsed) return null;
  const keyVersion = findKeyVersion(keyRing, parsed.version);
  if (!keyVersion) return null;
  const encKey = deriveEncryptionKey(keyVersion.rootKey);
  const iv = randomBytes(12); // 96-bit nonce for GCM
  const cipher = createCipheriv("aes-256-gcm", encKey, iv);
  cipher.setAAD(Buffer.from(aadToString(aad), "utf8"));
  const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: parsed.version,
    ct: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/** Decrypt a token. Returns null on any tamper/version/AAD mismatch. */
export function decryptToken(
  envelope: EncryptedToken,
  aad: TokenAAD,
  keyRing: KeyRing,
): string | null {
  const keyVersion = findKeyVersion(keyRing, envelope.v);
  if (!keyVersion) return null;
  // AAD's keyVersion must match the envelope's version.
  if (aad.keyVersion !== envelope.v) return null;
  const encKey = deriveEncryptionKey(keyVersion.rootKey);
  try {
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const ct = Buffer.from(envelope.ct, "base64");
    const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
    decipher.setAAD(Buffer.from(aadToString(aad), "utf8"));
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null; // tamper, wrong AAD, wrong key, etc.
  }
}

/** Find the KeyVersion for a given version number in the ring. */
function findKeyVersion(keyRing: KeyRing, version: number): KeyVersion | null {
  if (keyRing.current.version === version) return keyRing.current;
  for (const prev of keyRing.previous) {
    if (prev.version === version) return prev;
  }
  return null;
}

/** Build a KeyRing from a config: current root key + optional previous keys. */
export function buildKeyRing(current: { version: number; rootKeyHex: string }, previous?: { version: number; rootKeyHex: string }[]): KeyRing {
  const currentKey = {
    version: current.version,
    rootKey: Buffer.from(current.rootKeyHex, "hex"),
  };
  if (currentKey.rootKey.length < 32) {
    throw new Error("Root key must be at least 32 bytes (64 hex chars)");
  }
  const previousKeys = (previous ?? []).map((p) => ({
    version: p.version,
    rootKey: Buffer.from(p.rootKeyHex, "hex"),
  }));
  // Validate no duplicate versions.
  const versions = new Set([current.version, ...previousKeys.map((p) => p.version)]);
  if (versions.size !== 1 + previousKeys.length) {
    throw new Error("Duplicate key versions in key ring");
  }
  return { current: currentKey, previous: previousKeys };
}
