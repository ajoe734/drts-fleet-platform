import { describe, expect, it } from "vitest";
import {
  normalizeNonNegativeInteger,
  normalizeRequiredReason,
} from "../../app/sla/sla-action-validation";

describe("sla action validation", () => {
  it("accepts zero-minute thresholds", () => {
    expect(normalizeNonNegativeInteger(0, "waitThresholdMin")).toBe(0);
  });

  it("rejects negative or non-integer thresholds", () => {
    expect(() => normalizeNonNegativeInteger(-1, "waitThresholdMin")).toThrow(
      "waitThresholdMin must be a non-negative integer.",
    );
    expect(() => normalizeNonNegativeInteger(1.5, "waitThresholdMin")).toThrow(
      "waitThresholdMin must be a non-negative integer.",
    );
  });

  it("trims and requires reason text", () => {
    expect(normalizeRequiredReason("  sync from UI  ")).toBe("sync from UI");
    expect(() => normalizeRequiredReason("   ")).toThrow("reason is required.");
  });
});
