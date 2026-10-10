import { describe, expect, it } from "vitest";
import { estimateFare } from "../../../apps/api/src/modules/passenger-app/fare/fare.engine";
import { publishedTariff, tariff } from "./fixture";

const day = "2026-10-10T04:00:00.000Z";
function estimate(
  distanceMeters = 0,
  durationSeconds = 0,
  scheduledAt = day,
  changes = {},
) {
  return estimateFare(
    { ...tariff, ...changes },
    { distanceMeters, durationSeconds, scheduledAt },
  );
}

describe("fare engine with explicit, synthetic publication rules", () => {
  it.each([
    [0, 85],
    [1, 85],
    [1250, 85],
    [1250.01, 90],
    [1450, 90],
    [1450.01, 95],
    [100000, 2555],
  ])(
    "distance %s preserves base/tick boundaries => %s",
    (distance, expected) => {
      const result = estimate(distance);
      expect(result.estimatedMin).toBe(expected);
      expect(result.estimatedMax).toBe(expected);
      expect(result.fareVersion).toBe(tariff.version);
    },
  );
  it.each([
    [0, 0],
    [0.01, 5],
    [59.99, 5],
    [60, 5],
    [60.01, 10],
    [120, 10],
  ])("duration %s gives zero-to-full-delay bound %s", (duration, delay) => {
    const result = estimate(0, duration);
    expect(result.estimatedMin).toBe(85);
    expect(result.estimatedMax).toBe(85 + delay);
    expect(result.breakdown.delayFare).toEqual({ min: 0, max: delay });
  });
  it("uses completed ticks only when that rule is explicitly selected", () => {
    expect(
      estimate(1449, 59, day, {
        distanceRounding: "floor",
        delayRounding: "floor",
      }),
    ).toMatchObject({ estimatedMin: 85, estimatedMax: 85 });
    expect(
      estimate(1450, 60, day, {
        distanceRounding: "floor",
        delayRounding: "floor",
      }),
    ).toMatchObject({ estimatedMin: 90, estimatedMax: 95 });
  });
  it.each([
    ["2026-10-10T14:59:59.999Z", false],
    ["2026-10-10T15:00:00.000Z", true],
    ["2026-10-10T16:00:00.000Z", true],
    ["2026-10-10T21:59:59.999Z", true],
    ["2026-10-10T22:00:00.000Z", false],
  ])("Taipei night boundary %s => %s", (pickup, night) => {
    expect(estimate(0, 0, pickup)).toMatchObject({
      estimatedMin: night ? 105 : 85,
      breakdown: { nightApplies: night, nightSurchargeAmount: night ? 20 : 0 },
    });
  });
  it("pickup-based night rule remains bound to pickup across both time boundaries", () => {
    expect(
      estimate(0, 120, "2026-10-10T14:59:00Z").breakdown.nightApplies,
    ).toBe(false);
    expect(
      estimate(0, 120, "2026-10-10T21:59:00Z").breakdown.nightApplies,
    ).toBe(true);
  });
  it("explicit overlap rule uses a half-open trip interval including multi-day travel", () => {
    const pickup = "2026-10-10T14:59:00Z";
    expect(
      estimate(0, 60, pickup, { nightApplication: "any_overlap" }).breakdown
        .nightApplies,
    ).toBe(false);
    expect(
      estimate(0, 60.001, pickup, { nightApplication: "any_overlap" }).breakdown
        .nightApplies,
    ).toBe(true);
    expect(
      estimate(0, 86400, day, { nightApplication: "any_overlap" }).breakdown
        .nightApplies,
    ).toBe(true);
  });
  it("supports a non-wrapping explicitly configured night window", () => {
    expect(
      estimate(0, 0, day, {
        nightSurchargeWindowStart: "10:00",
        nightSurchargeWindowEnd: "14:00",
      }).estimatedMin,
    ).toBe(105);
  });
  it.each([
    ["ceil", 110],
    ["floor", 105],
    ["nearest", 105],
  ])(
    "fixed night fee is included before synthetic total %s to a five-dollar increment",
    (rounding, expected) => {
      expect(
        estimate(0, 0, "2026-10-10T15:00:00Z", {
          totalRounding: rounding,
          totalIncrement: 5,
          additionalFees: { unitOnlyFee: 2 },
        }).estimatedMin,
      ).toBe(expected);
    },
  );
  it("rounds exact nearest half up and includes explicitly approved fixed fees without mutation", () => {
    const fees = { unitOnlyFee: 2 };
    const result = estimate(0, 0, day, {
      additionalFees: fees,
      totalRounding: "nearest",
      totalIncrement: 2,
    });
    expect(result.estimatedMin).toBe(88);
    result.breakdown.additionalFees.unitOnlyFee = 9;
    expect(fees.unitOnlyFee).toBe(2);
  });
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid route metric %s",
    (value) => {
      expect(() => estimate(value)).toThrow(RangeError);
      expect(() => estimate(0, value)).toThrow(RangeError);
    },
  );
  it("rejects monetary overflow, invalid timestamps, zero increments and incomplete tariff rules", () => {
    expect(() =>
      estimate(Number.MAX_SAFE_INTEGER, 0, day, {
        distanceRate: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(RangeError);
    expect(() => estimate(0, 0, "bad timestamp")).toThrow(RangeError);
    for (const changes of [
      { totalIncrement: 0 },
      { delayIncrementSeconds: 0 },
      { baseFare: 1.1 },
      { nightSurchargeAmount: -1 },
      { nightSurchargeAmount: 0.2 },
      { nightSurchargeAmount: undefined },
      { distanceRounding: undefined },
      { nightApplication: undefined },
      { nightSurchargeWindowEnd: "23:00" },
      { effectiveUntil: tariff.effectiveAt },
      { additionalFees: { fee: -1 } },
    ]) {
      expect(() => estimate(0, 0, day, changes)).toThrow(RangeError);
    }
  });
  it("rejects overflow caused solely by adding the fixed night fee", () => {
    expect(
      estimate(0, 0, day, { baseFare: Number.MAX_SAFE_INTEGER }).estimatedMin,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(() =>
      estimate(0, 0, "2026-10-10T15:00:00Z", {
        baseFare: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(RangeError);
  });
});

describe("published Taipei 112/04/01 ordinary-day rules (official ceil distance / floor delay / pickup)", () => {
  it.each([
    [0, 0, 85, 85],
    [1250, 59.999, 85, 85],
    [1250.001, 60, 90, 95],
    [1450, 60.001, 90, 95],
    [1450.001, 120, 95, 105],
    [100000, 3600, 2555, 2855],
  ])("%sm/%ss => [%s, %s]", (distanceMeters, durationSeconds, min, max) => {
    const result = estimateFare(publishedTariff, {
      distanceMeters,
      durationSeconds,
      scheduledAt: day,
    });
    expect([result.estimatedMin, result.estimatedMax]).toEqual([min, max]);
    expect(result.breakdown.nightSurchargeAmount).toBe(0);
  });
  it.each([0, 1250, 3250, 100000])(
    "adds exactly 20 once to both bounds for %sm, including delay",
    (distanceMeters) => {
      const input = { distanceMeters, durationSeconds: 800, scheduledAt: day };
      const daytime = estimateFare(publishedTariff, input);
      const night = estimateFare(publishedTariff, {
        ...input,
        scheduledAt: "2026-10-10T15:00:00Z",
      });
      expect(night.estimatedMin - daytime.estimatedMin).toBe(20);
      expect(night.estimatedMax - daytime.estimatedMax).toBe(20);
      expect(night.breakdown).toMatchObject({
        nightApplies: true,
        nightSurchargeAmount: 20,
      });
      expect(night.breakdown.additionalFees).toEqual({});
    },
  );
  it.each([
    ["2026-10-10T14:59:00Z", 120, false, 85],
    ["2026-10-10T15:00:00Z", 120, true, 105],
    ["2026-10-10T21:59:00Z", 120, true, 105],
    ["2026-10-10T22:00:00Z", 120, false, 85],
    [day, 86400, false, 85],
  ])(
    "binds the official night charge to pickup %s across the window",
    (scheduledAt, durationSeconds, night, min) => {
      expect(
        estimateFare(publishedTariff, {
          distanceMeters: 0,
          durationSeconds,
          scheduledAt,
        }),
      ).toMatchObject({
        estimatedMin: min,
        breakdown: {
          nightApplies: night,
          nightSurchargeAmount: night ? 20 : 0,
        },
      });
    },
  );
});
