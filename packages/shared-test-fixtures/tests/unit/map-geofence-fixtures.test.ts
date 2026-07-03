import { describe, expect, it } from "vitest";

import {
  buildMapGeofenceGeoHealthEnvelope,
  buildMapGeofenceResolveEnvelope,
  buildMapGeofenceReverseEnvelope,
  buildMapGeofenceSearchEnvelope,
  buildMapGeofenceServiceAreaEnvelope,
  buildMapGeofenceServiceAreaGeoJsonResponse,
  buildMapGeofenceServiceAreaDefinitionsResponse,
  getMapGeofenceFixture,
  listMapGeofenceFixtures,
  MapGeofenceFixtureError,
  MAP_GEOFENCE_FIXTURE_KEYS,
  MAP_GEOFENCE_PROVIDER_UNAVAILABLE_SENTINEL,
} from "../../src/map-geofence-fixtures";

describe("map geofence fixtures", () => {
  it("publishes the expected stable fixture keys", () => {
    expect(MAP_GEOFENCE_FIXTURE_KEYS).toEqual([
      "taipei-core",
      "taoyuan-airport",
      "taipei-station-no-pickup",
      "manual-review-zone",
      "provider-unavailable",
      "no-geocode",
    ]);

    const keys = listMapGeofenceFixtures().map((fixture) => fixture.key);
    expect(keys).toEqual(MAP_GEOFENCE_FIXTURE_KEYS);
  });

  it("searches deterministic candidates and returns empty results for no-geocode", () => {
    const taipeiSearch = buildMapGeofenceSearchEnvelope({
      q: "台北車站",
      near: { lat: 25.05, lng: 121.52 },
      surface: "callcenter",
    });

    expect(taipeiSearch.data.candidates[0]).toMatchObject({
      candidateId: "mock-taipei-station",
      provider: "mock",
      placeId: "mock-place-taipei-station",
    });

    const noGeocodeSearch = buildMapGeofenceSearchEnvelope({
      q: getMapGeofenceFixture("no-geocode").searchQuery,
      surface: "callcenter",
    });

    expect(noGeocodeSearch.data.candidates).toEqual([]);
  });

  it("raises deterministic provider-unavailable errors", () => {
    expect(() =>
      buildMapGeofenceSearchEnvelope({
        q: MAP_GEOFENCE_PROVIDER_UNAVAILABLE_SENTINEL,
        surface: "callcenter",
      }),
    ).toThrowError(MapGeofenceFixtureError);

    try {
      buildMapGeofenceSearchEnvelope({
        q: MAP_GEOFENCE_PROVIDER_UNAVAILABLE_SENTINEL,
        surface: "callcenter",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MapGeofenceFixtureError);
      expect((error as MapGeofenceFixtureError).statusCode).toBe(503);
      expect((error as MapGeofenceFixtureError).envelope).toMatchObject({
        error: {
          code: "GEO_PROVIDER_UNAVAILABLE",
          retryable: true,
          details: { provider: "mock" },
        },
      });
    }
  });

  it("resolves provider candidates into auditable address payloads", () => {
    const envelope = buildMapGeofenceResolveEnvelope({
      candidateId: "mock-taipei-city-hall",
      addressText: "台北市政府",
      selectedByActorId: "agent-001",
      surface: "callcenter",
    });

    expect(envelope.data.address).toMatchObject({
      address: "台北市信義區市府路1號",
      lat: 25.0375,
      lng: 121.5637,
      geocodeProvider: "mock",
      geocodeConfidence: "exact",
      coordinateSource: "provider_candidate",
      selectedByActorId: "agent-001",
      pinnedByActorId: "agent-001",
    });
    expect(envelope.data.candidate?.candidateId).toBe("mock-taipei-city-hall");
  });

  it("reverse geocodes to the nearest deterministic fixture", () => {
    const envelope = buildMapGeofenceReverseEnvelope({
      location: { lat: 25.0798, lng: 121.2341 },
      surface: "ops_console",
      requestedByActorId: "ops-001",
    });

    expect(envelope.data.address).toMatchObject({
      placeId: "mock-place-taoyuan-airport-t1",
      geocodeProvider: "mock",
      coordinateSource: "reverse_geocode",
      selectedByActorId: "ops-001",
    });
  });

  it("evaluates serviceable, blocked, manual-review, and out-of-area cases", () => {
    const taipeiCore = buildMapGeofenceServiceAreaEnvelope({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0375, lng: 121.5637 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-07-01T10:20:00.000Z",
    });
    expect(taipeiCore.data).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["TAIPEI_CORE"],
      reasonCodes: [],
    });

    const stationBlocked = buildMapGeofenceServiceAreaEnvelope({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0478, lng: 121.5171 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-07-01T10:20:00.000Z",
    });
    expect(stationBlocked.data).toMatchObject({
      decision: "not_serviceable",
      reasonCodes: ["PICKUP_NOT_ALLOWED"],
    });

    const manualReview = buildMapGeofenceServiceAreaEnvelope({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0338, lng: 121.5645 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-07-01T10:20:00.000Z",
    });
    expect(manualReview.data).toMatchObject({
      decision: "manual_review",
      reasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
    });

    const airportTaxi = buildMapGeofenceServiceAreaEnvelope({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0797, lng: 121.2342 },
      requestedAt: "2026-07-01T10:20:00.000Z",
    });
    expect(airportTaxi.data).toMatchObject({
      decision: "not_serviceable",
      reasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
    });
  });

  it("exports seeded service-area definitions and admin geojson", () => {
    const definitions = buildMapGeofenceServiceAreaDefinitionsResponse();
    expect(definitions.serviceAreas).toHaveLength(2);
    expect(definitions.stopPolicies).toHaveLength(2);

    const geoJson = buildMapGeofenceServiceAreaGeoJsonResponse();
    expect(geoJson.type).toBe("FeatureCollection");
    expect(geoJson.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          properties: expect.objectContaining({
            recordKind: "service_area",
            areaCode: "TAOYUAN_AIRPORT",
          }),
        }),
        expect.objectContaining({
          properties: expect.objectContaining({
            recordKind: "stop_policy",
            policyCode: "TPE_STATION_PICKUP_BLOCK",
          }),
        }),
      ]),
    );
  });

  it("keeps geo health deterministic for offline harness runs", () => {
    const envelope = buildMapGeofenceGeoHealthEnvelope("req-health");
    expect(envelope).toMatchObject({
      meta: { requestId: "req-health" },
      data: {
        provider: "mock",
        mode: "mock",
        status: "healthy",
        failClosed: false,
      },
    });
  });
});
