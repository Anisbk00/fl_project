import { describe, it, expect } from "bun:test";
import {
  formatBytes,
  formatDuration,
  PRODUCT_TYPE_LABELS,
} from "@/features/catalog/view-models";

describe("formatBytes", () => {
  it("formats bytes, KB, MB, GB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(58_720_256)).toBe("56 MB");
    expect(formatBytes(1_073_741_824)).toBe("1.0 GB");
  });
  it("returns undefined for invalid input", () => {
    expect(formatBytes(undefined)).toBeUndefined();
    expect(formatBytes(-1)).toBeUndefined();
    expect(formatBytes(NaN)).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("formats m:ss", () => {
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(312)).toBe("5:12");
  });
  it("formats h:mm:ss for >= 1 hour", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("returns undefined for invalid input", () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(-1)).toBeUndefined();
  });
});

describe("PRODUCT_TYPE_LABELS", () => {
  it("labels every product type human-readably", () => {
    expect(PRODUCT_TYPE_LABELS.project_file).toBe("Project File");
    expect(PRODUCT_TYPE_LABELS.remake).toBe("Remake");
    expect(PRODUCT_TYPE_LABELS.stems).toBe("Stems");
    expect(PRODUCT_TYPE_LABELS.sample_pack).toBe("Sample Pack");
  });
});
