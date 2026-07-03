import { describe, expect, it, vi } from "vitest";

import { GeoProviderConfigService } from "../../src/modules/geo/geo-provider-config.service";
import { GeoService } from "../../src/modules/geo/geo.service";
import { MockGeoProvider } from "../../src/modules/geo/mock-geo.provider";
import {
  MAP_GEOFENCE_AUDIT_EVENT_DEFINITIONS,
  MAP_GEOFENCE_METRIC_DEFINITIONS,
  MapGeofenceObservabilityService,
} from "../../src/modules/map-geofence-observability/map-geofence-observability.service";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";

function createGeoService(observability: MapGeofenceObservabilityService) {
  return new GeoService(
    new MockGeoProvider(),
    new GeoProviderConfigService({
      NODE_ENV: "test",
      DRTS_ENV: "test",
      MAP_PROVIDER_MODE: "mock",
    }),
    observability,
  );
}

function createMutationService(observability: MapGeofenceObservabilityService) {
  const repository = {
    persistServiceArea: vi.fn().mockResolvedValue(undefined),
    persistStopPolicy: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn((input) => ({
      ...input,
      auditId: `audit-${input.actionName}`,
      requestId: input.requestId ?? "generated-request",
      createdAt: "2026-07-01T10:10:00.000Z",
    })),
  };
  const service = new ServiceAreaService(
    repository as never,
    auditNotificationService as never,
    observability,
  );

  return {
    service,
    context: {
      actorId: "platform-admin-map-001",
      actorType: "platform_admin" as const,
      requestId: "req-map-observability-001",
    },
  };
}

