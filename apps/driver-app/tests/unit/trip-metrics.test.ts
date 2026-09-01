import { afterEach, describe, expect, it, vi } from "vitest";

import {
  accumulateTripDistanceKm,
  calculateHaversineDistanceKm,
  calculateTripDurationSec,
  formatTripDistance,
  formatTripDuration,
  roundTripDistanceKm,
} from "../../lib/trip-metrics";

const TAIPEI_MAIN_STATION = { latitude: 25.0478, longitude: 121.5171 };
const TAIPEI_101 = { latitude: 25.0339, longitude: 121.5645 };

describe("calculateHaversineDistanceKm", () => {
  it("returns zero for identical coordinates", () => {
    expect(
      calculateHaversineDistanceKm(TAIPEI_MAIN_STATION, TAIPEI_MAIN_STATION),
    ).toBe(0);
  });

  it("matches the known great-circle distance between two Taipei landmarks", () => {
    const distance = calculateHaversineDistanceKm(
      TAIPEI_MAIN_STATION,
      TAIPEI_101,
    );
    expect(distance).toBeGreaterThan(4.7);
    expect(distance).toBeLessThan(5.1);
  });

  it("is symmetric", () => {
    expect(
      calculateHaversineDistanceKm(TAIPEI_MAIN_STATION, TAIPEI_101),
    ).toBeCloseTo(
      calculateHaversineDistanceKm(TAIPEI_101, TAIPEI_MAIN_STATION),
      10,
    );
  });

  it("handles a one-degree latitude step as roughly 111 km", () => {
    const distance = calculateHaversineDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 0 },
    );
    expect(distance).toBeGreaterThan(111);
    expect(distance).toBeLessThan(112);
  });

  it("handles antimeridian-adjacent coordinates without NaN", () => {
    const distance = calculateHaversineDistanceKm(
      { latitude: 0, longitude: 179.9 },
      { latitude: 0, longitude: -179.9 },
    );
    expect(Number.isFinite(distance)).toBe(true);
  });
});

describe("accumulateTripDistanceKm", () => {
  it("keeps the running total when there is no previous point", () => {
    expect(accumulateTripDistanceKm(3.5, null, TAIPEI_101)).toBe(3.5);
  });

  it("adds the leg distance to the running total", () => {
    const result = accumulateTripDistanceKm(
      10,
      TAIPEI_MAIN_STATION,
      TAIPEI_101,
    );
    expect(result).toBeGreaterThan(14.7);
    expect(result).toBeLessThan(15.1);
  });

  it("adds nothing when the driver has not moved", () => {
    expect(accumulateTripDistanceKm(8.25, TAIPEI_101, { ...TAIPEI_101 })).toBe(
      8.25,
    );
  });
});

describe("calculateTripDurationSec", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero when the trip has not started", () => {
    expect(calculateTripDurationSec(null, 1_000_000)).toBe(0);
  });

  it("returns zero for a non-finite start timestamp", () => {
    expect(calculateTripDurationSec(Number.NaN, 1_000_000)).toBe(0);
    expect(calculateTripDurationSec(Number.POSITIVE_INFINITY, 1_000_000)).toBe(
      0,
    );
  });

  it("rounds elapsed milliseconds to whole seconds", () => {
    expect(calculateTripDurationSec(1_000_000, 1_090_400)).toBe(90);
  });

  it("clamps a clock that jumped backwards to zero", () => {
    expect(calculateTripDurationSec(2_000_000, 1_000_000)).toBe(0);
  });

  it("defaults the reference time to Date.now()", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T00:01:00.000Z"));
    const startedAt = new Date("2026-05-08T00:00:00.000Z").getTime();
    expect(calculateTripDurationSec(startedAt)).toBe(60);
  });
});

describe("roundTripDistanceKm", () => {
  it("rounds to two decimal places", () => {
    expect(roundTripDistanceKm(1.23456)).toBe(1.23);
    expect(roundTripDistanceKm(1.235)).toBe(1.24);
  });

  it("leaves whole numbers unchanged", () => {
    expect(roundTripDistanceKm(12)).toBe(12);
  });
});

describe("formatTripDistance", () => {
  it("always renders two decimals with a km suffix", () => {
    expect(formatTripDistance(0)).toBe("0.00 km");
    expect(formatTripDistance(12)).toBe("12.00 km");
    expect(formatTripDistance(3.14159)).toBe("3.14 km");
  });
});

describe("formatTripDuration", () => {
  it("renders zero-padded HH:MM:SS", () => {
    expect(formatTripDuration(0)).toBe("00:00:00");
    expect(formatTripDuration(59)).toBe("00:00:59");
    expect(formatTripDuration(60)).toBe("00:01:00");
    expect(formatTripDuration(3661)).toBe("01:01:01");
  });

  it("does not wrap past 24 hours", () => {
    expect(formatTripDuration(90_000)).toBe("25:00:00");
  });

  it("clamps negative durations to zero", () => {
    expect(formatTripDuration(-45)).toBe("00:00:00");
  });

  it("rounds fractional seconds", () => {
    expect(formatTripDuration(59.6)).toBe("00:01:00");
  });
});
