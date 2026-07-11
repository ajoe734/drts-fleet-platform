import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { MapGeofenceObservabilityService } from "../../src/modules/operational-observability/map-geofence-observability.service";
import { ServiceAreaController } from "../../src/modules/service-area/service-area.controller";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";

function createService() {
  return new ServiceAreaService();
}

function createMutationService(
  repositoryOverrides = {},
  observability?: MapGeofenceObservabilityService,
) {
  const repository = {
    loadState: vi.fn().mockResolvedValue({
      serviceAreas: [],
      stopPolicies: [],
    }),
    persistServiceArea: vi.fn().mockResolvedValue(undefined),
    persistStopPolicy: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
    ...repositoryOverrides,
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn((input) => ({
      ...input,
      auditId: `audit-${input.actionName}`,
      requestId: input.requestId ?? "generated-request",
      createdAt: "2026-06-30T10:00:00.000Z",
    })),
  };
  const service = new ServiceAreaService(
    repository as never,
    auditNotificationService as never,
    observability,
  );

  return {
    service,
    repository,
    auditNotificationService,
    observability,
    context: {
      actorId: "platform-admin-geo-001",
      actorType: "platform_admin" as const,
      requestId: "req-service-area-admin-001",
    },
  };
}

function createObservedEvaluationService() {
  const auditNotificationService = {
    recordAuditLog: vi.fn((input) => ({
      ...input,
      auditId: `audit-${input.actionName}`,
      requestId: input.requestId ?? "generated-request",
      createdAt: "2026-07-01T00:00:00.000Z",
    })),
  };
  const observability = new MapGeofenceObservabilityService();
  const service = new ServiceAreaService(
    undefined,
    auditNotificationService as never,
    observability,
  );
  return { service, auditNotificationService, observability };
}

