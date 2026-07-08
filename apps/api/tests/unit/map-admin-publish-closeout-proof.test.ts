import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { MapGeofenceObservabilityService } from "../../src/modules/operational-observability/map-geofence-observability.service";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";

const ARTIFACT_RELATIVE_PATH =
  "support/sidecars/MAP-QA-002/artifacts/final-evidence-20260708/map-admin-publish-closeout-proof-20260708T120500Z.json";

function createMutationService() {
  const auditLogs: Array<Record<string, unknown>> = [];
  const observability = new MapGeofenceObservabilityService();
  const repository = {
    loadState: vi.fn().mockResolvedValue({
      serviceAreas: [],
      stopPolicies: [],
    }),
    persistServiceArea: vi
      .fn()
      .mockImplementation(async (payload) => JSON.parse(JSON.stringify(payload))),
    persistStopPolicy: vi
      .fn()
      .mockImplementation(async (payload) => JSON.parse(JSON.stringify(payload))),
    reportPersistenceFailure: vi.fn(),
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn((input) => {
      const auditLog = {
        ...input,
        auditId: `audit-${auditLogs.length + 1}`,
        requestId: input.requestId ?? "generated-request",
        createdAt: `2026-07-08T12:05:${String(auditLogs.length).padStart(
          2,
          "0",
        )}.000Z`,
      };
      auditLogs.push(auditLog);
      return auditLog;
    }),
  };
  const service = new ServiceAreaService(
    repository as never,
    auditNotificationService as never,
    observability,
  );

  return {
    service,
    repository,
    auditLogs,
    observability,
    context: {
      actorId: "platform-admin-geo-001",
      actorType: "platform_admin" as const,
      requestId: "req-service-area-admin-001",
    },
  };
}

it("writes admin publish closeout proof payloads", async () => {
  const { service, repository, auditLogs, observability, context } =
    createMutationService();

  const beforePublishDecision = service.evaluate({
    serviceProductType: "taxi_realtime",
    pickup: { lat: 22.6273, lng: 120.3014 },
    requestedAt: "2026-07-01T00:00:00.000Z",
  });

  const createdArea = await service.createServiceArea(
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
  const reviewArea = await service.submitServiceAreaForReview(
    createdArea.record.serviceAreaId,
    context,
  );
  const publishedArea = await service.publishServiceArea(
    createdArea.record.serviceAreaId,
    { reason: "launch kaohsiung pilot" },
    context,
  );
  const afterPublishDecision = service.evaluate({
    serviceProductType: "taxi_realtime",
    pickup: { lat: 22.6273, lng: 120.3014 },
    requestedAt: "2026-07-01T00:00:00.000Z",
  });

  const futureArea = await service.createServiceArea(
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
  const futurePublishedArea = await service.publishServiceArea(
    futureArea.record.serviceAreaId,
    { reason: "scheduled launch" },
    context,
  );
  const beforeEffectiveDecision = service.evaluate({
    serviceProductType: "taxi_realtime",
    pickup: { lat: 23.48, lng: 120.45 },
    requestedAt: "2026-07-31T23:59:59.000Z",
  });
  const afterEffectiveDecision = service.evaluate({
    serviceProductType: "taxi_realtime",
    pickup: { lat: 23.48, lng: 120.45 },
    requestedAt: "2026-08-01T00:00:00.000Z",
  });

  const firstVersion = await service.createServiceArea(
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
    firstVersion.record.serviceAreaId,
    { reason: "initial version" },
    context,
  );
  const overlappingVersion = await service.createServiceArea(
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
  let overlappingPublishError: ReturnType<ApiRequestError["getResponse"]> | null =
    null;
  try {
    await service.publishServiceArea(
      overlappingVersion.record.serviceAreaId,
      { reason: "overlapping version should fail" },
      context,
    );
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    overlappingPublishError = (error as ApiRequestError).getResponse();
  }

  const stopPolicy = await service.createStopPolicy(
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
  const reviewPolicy = await service.submitStopPolicyForReview(
    stopPolicy.record.stopPolicyId,
    context,
  );
  const reviewedGeoJson = service.exportGeoJson();
  const publishedPolicy = await service.publishStopPolicy(
    stopPolicy.record.stopPolicyId,
    { reason: "temporary city hall curb works" },
    context,
  );
  const publishedPolicyDecision = service.evaluate({
    serviceProductType: "taxi_realtime",
    pickup: { lat: 25.0375, lng: 121.5637 },
    dropoff: { lat: 25.041, lng: 121.55 },
    requestedAt: "2026-07-01T00:00:00.000Z",
  });
  const retiredPolicy = await service.retireStopPolicy(
    stopPolicy.record.stopPolicyId,
    {
      effectiveUntil: "2026-07-15T00:00:00.000Z",
      reason: "curb works completed",
    },
    context,
  );
  const retiredGeoJson = service.exportGeoJson();
  const postRetireDecision = service.evaluate({
    serviceProductType: "taxi_realtime",
    pickup: { lat: 25.0375, lng: 121.5637 },
    dropoff: { lat: 25.041, lng: 121.55 },
    requestedAt: "2026-07-01T00:00:00.000Z",
  });

  let invalidGeometryError: ReturnType<ApiRequestError["getResponse"]> | null =
    null;
  try {
    await service.createServiceArea(
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
    );
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    invalidGeometryError = (error as ApiRequestError).getResponse();
  }

  const artifactPath = resolve(process.cwd(), "..", "..", ARTIFACT_RELATIVE_PATH);
  mkdirSync(resolve(artifactPath, ".."), { recursive: true });
  writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        serviceAreaPublishLifecycle: {
          beforePublishDecision,
          createdArea,
          reviewArea,
          publishedArea,
          afterPublishDecision,
          publishAuditEvent:
            auditLogs.find(
              (entry) =>
                entry.actionName === "service_area.boundary.published" &&
                entry.requestId === "req-service-area-admin-001",
            ) ?? null,
        },
        effectiveWindowProof: {
          futurePublishedArea,
          beforeEffectiveDecision,
          afterEffectiveDecision,
        },
        versionOverlapRejection: {
          firstVersion,
          overlappingVersion,
          errorResponse: overlappingPublishError,
        },
        stopPolicyLifecycle: {
          stopPolicy,
          reviewPolicy,
          reviewedGeoJson,
          publishedPolicy,
          publishedPolicyDecision,
          retiredPolicy,
          retiredGeoJson,
          postRetireDecision,
          reviewAuditEvent:
            auditLogs.find(
              (entry) =>
                entry.actionName ===
                "service_area.stop_policy.submitted_for_review",
            ) ?? null,
          publishAuditEvent:
            auditLogs.find(
              (entry) =>
                entry.actionName === "service_area.stop_policy.published",
            ) ?? null,
          retireAuditEvent:
            auditLogs.find(
              (entry) =>
                entry.actionName === "service_area.stop_policy.retired",
            ) ?? null,
        },
        invalidGeometryRejection: {
          errorResponse: invalidGeometryError,
          persistServiceAreaCallCount: repository.persistServiceArea.mock.calls
            .length,
        },
        observability: observability.getSnapshot(),
      },
      null,
      2,
    ),
  );
});
