import { describe, it, expect } from "bun:test";
import { assertPublishable, canPublish, PublicationError } from "@/features/catalog/publish-constraint";

const valid = {
  rightsStatus: "original",
  price: 1900,
  priceCurrency: "USD",
  title: "Nebula Drift",
  shortDescription: "Original FL Studio project.",
  productType: "project_file",
};

describe("canPublish", () => {
  it("returns true for a rights-cleared, valid product", () => {
    expect(canPublish(valid)).toBe(true);
    expect(canPublish({ ...valid, rightsStatus: "licensed" })).toBe(true);
    expect(canPublish({ ...valid, price: 0 })).toBe(true);
  });

  it("returns false when rights are unreviewed", () => {
    expect(canPublish({ ...valid, rightsStatus: "unreviewed" })).toBe(false);
  });

  it("returns false when rights are rejected", () => {
    expect(canPublish({ ...valid, rightsStatus: "rejected" })).toBe(false);
  });

  it("returns false when price is negative", () => {
    expect(canPublish({ ...valid, price: -1 })).toBe(false);
  });

  it("returns false when price is not an integer", () => {
    expect(canPublish({ ...valid, price: 19.99 })).toBe(false);
  });

  it("returns false when currency is not a 3-letter code", () => {
    expect(canPublish({ ...valid, priceCurrency: "us" })).toBe(false);
  });

  it("returns false when title is missing", () => {
    expect(canPublish({ ...valid, title: "" })).toBe(false);
  });
});

describe("assertPublishable", () => {
  it("passes for a rights-cleared product", () => {
    expect(() => assertPublishable(valid)).not.toThrow();
  });

  it("throws PublicationError for an unreviewed product", () => {
    expect(() =>
      assertPublishable({ ...valid, rightsStatus: "unreviewed" }),
    ).toThrow(PublicationError);
    expect(() =>
      assertPublishable({ ...valid, rightsStatus: "unreviewed" }),
    ).toThrow(/rights status/);
  });

  it("throws PublicationError for an invalid price", () => {
    expect(() => assertPublishable({ ...valid, price: -5 })).toThrow(
      PublicationError,
    );
  });

  it("throws PublicationError for a bad currency code", () => {
    expect(() =>
      assertPublishable({ ...valid, priceCurrency: "usd-1" }),
    ).toThrow(PublicationError);
  });
});
