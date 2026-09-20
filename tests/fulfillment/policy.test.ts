import { describe, it, expect } from "bun:test";
import {
  canTransitionEntitlement,
  checkIssuanceQuota,
  finalizeIssuance,
  releaseReservation,
  refundRevocationAction,
  isMessageTerminal,
  ACCESS_TOKEN_EXPIRY_HOURS,
  SIGNED_URL_TTL_SECONDS,
  SIGNED_URL_ISSUANCE_QUOTA,
  ACTIVE_TOKEN_CAP,
  type MessageState,
} from "@/features/fulfillment/policy";
import {
  escapeHtml,
  sanitizeLine,
  buildAccessUrl,
  prepareEmailPayload,
  payloadHash,
  sanitizeDownloadFilename,
  decideRecoveryAction,
} from "@/features/fulfillment/email-payload";

describe("entitlement state machine", () => {
  it("allows active→held/revoked, held→active/revoked, revoked→active(restore)", () => {
    expect(canTransitionEntitlement("active", "held")).toBe(true);
    expect(canTransitionEntitlement("active", "revoked")).toBe(true);
    expect(canTransitionEntitlement("held", "active")).toBe(true);
    expect(canTransitionEntitlement("held", "revoked")).toBe(true);
    expect(canTransitionEntitlement("revoked", "active")).toBe(true);
  });
  it("rejects revoked→held (no partial re-hold)", () => {
    expect(canTransitionEntitlement("revoked", "held")).toBe(false);
  });
  it("is idempotent", () => {
    expect(canTransitionEntitlement("active", "active")).toBe(true);
  });
});

describe("signed-URL issuance quota", () => {
  it("allows under quota", () => {
    expect(checkIssuanceQuota(3, 1, 10).ok).toBe(true);
    expect(checkIssuanceQuota(3, 1, 10).remaining).toBe(6);
  });
  it("rejects at quota", () => {
    expect(checkIssuanceQuota(8, 2, 10).ok).toBe(false);
  });
  it("finalizes a reservation (reserved→successful)", () => {
    const r = finalizeIssuance(3, 2, 10);
    expect(r.ok).toBe(true);
    expect(r.successful).toBe(4);
    expect(r.reserved).toBe(1);
  });
  it("releases a failed reservation without consuming quota", () => {
    const r = releaseReservation(3, 2, 10);
    expect(r.reserved).toBe(1);
    expect(r.successful).toBe(3);
  });
});

describe("refund/dispute revocation", () => {
  it("full refund → revoke all", () => {
    expect(refundRevocationAction("full")).toBe("revoke");
  });
  it("ambiguous partial → hold all (fail closed)", () => {
    expect(refundRevocationAction("ambiguous_partial")).toBe("hold");
  });
  it("dispute open → hold", () => {
    expect(refundRevocationAction("dispute_open")).toBe("hold");
  });
  it("dispute won → release", () => {
    expect(refundRevocationAction("dispute_won")).toBe("release");
  });
  it("dispute lost → revoke all", () => {
    expect(refundRevocationAction("dispute_lost")).toBe("revoke");
  });
  it("refund failed → release the hold", () => {
    expect(refundRevocationAction("refund_failed")).toBe("release");
  });
});

describe("message state machine", () => {
  it("identifies terminal states", () => {
    const terminal: MessageState[] = ["delivered", "dead", "cancelled"];
    for (const s of terminal) expect(isMessageTerminal(s)).toBe(true);
    expect(isMessageTerminal("queued")).toBe(false);
    expect(isMessageTerminal("accepted")).toBe(false);
  });
});

