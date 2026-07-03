import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient, ApiClientError } from "../../packages/api-client/src/index";
import type {
  CreateCallCenterOrderCommand,
  CreateTenantBookingCommand,
  GeoResolveResponse,
  GeoReverseResponse,
  GeoSearchResponse,
  OwnedOrderRecord,
  ServiceAreaDefinitionsResponse,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
} from "../../packages/contracts/src/index";

type CapturedRequest = {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
};

function envelope<T>(data: T) {
  return {
    data,
    meta: {
      requestId: "req-api-client-geo-test",
      timestamp: "2026-06-30T00:00:00.000Z",
    },
  };
}

function stubFetchSequence(
  responses: Array<{ status?: number; body: unknown }>,
) {
  const captured: CapturedRequest[] = [];
  const fetchMock = vi.fn(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      captured.push({ input, init });
      const next = responses.shift();
      if (!next) {
        throw new Error("Unexpected fetch call.");
      }
      return new Response(JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return captured;
}

function serviceAreaResult(
  decision: ServiceAreaEvaluationDecision,
): ServiceAreaEvaluationResult {
  return {
    decision,
    serviceProductType: "taxi_realtime",
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    stops: [
      {
        kind: "pickup",
        location: { lat: 25.041, lng: 121.55 },
        serviceAreaCodes: decision === "not_serviceable" ? [] : ["TAIPEI_CORE"],
        policyCodes:
          decision === "manual_review" ? ["XINYI_HOSPITAL_MANUAL_REVIEW"] : [],
        geometryVersionRefs:
          decision === "not_serviceable" ? [] : ["service_area:TAIPEI_CORE@1"],
        decision,
        reasonCodes:
          decision === "serviceable" ? [] : [`TEST_${decision.toUpperCase()}`],
        reasonMessages:
          decision === "serviceable" ? [] : [`Test ${decision} decision.`],
      },
    ],
    serviceAreaCodes: decision === "not_serviceable" ? [] : ["TAIPEI_CORE"],
    geometryVersionRefs:
      decision === "not_serviceable" ? [] : ["service_area:TAIPEI_CORE@1"],
    reasonCodes:
      decision === "serviceable" ? [] : [`TEST_${decision.toUpperCase()}`],
    reasonMessages:
      decision === "serviceable" ? [] : [`Test ${decision} decision.`],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ApiClient geo and service-area coverage", () => {
  it("builds typed geo search requests with provider-neutral query params", async () => {
    const searchResponse: GeoSearchResponse = {
      provider: "mock",
      generatedAt: "2026-06-30T00:00:00.000Z",
      candidates: [
        {
          candidateId: "mock-taipei-station",
          provider: "mock",
          displayName: "台北車站",
          address: "台北市中正區北平西路3號",
          location: { lat: 25.0478, lng: 121.5171 },
          confidence: "exact",
          placeId: "mock-place-taipei-station",
        },
      ],
    };
    const captured = stubFetchSequence([{ body: envelope(searchResponse) }]);
    const client = new ApiClient({ baseUrl: "https://api.example.test" });

    const result = await client.searchGeo({
      q: "台北車站",
      near: { lat: 25.05, lng: 121.52 },
      locale: "zh-TW",
      limit: 3,
      surface: "callcenter",
      requestedByActorId: "agent-001",
    });

    expect(result.candidates[0]?.candidateId).toBe("mock-taipei-station");
    const requestUrl = new URL(String(captured[0]?.input));
    expect(requestUrl.pathname).toBe("/api/geo/search");
    expect(requestUrl.searchParams.get("q")).toBe("台北車站");
    expect(requestUrl.searchParams.get("nearLat")).toBe("25.05");
    expect(requestUrl.searchParams.get("nearLng")).toBe("121.52");
    expect(requestUrl.searchParams.get("surface")).toBe("callcenter");
    expect(requestUrl.searchParams.get("requestedByActorId")).toBe("agent-001");
    expect(captured[0]?.init?.method).toBe("GET");
  });

  it("posts typed resolve and reverse-geocode commands without provider leakage", async () => {
    const resolveResponse: GeoResolveResponse = {
      provider: "mock",
      resolvedAt: "2026-06-30T00:00:00.000Z",
      candidate: null,
      address: {
        address: "Caller confirmed side gate",
        lat: 25.041,
        lng: 121.55,
        coordinateSource: "manual_pin",
        geocodeConfidence: "manual",
        resolvedAt: "2026-06-30T00:00:00.000Z",
        surface: "callcenter",
      },
    };
    const reverseResponse: GeoReverseResponse = {
      provider: "mock",
      resolvedAt: "2026-06-30T00:00:01.000Z",
      address: {
        address: "台北市信義區松高路",
        lat: 25.0338,
        lng: 121.5645,
        coordinateSource: "reverse_geocode",
        geocodeConfidence: "approximate",
        resolvedAt: "2026-06-30T00:00:01.000Z",
        surface: "ops_console",
      },
    };
    const captured = stubFetchSequence([
      { body: envelope(resolveResponse) },
      { body: envelope(reverseResponse) },
    ]);
    const client = new ApiClient({ baseUrl: "https://api.example.test" });

    await client.resolveGeo({
      addressText: "Caller confirmed side gate",
      selectedPoint: { lat: 25.041, lng: 121.55 },
      selectedByActorId: "agent-002",
      surface: "callcenter",
      manualOverrideReason: "caller_confirmed_gate",
    });
    await client.reverseGeo({
      location: { lat: 25.0338, lng: 121.5645 },
      surface: "ops_console",
      requestedByActorId: "ops-001",
    });

    expect(String(captured[0]?.input)).toBe(
      "https://api.example.test/api/geo/resolve",
    );
    expect(JSON.parse(String(captured[0]?.init?.body))).toMatchObject({
      selectedPoint: { lat: 25.041, lng: 121.55 },
      surface: "callcenter",
      manualOverrideReason: "caller_confirmed_gate",
    });
    expect(String(captured[1]?.input)).toBe(
      "https://api.example.test/api/geo/reverse",
    );
    expect(JSON.parse(String(captured[1]?.init?.body))).toMatchObject({
      location: { lat: 25.0338, lng: 121.5645 },
      surface: "ops_console",
    });
  });

  it("reads service-area definitions with generated freshness metadata", async () => {
    const definitions: ServiceAreaDefinitionsResponse = {
      serviceAreas: [],
      stopPolicies: [],
      generatedAt: "2026-06-30T00:00:00.000Z",
    };
    const captured = stubFetchSequence([{ body: envelope(definitions) }]);
    const client = new ApiClient({ baseUrl: "https://api.example.test" });

    const result = await client.getServiceAreaDefinitions();

    expect(result.generatedAt).toBe("2026-06-30T00:00:00.000Z");
    expect(String(captured[0]?.input)).toBe(
      "https://api.example.test/api/service-area/definitions",
    );
    expect(captured[0]?.init?.method).toBe("GET");
  });

  it.each(["serviceable", "manual_review", "not_serviceable"] as const)(
    "evaluates service-area %s decisions through the typed client",
    async (decision) => {
      const captured = stubFetchSequence([
        { body: envelope(serviceAreaResult(decision)) },
      ]);
      const client = new ApiClient({ baseUrl: "https://api.example.test" });

      const result = await client.evaluateServiceArea({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.041, lng: 121.55 },
        requestedAt: "2026-06-30T00:00:00.000Z",
      });

      expect(result.decision).toBe(decision);
      expect(String(captured[0]?.input)).toBe(
        "https://api.example.test/api/service-area/evaluate",
      );
      expect(JSON.parse(String(captured[0]?.init?.body))).toMatchObject({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.041, lng: 121.55 },
      });
    },
  );

  it("preserves provider-unavailable error codes for degraded UI states", async () => {
    stubFetchSequence([
      {
        status: 503,
        body: {
          error: {
            code: "GEO_PROVIDER_UNAVAILABLE",
            message: "Geocode provider is unavailable.",
            details: { provider: "mock" },
            retryable: true,
            traceId: "trace-geo-provider",
          },
        },
      },
    ]);
    const client = new ApiClient({ baseUrl: "https://api.example.test" });

    await expect(
      client.searchGeo({ q: "__provider_unavailable__" }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "GEO_PROVIDER_UNAVAILABLE",
      retryable: true,
      details: { provider: "mock" },
      traceId: "trace-geo-provider",
    });
  });

  it("preserves invalid-coordinate error codes from service-area evaluation", async () => {
    stubFetchSequence([
      {
        status: 400,
        body: {
          error: {
            code: "INVALID_COORDINATE",
            message: "pickup must include valid lat/lng coordinates.",
            details: { field: "pickup.lat" },
            retryable: false,
          },
        },
      },
    ]);
    const client = new ApiClient({ baseUrl: "https://api.example.test" });

    try {
      await client.evaluateServiceArea({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 95, lng: 121.55 },
      });
      throw new Error("Expected evaluateServiceArea to reject.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect(error).toMatchObject({
        statusCode: 400,
        code: "INVALID_COORDINATE",
        details: { field: "pickup.lat" },
      });
    }
  });

  it("keeps booking surface provenance through create and order read-back API flows", async () => {
    const callcenterCommand: CreateCallCenterOrderCommand = {
      callId: "call-provider-outage-001",
      agentId: "agent-map-001",
      pickup: {
        address: "Concierge caller text pickup while provider is down",
        coordinateSource: "legacy_text",
        manualOverrideReason: "map_provider_unavailable",
        surface: "concierge_portal",
        coordinateProvenance: {
          coordinateSource: "legacy_text",
          geocodeProvider: null,
          geocodeConfidence: null,
          providerCandidateId: null,
          placeId: null,
          coordinateAccuracyM: null,
          selectedByActorId: "agent-map-001",
          selectedAt: "2026-07-01T09:41:00.000Z",
          pinnedByActorId: null,
          pinnedAt: null,
          manualOverrideReason: "map_provider_unavailable",
          surface: "concierge_portal",
        },
      },
      dropoff: {
        address: "Concierge caller text dropoff while provider is down",
        coordinateSource: "legacy_text",
        manualOverrideReason: "map_provider_unavailable",
        surface: "concierge_portal",
      },
      passenger: {
        name: "Provider Outage Caller",
        phone: "+886900000001",
      },
    };
    const partnerCommand: CreateTenantBookingCommand = {
      businessDispatchSubtype: "airport_transfer",
      partnerEntrySlug: "ctbc-provider-outage",
      eligibilityVerificationId: "elig-provider-outage-001",
      pickup: {
        address: "Partner text pickup while provider is down",
        coordinateSource: "legacy_text",
        manualOverrideReason: "map_provider_unavailable",
        surface: "partner_booking",
      },
      dropoff: {
        address: "Partner text dropoff while provider is down",
        coordinateSource: "legacy_text",
        manualOverrideReason: "map_provider_unavailable",
        surface: "partner_booking",
      },
      reservationWindowStart: "2026-07-02T02:00:00.000Z",
      reservationWindowEnd: "2026-07-02T03:00:00.000Z",
      passenger: {
        name: "Provider Outage Partner Guest",
        phone: "+886900000002",
      },
      direction: "pickup",
      flightNo: "BR001",
    };
    const callcenterOrder = {
      orderId: "order-provider-outage-callcenter",
      spatialAudit: {
        surface: "concierge_portal",
        decision: "manual_review",
        missingItems: ["pickup_coordinates", "dropoff_coordinates"],
        stops: [
          {
            kind: "pickup",
            coordinateProvenance: callcenterCommand.pickup.coordinateProvenance,
          },
        ],
      },
    } as OwnedOrderRecord;
    const partnerOrder = {
      orderId: "order-provider-outage-partner",
      partnerEntrySlug: "ctbc-provider-outage",
      spatialAudit: {
        surface: "partner_booking",
        decision: "manual_review",
        missingItems: ["pickup_coordinates", "dropoff_coordinates"],
        stops: [
          {
            kind: "pickup",
            coordinateProvenance: {
              coordinateSource: "legacy_text",
              manualOverrideReason: "map_provider_unavailable",
              surface: "partner_booking",
            },
          },
        ],
      },
    } as OwnedOrderRecord;
    const captured = stubFetchSequence([
      {
        body: envelope({
          orderId: callcenterOrder.orderId,
          orderSource: "phone",
          callId: callcenterCommand.callId,
          recordingId: null,
          status: "ready_for_dispatch",
        }),
      },
      { body: envelope(callcenterOrder) },
      {
        body: envelope({
          orderId: partnerOrder.orderId,
          bookingId: "booking-provider-outage-partner",
          serviceBucket: "business_dispatch",
          businessDispatchSubtype: "airport_transfer",
          dispatchSemantics: "reservation",
          status: "created",
        }),
      },
      { body: envelope(partnerOrder) },
    ]);
    const client = new ApiClient({
      baseUrl: "https://api.example.test",
      defaultHeaders: { "x-tenant-id": "tenant-provider-outage" },
    });

    const callcenterCreate =
      await client.createCallCenterOrder(callcenterCommand);
    const callcenterReadBack = await client.getOrder(callcenterCreate.orderId);
    const partnerCreate = await client.createTenantBooking(partnerCommand);
    const partnerReadBack = await client.getOrder(partnerCreate.orderId);

    expect(JSON.parse(String(captured[0]?.init?.body))).toMatchObject({
      pickup: {
        coordinateSource: "legacy_text",
        manualOverrideReason: "map_provider_unavailable",
        surface: "concierge_portal",
        coordinateProvenance: {
          surface: "concierge_portal",
          manualOverrideReason: "map_provider_unavailable",
        },
      },
    });
    expect(String(captured[1]?.input)).toBe(
      "https://api.example.test/api/orders/order-provider-outage-callcenter",
    );
    expect(callcenterReadBack.spatialAudit).toMatchObject({
      surface: "concierge_portal",
      decision: "manual_review",
      missingItems: ["pickup_coordinates", "dropoff_coordinates"],
    });
    expect(
      callcenterReadBack.spatialAudit?.stops[0]?.coordinateProvenance,
    ).toMatchObject({
      surface: "concierge_portal",
      manualOverrideReason: "map_provider_unavailable",
    });

    expect(JSON.parse(String(captured[2]?.init?.body))).toMatchObject({
      partnerEntrySlug: "ctbc-provider-outage",
      pickup: {
        coordinateSource: "legacy_text",
        manualOverrideReason: "map_provider_unavailable",
        surface: "partner_booking",
      },
    });
    expect(String(captured[3]?.input)).toBe(
      "https://api.example.test/api/orders/order-provider-outage-partner",
    );
    expect(partnerReadBack.spatialAudit).toMatchObject({
      surface: "partner_booking",
      decision: "manual_review",
      missingItems: ["pickup_coordinates", "dropoff_coordinates"],
    });
    expect(
      partnerReadBack.spatialAudit?.stops[0]?.coordinateProvenance,
    ).toMatchObject({
      surface: "partner_booking",
      manualOverrideReason: "map_provider_unavailable",
    });
  });
});
