import { describe, it, expect } from "bun:test";
import {
  checkPublishReadiness,
  type ReadinessInput,
} from "@/features/admin/readiness";

const base: ReadinessInput = {
  rightsStatus: "original",
  rightsAttested: true,
  rightsReviewedAt: "2026-09-18T00:00:00Z",
  licensedSourceType: null,
  licensedEvidenceRef: null,
  licenseExpiresAt: null,
  title: "Vector Drift",
  shortDescription: "Original project.",
  price: 2400,
  priceCurrency: "USD",
  hasValidatedCover: true,
  isPaid: true,
  hasActiveValidatedZip: true,
  hasPendingUploads: false,
};

describe("publish-readiness gate", () => {
  it("passes for a fully ready product", () => {
    const r = checkPublishReadiness(base);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("fails when rights are not cleared", () => {
    const r = checkPublishReadiness({ ...base, rightsStatus: "unreviewed" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("rights_not_cleared");
  });

  it("fails without a rights attestation", () => {
    const r = checkPublishReadiness({ ...base, rightsAttested: false, rightsReviewedAt: null });
    expect(r.errors).toContain("rights_not_attested");
  });

  it("requires licensed evidence", () => {
    const r = checkPublishReadiness({
      ...base,
      rightsStatus: "licensed",
      licensedSourceType: null,
      licensedEvidenceRef: null,
    });
    expect(r.errors).toContain("licensed_evidence_missing");
  });
  it("passes licensed with evidence", () => {
    const r = checkPublishReadiness({
      ...base,
      rightsStatus: "licensed",
      licensedSourceType: "contract",
      licensedEvidenceRef: "lic-123",
    });
    expect(r.ok).toBe(true);
  });

  it("fails on expired license", () => {
    const r = checkPublishReadiness({
      ...base,
      rightsStatus: "licensed",
      licensedSourceType: "contract",
      licensedEvidenceRef: "lic-123",
      licenseExpiresAt: "2020-01-01T00:00:00Z",
    });
    expect(r.errors).toContain("license_expired");
  });

  it("fails on missing title/summary/invalid price/currency", () => {
    const r = checkPublishReadiness({
      ...base,
      title: "",
      shortDescription: "",
      price: -1,
      priceCurrency: "us",
    });
    expect(r.errors).toContain("title_missing");
    expect(r.errors).toContain("summary_missing");
    expect(r.errors).toContain("invalid_price");
    expect(r.errors).toContain("invalid_currency");
  });

  it("fails without a validated cover", () => {
    expect(checkPublishReadiness({ ...base, hasValidatedCover: false }).errors).toContain(
      "cover_missing",
    );
  });

  it("fails when a paid product has no validated ZIP", () => {
    expect(
      checkPublishReadiness({ ...base, hasActiveValidatedZip: false }).errors,
    ).toContain("private_zip_missing");
  });

  it("does NOT require a ZIP for a free product", () => {
    const r = checkPublishReadiness({ ...base, isPaid: false, hasActiveValidatedZip: false, price: 0 });
    expect(r.ok).toBe(true);
  });

  it("fails when uploads are pending", () => {
    expect(checkPublishReadiness({ ...base, hasPendingUploads: true }).errors).toContain(
      "pending_uploads",
    );
  });
});
