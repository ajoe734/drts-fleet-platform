import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterEach, expect, it, vi } from "vitest";

const { randomUuidMock } = vi.hoisted(() => ({
  randomUuidMock: vi.fn(),
}));

vi.mock("node:crypto", async () => {
  const actual =
    await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomUUID: randomUuidMock,
  };
});

import type {
  AuditLogRecord,
  DispatchJobRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { GeoProviderConfigService } from "../../src/modules/geo/geo-provider-config.service";
import { GeoService } from "../../src/modules/geo/geo.service";
import { MockGeoProvider } from "../../src/modules/geo/mock-geo.provider";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { MapGeofenceObservabilityService } from "../../src/modules/operational-observability/map-geofence-observability.service";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";

const ARTIFACT_RELATIVE_PATH =
  "support/sidecars/MAP-QA-002/artifacts/final-evidence-20260708/map-qa-final-evidence-proof-20260708T120000Z.json";
const SHARED_ORDER_ID = "ORD-MAP-QA-SHARED-001";
const OUTAGE_ORDER_ID = "ORD-MAP-QA-OUTAGE-001";
const LEGACY_ORDER_ID = "ORD-MAP-QA-LEGACY-001";

type PersistPayload = {
  orders?: OwnedOrderRecord[];
  dispatchJobs?: DispatchJobRecord[];
  dispatchTraceLogs?: Array<Record<string, unknown>>;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildAuditNotificationService(auditLogs: AuditLogRecord[]) {
  return {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(
      (
        input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
          requestId?: string;
        },
      ) => {
        const auditLog: AuditLogRecord = {
          auditId: `audit-${String(auditLogs.length + 1).padStart(3, "0")}`,
          createdAt: `2026-07-08T12:00:${String(auditLogs.length).padStart(
            2,
            "0",
          )}.000Z`,
          requestId: input.requestId ?? null,
          actorId: input.actorId,
          actorType: input.actorType,
          tenantId: input.tenantId ?? null,
          moduleName: input.moduleName,
          actionName: input.actionName,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          oldValuesSummary: input.oldValuesSummary ?? null,
          newValuesSummary: input.newValuesSummary ?? null,
          metadata: input.metadata ?? null,
        };
        auditLogs.unshift(auditLog);
        return auditLog;
      },
    ),
  };
}

function createOwnedMobilityProofService() {
  const auditLogs: AuditLogRecord[] = [];
  const auditNotificationService = buildAuditNotificationService(auditLogs);
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  const persistedWrites: Array<{ context: string; payload: PersistPayload }> =
    [];
  const repository = {
    isEnabled: () => true,
    persistChanges: async (payload: PersistPayload) => {
      persistedWrites.push({
        context: "persistChanges",
        payload: cloneJson(payload),
      });
      return payload;
    },
    persistOrderWorkflow: async (...args: unknown[]) => args,
    withTransaction: async <T>(work: (tx: unknown) => Promise<T>) => work({}),
    reportPersistenceFailure: vi.fn(),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(
      ({
        callId,
        callType,
        callerPhone,
        agentId,
        linkedOrderId,
        recordingId,
      }) => ({
        callId,
        callType,
        callerPhone,
        agentId,
        linkedOrderId,
        recordingId: recordingId ?? null,
      }),
    ),
  };
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
    new OpsDispatchEventsService(new EventEmitter2()),
    repository as never,
    undefined,
    undefined,
    serviceProductService,
    undefined,
    undefined,
    undefined,
    undefined,
    new ServiceAreaService(),
  );

  return { service, auditLogs, persistedWrites };
}

function createObservedServiceAreaService() {
  const auditLogs: AuditLogRecord[] = [];
  const observability = new MapGeofenceObservabilityService();
  const auditNotificationService = buildAuditNotificationService(auditLogs);
  const service = new ServiceAreaService(
    undefined,
    auditNotificationService as never,
    observability,
  );

  return { service, auditLogs, observability };
}

function createObservedGeoService() {
  const auditLogs: AuditLogRecord[] = [];
  const observability = new MapGeofenceObservabilityService();
  const auditNotificationService = buildAuditNotificationService(auditLogs);
  const service = new GeoService(
    new MockGeoProvider(),
    new GeoProviderConfigService({
      NODE_ENV: "test",
      DRTS_ENV: "test",
      MAP_PROVIDER_MODE: "mock",
    }),
    auditNotificationService as never,
    observability,
  );

  return { service, auditLogs, observability };
}

afterEach(() => {
  randomUuidMock.mockReset();
});