describe("ServiceAreaService", () => {
  it("returns serviceable when pickup and dropoff are inside an active area", () => {
    const service = createService();

    const result = service.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.041, lng: 121.55 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(result.decision).toBe("serviceable");
    expect(result.serviceAreaCodes).toEqual(["TAIPEI_CORE"]);
    expect(result.geometryVersionRefs).toEqual(["service_area:TAIPEI_CORE@1"]);
    expect(result.reasonCodes).toEqual([]);
    expect(result.stops).toHaveLength(2);
  });

  it("exempts products with no active service area defined from service-area check", () => {
    const service = createService();

    // insurance_replacement_vehicle has no active service areas seeded
    const result = service.evaluate({
      serviceProductType: "insurance_replacement_vehicle",
      pickup: { lat: 25.041, lng: 121.55 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(result.decision).toBe("serviceable");
    expect(result.serviceAreaCodes).toEqual([]);
    expect(result.geometryVersionRefs).toEqual([]);
    expect(result.reasonCodes).toEqual([]);
  });

  it("rejects pickup points outside the service area", () => {
    const service = createService();

    const result = service.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 24.15, lng: 120.67 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(result.decision).toBe("not_serviceable");
    expect(result.reasonCodes).toContain("PICKUP_AREA_NOT_SERVICEABLE");
    expect(result.stops[0]).toMatchObject({
      kind: "pickup",
      decision: "not_serviceable",
      serviceAreaCodes: [],
    });
  });

  it("hard-blocks a pickup point inside a deny stop policy", () => {
    const service = createService();

    const result = service.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0478, lng: 121.517 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(result.decision).toBe("not_serviceable");
    expect(result.reasonCodes).toContain("PICKUP_NOT_ALLOWED");
    expect(result.geometryVersionRefs).toEqual([
      "service_area:TAIPEI_CORE@1",
      "stop_policy:TPE_STATION_PICKUP_BLOCK@1",
    ]);
    expect(result.stops[0]).toMatchObject({
      kind: "pickup",
      decision: "not_serviceable",
      policyCodes: ["TPE_STATION_PICKUP_BLOCK"],
      geometryVersionRefs: [
        "service_area:TAIPEI_CORE@1",
        "stop_policy:TPE_STATION_PICKUP_BLOCK@1",
      ],
    });
  });

  it("audits evaluations and separates policy denial from coordinate-less attempts", () => {
    const { service, auditNotificationService, observability } =
      createObservedEvaluationService();

    service.evaluate(
      {
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.0478, lng: 121.517 },
        dropoff: { lat: 25.06, lng: 121.58 },
        requestedAt: "2026-06-30T00:00:00.000Z",
      },
      "req-service-area-eval-001",
    );
    expect(() =>
      service.evaluate(
        {
          serviceProductType: "taxi_realtime",
          pickup: { lat: 25.041 } as never,
        },
        "req-service-area-eval-002",
      ),
    ).toThrowError(ApiRequestError);

    expect(observability.getSnapshot()).toMatchObject({
      serviceArea: {
        evaluations: 2,
        policyDenialCount: 1,
        coordinateLessAttemptCount: 1,
        outOfAreaCount: 0,
      },
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "service_area.evaluated",
        requestId: "req-service-area-eval-001",
        newValuesSummary: expect.objectContaining({
          decision: "not_serviceable",
          policyCodes: ["TPE_STATION_PICKUP_BLOCK"],
        }),
      }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "service_area.evaluated",
        requestId: "req-service-area-eval-002",
        newValuesSummary: expect.objectContaining({
          decision: "coordinate_less_attempt",
          coordinateLessAttempt: true,
        }),
      }),
    );
  });

  it("returns manual review when a stop hits a review-only policy", () => {
    const service = createService();

    const result = service.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0338, lng: 121.5645 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-06-30T00:00:00.000Z",
    });

    expect(result.decision).toBe("manual_review");
    expect(result.reasonCodes).toContain("STOP_REQUIRES_MANUAL_REVIEW");
    expect(result.geometryVersionRefs).toEqual([
      "service_area:TAIPEI_CORE@1",
      "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
    ]);
    expect(result.stops[0]).toMatchObject({
      kind: "pickup",
      decision: "manual_review",
      policyCodes: ["XINYI_HOSPITAL_MANUAL_REVIEW"],
      geometryVersionRefs: [
        "service_area:TAIPEI_CORE@1",
        "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
      ],
    });
  });

  it("uses service product scoping when matching areas", () => {
    const service = createService();

    expect(
      service.evaluate({
        serviceProductType: "credit_card_airport_transfer",
        pickup: { lat: 25.0797, lng: 121.2342 },
        requestedAt: "2026-06-30T00:00:00.000Z",
      }),
    ).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["TAOYUAN_AIRPORT"],
    });

    expect(
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.0797, lng: 121.2342 },
        requestedAt: "2026-06-30T00:00:00.000Z",
      }).decision,
    ).toBe("not_serviceable");
  });

  it("rejects invalid coordinates with a 400 contract error", () => {
    const service = createService();

    expect(() =>
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 95, lng: 121.55 },
      }),
    ).toThrowError(ApiRequestError);

    try {
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 95, lng: 121.55 },
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "INVALID_COORDINATE",
          details: { field: "pickup.lat" },
        },
      });
    }
  });

  it("returns definitions with generated freshness metadata", () => {
    const controller = new ServiceAreaController(createService());

    const envelope = controller.listDefinitions("req-service-area-defs");

    expect(envelope.meta.requestId).toBe("req-service-area-defs");
    expect(envelope.data.generatedAt).toEqual(expect.any(String));
    expect(envelope.data.serviceAreas.length).toBeGreaterThan(0);
    expect(envelope.data.stopPolicies.length).toBeGreaterThan(0);
  });

  it("exports governed admin GeoJSON layers with lifecycle metadata", () => {
    const controller = new ServiceAreaController(createService());

    const envelope = controller.exportAdminGeoJson("req-service-area-geojson");
    const airportArea = envelope.data.features.find(
      (feature) =>
        feature.properties.recordKind === "service_area" &&
        feature.properties.areaCode === "TAOYUAN_AIRPORT",
    );
    const stationPolicy = envelope.data.features.find(
      (feature) =>
        feature.properties.recordKind === "stop_policy" &&
        feature.properties.policyCode === "TPE_STATION_PICKUP_BLOCK",
    );

    expect(envelope.meta.requestId).toBe("req-service-area-geojson");
    expect(envelope.data.type).toBe("FeatureCollection");
    expect(envelope.data.generatedAt).toEqual(expect.any(String));
    expect(airportArea).toMatchObject({
      type: "Feature",
      geometry: { type: "Polygon" },
      properties: {
        recordKind: "service_area",
        areaCode: "TAOYUAN_AIRPORT",
        status: "active",
        sourceGeometry: { type: "circle", radiusMeters: 6500 },
        geometryVersionRef: "service_area:TAOYUAN_AIRPORT@1",
      },
    });
    expect(airportArea?.geometry.coordinates[0]?.length).toBeGreaterThan(4);
    expect(stationPolicy).toMatchObject({
      properties: {
        recordKind: "stop_policy",
        direction: "pickup",
        effect: "deny",
        geometryVersionRef: "stop_policy:TPE_STATION_PICKUP_BLOCK@1",
      },
    });
  });

  it("merges persisted governance state with baseline service-area seeds on startup", async () => {
    const repository = {
      loadState: vi.fn().mockResolvedValue({
        serviceAreas: [
          {
            serviceAreaId: "55555555-5555-4555-8555-555555555555",
            areaCode: "DB_ONLY_CORE",
            displayName: "Database-only service area",
            status: "active",
            geometry: {
              type: "circle",
              center: { lat: 24.8, lng: 121.0 },
              radiusMeters: 1200,
            },
            serviceProductTypes: ["taxi_realtime"],
            effectiveFrom: "2026-01-01T00:00:00.000Z",
            effectiveUntil: null,
            version: 1,
            metadata: { source: "db" },
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        stopPolicies: [],
      }),
      persistServiceArea: vi.fn(),
      persistStopPolicy: vi.fn(),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new ServiceAreaService(repository as never);

    await service.onModuleInit();

    const areaCodes = service
      .listServiceAreas()
      .map((record) => record.areaCode);
    expect(areaCodes).toEqual(
      expect.arrayContaining([
        "DB_ONLY_CORE",
        "TAIPEI_CORE",
        "TAOYUAN_AIRPORT",
      ]),
    );
    expect(new Set(areaCodes).size).toBe(areaCodes.length);
    expect(
      service.listStopPolicies().map((record) => record.policyCode),
    ).toEqual(
      expect.arrayContaining([
        "TPE_STATION_PICKUP_BLOCK",
        "XINYI_HOSPITAL_MANUAL_REVIEW",
      ]),
    );
  });

  it("rejects service-area creates when persistence fails without mutating memory or audit", async () => {
    const { service, repository, auditNotificationService, context } =
      createMutationService({
        persistServiceArea: vi
          .fn()
          .mockRejectedValue(new Error("database unavailable")),
      });

    await expect(
      service.createServiceArea(
        {
          areaCode: "DB_FAIL_CORE",
          displayName: "Persistence failure area",
          geometry: {
            type: "circle",
            center: { lat: 24.99, lng: 121.3 },
            radiusMeters: 1200,
          },
          serviceProductTypes: ["taxi_realtime"],
        },
        context,
      ),
    ).rejects.toThrowError(ApiRequestError);

    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "create_service_area",
    );
    expect(
      service
        .listServiceAreas()
        .some((record) => record.areaCode === "DB_FAIL_CORE"),
    ).toBe(false);
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
  });

  it("rolls back service-area updates when persistence fails", async () => {
    const { service, repository, context } = createMutationService();
    const created = await service.createServiceArea(
      {
        areaCode: "ROLLBACK_CORE",
        displayName: "Rollback original area",
        geometry: {
          type: "circle",
          center: { lat: 24.91, lng: 121.22 },
          radiusMeters: 900,
        },
        serviceProductTypes: ["taxi_realtime"],
      },
      context,
    );
    repository.persistServiceArea.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(
      service.updateServiceArea(
        created.record.serviceAreaId,
        { displayName: "Rollback mutated area" },
        context,
      ),
    ).rejects.toThrowError(ApiRequestError);

    expect(
      service
        .listServiceAreas()
        .find((record) => record.serviceAreaId === created.record.serviceAreaId)
        ?.displayName,
    ).toBe("Rollback original area");
    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "update_service_area",
    );
  });

  it("publishes service-area drafts and feeds the evaluator immediately", async () => {
    const observability = new MapGeofenceObservabilityService();
    const { service, repository, auditNotificationService, context } =
      createMutationService({}, observability);

    expect(
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.6273, lng: 120.3014 },
        requestedAt: "2026-07-01T00:00:00.000Z",
      }).decision,
    ).toBe("not_serviceable");

    const created = await service.createServiceArea(
      {
        areaCode: "KHH_CORE",
        displayName: "Kaohsiung core operating area",
        geometry: {
          type: "polygon",
          coordinates: [
            { lat: 22.58, lng: 120.25 },
            { lat: 22.58, lng: 120.36 },
            { lat: 22.68, lng: 120.36 },
            { lat: 22.68, lng: 120.25 },
          ],
        },
        serviceProductTypes: ["taxi_realtime"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        metadata: { governanceDomain: "taxi_service_area" },
      },
      context,
    );
    expect(created.record).toMatchObject({
      areaCode: "KHH_CORE",
      status: "draft",
      version: 1,
    });

    const review = await service.submitServiceAreaForReview(
      created.record.serviceAreaId,
      context,
    );
    expect(review.record.status).toBe("review");

    const published = await service.publishServiceArea(
      created.record.serviceAreaId,
      { reason: "launch kaohsiung pilot" },
      context,
    );

    expect(published.record.status).toBe("active");
    expect(
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.6273, lng: 120.3014 },
        requestedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["KHH_CORE"],
      geometryVersionRefs: ["service_area:KHH_CORE@1"],
    });
    expect(repository.persistServiceArea).toHaveBeenCalledTimes(3);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "service_area.boundary.published",
        actorId: "platform-admin-geo-001",
        actorType: "platform_admin",
        requestId: "req-service-area-admin-001",
        newValuesSummary: expect.objectContaining({
          areaCode: "KHH_CORE",
          geometryVersionRef: "service_area:KHH_CORE@1",
        }),
      }),
    );
    expect(observability.getSnapshot()).toMatchObject({
      governance: {
        geometryMutationCount: 2,
        serviceAreaPublishedCount: 1,
      },
    });
  });

  it("keeps future-effective published service areas out of evaluator until active", async () => {
    const { service, context } = createMutationService();
    const created = await service.createServiceArea(
      {
        areaCode: "CYI_CORE",
        displayName: "Chiayi future operating area",
        geometry: {
          type: "circle",
          center: { lat: 23.48, lng: 120.45 },
          radiusMeters: 2200,
        },
        serviceProductTypes: ["taxi_realtime"],
        effectiveFrom: "2026-08-01T00:00:00.000Z",
      },
      context,
    );
    await service.publishServiceArea(
      created.record.serviceAreaId,
      { reason: "scheduled launch" },
      context,
    );

    expect(
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 23.48, lng: 120.45 },
        requestedAt: "2026-07-31T23:59:59.000Z",
      }).decision,
    ).toBe("not_serviceable");
    expect(
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 23.48, lng: 120.45 },
        requestedAt: "2026-08-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["CYI_CORE"],
      geometryVersionRefs: ["service_area:CYI_CORE@1"],
    });
  });

  it("rejects overlapping active versions for the same service-area code", async () => {
    const { service, repository, context } = createMutationService();
    const first = await service.createServiceArea(
      {
        areaCode: "VERSIONED_CORE",
        displayName: "Versioned core first window",
        geometry: {
          type: "circle",
          center: { lat: 24.1477, lng: 120.6736 },
          radiusMeters: 1800,
        },
        serviceProductTypes: ["taxi_realtime"],
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2026-12-31T00:00:00.000Z",
      },
      context,
    );
    await service.publishServiceArea(
      first.record.serviceAreaId,
      { reason: "initial version" },
      context,
    );
    const overlapping = await service.createServiceArea(
      {
        areaCode: "VERSIONED_CORE",
        displayName: "Versioned core overlapping window",
        geometry: {
          type: "circle",
          center: { lat: 24.1477, lng: 120.6736 },
          radiusMeters: 2000,
        },
        serviceProductTypes: ["taxi_realtime"],
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: "2026-07-01T00:00:00.000Z",
      },
      context,
    );

    await expect(
      service.publishServiceArea(
        overlapping.record.serviceAreaId,
        { reason: "overlapping version should fail" },
        context,
      ),
    ).rejects.toThrowError(ApiRequestError);
    expect(repository.persistServiceArea).toHaveBeenCalledTimes(3);
  });

  it("publishes and retires stop policies without losing service-area coverage", async () => {
    const observability = new MapGeofenceObservabilityService();
    const { service, repository, auditNotificationService, context } =
      createMutationService({}, observability);
    const policy = await service.createStopPolicy(
      {
        policyCode: "CITY_HALL_PICKUP_BLOCK",
        displayName: "City Hall pickup access block",
        direction: "pickup",
        effect: "deny",
        geometry: {
          type: "circle",
          center: { lat: 25.0375, lng: 121.5637 },
          radiusMeters: 120,
        },
        serviceAreaCodes: ["TAIPEI_CORE"],
        serviceProductTypes: ["taxi_realtime"],
        reasonCode: "PICKUP_NOT_ALLOWED",
        reasonMessage: "Pickup requires the signed city-hall curb lane.",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        metadata: { governanceDomain: "taxi_stop_policy" },
      },
      context,
    );
    const review = await service.submitStopPolicyForReview(
      policy.record.stopPolicyId,
      context,
    );
    expect(review.record).toMatchObject({
      policyCode: "CITY_HALL_PICKUP_BLOCK",
      status: "review",
      version: 1,
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
    });
    expect(
      service
        .exportGeoJson()
        .features.find(
          (feature) =>
            feature.properties.recordKind === "stop_policy" &&
            feature.properties.policyCode === "CITY_HALL_PICKUP_BLOCK",
        ),
    ).toMatchObject({
      properties: {
        recordKind: "stop_policy",
        policyCode: "CITY_HALL_PICKUP_BLOCK",
        status: "review",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        version: 1,
        geometryVersionRef: "stop_policy:CITY_HALL_PICKUP_BLOCK@1",
      },
    });
    const published = await service.publishStopPolicy(
      policy.record.stopPolicyId,
      { reason: "temporary city hall curb works" },
      context,
    );

    expect(published.record.status).toBe("active");
    expect(
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.0375, lng: 121.5637 },
        dropoff: { lat: 25.041, lng: 121.55 },
        requestedAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      decision: "not_serviceable",
      reasonCodes: ["PICKUP_NOT_ALLOWED"],
      geometryVersionRefs: expect.arrayContaining([
        "stop_policy:CITY_HALL_PICKUP_BLOCK@1",
      ]),
    });

    const retired = await service.retireStopPolicy(
      policy.record.stopPolicyId,
      {
        effectiveUntil: "2026-07-15T00:00:00.000Z",
        reason: "curb works completed",
      },
      context,
    );

    expect(retired.record.status).toBe("retired");
    expect(
      service
        .exportGeoJson()
        .features.find(
          (feature) =>
            feature.properties.recordKind === "stop_policy" &&
            feature.properties.policyCode === "CITY_HALL_PICKUP_BLOCK",
        ),
    ).toMatchObject({
      properties: {
        recordKind: "stop_policy",
        policyCode: "CITY_HALL_PICKUP_BLOCK",
        status: "retired",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: "2026-07-15T00:00:00.000Z",
        version: 1,
        geometryVersionRef: "stop_policy:CITY_HALL_PICKUP_BLOCK@1",
      },
    });
    expect(
      service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.0375, lng: 121.5637 },
        dropoff: { lat: 25.041, lng: 121.55 },
        requestedAt: "2026-07-01T00:00:00.000Z",
      }).decision,
    ).toBe("serviceable");
    expect(repository.persistStopPolicy).toHaveBeenCalledTimes(4);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "service_area.stop_policy.submitted_for_review",
        actorId: "platform-admin-geo-001",
        actorType: "platform_admin",
        requestId: "req-service-area-admin-001",
        newValuesSummary: expect.objectContaining({
          policyCode: "CITY_HALL_PICKUP_BLOCK",
          status: "review",
          version: 1,
        }),
      }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "service_area.stop_policy.published",
        actorId: "platform-admin-geo-001",
        actorType: "platform_admin",
        requestId: "req-service-area-admin-001",
        newValuesSummary: expect.objectContaining({
          policyCode: "CITY_HALL_PICKUP_BLOCK",
          status: "active",
          version: 1,
          geometryVersionRef: "stop_policy:CITY_HALL_PICKUP_BLOCK@1",
        }),
      }),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "service_area.stop_policy.retired",
        actorId: "platform-admin-geo-001",
        actorType: "platform_admin",
        requestId: "req-service-area-admin-001",
        newValuesSummary: expect.objectContaining({
          policyCode: "CITY_HALL_PICKUP_BLOCK",
          status: "retired",
          version: 1,
          effectiveUntil: "2026-07-15T00:00:00.000Z",
        }),
      }),
    );
    expect(observability.getSnapshot()).toMatchObject({
      governance: {
        geometryMutationCount: 3,
        stopPolicyPublishedCount: 1,
        stopPolicyRetiredCount: 1,
      },
    });
  });

  it("rejects self-intersecting service-area geometry before persistence", async () => {
    const { service, repository, context } = createMutationService();

    await expect(
      service.createServiceArea(
        {
          areaCode: "BAD_BOWTIE",
          displayName: "Invalid bowtie polygon",
          geometry: {
            type: "polygon",
            coordinates: [
              { lat: 25.0, lng: 121.5 },
              { lat: 25.1, lng: 121.6 },
              { lat: 25.0, lng: 121.6 },
              { lat: 25.1, lng: 121.5 },
            ],
          },
          serviceProductTypes: ["taxi_realtime"],
        },
        context,
      ),
    ).rejects.toThrowError(ApiRequestError);
    expect(repository.persistServiceArea).not.toHaveBeenCalled();
  });

  it("exposes admin mutation envelopes through the controller", async () => {
    const { service, auditNotificationService } = createMutationService();
    const controller = new ServiceAreaController(service);

    const envelope = await controller.createServiceArea(
      {
        areaCode: "TNN_CORE",
        displayName: "Tainan core area",
        geometry: {
          type: "circle",
          center: { lat: 22.9997, lng: 120.227 },
          radiusMeters: 3500,
        },
        serviceProductTypes: ["taxi_realtime"],
      },
      {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "platform-admin-geo-002",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["service-area:write"],
        requestId: "req-controller-admin-001",
      },
      "req-controller-admin-001",
    );

    expect(envelope.meta.requestId).toBe("req-controller-admin-001");
    expect(envelope.data.serviceArea).toMatchObject({
      areaCode: "TNN_CORE",
      status: "draft",
    });
    expect(envelope.data.auditId).toBe("audit-service_area.boundary.created");
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "platform-admin-geo-002",
        actionName: "service_area.boundary.created",
      }),
    );
  });
});
