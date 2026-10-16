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

  it("exports only active and effective layers to operational map consumers", async () => {
    const { service, context } = createMutationService();
    const draft = await service.createServiceArea(
      {
        areaCode: "DRAFT_MAP_AREA",
        displayName: "Draft map area",
        geometry: {
          type: "circle",
          center: { lat: 24.99, lng: 121.3 },
          radiusMeters: 900,
        },
        serviceProductTypes: ["taxi_realtime"],
      },
      context,
    );
    const future = await service.createServiceArea(
      {
        areaCode: "FUTURE_MAP_AREA",
        displayName: "Future map area",
        geometry: {
          type: "circle",
          center: { lat: 23.48, lng: 120.45 },
          radiusMeters: 900,
        },
        serviceProductTypes: ["taxi_realtime"],
        effectiveFrom: "2026-08-01T00:00:00.000Z",
      },
      context,
    );
    await service.submitServiceAreaForReview(
      future.record.serviceAreaId,
      context,
    );
    await service.publishServiceArea(
      future.record.serviceAreaId,
      { reason: "future rollout" },
      context,
    );

    const controller = new ServiceAreaController(service);
    const operational = service.exportOperationalGeoJson(
      new Date("2026-07-11T00:00:00.000Z"),
    );
    const admin = controller.exportAdminGeoJson().data;
    const operationalCodes = operational.features.map((feature) =>
      feature.properties.recordKind === "service_area"
        ? feature.properties.areaCode
        : feature.properties.policyCode,
    );
    const adminCodes = admin.features.map((feature) =>
      feature.properties.recordKind === "service_area"
        ? feature.properties.areaCode
        : feature.properties.policyCode,
    );

    expect(adminCodes).toEqual(
      expect.arrayContaining([draft.record.areaCode, future.record.areaCode]),
    );
    expect(operationalCodes).not.toContain(draft.record.areaCode);
    expect(operationalCodes).not.toContain(future.record.areaCode);
    expect(
      operational.features.every(
        (feature) => feature.properties.status === "active",
      ),
    ).toBe(true);
    expect(
      controller.exportOperationalGeoJson("req-operational-map").meta.requestId,
    ).toBe("req-operational-map");
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

  describe("polygon holes: contract normalization and ring semantics", () => {
    const KHH_DONUT_OUTER = [
      { lat: 22.58, lng: 120.25 },
      { lat: 22.58, lng: 120.35 },
      { lat: 22.68, lng: 120.35 },
      { lat: 22.68, lng: 120.25 },
    ];
    const KHH_DONUT_HOLE = [
      { lat: 22.61, lng: 120.28 },
      { lat: 22.61, lng: 120.32 },
      { lat: 22.65, lng: 120.32 },
      { lat: 22.65, lng: 120.28 },
    ];

    it("retains unclosed canonical holes and serializes GeoJSON exterior CCW / hole CW", async () => {
      const { service, context } = createMutationService();
      const created = await service.createServiceArea(
        {
          areaCode: "KHH_DONUT_CORE",
          displayName: "Kaohsiung donut operating area",
          geometry: {
            type: "polygon",
            coordinates: KHH_DONUT_OUTER,
            holes: [KHH_DONUT_HOLE],
          },
          serviceProductTypes: ["taxi_realtime"],
          effectiveFrom: "2026-06-01T00:00:00.000Z",
        },
        context,
      );

      expect(created.record.geometry).toEqual({
        type: "polygon",
        coordinates: KHH_DONUT_OUTER,
        holes: [KHH_DONUT_HOLE],
      });

      const feature = service
        .exportGeoJson()
        .features.find((f) => f.id === created.record.serviceAreaId)!;
      expect(feature.geometry.coordinates).toHaveLength(2);
      expect(feature.properties.sourceGeometry).toMatchObject({
        holes: [KHH_DONUT_HOLE],
      });
      const [outerRing, holeRing] = feature.geometry.coordinates;
      expect(signedShoelaceArea(outerRing!)).toBeGreaterThan(0);
      expect(signedShoelaceArea(holeRing!)).toBeLessThan(0);
      expect(outerRing![0]).toEqual(outerRing![outerRing!.length - 1]);
      expect(holeRing![0]).toEqual(holeRing![holeRing!.length - 1]);
    });

    it("accepts either winding on input and still normalizes two disjoint holes correctly", async () => {
      const { service, context } = createMutationService();
      // Outer ring input clockwise; hole 0 input counterclockwise; hole 1 input clockwise.
      const outerCw = [
        { lat: 22.58, lng: 120.25 },
        { lat: 22.68, lng: 120.25 },
        { lat: 22.68, lng: 120.35 },
        { lat: 22.58, lng: 120.35 },
      ];
      const hole0Ccw = [
        { lat: 22.61, lng: 120.28 },
        { lat: 22.61, lng: 120.32 },
        { lat: 22.65, lng: 120.32 },
        { lat: 22.65, lng: 120.28 },
      ];
      const hole1Cw = [
        { lat: 22.59, lng: 120.33 },
        { lat: 22.60, lng: 120.33 },
        { lat: 22.60, lng: 120.34 },
        { lat: 22.59, lng: 120.34 },
      ];

      const created = await service.createServiceArea(
        {
          areaCode: "KHH_DONUT_TWOHOLE",
          displayName: "Kaohsiung two-hole donut",
          geometry: {
            type: "polygon",
            coordinates: outerCw,
            holes: [hole0Ccw, hole1Cw],
          },
          serviceProductTypes: ["taxi_realtime"],
          effectiveFrom: "2026-06-01T00:00:00.000Z",
        },
        context,
      );

      expect(created.record.geometry).toEqual({
        type: "polygon",
        coordinates: outerCw,
        holes: [hole0Ccw, hole1Cw],
      });
      const feature = service
        .exportGeoJson()
        .features.find((f) => f.id === created.record.serviceAreaId)!;
      const [outerRing, ring0, ring1] = feature.geometry.coordinates;
      expect(signedShoelaceArea(outerRing!)).toBeGreaterThan(0);
      expect(signedShoelaceArea(ring0!)).toBeLessThan(0);
      expect(signedShoelaceArea(ring1!)).toBeLessThan(0);
    });

    it("omits the holes field for backward compatibility when absent or empty", async () => {
      const { service, context } = createMutationService();
      const createdWithoutHoles = await service.createServiceArea(
        {
          areaCode: "KHH_SOLID_CORE",
          displayName: "Kaohsiung solid core",
          geometry: { type: "polygon", coordinates: KHH_DONUT_OUTER },
          serviceProductTypes: ["taxi_realtime"],
        },
        context,
      );
      const createdWithEmptyHoles = await service.createServiceArea(
        {
          areaCode: "KHH_SOLID_CORE_2",
          displayName: "Kaohsiung solid core 2",
          geometry: {
            type: "polygon",
            coordinates: KHH_DONUT_OUTER,
            holes: [],
          },
          serviceProductTypes: ["taxi_realtime"],
        },
        context,
      );

      expect(createdWithoutHoles.record.geometry).toEqual({
        type: "polygon",
        coordinates: KHH_DONUT_OUTER,
      });
      expect(createdWithEmptyHoles.record.geometry).toEqual({
        type: "polygon",
        coordinates: KHH_DONUT_OUTER,
      });
      expect("holes" in createdWithoutHoles.record.geometry).toBe(false);
    });

    it("rejects a hole that is not strictly inside the outer boundary", async () => {
      const { service, context } = createMutationService();

      await expect(
        service.createServiceArea(
          {
            areaCode: "KHH_BAD_HOLE_OUTSIDE",
            displayName: "Bad hole outside boundary",
            geometry: {
              type: "polygon",
              coordinates: KHH_DONUT_OUTER,
              holes: [
                [
                  { lat: 22.6, lng: 120.2 },
                  { lat: 22.6, lng: 120.3 },
                  { lat: 22.7, lng: 120.3 },
                  { lat: 22.7, lng: 120.2 },
                ],
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_HOLE_OUTSIDE_2",
            displayName: "Bad hole outside boundary 2",
            geometry: {
              type: "polygon",
              coordinates: KHH_DONUT_OUTER,
              holes: [
                [
                  { lat: 22.6, lng: 120.2 },
                  { lat: 22.6, lng: 120.3 },
                  { lat: 22.7, lng: 120.3 },
                  { lat: 22.7, lng: 120.2 },
                ],
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_HOLE_OUTSIDE_BOUNDARY" },
        });
      }
    });

    it("rejects two holes that overlap, touch, or nest each other", async () => {
      const { service, context } = createMutationService();

      try {
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_HOLE_OVERLAP",
            displayName: "Bad overlapping holes",
            geometry: {
              type: "polygon",
              coordinates: KHH_DONUT_OUTER,
              holes: [
                KHH_DONUT_HOLE,
                [
                  { lat: 22.62, lng: 120.29 },
                  { lat: 22.62, lng: 120.33 },
                  { lat: 22.64, lng: 120.33 },
                  { lat: 22.64, lng: 120.29 },
                ],
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected overlapping holes to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_HOLE_OVERLAP" },
        });
      }
    });

    it("rejects a degenerate collinear hole and a self-intersecting hole", async () => {
      const { service, context } = createMutationService();

      try {
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_HOLE_COLLINEAR",
            displayName: "Bad collinear hole",
            geometry: {
              type: "polygon",
              coordinates: KHH_DONUT_OUTER,
              holes: [
                [
                  { lat: 22.63, lng: 120.29 },
                  { lat: 22.63, lng: 120.3 },
                  { lat: 22.63, lng: 120.31 },
                ],
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected collinear hole to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY", details: { field: "geometry.holes.0" } },
        });
      }

      try {
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_HOLE_BOWTIE",
            displayName: "Bad self-intersecting hole",
            geometry: {
              type: "polygon",
              coordinates: KHH_DONUT_OUTER,
              holes: [
                [
                  { lat: 22.61, lng: 120.28 },
                  { lat: 22.65, lng: 120.3 },
                  { lat: 22.61, lng: 120.32 },
                  { lat: 22.63, lng: 120.29 },
                ],
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected self-intersecting hole to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_SELF_INTERSECTION" },
        });
      }
    });

    it("keeps non-hole polygon, triangle, concave, and circle creation unaffected", async () => {
      const { service, context } = createMutationService();

      const triangle = await service.createServiceArea(
        {
          areaCode: "KHH_TRIANGLE",
          displayName: "Kaohsiung triangle",
          geometry: {
            type: "polygon",
            coordinates: [
              { lat: 22.5, lng: 120.2 },
              { lat: 22.5, lng: 120.3 },
              { lat: 22.6, lng: 120.25 },
            ],
          },
          serviceProductTypes: ["taxi_realtime"],
        },
        context,
      );
      expect(triangle.record.geometry).toEqual({
        type: "polygon",
        coordinates: [
          { lat: 22.5, lng: 120.2 },
          { lat: 22.5, lng: 120.3 },
          { lat: 22.6, lng: 120.25 },
        ],
      });

      const circle = await service.createServiceArea(
        {
          areaCode: "KHH_CIRCLE_UNAFFECTED",
          displayName: "Kaohsiung circle",
          geometry: {
            type: "circle",
            center: { lat: 22.5, lng: 120.2 },
            radiusMeters: 1000,
          },
          serviceProductTypes: ["taxi_realtime"],
        },
        context,
      );
      expect(circle.record.geometry).toEqual({
        type: "circle",
        center: { lat: 22.5, lng: 120.2 },
        radiusMeters: 1000,
      });
    });

    it("rejects an outer ring with a duplicate consecutive vertex (zero-length edge)", async () => {
      const { service, context } = createMutationService();

      try {
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_DUP_VERTEX",
            displayName: "Bad duplicate vertex",
            geometry: {
              type: "polygon",
              coordinates: [
                { lat: 25.0, lng: 121.5 },
                { lat: 25.0, lng: 121.5 },
                { lat: 25.1, lng: 121.6 },
                { lat: 25.0, lng: 121.6 },
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected duplicate consecutive vertex to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY" },
        });
      }
    });

    it("rejects an outer ring that pinches at two non-adjacent vertices", async () => {
      const { service, context } = createMutationService();

      try {
        // P1 and P3 coincide; they are non-adjacent in this 5-vertex ring,
        // so the path crosses back through the same point without sharing
        // an edge.
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_PINCH",
            displayName: "Bad pinch",
            geometry: {
              type: "polygon",
              coordinates: [
                { lat: 25.0, lng: 121.5 },
                { lat: 25.05, lng: 121.52 },
                { lat: 25.0, lng: 121.54 },
                { lat: 25.05, lng: 121.52 },
                { lat: 25.05, lng: 121.48 },
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected a pinched ring to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_SELF_INTERSECTION" },
        });
      }
    });

    it("rejects an outer ring with an adjacent 180-degree foldback (spike)", async () => {
      const { service, context } = createMutationService();

      try {
        // P1 is the spike tip; P2 sits on the segment between P0 and P1, so
        // the path folds straight back on itself at P1 instead of turning.
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_FOLDBACK",
            displayName: "Bad foldback",
            geometry: {
              type: "polygon",
              coordinates: [
                { lat: 25.0, lng: 121.5 },
                { lat: 25.1, lng: 121.5 },
                { lat: 25.05, lng: 121.5 },
                { lat: 25.05, lng: 121.6 },
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected a foldback ring to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_SELF_INTERSECTION" },
        });
      }
    });

    it("rejects an outer ring where two non-adjacent edges touch without crossing", async () => {
      const { service, context } = createMutationService();

      try {
        // P4 lands exactly on the interior of edge P0-P1 (a T-junction): the
        // two edges touch at one point but never cross.
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_EDGE_TOUCH",
            displayName: "Bad edge touch",
            geometry: {
              type: "polygon",
              coordinates: [
                { lat: 25.0, lng: 121.5 },
                { lat: 25.0, lng: 121.7 },
                { lat: 25.05, lng: 121.7 },
                { lat: 25.05, lng: 121.55 },
                { lat: 25.0, lng: 121.6 },
                { lat: 25.02, lng: 121.5 },
              ],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected a touching (non-crossing) ring to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_SELF_INTERSECTION" },
        });
      }
    });

    it("rejects two holes that merely touch at a shared boundary point (distinct from crossing or nesting)", async () => {
      const { service, context } = createMutationService();
      const outer = [
        { lat: 22.58, lng: 120.25 },
        { lat: 22.58, lng: 120.35 },
        { lat: 22.68, lng: 120.35 },
        { lat: 22.68, lng: 120.25 },
      ];
      const hole1 = [
        { lat: 22.61, lng: 120.28 },
        { lat: 22.61, lng: 120.32 },
        { lat: 22.65, lng: 120.32 },
        { lat: 22.65, lng: 120.28 },
      ];
      // hole2 shares exactly the (22.65, 120.32) corner with hole1.
      const hole2 = [
        { lat: 22.65, lng: 120.32 },
        { lat: 22.65, lng: 120.34 },
        { lat: 22.67, lng: 120.34 },
        { lat: 22.67, lng: 120.32 },
      ];

      try {
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_HOLE_TOUCH",
            displayName: "Bad touching holes",
            geometry: { type: "polygon", coordinates: outer, holes: [hole1, hole2] },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected touching holes to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_HOLE_OVERLAP" },
        });
      }
    });

    it("rejects a hole nested entirely inside another hole", async () => {
      const { service, context } = createMutationService();
      const outer = [
        { lat: 22.58, lng: 120.25 },
        { lat: 22.58, lng: 120.35 },
        { lat: 22.68, lng: 120.35 },
        { lat: 22.68, lng: 120.25 },
      ];
      const outerHole = [
        { lat: 22.61, lng: 120.28 },
        { lat: 22.61, lng: 120.32 },
        { lat: 22.65, lng: 120.32 },
        { lat: 22.65, lng: 120.28 },
      ];
      // innerHole is fully inside outerHole, not merely overlapping it.
      const innerHole = [
        { lat: 22.62, lng: 120.29 },
        { lat: 22.62, lng: 120.31 },
        { lat: 22.64, lng: 120.31 },
        { lat: 22.64, lng: 120.29 },
      ];

      try {
        await service.createServiceArea(
          {
            areaCode: "KHH_BAD_HOLE_NESTED",
            displayName: "Bad nested holes",
            geometry: {
              type: "polygon",
              coordinates: outer,
              holes: [outerHole, innerHole],
            },
            serviceProductTypes: ["taxi_realtime"],
          },
          context,
        );
        expect.unreachable("expected a nested hole to be rejected");
      } catch (error) {
        expect((error as ApiRequestError).getResponse()).toMatchObject({
          error: { code: "INVALID_GEOMETRY_HOLE_OVERLAP" },
        });
      }
    });

    it("accepts two holes that are genuinely disjoint (not touching, not nested)", async () => {
      const { service, context } = createMutationService();
      const outer = [
        { lat: 22.58, lng: 120.25 },
        { lat: 22.58, lng: 120.35 },
        { lat: 22.68, lng: 120.35 },
        { lat: 22.68, lng: 120.25 },
      ];
      const hole1 = [
        { lat: 22.61, lng: 120.28 },
        { lat: 22.61, lng: 120.32 },
        { lat: 22.65, lng: 120.32 },
        { lat: 22.65, lng: 120.28 },
      ];
      const hole2 = [
        { lat: 22.59, lng: 120.26 },
        { lat: 22.59, lng: 120.27 },
        { lat: 22.6, lng: 120.27 },
        { lat: 22.6, lng: 120.26 },
      ];

      const created = await service.createServiceArea(
        {
          areaCode: "KHH_GOOD_DISJOINT_HOLES",
          displayName: "Good disjoint holes",
          geometry: { type: "polygon", coordinates: outer, holes: [hole1, hole2] },
          serviceProductTypes: ["taxi_realtime"],
        },
        context,
      );
      expect(created.record.geometry).toMatchObject({
        holes: [hole1, hole2],
      });
    });
  });

  describe("polygon holes: seed-isolated evaluation matrix (HOLE-EVAL-1..7)", () => {
    const KHH_DONUT_OUTER = [
      { lat: 22.58, lng: 120.25 },
      { lat: 22.58, lng: 120.35 },
      { lat: 22.68, lng: 120.35 },
      { lat: 22.68, lng: 120.25 },
    ];
    const KHH_DONUT_HOLE = [
      { lat: 22.61, lng: 120.28 },
      { lat: 22.61, lng: 120.32 },
      { lat: 22.65, lng: 120.32 },
      { lat: 22.65, lng: 120.28 },
    ];
    const FIXED_REQUESTED_AT = "2026-07-01T00:00:00.000Z";

    async function publishKhhDonutCore(
      service: ServiceAreaService,
      context: ReturnType<typeof createMutationService>["context"],
    ) {
      const created = await service.createServiceArea(
        {
          areaCode: "KHH_DONUT_CORE",
          displayName: "Kaohsiung donut operating area",
          geometry: {
            type: "polygon",
            coordinates: KHH_DONUT_OUTER,
            holes: [KHH_DONUT_HOLE],
          },
          serviceProductTypes: ["taxi_realtime"],
          effectiveFrom: "2026-06-01T00:00:00.000Z",
        },
        context,
      );
      await service.submitServiceAreaForReview(
        created.record.serviceAreaId,
        context,
      );
      return service.publishServiceArea(
        created.record.serviceAreaId,
        { effectiveFrom: "2026-06-01T00:00:00.000Z", reason: "activate kaohsiung donut" },
        context,
      );
    }

    it("HOLE-EVAL-1..5: outer-inside, hole-inside (pickup/dropoff), hole-edge, and outside are all deterministic", async () => {
      const { service, context } = createMutationService();
      await publishKhhDonutCore(service, context);

      // HOLE-EVAL-1 (outer-inside, null dropoff)
      expect(
        service.evaluate({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 22.595, lng: 120.265 },
          dropoff: null,
          requestedAt: FIXED_REQUESTED_AT,
        }),
      ).toMatchObject({
        decision: "serviceable",
        serviceAreaCodes: ["KHH_DONUT_CORE"],
        geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
        reasonCodes: [],
      });

      // HOLE-EVAL-2 (hole-inside pickup, outer-inside dropoff)
      const holeInsidePickup = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.63, lng: 120.3 },
        dropoff: { lat: 22.595, lng: 120.265 },
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(holeInsidePickup).toMatchObject({
        decision: "not_serviceable",
        reasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
      });
      expect(holeInsidePickup.stops[0]).toMatchObject({
        kind: "pickup",
        decision: "not_serviceable",
        serviceAreaCodes: [],
        policyCodes: [],
        geometryVersionRefs: [],
      });
      expect(holeInsidePickup.stops[1]).toMatchObject({
        kind: "dropoff",
        decision: "serviceable",
        serviceAreaCodes: ["KHH_DONUT_CORE"],
      });

      // HOLE-EVAL-3 (outer-inside pickup, hole-inside dropoff)
      const holeInsideDropoff = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.595, lng: 120.265 },
        dropoff: { lat: 22.63, lng: 120.3 },
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(holeInsideDropoff).toMatchObject({
        decision: "not_serviceable",
        reasonCodes: ["DROPOFF_AREA_NOT_SERVICEABLE"],
      });
      expect(holeInsideDropoff.stops[0]).toMatchObject({
        kind: "pickup",
        decision: "serviceable",
        serviceAreaCodes: ["KHH_DONUT_CORE"],
      });
      expect(holeInsideDropoff.stops[1]).toMatchObject({
        kind: "dropoff",
        decision: "not_serviceable",
        serviceAreaCodes: [],
        geometryVersionRefs: [],
      });

      // HOLE-EVAL-4 (hole-edge/vertex: all four edge midpoints and all four
      // vertices of the hole boundary are serviceable, not just one sample
      // of each).
      const holeBoundaryPoints = [
        { label: "bottom edge midpoint", lat: 22.61, lng: 120.3 },
        { label: "right edge midpoint", lat: 22.63, lng: 120.32 },
        { label: "top edge midpoint", lat: 22.65, lng: 120.3 },
        { label: "left edge midpoint", lat: 22.63, lng: 120.28 },
        { label: "bottom-left vertex", lat: 22.61, lng: 120.28 },
        { label: "bottom-right vertex", lat: 22.61, lng: 120.32 },
        { label: "top-right vertex", lat: 22.65, lng: 120.32 },
        { label: "top-left vertex", lat: 22.65, lng: 120.28 },
      ];
      for (const point of holeBoundaryPoints) {
        const result = service.evaluate({
          serviceProductType: "taxi_realtime",
          pickup: { lat: point.lat, lng: point.lng },
          dropoff: null,
          requestedAt: FIXED_REQUESTED_AT,
        });
        expect(result, point.label).toMatchObject({
          decision: "serviceable",
          serviceAreaCodes: ["KHH_DONUT_CORE"],
          geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
        });
      }
      const holeEdge = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.61, lng: 120.3 },
        dropoff: { lat: 22.65, lng: 120.28 },
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(holeEdge.decision).toBe("serviceable");
      expect(holeEdge.stops[0]).toMatchObject({
        serviceAreaCodes: ["KHH_DONUT_CORE"],
        geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
      });
      expect(holeEdge.stops[1]).toMatchObject({
        serviceAreaCodes: ["KHH_DONUT_CORE"],
        geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
      });

      // HOLE-EVAL-5 (outside the exterior ring entirely)
      expect(
        service.evaluate({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 22.5, lng: 120.2 },
          dropoff: null,
          requestedAt: FIXED_REQUESTED_AT,
        }),
      ).toMatchObject({
        decision: "not_serviceable",
        serviceAreaCodes: [],
        reasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
      });
    });

    it("HOLE-EVAL-6: a separate enclave area inside the donut hole covers that hole exclusively", async () => {
      const { service, context } = createMutationService();
      await publishKhhDonutCore(service, context);

      const enclave = await service.createServiceArea(
        {
          areaCode: "KHH_ENCLAVE_SHUTTLE",
          displayName: "Kaohsiung donut-hole enclave shuttle",
          geometry: {
            type: "polygon",
            coordinates: [
              { lat: 22.62, lng: 120.29 },
              { lat: 22.62, lng: 120.31 },
              { lat: 22.64, lng: 120.31 },
              { lat: 22.64, lng: 120.29 },
            ],
          },
          serviceProductTypes: ["taxi_realtime"],
          effectiveFrom: "2026-06-01T00:00:00.000Z",
        },
        context,
      );
      await service.submitServiceAreaForReview(enclave.record.serviceAreaId, context);
      await service.publishServiceArea(
        enclave.record.serviceAreaId,
        { effectiveFrom: "2026-06-01T00:00:00.000Z", reason: "activate enclave" },
        context,
      );

      const result = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.63, lng: 120.3 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(result).toMatchObject({
        decision: "serviceable",
        serviceAreaCodes: ["KHH_ENCLAVE_SHUTTLE"],
        geometryVersionRefs: ["service_area:KHH_ENCLAVE_SHUTTLE@1"],
      });
      expect(result.serviceAreaCodes).not.toContain("KHH_DONUT_CORE");
    });

    it("HOLE-EVAL-7: a stop policy with its own donut hole denies the outer ring but not its hole", async () => {
      const { service, context } = createMutationService();
      await publishKhhDonutCore(service, context);

      const policy = await service.createStopPolicy(
        {
          policyCode: "KHH_CURB_DONUT_POLICY",
          displayName: "Kaohsiung curb donut restriction",
          direction: "pickup",
          effect: "deny",
          geometry: {
            type: "polygon",
            coordinates: [
              { lat: 22.66, lng: 120.26 },
              { lat: 22.66, lng: 120.275 },
              { lat: 22.675, lng: 120.275 },
              { lat: 22.675, lng: 120.26 },
            ],
            holes: [
              [
                { lat: 22.665, lng: 120.265 },
                { lat: 22.665, lng: 120.27 },
                { lat: 22.67, lng: 120.27 },
                { lat: 22.67, lng: 120.265 },
              ],
            ],
          },
          serviceAreaCodes: ["KHH_DONUT_CORE"],
          serviceProductTypes: ["taxi_realtime"],
          reasonCode: "KHH_CURB_RESTRICTED",
          reasonMessage: "Curb pickup is restricted in this donut zone.",
          effectiveFrom: "2026-06-01T00:00:00.000Z",
        },
        context,
      );
      await service.submitStopPolicyForReview(policy.record.stopPolicyId, context);
      await service.publishStopPolicy(
        policy.record.stopPolicyId,
        { effectiveFrom: "2026-06-01T00:00:00.000Z", reason: "activate curb donut policy" },
        context,
      );

      // HOLE-EVAL-7a: inside the policy's outer ring, outside its hole -> denied.
      const denied = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.662, lng: 120.262 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(denied).toMatchObject({
        decision: "not_serviceable",
        serviceAreaCodes: ["KHH_DONUT_CORE"],
        reasonCodes: ["KHH_CURB_RESTRICTED"],
      });
      expect(denied.stops[0]).toMatchObject({
        policyCodes: ["KHH_CURB_DONUT_POLICY"],
        geometryVersionRefs: [
          "service_area:KHH_DONUT_CORE@1",
          "stop_policy:KHH_CURB_DONUT_POLICY@1",
        ],
      });

      // HOLE-EVAL-7b: inside the policy's own hole -> excluded from the policy, still serviceable.
      const excludedFromPolicy = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.667, lng: 120.267 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(excludedFromPolicy).toMatchObject({
        decision: "serviceable",
        serviceAreaCodes: ["KHH_DONUT_CORE"],
        reasonCodes: [],
      });
      expect(excludedFromPolicy.stops[0]).toMatchObject({
        policyCodes: [],
        geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
      });
    });

    it("records observability outOfArea for a hole-inside pickup, distinct from policyDenial for a policy-denied pickup", async () => {
      const observability = new MapGeofenceObservabilityService();
      const { service, context } = createMutationService({}, observability);
      await publishKhhDonutCore(service, context);

      const policy = await service.createStopPolicy(
        {
          policyCode: "KHH_CURB_RESTRICT",
          displayName: "Kaohsiung curb restriction",
          direction: "pickup",
          effect: "deny",
          geometry: {
            type: "polygon",
            coordinates: [
              { lat: 22.66, lng: 120.26 },
              { lat: 22.66, lng: 120.28 },
              { lat: 22.67, lng: 120.28 },
              { lat: 22.67, lng: 120.26 },
            ],
          },
          serviceAreaCodes: ["KHH_DONUT_CORE"],
          serviceProductTypes: ["taxi_realtime"],
          reasonCode: "KHH_CURB_RESTRICTED",
          reasonMessage: "Curb pickup is restricted here.",
          effectiveFrom: "2026-06-01T00:00:00.000Z",
        },
        context,
      );
      await service.submitStopPolicyForReview(policy.record.stopPolicyId, context);
      await service.publishStopPolicy(
        policy.record.stopPolicyId,
        { effectiveFrom: "2026-06-01T00:00:00.000Z", reason: "activate curb restriction" },
        context,
      );

      const beforeOutOfArea = observability.getSnapshot().serviceArea.outOfAreaCount;
      const beforePolicyDenial =
        observability.getSnapshot().serviceArea.policyDenialCount;

      // Geometric exclusion: pickup is inside the donut hole, no policy involved.
      const holeResult = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.63, lng: 120.3 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(holeResult.decision).toBe("not_serviceable");
      expect(holeResult.reasonCodes).toEqual(["PICKUP_AREA_NOT_SERVICEABLE"]);
      expect(observability.getSnapshot().serviceArea.outOfAreaCount).toBe(
        beforeOutOfArea + 1,
      );
      expect(observability.getSnapshot().serviceArea.policyDenialCount).toBe(
        beforePolicyDenial,
      );

      // Policy exclusion: pickup is inside the outer ring and within a deny policy.
      const policyResult = service.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.665, lng: 120.27 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT,
      });
      expect(policyResult.decision).toBe("not_serviceable");
      expect(policyResult.reasonCodes).toEqual(["KHH_CURB_RESTRICTED"]);
      expect(observability.getSnapshot().serviceArea.outOfAreaCount).toBe(
        beforeOutOfArea + 1,
      );
      expect(observability.getSnapshot().serviceArea.policyDenialCount).toBe(
        beforePolicyDenial + 1,
      );
    });
  });
});

/** Planar shoelace signed area over a closed `[lng, lat][]` GeoJSON ring. */
function signedShoelaceArea(ring: [number, number][]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [lngA, latA] = ring[index]!;
    const [lngB, latB] = ring[index + 1]!;
    area += lngA * latB - lngB * latA;
  }
  return area / 2;
}
