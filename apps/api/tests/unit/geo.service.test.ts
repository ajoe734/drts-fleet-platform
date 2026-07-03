import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { GeoProviderConfigService } from "../../src/modules/geo/geo-provider-config.service";
import { GeoController } from "../../src/modules/geo/geo.controller";
import { GeoService } from "../../src/modules/geo/geo.service";
import { MockGeoProvider } from "../../src/modules/geo/mock-geo.provider";

function createService(env: Record<string, string | undefined> = {}) {
  return new GeoService(
    new MockGeoProvider(),
    new GeoProviderConfigService({
      NODE_ENV: "test",
      DRTS_ENV: "test",
      MAP_PROVIDER_MODE: "mock",
      ...env,
    }),
  );
}

describe("GeoService", () => {
  it("reports mock provider health for local and CI runtime", () => {
    const service = createService();

    expect(service.health()).toMatchObject({
      provider: "mock",
      mode: "mock",
      status: "healthy",
      failClosed: false,
      mockAllowed: true,
      quota: {
        policy: "mock_unlimited",
      },
    });
  });

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

  it("includes a Taipei core serviceable fixture for production E2E success paths", async () => {
    const service = createService();

    const result = await service.search({
      q: "台北市政府",
      surface: "callcenter",
      near: { lat: 25.037, lng: 121.564 },
    });

    expect(result.candidates[0]).toMatchObject({
      candidateId: "mock-taipei-city-hall",
      provider: "mock",
      placeId: "mock-place-taipei-city-hall",
      location: { lat: 25.0375, lng: 121.5637 },
      metadata: { serviceArea: "TAIPEI_CORE" },
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

  it("normalizes candidate miss into a stable not-found domain error", async () => {
    const service = createService();

    try {
      await service.resolve({
        candidateId: "missing-candidate",
        addressText: "Unknown stop",
        surface: "callcenter",
      });
    } catch (error) {
      expect((error as ApiRequestError).getStatus()).toBe(404);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "GEO_CANDIDATE_NOT_FOUND",
          retryable: false,
          details: {
            candidateId: "missing-candidate",
          },
        },
      });
      return;
    }

    throw new Error("Expected missing candidate lookup to fail.");
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

  it("fails closed when production-like runtime tries to use mock provider", async () => {
    const service = createService({
      DRTS_ENV: "production",
      MAP_PROVIDER_MODE: "mock",
    });

    expect(service.health()).toMatchObject({
      mode: "mock",
      status: "unhealthy",
      failClosed: true,
      mockAllowed: false,
    });

    await expect(
      service.search({
        q: "台北車站",
        surface: "callcenter",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("fails closed with an explicit check when provider mode is invalid", () => {
    const service = createService({
      MAP_PROVIDER_MODE: "oops",
    });

    expect(service.health()).toMatchObject({
      mode: "disabled",
      status: "unhealthy",
      failClosed: true,
      checks: expect.arrayContaining([
        expect.objectContaining({
          name: "provider_mode",
          status: "fail",
        }),
      ]),
    });
  });

  it("fails closed when external provider mode is missing required secrets", async () => {
    const service = createService({
      DRTS_ENV: "staging",
      MAP_PROVIDER_MODE: "external",
      MAP_PROVIDER_ALLOWED_ORIGINS: "https://ops.example.com",
      MAP_PROVIDER_SERVER_KEY: "",
    });

    expect(service.health()).toMatchObject({
      mode: "external",
      status: "unhealthy",
      failClosed: true,
      requiredSecretNames: ["MAP_PROVIDER_SERVER_KEY"],
      missingSecretNames: ["MAP_PROVIDER_SERVER_KEY"],
    });

    try {
      await service.reverse({
        location: { lat: 25.0478, lng: 121.5171 },
        surface: "ops_console",
      });
    } catch (error) {
      expect((error as ApiRequestError).getStatus()).toBe(503);
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "GEO_PROVIDER_NOT_CONFIGURED",
          retryable: true,
          details: {
            mode: "external",
            missingSecretNames: ["MAP_PROVIDER_SERVER_KEY"],
          },
        },
      });
      return;
    }

    throw new Error("Expected external provider configuration to fail closed.");
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
  it("wraps provider health in the platform API envelope", () => {
    const controller = new GeoController(createService());

    const result = controller.health("req-geo-health");

    expect(result.meta.requestId).toBe("req-geo-health");
    expect(result.data).toMatchObject({
      provider: "mock",
      status: "healthy",
      failClosed: false,
    });
  });

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

  it("wraps resolve responses in the platform API envelope", async () => {
    const controller = new GeoController(createService());

    const result = await controller.resolve(
      {
        candidateId: "mock-taipei-city-hall",
        addressText: "台北市政府",
        selectedByActorId: "agent-007",
        surface: "callcenter",
      },
      "req-geo-resolve-001",
    );

    expect(result.meta.requestId).toBe("req-geo-resolve-001");
    expect(result.data.address).toMatchObject({
      address: "台北市信義區市府路1號",
      placeId: "mock-place-taipei-city-hall",
      geocodeProvider: "mock",
      surface: "callcenter",
    });
  });

  it("wraps reverse responses in the platform API envelope", async () => {
    const controller = new GeoController(createService());

    const result = await controller.reverse(
      {
        location: { lat: 25.0338, lng: 121.5645 },
        surface: "ops_console",
        requestedByActorId: "ops-geo-1",
      },
      "req-geo-reverse-001",
    );

    expect(result.meta.requestId).toBe("req-geo-reverse-001");
    expect(result.data.address).toMatchObject({
      address: "台北市信義區吳興街252號",
      placeId: "mock-place-xinyi-hospital",
      coordinateSource: "reverse_geocode",
      geocodeProvider: "mock",
      surface: "ops_console",
    });
  });
});
