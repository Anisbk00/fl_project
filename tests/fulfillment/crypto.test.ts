import { describe, it, expect } from "bun:test";
import {
  generateAccessToken,
  parseTokenVersion,
  digestToken,
  safeEqualDigests,
  encryptToken,
  decryptToken,
  buildKeyRing,
  type KeyRing,
  type TokenAAD,
} from "@/features/fulfillment/crypto";

const ROOT_KEY_HEX = "a".repeat(64); // 32 bytes
const PREV_KEY_HEX = "b".repeat(64);

const keyRing: KeyRing = buildKeyRing(
  { version: 1, rootKeyHex: ROOT_KEY_HEX },
  [{ version: 0, rootKeyHex: PREV_KEY_HEX }],
);

describe("token generation + parsing", () => {
  it("generates 256-bit tokens with a version prefix", () => {
    const t = generateAccessToken(1);
    expect(t.startsWith("v1.")).toBe(true);
    const parsed = parseTokenVersion(t);
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(1);
    // base64url of 32 bytes is ~43 chars
    expect(parsed!.raw.length).toBeGreaterThanOrEqual(32);
  });
  it("generates different tokens each call", () => {
    expect(generateAccessToken(1)).not.toBe(generateAccessToken(1));
  });
  it("rejects malformed tokens", () => {
    expect(parseTokenVersion("not-a-token")).toBeNull();
    expect(parseTokenVersion("v.")).toBeNull();
    expect(parseTokenVersion("")).toBeNull();
    expect(parseTokenVersion("x.y")).toBeNull();
  });
});

describe("HMAC digest", () => {
  it("is stable for the same token + key", () => {
    const t = generateAccessToken(1);
    const d1 = digestToken(t, keyRing);
    const d2 = digestToken(t, keyRing);
    expect(d1).not.toBeNull();
    expect(d1).toBe(d2);
    // The digest never equals the raw token.
    expect(d1).not.toBe(t);
  });
  it("differs across tokens", () => {
    expect(digestToken(generateAccessToken(1), keyRing)).not.toBe(
      digestToken(generateAccessToken(1), keyRing),
    );
  });
  it("returns null for malformed tokens", () => {
    expect(digestToken("bad", keyRing)).toBeNull();
  });
  it("safe-equals digests", () => {
    const t = generateAccessToken(1);
    const d = digestToken(t, keyRing)!;
    expect(safeEqualDigests(d, d)).toBe(true);
    expect(safeEqualDigests(d, "0".repeat(64))).toBe(false);
    expect(safeEqualDigests("", "")).toBe(false);
  });
});

describe("AES-256-GCM encrypt/decrypt with AAD", () => {
  const aad: TokenAAD = {
    tokenId: "tok_1",
    orderId: "order_1",
    generation: 1,
    purpose: "initial_delivery",
    keyVersion: 1,
    expiresAt: "2026-12-31T00:00:00Z",
  };
  it("round-trips encrypt→decrypt", () => {
    const t = generateAccessToken(1);
    const enc = encryptToken(t, aad, keyRing);
    expect(enc).not.toBeNull();
    const dec = decryptToken(enc!, aad, keyRing);
    expect(dec).toBe(t);
  });
  it("rejects tampered ciphertext", () => {
    const t = generateAccessToken(1);
    const enc = encryptToken(t, aad, keyRing)!;
    const tampered = { ...enc, ct: enc.ct.slice(0, -2) + "XX" };
    expect(decryptToken(tampered, aad, keyRing)).toBeNull();
  });
  it("rejects tampered auth tag", () => {
    const t = generateAccessToken(1);
    const enc = encryptToken(t, aad, keyRing)!;
    const tampered = { ...enc, tag: enc.tag.slice(0, -2) + "XX" };
    expect(decryptToken(tampered, aad, keyRing)).toBeNull();
  });
  it("rejects wrong AAD (token id mismatch)", () => {
    const t = generateAccessToken(1);
    const enc = encryptToken(t, aad, keyRing)!;
    const wrongAad = { ...aad, tokenId: "OTHER" };
    expect(decryptToken(enc, wrongAad, keyRing)).toBeNull();
  });
  it("rejects wrong AAD (expiry mismatch)", () => {
    const t = generateAccessToken(1);
    const enc = encryptToken(t, aad, keyRing)!;
    const wrongAad = { ...aad, expiresAt: "2027-01-01T00:00:00Z" };
    expect(decryptToken(enc, wrongAad, keyRing)).toBeNull();
  });
  it("decrypts with a previous key version", () => {
    const t = generateAccessToken(0); // version 0
    const aad0 = { ...aad, keyVersion: 0 };
    const enc = encryptToken(t, aad0, keyRing)!;
    expect(enc.v).toBe(0);
    expect(decryptToken(enc, aad0, keyRing)).toBe(t);
  });
  it("rejects unknown key version", () => {
    const t = generateAccessToken(99);
    expect(digestToken(t, keyRing)).toBeNull();
    expect(encryptToken(t, aad, keyRing)).toBeNull();
  });
  it("rejects AAD keyVersion mismatch with envelope version", () => {
    const t = generateAccessToken(1);
    const enc = encryptToken(t, aad, keyRing)!;
    const mismatchedAad = { ...aad, keyVersion: 0 }; // enc.v=1, aad.keyVersion=0
    expect(decryptToken(enc, mismatchedAad, keyRing)).toBeNull();
  });
});

describe("key ring", () => {
  it("rejects short root keys", () => {
    expect(() => buildKeyRing({ version: 1, rootKeyHex: "abc" })).toThrow();
  });
  it("rejects duplicate versions", () => {
    expect(() =>
      buildKeyRing(
        { version: 1, rootKeyHex: ROOT_KEY_HEX },
        [{ version: 1, rootKeyHex: PREV_KEY_HEX }],
      ),
    ).toThrow();
  });
});
