import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient, ApiClientError } from "../../packages/api-client/src/index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("api client geo and service-area coverage", () => {
  it("targets the canonical geo and service-area endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          generatedAt: "2026-07-03T00:00:00.000Z",
          checks: [],
          candidates: [],
          provider: "mock",
          address: {
            addressLine1: "Taipei City Hall",
            coordinate: { lat: 25.0375, lng: 121.5637 },
            coordinateProvenance: {
              coordinateSource: "manual_pin",
            },
          },
          decision: "serviceable",
          serviceProductType: "taxi_realtime",
          stops: [],
          serviceAreaCodes: ["taipei-core"],
          geometryVersionRefs: ["svc:v1"],
          reasonCodes: [],
          reasonMessages: [],
          serviceAreas: [],
          stopPolicies: [],
          type: "FeatureCollection",
          features: [],
          auditId: "audit-001",
        },
        meta: {
          requestId: "req-001",
          timestamp: "2026-07-03T00:00:00.000Z",
        },
      }),
      text: async () => "",
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await client.getGeoProviderHealth();
    await client.searchGeo({
      q: "Taipei 101",
      near: { lat: 25.033, lng: 121.5654 },
      locale: "zh-TW",
      limit: 5,
      surface: "callcenter",
      requestedByActorId: "agent-001",
    });
    await client.resolveGeo({
      addressText: "Taipei 101",
      candidateId: "candidate-001",
      surface: "callcenter",
    });
    await client.reverseGeo({
      location: { lat: 25.033, lng: 121.5654 },
      surface: "ops_console",
    });
    await client.computeGeoRoute({
      origin: { lat: 25.033, lng: 121.5654 },
      destination: { lat: 25.0478, lng: 121.5319 },
      travelMode: "drive",
      locale: "zh-TW",
      requestedByActorId: "agent-001",
    });
    await client.getServiceAreaDefinitions();
    await client.getServiceAreaGeoJson();
    await client.getOperationalServiceAreaGeoJson();
    await client.evaluateServiceArea({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.033, lng: 121.5654 },
      dropoff: { lat: 25.0478, lng: 121.5319 },
    });
    await client.createServiceAreaBoundary({
      areaCode: "taipei-core",
      displayName: "Taipei Core",
      geometry: {
        type: "polygon",
        coordinates: [
          { lat: 25.02, lng: 121.52 },
          { lat: 25.06, lng: 121.52 },
          { lat: 25.06, lng: 121.58 },
        ],
      },
      serviceProductTypes: ["taxi_realtime"],
    });
    await client.updateServiceAreaBoundary("svc/001", {
      displayName: "Taipei Core Updated",
    });
    await client.submitServiceAreaBoundaryForReview("svc/001");
    await client.publishServiceAreaBoundary("svc/001", {
      reason: "ready",
    });
    await client.retireServiceAreaBoundary("svc/001", {
      reason: "superseded",
    });
    await client.createStopPolicy({
      policyCode: "pickup-station-ban",
      displayName: "Station pickup ban",
      direction: "pickup",
      effect: "manual_review",
      geometry: {
        type: "circle",
        center: { lat: 25.0478, lng: 121.517 },
        radiusMeters: 300,
      },
      serviceAreaCodes: ["taipei-core"],
      serviceProductTypes: ["taxi_realtime"],
      reasonCode: "station_restriction",
      reasonMessage: "Station pickup requires review",
    });
    await client.updateStopPolicy("policy/001", {
      reasonMessage: "Updated reason",
    });
    await client.submitStopPolicyForReview("policy/001");
    await client.publishStopPolicy("policy/001", {
      reason: "ready",
    });
    await client.retireStopPolicy("policy/001", {
      reason: "superseded",
    });

    const calledUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );

    expect(calledUrls).toEqual([
      "http://localhost:3001/api/geo/health",
      "http://localhost:3001/api/geo/search?q=Taipei+101&nearLat=25.033&nearLng=121.5654&locale=zh-TW&limit=5&surface=callcenter&requestedByActorId=agent-001",
      "http://localhost:3001/api/geo/resolve",
      "http://localhost:3001/api/geo/reverse",
      "http://localhost:3001/api/geo/route",
      "http://localhost:3001/api/service-area/definitions",
      "http://localhost:3001/api/service-area/admin/geojson",
      "http://localhost:3001/api/service-area/geojson",
      "http://localhost:3001/api/service-area/evaluate",
      "http://localhost:3001/api/service-area/admin/service-areas",
      "http://localhost:3001/api/service-area/admin/service-areas/svc%2F001/update",
      "http://localhost:3001/api/service-area/admin/service-areas/svc%2F001/submit-review",
      "http://localhost:3001/api/service-area/admin/service-areas/svc%2F001/publish",
      "http://localhost:3001/api/service-area/admin/service-areas/svc%2F001/retire",
      "http://localhost:3001/api/service-area/admin/stop-policies",
      "http://localhost:3001/api/service-area/admin/stop-policies/policy%2F001/update",
      "http://localhost:3001/api/service-area/admin/stop-policies/policy%2F001/submit-review",
      "http://localhost:3001/api/service-area/admin/stop-policies/policy%2F001/publish",
      "http://localhost:3001/api/service-area/admin/stop-policies/policy%2F001/retire",
    ]);
  });

  it("unwraps serviceable, manual_review, and not_serviceable evaluation responses", async () => {
    const decisions = [
      "serviceable",
      "manual_review",
      "not_serviceable",
    ] as const;
    let index = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      const decision = decisions[index++]!;
      return {
        ok: true,
        json: async () => ({
          data: {
            decision,
            serviceProductType: "taxi_realtime",
            evaluatedAt: "2026-07-03T00:00:00.000Z",
            stops: [
              {
                kind: "pickup",
                location: { lat: 25.033, lng: 121.5654 },
                serviceAreaCodes: ["taipei-core"],
                policyCodes: [],
                geometryVersionRefs: ["svc:v1"],
                decision,
                reasonCodes: [],
                reasonMessages: [],
              },
            ],
            serviceAreaCodes: ["taipei-core"],
            geometryVersionRefs: ["svc:v1"],
            reasonCodes: [],
            reasonMessages: [],
          },
          meta: {
            requestId: "req-001",
            timestamp: "2026-07-03T00:00:00.000Z",
          },
        }),
        text: async () => "",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    for (const expectedDecision of decisions) {
      await expect(
        client.evaluateServiceArea({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 25.033, lng: 121.5654 },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          decision: expectedDecision,
        }),
      );
    }
  });

  it("throws ApiClientError for provider_unavailable geo failures", async () => {
    const rawBody = JSON.stringify({
      error: {
        code: "GEO_PROVIDER_UNAVAILABLE",
        message: "Provider unavailable",
        details: { provider: "mock", outageWindow: "active" },
        retryable: true,
        traceId: "trace-geo-001",
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => rawBody,
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    const error = await client
      .searchGeo({
        q: "__provider_unavailable__",
      })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      name: "ApiClientError",
      statusCode: 503,
      code: "GEO_PROVIDER_UNAVAILABLE",
      apiMessage: "Provider unavailable",
      retryable: true,
      traceId: "trace-geo-001",
      details: { provider: "mock", outageWindow: "active" },
      rawBody,
    });
    expect((error as ApiClientError).message).toBe(`API error 503: ${rawBody}`);
  });

  it("throws ApiClientError for invalid_coordinate service-area failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            code: "INVALID_COORDINATE",
            message: "Pickup coordinate is out of bounds",
            details: {
              field: "pickup",
              coordinate: { lat: 95, lng: 121.5654 },
            },
            retryable: false,
            traceId: "trace-svc-001",
          },
        }),
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(
      client.evaluateServiceArea({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 95, lng: 121.5654 },
      }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      statusCode: 400,
      code: "INVALID_COORDINATE",
      retryable: false,
      traceId: "trace-svc-001",
      details: {
        field: "pickup",
        coordinate: { lat: 95, lng: 121.5654 },
      },
    });
  });
});
