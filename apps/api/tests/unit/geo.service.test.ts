import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { GeoController } from "../../src/modules/geo/geo.controller";
import { GeoService } from "../../src/modules/geo/geo.service";
import { MockGeoProvider } from "../../src/modules/geo/mock-geo.provider";

function createService() {
  return new GeoService(new MockGeoProvider());
}

describe("GeoService", () => {
  it("searches deterministic mock candidates for CI and E2E", async () => {
    const service = createService();

    const result = await service.search({
      q: "台北車站",
      surface: "callcenter",
      near: { lat: 25.05, lng: 121.52 },
    });

    expect(result.provider).toBe("mock");
    expect(result.candidates[0]).toMatchObject({
      candidateId: "mock-taipei-station",
      provider: "mock",
      placeId: "mock-place-taipei-station",
      location: { lat: 25.0478, lng: 121.5171 },
      confidence: "exact",
    });
  });

  it("resolves provider candidates into auditable address payloads", async () => {
    const service = createService();

    const result = await service.resolve({
      candidateId: "mock-taipei-station",
      addressText: "台北車站",
      selectedByActorId: "agent-001",
      surface: "callcenter",
    });

    expect(result.address).toMatchObject({
      address: "台北市中正區北平西路3號",
      lat: 25.0478,
      lng: 121.5171,
      placeId: "mock-place-taipei-station",
      geocodeProvider: "mock",
      geocodeConfidence: "exact",
      coordinateSource: "provider_candidate",
      selectedByActorId: "agent-001",
      pinnedByActorId: "agent-001",
      surface: "callcenter",
    });
    expect(result.address.selectedAt).toEqual(expect.any(String));
    expect(result.address.pinnedAt).toEqual(expect.any(String));
  });

  it("supports explicit manual pin fallback with override reason", async () => {
    const service = createService();

    const result = await service.resolve({
      addressText: "Caller described a side gate",
      selectedPoint: { lat: 25.041, lng: 121.55 },
      selectedByActorId: "agent-002",
      surface: "callcenter",
      manualOverrideReason: "caller_confirmed_gate",
    });

    expect(result.candidate).toBeNull();
    expect(result.address).toMatchObject({
      address: "Caller described a side gate",
      lat: 25.041,
      lng: 121.55,
      geocodeConfidence: "manual",
      coordinateSource: "manual_pin",
      manualOverrideReason: "caller_confirmed_gate",
    });
  });

  it("reverse geocodes coordinates to nearest deterministic fixture", async () => {
    const service = createService();

    const result = await service.reverse({
      location: { lat: 25.0798, lng: 121.2341 },
      surface: "ops_console",
      requestedByActorId: "ops-001",
    });

    expect(result.address).toMatchObject({
      placeId: "mock-place-taoyuan-airport-t1",
      coordinateSource: "reverse_geocode",
      geocodeProvider: "mock",
      surface: "ops_console",
      selectedByActorId: "ops-001",
    });
  });

  it("normalizes provider outage into retryable API errors", async () => {
    const service = createService();

    await expect(
      service.search({
        q: "__provider_unavailable__",
        surface: "callcenter",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    try {
      await service.search({
        q: "__provider_unavailable__",
        surface: "callcenter",
      });
    } catch (error) {
      expect((error as ApiRequestError).getStatus()).toBe(503);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "GEO_PROVIDER_UNAVAILABLE",
          retryable: true,
          details: { provider: "mock" },
        },
      });
    }
  });

  it("rejects invalid search and coordinate input before hitting provider", async () => {
    const service = createService();

    await expect(
      service.search({
        q: "",
        surface: "callcenter",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    await expect(
      service.reverse({
        location: { lat: 95, lng: 121.517 },
        surface: "callcenter",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe("GeoController", () => {
  it("wraps geo responses in the platform API envelope", async () => {
    const controller = new GeoController(createService());

    const result = await controller.search(
      { q: "taoyuan airport", surface: "callcenter", limit: "1" },
      "req-geo-001",
    );

    expect(result.meta.requestId).toBe("req-geo-001");
    expect(result.data.candidates).toHaveLength(1);
    expect(result.data.candidates[0].candidateId).toBe(
      "mock-taoyuan-airport-t1",
    );
  });
});
