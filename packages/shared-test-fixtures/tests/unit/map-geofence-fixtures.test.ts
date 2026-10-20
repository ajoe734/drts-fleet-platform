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
  mapGeofenceGeometryContainsPoint,
  mapGeofenceGeometryToGeoJson,
  MapGeofenceFixtureError,
  MAP_GEOFENCE_FIXTURE_KEYS,
  MAP_GEOFENCE_PROVIDER_UNAVAILABLE_SENTINEL,
} from "../../src/map-geofence-fixtures";

const DONUT_OUTER = [
  { lat: 22.58, lng: 120.25 },
  { lat: 22.58, lng: 120.35 },
  { lat: 22.68, lng: 120.35 },
  { lat: 22.68, lng: 120.25 },
];
const DONUT_HOLE = [
  { lat: 22.61, lng: 120.28 },
  { lat: 22.61, lng: 120.32 },
  { lat: 22.65, lng: 120.32 },
  { lat: 22.65, lng: 120.28 },
];

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

  it("serializes a polygon hole as a closed RFC 7946 CW ring alongside a CCW exterior ring", () => {
    const geoJson = mapGeofenceGeometryToGeoJson({
      type: "polygon",
      coordinates: DONUT_OUTER,
      holes: [DONUT_HOLE],
    });

    expect(geoJson.coordinates).toHaveLength(2);
    const [outerRing, holeRing] = geoJson.coordinates;
    expect(outerRing![0]).toEqual(outerRing![outerRing!.length - 1]);
    expect(holeRing![0]).toEqual(holeRing![holeRing!.length - 1]);

    function shoelaceArea(ring: [number, number][]) {
      let area = 0;
      for (let i = 0; i < ring.length - 1; i += 1) {
        const [lngA, latA] = ring[i]!;
        const [lngB, latB] = ring[i + 1]!;
        area += lngA * latB - lngB * latA;
      }
      return area / 2;
    }
    expect(shoelaceArea(outerRing!)).toBeGreaterThan(0);
    expect(shoelaceArea(holeRing!)).toBeLessThan(0);
  });

  it("excludes a polygon's hole interior from containment while including its boundary and the outer region", () => {
    const donut = {
      type: "polygon" as const,
      coordinates: DONUT_OUTER,
      holes: [DONUT_HOLE],
    };

    // outer-inside
    expect(
      mapGeofenceGeometryContainsPoint(donut, { lat: 22.595, lng: 120.265 }),
    ).toBe(true);
    // hole-inside
    expect(
      mapGeofenceGeometryContainsPoint(donut, { lat: 22.63, lng: 120.3 }),
    ).toBe(false);
    // hole-edge (on the hole boundary, which is still part of the polygon)
    expect(
      mapGeofenceGeometryContainsPoint(donut, { lat: 22.61, lng: 120.3 }),
    ).toBe(true);
    // outside the exterior ring
    expect(
      mapGeofenceGeometryContainsPoint(donut, { lat: 22.5, lng: 120.2 }),
    ).toBe(false);
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
