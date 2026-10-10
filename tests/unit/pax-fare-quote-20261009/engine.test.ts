import { describe, expect, it } from "vitest";
import { estimateFare } from "../../../apps/api/src/modules/passenger-app/fare/fare.engine";
import { tariff } from "./fixture";

const day = "2026-10-10T04:00:00.000Z";
function estimate(distanceMeters = 0, durationSeconds = 0, scheduledAt = day, changes = {}) {
  return estimateFare({ ...tariff, ...changes }, { distanceMeters, durationSeconds, scheduledAt });
}

describe("fare engine with explicit, synthetic publication rules", () => {
  it.each([[0, 85], [1, 85], [1250, 85], [1250.01, 90], [1450, 90], [1450.01, 95], [100000, 2555]])(
    "distance %s preserves base/tick boundaries => %s", (distance, expected) => {
      const result = estimate(distance);
      expect(result.estimatedMin).toBe(expected);
      expect(result.estimatedMax).toBe(expected);
      expect(result.fareVersion).toBe(tariff.version);
    });
  it.each([[0, 0], [0.01, 5], [79.99, 5], [80, 5], [80.01, 10], [160, 10]])(
    "duration %s gives zero-to-full-delay bound %s", (duration, delay) => {
      const result = estimate(0, duration);
      expect(result.estimatedMin).toBe(85);
      expect(result.estimatedMax).toBe(85 + delay);
      expect(result.breakdown.delayFare).toEqual({ min: 0, max: delay });
    });
  it("uses completed ticks only when that rule is explicitly selected", () => {
    expect(estimate(1449, 79, day, { distanceRounding: "floor", delayRounding: "floor" })).toMatchObject({ estimatedMin: 85, estimatedMax: 85 });
    expect(estimate(1450, 80, day, { distanceRounding: "floor", delayRounding: "floor" })).toMatchObject({ estimatedMin: 90, estimatedMax: 95 });
  });
  it.each([
    ["2026-10-10T14:59:59.999Z", false],
    ["2026-10-10T15:00:00.000Z", true],
    ["2026-10-10T16:00:00.000Z", true],
    ["2026-10-10T21:59:59.999Z", true],
    ["2026-10-10T22:00:00.000Z", false],
  ])("Taipei night boundary %s => %s", (pickup, night) => {
    expect(estimate(0, 0, pickup)).toMatchObject({ estimatedMin: night ? 102 : 85, breakdown: { nightApplies: night } });
  });
  it("pickup-based night rule remains bound to pickup across both time boundaries", () => {
    expect(estimate(0, 120, "2026-10-10T14:59:00Z").breakdown.nightApplies).toBe(false);
    expect(estimate(0, 120, "2026-10-10T21:59:00Z").breakdown.nightApplies).toBe(true);
  });
  it("explicit overlap rule uses a half-open trip interval including multi-day travel", () => {
    const pickup = "2026-10-10T14:59:00Z";
    expect(estimate(0, 60, pickup, { nightApplication: "any_overlap" }).breakdown.nightApplies).toBe(false);
    expect(estimate(0, 60.001, pickup, { nightApplication: "any_overlap" }).breakdown.nightApplies).toBe(true);
    expect(estimate(0, 86400, day, { nightApplication: "any_overlap" }).breakdown.nightApplies).toBe(true);
  });
  it("supports a non-wrapping explicitly configured night window", () => {
    expect(estimate(0, 0, day, { nightSurchargeWindowStart: "10:00", nightSurchargeWindowEnd: "14:00" }).estimatedMin).toBe(102);
  });
  it.each([["ceil", 105], ["floor", 100], ["nearest", 100]])(
    "percentage is applied before total %s to a five-dollar increment", (rounding, expected) => {
      expect(estimate(0, 0, "2026-10-10T15:00:00Z", { totalRounding: rounding, totalIncrement: 5 }).estimatedMin).toBe(expected);
    });
  it("rounds exact nearest half up and includes explicitly approved fixed fees without mutation", () => {
    const fees = { unitOnlyFee: 2 };
    const result = estimate(0, 0, day, { additionalFees: fees, totalRounding: "nearest", totalIncrement: 2 });
    expect(result.estimatedMin).toBe(88);
    result.breakdown.additionalFees.unitOnlyFee = 9;
    expect(fees.unitOnlyFee).toBe(2);
  });
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])("rejects invalid route metric %s", (value) => {
    expect(() => estimate(value)).toThrow(RangeError);
    expect(() => estimate(0, value)).toThrow(RangeError);
  });
  it("rejects monetary overflow, invalid timestamps, zero increments and incomplete tariff rules", () => {
    expect(() => estimate(Number.MAX_SAFE_INTEGER, 0, day, { distanceRate: Number.MAX_SAFE_INTEGER })).toThrow(RangeError);
    expect(() => estimate(0, 0, "bad timestamp")).toThrow(RangeError);
    for (const changes of [{ totalIncrement: 0 }, { delayIncrementSeconds: 0 }, { baseFare: 1.1 }, { nightSurchargeBps: 10001 }, { distanceRounding: undefined }, { nightApplication: undefined }, { nightSurchargeWindowEnd: "23:00" }, { effectiveUntil: tariff.effectiveAt }, { additionalFees: { fee: -1 } }]) {
      expect(() => estimate(0, 0, day, changes)).toThrow(RangeError);
    }
  });
});