it("writes row-level QA final evidence proof payloads", async () => {
  let orderSequence = 0;
  let snapshotSequence = 0;
  let traceSequence = 0;
  let fallbackSequence = 0;
  randomUuidMock.mockImplementation(() => {
    const stack = new Error().stack ?? "";
    if (stack.includes("buildSpatialAuditSnapshot")) {
      snapshotSequence += 1;
      if (snapshotSequence === 1) {
        return "snapshot-map-qa-shared-001";
      }
      if (snapshotSequence === 2) {
        return "snapshot-map-qa-outage-001";
      }
      return "snapshot-map-qa-legacy-001";
    }
    if (stack.includes("appendTrace")) {
      traceSequence += 1;
      return `trace-map-qa-${traceSequence}`;
    }
    if (stack.includes("createCallCenterOrder")) {
      orderSequence += 1;
      return orderSequence === 1 ? SHARED_ORDER_ID : OUTAGE_ORDER_ID;
    }
    if (stack.includes("createPassengerOrder")) {
      return LEGACY_ORDER_ID;
    }
    fallbackSequence += 1;
    return `misc-map-qa-${fallbackSequence}`;
  });

  const {
    service: ownedMobilityService,
    auditLogs: ownedMobilityAuditLogs,
    persistedWrites,
  } = createOwnedMobilityProofService();
  const {
    service: serviceAreaService,
    auditLogs: serviceAreaAuditLogs,
    observability: serviceAreaObservability,
  } = createObservedServiceAreaService();
  const { service: geoService, observability: geoObservability } =
    createObservedGeoService();

  const sharedRequestBody = {
    callId: "CALL-MAP-QA-SHARED-001",
    agentId: "AGENT-MAP-QA-001",
    recordingId: "REC-MAP-QA-SHARED-001",
    pickup: {
      address: "台北市政府",
      lat: 25.0375,
      lng: 121.5637,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock_geo",
      geocodeConfidence: "exact",
      providerCandidateId: "mock-taipei-city-hall",
      selectedByActorId: "AGENT-MAP-QA-001",
      selectedAt: "2026-07-08T12:00:00.000Z",
      surface: "callcenter",
    },
    dropoff: {
      address: "松山文創園區",
      lat: 25.0438,
      lng: 121.5601,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock_geo",
      geocodeConfidence: "exact",
      providerCandidateId: "mock-songshan-cultural-park",
      selectedByActorId: "AGENT-MAP-QA-001",
      selectedAt: "2026-07-08T12:01:00.000Z",
      surface: "callcenter",
    },
    passenger: {
      name: "Shared Outcome Rider",
      phone: "0912-000-401",
    },
  };

  const sharedOrder = ownedMobilityService.createCallCenterOrder(
    sharedRequestBody,
    "req-map-qa-shared-001",
  );
  const sharedDetail = ownedMobilityService.getOrder(sharedOrder.orderId);
  const sharedPersistedWrite = persistedWrites.find(
    (entry) => entry.payload.orders?.[0]?.orderId === SHARED_ORDER_ID,
  );
  const sharedAuditLog = ownedMobilityAuditLogs.find(
    (entry) =>
      entry.resourceId === SHARED_ORDER_ID &&
      entry.actionName === "order.spatial_audit.snapshot_created",
  );

  const outageRequestBody = {
    callId: "CALL-MAP-QA-OUTAGE-001",
    agentId: "AGENT-MAP-QA-001",
    recordingId: "REC-MAP-QA-OUTAGE-001",
    pickup: {
      address: "台北市政府",
      lat: 25.0375,
      lng: 121.5637,
    },
    dropoff: {
      address: "松山文創園區",
      lat: 25.0438,
      lng: 121.5601,
    },
    passenger: {
      name: "Outage Review Rider",
      phone: "0912-000-402",
    },
    mapFallbackReview: {
      reasonCode: "map_provider_unavailable",
      providerAvailable: false,
      providerDegraded: true,
      providerReasonCode: "request_failed",
    },
  };

  const outageOrder = ownedMobilityService.createCallCenterOrder(
    outageRequestBody,
    "req-map-qa-outage-001",
  );
  const outageDetail = ownedMobilityService.getOrder(outageOrder.orderId);
  const outagePersistedWrite = persistedWrites.find(
    (entry) => entry.payload.orders?.[0]?.orderId === OUTAGE_ORDER_ID,
  );
  let outageDispatchError: ReturnType<ApiRequestError["getResponse"]> | null =
    null;
  try {
    ownedMobilityService.dispatchOrder(OUTAGE_ORDER_ID, { mode: "auto" });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    outageDispatchError = (error as ApiRequestError).getResponse();
  }

  const legacyOrder = ownedMobilityService.createPassengerOrder(
    {
      pickup: { address: "Caller only gave a landmark" },
      dropoff: { address: "Caller only gave another landmark" },
      passenger: { name: "Legacy Rider", phone: "0912-000-403" },
    },
    "req-map-qa-legacy-001",
  );
  const legacyDetail = ownedMobilityService.getOrder(legacyOrder.orderId);
  const legacyPersistedWrite = persistedWrites.find(
    (entry) => entry.payload.orders?.[0]?.orderId === LEGACY_ORDER_ID,
  );
  let legacyDispatchError: ReturnType<ApiRequestError["getResponse"]> | null =
    null;
  try {
    ownedMobilityService.dispatchOrder(LEGACY_ORDER_ID, { mode: "auto" });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    legacyDispatchError = (error as ApiRequestError).getResponse();
  }

  const policyDenialResult = serviceAreaService.evaluate(
    {
      serviceProductType: "taxi_realtime",
      pickup: { lat: 25.0478, lng: 121.517 },
      dropoff: { lat: 25.06, lng: 121.58 },
      requestedAt: "2026-07-08T12:10:00.000Z",
    },
    "req-map-qa-policy-denial-001",
  );
  let coordinateLessError: ReturnType<ApiRequestError["getResponse"]> | null =
    null;
  try {
    serviceAreaService.evaluate(
      {
        serviceProductType: "taxi_realtime",
        pickup: { lat: 25.041 } as never,
      },
      "req-map-qa-coordinate-less-001",
    );
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    coordinateLessError = (error as ApiRequestError).getResponse();
  }
  const policyDenialAuditLog = serviceAreaAuditLogs.find(
    (entry) => entry.requestId === "req-map-qa-policy-denial-001",
  );
  const coordinateLessAuditLog = serviceAreaAuditLogs.find(
    (entry) => entry.requestId === "req-map-qa-coordinate-less-001",
  );

  let providerOutageError: ReturnType<ApiRequestError["getResponse"]> | null =
    null;
  try {
    await geoService.search({
      q: "__provider_unavailable__",
      surface: "callcenter",
    });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    providerOutageError = (error as ApiRequestError).getResponse();
  }
  const ambiguityResult = await geoService.search({
    q: "台北",
    surface: "callcenter",
  });
  let geoCoordinateLessError: ReturnType<
    ApiRequestError["getResponse"]
  > | null = null;
  try {
    await geoService.resolve({
      addressText: "No selected candidate or pin",
      surface: "callcenter",
    });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    geoCoordinateLessError = (error as ApiRequestError).getResponse();
  }

  const artifactPath = resolve(
    __dirname,
    "../../../..",
    ARTIFACT_RELATIVE_PATH,
  );
  mkdirSync(resolve(artifactPath, ".."), { recursive: true });
  writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        sharedServiceabilityDecision: {
          requestId: "req-map-qa-shared-001",
          requestBody: sharedRequestBody,
          apiOrder: {
            orderId: sharedDetail.orderId,
            status: sharedDetail.status,
            pickup: sharedDetail.pickup,
            dropoff: sharedDetail.dropoff,
            complianceFlags: sharedDetail.complianceFlags,
            spatialAudit: sharedDetail.spatialAudit,
            serviceAreaGate: sharedDetail.complianceGates?.find(
              (gate) => gate.gateType === "service_area",
            ),
          },
          persistedWrite: sharedPersistedWrite?.payload ?? null,
          auditEvent: sharedAuditLog ?? null,
        },
        outageManualReviewOrder: {
          requestId: "req-map-qa-outage-001",
          requestBody: outageRequestBody,
          apiOrder: {
            orderId: outageDetail.orderId,
            status: outageDetail.status,
            queueFamily: outageDetail.queueFamily,
            queueEntryReason: outageDetail.queueEntryReason,
            mapFallbackReview: outageDetail.mapFallbackReview,
            addressCaptureGate: outageDetail.complianceGates?.find(
              (gate) => gate.gateType === "address_capture",
            ),
            spatialAudit: outageDetail.spatialAudit,
          },
          persistedWrite: outagePersistedWrite?.payload ?? null,
          dispatchAttempt: {
            errorResponse: outageDispatchError,
            dispatchJobsForOrder: ownedMobilityService
              .listDispatchJobs()
              .filter((job) => job.orderId === OUTAGE_ORDER_ID),
          },
        },
        coordinateLessLegacyOrder: {
          requestId: "req-map-qa-legacy-001",
          apiOrder: {
            orderId: legacyDetail.orderId,
            status: legacyDetail.status,
            queueFamily: legacyDetail.queueFamily,
            queueEntryReason: legacyDetail.queueEntryReason,
            complianceFlags: legacyDetail.complianceFlags,
            spatialAudit: legacyDetail.spatialAudit,
            serviceAreaGate: legacyDetail.complianceGates?.find(
              (gate) => gate.gateType === "service_area",
            ),
          },
          persistedWrite: legacyPersistedWrite?.payload ?? null,
          dispatchAttempt: {
            errorResponse: legacyDispatchError,
            dispatchJobsForOrder: ownedMobilityService
              .listDispatchJobs()
              .filter((job) => job.orderId === LEGACY_ORDER_ID),
          },
        },
        serviceAreaAudits: {
          policyDenial: {
            requestId: "req-map-qa-policy-denial-001",
            evaluation: policyDenialResult,
            auditEvent: policyDenialAuditLog ?? null,
          },
          coordinateLess: {
            requestId: "req-map-qa-coordinate-less-001",
            errorResponse: coordinateLessError,
            auditEvent: coordinateLessAuditLog ?? null,
          },
          observability: serviceAreaObservability.getSnapshot(),
        },
        geoSignals: {
          providerOutage: providerOutageError,
          ambiguity: {
            query: "台北",
            candidateCount: ambiguityResult.candidates.length,
            firstCandidate: ambiguityResult.candidates[0] ?? null,
          },
          coordinateLess: geoCoordinateLessError,
          observability: geoObservability.getSnapshot(),
        },
      },
      null,
      2,
    ),
  );
});
