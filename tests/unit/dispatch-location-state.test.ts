import { describe, expect, it } from "vitest";

import type { DispatchCandidate } from "../../packages/contracts/src";
import {
  LOCATION_STALE_MS,
  getCandidateLocationState,
  getCandidateLocationTone,
  isFreshLocation,
} from "../../apps/ops-console-web/app/dispatch/location-state";

function buildCandidate(
  overrides: Partial<DispatchCandidate> = {},
): DispatchCandidate {
  return {
    vehicleId: "vehicle-001",
    driverId: "driver-001",
    operatingArea: "taipei",
    serviceBuckets: ["standard_taxi"],
    etaMinutes: 6,
    currentLocation: {
      driverId: "driver-001",
      lat: 25.04,
      lng: 121.56,
      accuracyM: null,
      recordedAt: "2026-04-30T15:10:00.000Z",
      updatedAt: "2026-04-30T15:10:00.000Z",
    },
    ...overrides,
  };
}

describe("ORX-DP-004 dispatch candidate location state", () => {
  it("treats recent candidate locations as live", () => {
    const nowMs = new Date("2026-04-30T15:19:59.000Z").getTime();

    expect(getCandidateLocationState(buildCandidate(), nowMs)).toBe("live");
    expect(isFreshLocation("2026-04-30T15:10:00.000Z", nowMs)).toBe(true);
  });

  it("treats old candidate locations as stale after ten minutes", () => {
    const nowMs = new Date("2026-04-30T15:20:01.000Z").getTime();

    expect(getCandidateLocationState(buildCandidate(), nowMs)).toBe("stale");
    expect(isFreshLocation("2026-04-30T15:10:00.000Z", nowMs)).toBe(false);
    expect(LOCATION_STALE_MS).toBe(600000);
  });

  it("treats missing or invalid locations as no_location", () => {
    const nowMs = new Date("2026-04-30T15:20:01.000Z").getTime();

    expect(
      getCandidateLocationState(
        buildCandidate({ currentLocation: null }),
        nowMs,
      ),
    ).toBe("no_location");
    expect(
      getCandidateLocationState(
        buildCandidate({
          currentLocation: {
            driverId: "driver-001",
            lat: 25.04,
            lng: 121.56,
            accuracyM: null,
            recordedAt: "not-a-date",
            updatedAt: "2026-04-30T15:10:00.000Z",
          },
        }),
        nowMs,
      ),
    ).toBe("stale");
  });

  it("honors canonical locationState when the API sends it", () => {
    const nowMs = new Date("2026-04-30T15:11:00.000Z").getTime();

    expect(
      getCandidateLocationState(
        buildCandidate({
          locationState: "no_location",
        }),
        nowMs,
      ),
    ).toBe("no_location");
    expect(getCandidateLocationTone("live")).toBe("candidate-location-live");
    expect(getCandidateLocationTone("stale")).toBe("candidate-location-stale");
    expect(getCandidateLocationTone("no_location")).toBe(
      "candidate-location-no-location",
    );
  });
});
