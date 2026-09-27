import { describe, it, expect } from "bun:test";
import {
  checkPublishReadiness,
  type ReadinessInput,
} from "@/features/admin/readiness";

const base: ReadinessInput = {
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