describe("MapGeofenceObservabilityService", () => {
  it("declares every production OBS metric and audit marker with stable labels", () => {
    expect(Object.keys(MAP_GEOFENCE_METRIC_DEFINITIONS)).toEqual(
      expect.arrayContaining([
        "map_geocode_requests_total",
        "map_geocode_latency_ms",
        "map_provider_errors_total",
        "map_provider_quota_usage_percent",
        "coordinate_less_booking_attempts_total",
        "service_area_evaluations_total",
        "service_area_policy_blocks_total",
        "service_area_geometry_mutations_total",
      ]),
    );
    expect(Object.keys(MAP_GEOFENCE_AUDIT_EVENT_DEFINITIONS)).toEqual(
      expect.arrayContaining([
        "geo.address.resolved",
        "geo.pin.confirmed",
        "service_area.evaluated",
        "service_area.policy.published",
        "service_area.policy.retired",
        "geo.manual_override.created",
      ]),
    );

    for (const definition of Object.values(MAP_GEOFENCE_METRIC_DEFINITIONS)) {
      expect(definition.requiredLabels.length).toBeGreaterThan(0);
    }
    for (const definition of Object.values(
      MAP_GEOFENCE_AUDIT_EVENT_DEFINITIONS,
    )) {
      expect(definition.requiredFields.length).toBeGreaterThan(0);
    }
  });

  it("records geocode metrics plus address, pin, and manual-override audit samples", async () => {
    const observability = new MapGeofenceObservabilityService();
    const service = createGeoService(observability);

    await service.resolve({
      addressText: "Caller described a school side gate",
      selectedPoint: { lat: 25.041, lng: 121.55 },
      selectedByActorId: "agent-geo-001",
      surface: "callcenter",
      manualOverrideReason: "caller_confirmed_gate",
    });

    expect(
      observability.listMetricSamples("map_geocode_requests_total"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            provider: "mock",
            surface: "callcenter",
            operation: "resolve",
            result: "success",
          }),
        }),
      ]),
    );
    expect(observability.listMetricSamples("map_geocode_latency_ms")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            provider: "mock",
            surface: "callcenter",
            operation: "resolve",
          }),
        }),
      ]),
    );
    expect(observability.listAuditEventSamples()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "geo.address.resolved" }),
        expect.objectContaining({ name: "geo.pin.confirmed" }),
        expect.objectContaining({
          name: "geo.manual_override.created",
          summary: expect.objectContaining({
            manualOverrideReason: "caller_confirmed_gate",
          }),
        }),
      ]),
    );
  });

  it("records provider-unavailable metrics for degraded booking surfaces", async () => {
    const observability = new MapGeofenceObservabilityService();
    const service = createGeoService(observability);

    await expect(
      service.search({
        q: "__provider_unavailable__",
        surface: "partner_booking",
      }),
    ).rejects.toThrow();

    expect(
      observability.listMetricSamples("map_provider_errors_total"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            provider: "mock",
            surface: "partner_booking",
            operation: "search",
            error_code: "GEO_PROVIDER_UNAVAILABLE",
          }),
        }),
      ]),
    );
    expect(
      observability.listMetricSamples("geo_provider_unavailable_total"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            provider: "mock",
            surface: "partner_booking",
            error_code: "GEO_PROVIDER_UNAVAILABLE",
          }),
        }),
      ]),
    );
  });

  it("records service-area evaluation and policy-block samples", () => {
    const observability = new MapGeofenceObservabilityService();
    const service = new ServiceAreaService(undefined, undefined, observability);

    service.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0478, lng: 121.517 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-07-01T00:00:00.000Z",
      surface: "callcenter",
      requestedByActorId: "agent-service-area-001",
      requestId: "req-service-area-eval-001",
    });

    expect(
      observability.listMetricSamples("service_area_evaluations_total"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            surface: "callcenter",
            decision: "not_serviceable",
            service_product_type: "taxi_realtime",
          }),
        }),
      ]),
    );
    expect(
      observability.listMetricSamples("service_area_policy_blocks_total"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            policy_code: "TPE_STATION_PICKUP_BLOCK",
            effect: "deny",
            direction: "pickup",
          }),
        }),
      ]),
    );
    expect(
      observability.listAuditEventSamples("service_area.evaluated"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "agent-service-area-001",
          requestId: "req-service-area-eval-001",
          summary: expect.objectContaining({
            decision: "not_serviceable",
            serviceProductType: "taxi_realtime",
          }),
        }),
      ]),
    );
  });

  it("records geometry mutation metrics and policy lifecycle audit samples", async () => {
    const observability = new MapGeofenceObservabilityService();
    const { service, context } = createMutationService(observability);

    const created = await service.createStopPolicy(
      {
        policyCode: "OBS_TEST_PICKUP_BLOCK",
        displayName: "OBS test pickup block",
        direction: "pickup",
        effect: "deny",
        geometry: {
          type: "circle",
          center: { lat: 24.15, lng: 120.67 },
          radiusMeters: 120,
        },
        serviceAreaCodes: [],
        serviceProductTypes: ["taxi_realtime"],
        reasonCode: "OBS_TEST_PICKUP_NOT_ALLOWED",
        reasonMessage: "OBS test pickup is not allowed.",
        effectiveFrom: "2026-07-01T00:00:00.000Z",
      },
      context,
    );
    await service.publishStopPolicy(
      created.record.stopPolicyId,
      { reason: "observability evidence" },
      context,
    );
    await service.retireStopPolicy(
      created.record.stopPolicyId,
      {
        reason: "observability evidence complete",
        effectiveUntil: "2026-07-02T00:00:00.000Z",
      },
      context,
    );

    expect(
      observability.listMetricSamples("service_area_geometry_mutations_total"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.objectContaining({
            record_kind: "stop_policy",
            action: "created",
            actor_type: "platform_admin",
          }),
        }),
        expect.objectContaining({
          labels: expect.objectContaining({
            record_kind: "stop_policy",
            action: "published",
            actor_type: "platform_admin",
          }),
        }),
        expect.objectContaining({
          labels: expect.objectContaining({
            record_kind: "stop_policy",
            action: "retired",
            actor_type: "platform_admin",
          }),
        }),
      ]),
    );
    expect(
      observability.listAuditEventSamples("service_area.policy.published"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "platform-admin-map-001",
          summary: expect.objectContaining({
            policyCode: "OBS_TEST_PICKUP_BLOCK",
            version: 1,
            geometryVersionRef: "stop_policy:OBS_TEST_PICKUP_BLOCK@1",
          }),
        }),
      ]),
    );
    expect(
      observability.listAuditEventSamples("service_area.policy.retired"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "platform-admin-map-001",
          summary: expect.objectContaining({
            policyCode: "OBS_TEST_PICKUP_BLOCK",
            effectiveUntil: "2026-07-02T00:00:00.000Z",
          }),
        }),
      ]),
    );
  });
});
