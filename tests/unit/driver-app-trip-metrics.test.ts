import { describe, expect, it } from "vitest";

import {
  accumulateTripDistanceKm,
  calculateHaversineDistanceKm,
  calculateTripDurationSec,
  formatTripDistance,
  formatTripDuration,
  roundTripDistanceKm,
} from "../../apps/driver-app/lib/trip-metrics";

describe("driver-app trip metrics helpers", () => {
  it("calculates haversine distance for nearby coordinates", () => {
    const distanceKm = calculateHaversineDistanceKm(
      { latitude: 25.033964, longitude: 121.564468 },
      { latitude: 25.047924, longitude: 121.517081 },
    );

    expect(distanceKm).toBeGreaterThan(5);
    expect(distanceKm).toBeLessThan(5.1);
  });

  it("accumulates route distance only after a previous point exists", () => {
    const firstPointDistance = accumulateTripDistanceKm(0, null, {
      latitude: 25.033964,
      longitude: 121.564468,
    });
    const totalDistance = accumulateTripDistanceKm(
      firstPointDistance,
      { latitude: 25.033964, longitude: 121.564468 },
      { latitude: 25.047924, longitude: 121.517081 },
    );

    expect(firstPointDistance).toBe(0);
    expect(totalDistance).toBeGreaterThan(5);
    expect(totalDistance).toBeLessThan(5.1);
  });

  it("derives non-negative duration from a trip start timestamp", () => {
    expect(calculateTripDurationSec(1_000, 61_499)).toBe(60);
    expect(calculateTripDurationSec(50_000, 49_000)).toBe(0);
    expect(calculateTripDurationSec(null, 49_000)).toBe(0);
  });

  it("rounds and formats trip metrics for screen display and payload submission", () => {
    expect(roundTripDistanceKm(12.3456)).toBe(12.35);
    expect(formatTripDistance(12.3)).toBe("12.30 km");
    expect(formatTripDuration(3665)).toBe("01:01:05");
  });
});
