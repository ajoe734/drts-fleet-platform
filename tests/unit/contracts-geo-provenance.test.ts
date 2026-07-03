import { describe, expect, it } from "vitest";

import {
  hasAddressCoordinateProvenance,
  hasAddressCoordinates,
  isValidGeoPoint,
} from "@drts/contracts";

describe("geo contract helpers", () => {
  it("accepts only bounded latitude and longitude pairs", () => {
    expect(isValidGeoPoint({ lat: 25.0478, lng: 121.517 })).toBe(true);
    expect(isValidGeoPoint({ lat: 95, lng: 121.517 })).toBe(false);
    expect(isValidGeoPoint({ lat: 25.0478, lng: 181 })).toBe(false);
    expect(isValidGeoPoint({ lat: "25.0478", lng: 121.517 })).toBe(false);
  });

  it("distinguishes legacy coordinates from auditable provenance", () => {
    expect(
      hasAddressCoordinates({
        address: "Taipei Station",
        lat: 25.0478,
        lng: 121.517,
      }),
    ).toBe(true);
    expect(
      hasAddressCoordinateProvenance({
        address: "Taipei Station",
        lat: 25.0478,
        lng: 121.517,
      }),
    ).toBe(false);
    expect(
      hasAddressCoordinateProvenance({
        address: "Taipei Station",
        lat: 25.0478,
        lng: 121.517,
        coordinateSource: "provider_candidate",
        geocodeProvider: "mock",
        placeId: "mock-taipei-station",
      }),
    ).toBe(true);
    expect(
      hasAddressCoordinateProvenance({
        address: "Taipei City Hall",
        lat: 25.0375,
        lng: 121.5637,
        coordinateProvenance: {
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock",
          geocodeConfidence: "exact",
          providerCandidateId: "mock-city-hall-candidate",
          placeId: "mock-city-hall",
          coordinateAccuracyM: 8,
          selectedByActorId: "tenant-user-geo-001",
          selectedAt: "2026-07-01T09:00:00.000Z",
          pinnedByActorId: "tenant-user-geo-001",
          pinnedAt: "2026-07-01T09:00:10.000Z",
          surface: "tenant_console",
        },
      }),
    ).toBe(true);
  });

  it("does not treat text-only addresses as dispatchable coordinates", () => {
    expect(hasAddressCoordinates({ address: "Taipei Station" })).toBe(false);
    expect(
      hasAddressCoordinateProvenance({
        address: "Taipei Station",
        coordinateSource: "legacy_text",
      }),
    ).toBe(false);
  });
});