describe("email payload", () => {
  it("escapes HTML in product titles", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeHtml("a&b<c>")).toBe("a&amp;b&lt;c&gt;");
  });
  it("sanitizes CRLF + control chars", () => {
    expect(sanitizeLine("a\r\nBcc:evil", 100)).toBe("aBcc:evil");
    expect(sanitizeLine("a\u0000b", 100)).toBe("ab");
  });
  it("builds an access URL with the token in the fragment", () => {
    const url = buildAccessUrl("https://store.example.com", "v1.abc123");
    expect(url).toBe("https://store.example.com/downloads/access#t=v1.abc123");
    expect(url.includes("#t=")).toBe(true);
  });
  it("prepares an immutable payload with a stable hash", () => {
    const input = {
      orderNumber: "ORD-123",
      items: [{ title: "Vector Drift", productType: "project_file", unitAmount: 2400, currency: "usd" }],
      totalAmount: 2400,
      currency: "usd",
      accessToken: "v1.abc123",
      canonicalOrigin: "https://store.example.com",
      supportEmail: "support@store.example.com",
      licenseUrl: "https://store.example.com/legal/license",
      refundUrl: "https://store.example.com/legal/refunds",
      templateVersion: "v1",
    };
    const p1 = prepareEmailPayload(input);
    const p2 = prepareEmailPayload(input);
    expect(p1.html).toBe(p2.html);
    expect(p1.payloadHash).toBe(p2.payloadHash);
    expect(p1.subject).toContain("ORD-123");
    expect(p1.html).toContain("Continue to downloads");
    expect(p1.html).toContain("#t=v1.abc123");
    expect(p1.text).toContain("#t=v1.abc123");
    // No tracking pixel / third-party image.
    expect(p1.html).not.toContain("<img");
    expect(p1.html).not.toContain("track");
  });
  it("rejects CRLF in order number (header injection)", () => {
    const p = prepareEmailPayload({
      orderNumber: "ORD\r\nBcc:evil",
      items: [],
      totalAmount: 0,
      currency: "usd",
      accessToken: "v1.x",
      canonicalOrigin: "https://x.com",
      supportEmail: "s@x.com",
      licenseUrl: "https://x.com/l",
      refundUrl: "https://x.com/r",
      templateVersion: "v1",
    });
    expect(p.subject).not.toContain("\n");
    expect(p.subject).not.toContain("\r");
  });
  it("escapes a product title with HTML", () => {
    const p = prepareEmailPayload({
      orderNumber: "ORD-1",
      items: [{ title: "<b>Bold</b>", productType: "stems", unitAmount: 100, currency: "usd" }],
      totalAmount: 100, currency: "usd", accessToken: "v1.x",
      canonicalOrigin: "https://x.com", supportEmail: "s@x.com",
      licenseUrl: "https://x.com/l", refundUrl: "https://x.com/r", templateVersion: "v1",
    });
    expect(p.html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(p.html).not.toContain("<b>Bold</b>");
  });
});

describe("recovery logic", () => {
  it("reuses a valid unconsumed unexpired token", () => {
    const r = decideRecoveryAction({
      hasUnconsumedUnexpiredToken: true,
      hasConsumedToken: false, hasExpiredToken: false, hasRevokedToken: false,
      activeTokenCount: 1, activeTokenCap: ACTIVE_TOKEN_CAP,
      cooldownElapsed: true,
    });
    expect(r.kind).toBe("reuse_token");
  });
  it("creates a new token when the old one is consumed", () => {
    const r = decideRecoveryAction({
      hasUnconsumedUnexpiredToken: false,
      hasConsumedToken: true, hasExpiredToken: false, hasRevokedToken: false,
      activeTokenCount: 0, activeTokenCap: ACTIVE_TOKEN_CAP,
      cooldownElapsed: true,
    });
    expect(r.kind).toBe("create_new_token");
    expect((r as { reason: string }).reason).toBe("consumed");
  });
  it("rate-limits when cooldown not elapsed", () => {
    const r = decideRecoveryAction({
      hasUnconsumedUnexpiredToken: true,
      hasConsumedToken: false, hasExpiredToken: false, hasRevokedToken: false,
      activeTokenCount: 1, activeTokenCap: ACTIVE_TOKEN_CAP,
      cooldownElapsed: false,
    });
    expect(r.kind).toBe("rate_limited");
  });
  it("rate-limits at the active-token cap", () => {
    const r = decideRecoveryAction({
      hasUnconsumedUnexpiredToken: false,
      hasConsumedToken: true, hasExpiredToken: false, hasRevokedToken: false,
      activeTokenCount: ACTIVE_TOKEN_CAP, activeTokenCap: ACTIVE_TOKEN_CAP,
      cooldownElapsed: true,
    });
    expect(r.kind).toBe("rate_limited");
  });
});

describe("download filename sanitization", () => {
  it("removes traversal + control chars", () => {
    expect(sanitizeDownloadFilename("../evil.zip")).toBe("evil.zip");
    expect(sanitizeDownloadFilename("a\u0000b\r\n.zip")).toBe("ab.zip");
    expect(sanitizeDownloadFilename("name/with/slashes.zip")).toBe("namewithslashes.zip");
    expect(sanitizeDownloadFilename("")).toBe("download");
  });
});
