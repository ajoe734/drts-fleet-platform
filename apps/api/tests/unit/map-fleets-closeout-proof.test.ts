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
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { buildOpsMapBoardModel } from "../../../ops-console-web/app/dispatch/ops-map-board";

const SERVICEABLE_ORDER_ID = "ORD-SMOKE-001";
const MANUAL_REVIEW_ORDER_ID = "ORD-MAP-MANUAL-001";
const BACKEND_ARTIFACT_RELATIVE_PATH =
  "support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json";

type PersistPayload = {
  orders?: OwnedOrderRecord[];
  dispatchJobs?: DispatchJobRecord[];
  dispatchTraceLogs?: Array<Record<string, unknown>>;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createOwnedMobilityService() {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const auditLogs: AuditLogRecord[] = [];
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(
      (
        input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
          requestId?: string;
        },
      ) => {
        const auditLog: AuditLogRecord = {
          auditId: `audit-${String(auditLogs.length + 1).padStart(3, "0")}`,
          createdAt: `2026-07-08T05:05:${String(auditLogs.length).padStart(
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

  return {
    service,
    auditLogs,
    persistedWrites,
  };
}

afterEach(() => {
  randomUuidMock.mockReset();
});

it("writes persisted spatial closeout proof for the fleets closeout task", () => {
  let orderSequence = 0;
  let snapshotSequence = 0;
  let traceSequence = 0;
  let fallbackSequence = 0;
  randomUuidMock.mockImplementation(() => {
    const stack = new Error().stack ?? "";
    if (stack.includes("buildSpatialAuditSnapshot")) {
      snapshotSequence += 1;
      return snapshotSequence === 1
        ? "snapshot-serviceable-001"
        : "snapshot-manual-review-001";
    }
    if (stack.includes("appendTrace")) {
      traceSequence += 1;
      return traceSequence === 1
        ? "trace-serviceable-001"
        : "trace-manual-review-001";
    }
    if (stack.includes("createCallCenterOrder")) {
      orderSequence += 1;
      return orderSequence === 1
        ? SERVICEABLE_ORDER_ID
        : MANUAL_REVIEW_ORDER_ID;
    }
    fallbackSequence += 1;
    return `misc-closeout-${fallbackSequence}`;
  });

  const { service, auditLogs, persistedWrites } = createOwnedMobilityService();
  const serviceableRequestBody = {
    callId: "CALL-SMOKE-001",
    agentId: "AGENT-OPS-001",
    recordingId: "REC-SMOKE-001",
    pickup: {
      address: "No. 1, City Hall Road, Xinyi District, Taipei",
      lat: 25.037519,
      lng: 121.56368,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      geocodeConfidence: "exact",
      providerCandidateId: "place-city-hall",
      selectedByActorId: "AGENT-OPS-001",
      selectedAt: "2026-07-08T05:00:00.000Z",
      surface: "callcenter",
      coordinateProvenance: {
        coordinateSource: "provider_candidate",
        geocodeProvider: "mock-geo",
        geocodeConfidence: "exact",
        providerCandidateId: "place-city-hall",
        selectedByActorId: "AGENT-OPS-001",
        selectedAt: "2026-07-08T05:00:00.000Z",
        surface: "callcenter",
      },
    },
    dropoff: {
      address: "No. 100, Songren Road, Xinyi District, Taipei",
      lat: 25.033879,
      lng: 121.568743,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      geocodeConfidence: "interpolated",
      providerCandidateId: "place-xinyi-office",
      selectedByActorId: "AGENT-OPS-001",
      selectedAt: "2026-07-08T05:01:00.000Z",
      surface: "callcenter",
      coordinateProvenance: {
        coordinateSource: "provider_candidate",
        geocodeProvider: "mock-geo",
        geocodeConfidence: "interpolated",
        providerCandidateId: "place-xinyi-office",
        selectedByActorId: "AGENT-OPS-001",
        selectedAt: "2026-07-08T05:01:00.000Z",
        surface: "callcenter",
      },
    },
    passenger: {
      name: "Smoke Caller",
      phone: "0912-000-301",
    },
  };

  const serviceableOrder = service.createCallCenterOrder(
    serviceableRequestBody,
    "req-map-closeout-serviceable-001",
  );
  const serviceableDetail = service.getOrder(SERVICEABLE_ORDER_ID);
  const serviceableMutated = service.getOrder(SERVICEABLE_ORDER_ID);
  serviceableMutated.spatialAudit?.reasonCodes.push("MUTATED_REASON");
  const freshServiceableDetail = service.getOrder(SERVICEABLE_ORDER_ID);
  const serviceablePersistedWrite = persistedWrites.find(
    (entry) => entry.payload.orders?.[0]?.orderId === SERVICEABLE_ORDER_ID,
  );
  const serviceableAuditLog = auditLogs.find(
    (auditLog) =>
      auditLog.resourceId === SERVICEABLE_ORDER_ID &&
      auditLog.actionName === "order.spatial_audit.snapshot_created",
  );
  const serviceableOpsMap = buildOpsMapBoardModel({
    orders: [serviceableDetail],
    orderJobMap: {
      [SERVICEABLE_ORDER_ID]: undefined,
    },
    candidatesByJobId: {},
  });

  expect(serviceableOrder.orderId).toBe(SERVICEABLE_ORDER_ID);
  expect(serviceableDetail.spatialAudit).toMatchObject({
    snapshotId: "snapshot-serviceable-001",
    decision: "serviceable",
    serviceAreaCodes: ["TAIPEI_CORE"],
    geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
  });
  expect(freshServiceableDetail.spatialAudit?.reasonCodes).toEqual([]);
  expect(serviceableAuditLog).toMatchObject({
    actionName: "order.spatial_audit.snapshot_created",
    resourceId: SERVICEABLE_ORDER_ID,
  });

  const manualReviewRequestBody = {
    callId: "CALL-MANUAL-001",
    agentId: "AGENT-OPS-001",
    recordingId: "REC-MANUAL-001",
    pickup: {
      address: "信義醫院管制入口",
      lat: 25.0338,
      lng: 121.5645,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      geocodeConfidence: "exact",
      providerCandidateId: "place-xinyi-hospital-review",
      selectedByActorId: "AGENT-OPS-001",
      selectedAt: "2026-07-08T05:10:00.000Z",
      surface: "callcenter",
    },
    dropoff: {
      address: "市府轉運站",
      lat: 25.041,
      lng: 121.55,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      geocodeConfidence: "exact",
      providerCandidateId: "place-city-hall-bus-terminal",
      selectedByActorId: "AGENT-OPS-001",
      selectedAt: "2026-07-08T05:11:00.000Z",
      surface: "callcenter",
    },
    passenger: {
      name: "Manual Review Rider",
      phone: "0912-000-302",
    },
  };

  const manualReviewOrder = service.createCallCenterOrder(
    manualReviewRequestBody,
    "req-map-closeout-manual-review-001",
  );
  const manualReviewDetail = service.getOrder(MANUAL_REVIEW_ORDER_ID);
  const manualReviewPersistedWrite = persistedWrites.find(
    (entry) => entry.payload.orders?.[0]?.orderId === MANUAL_REVIEW_ORDER_ID,
  );
  let manualReviewDispatchError: ReturnType<
    ApiRequestError["getResponse"]
  > | null = null;

  try {
    service.dispatchOrder(MANUAL_REVIEW_ORDER_ID, { mode: "auto" });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    manualReviewDispatchError = (error as ApiRequestError).getResponse();
  }

  const manualReviewDispatchJobs = service
    .listDispatchJobs()
    .filter((job) => job.orderId === MANUAL_REVIEW_ORDER_ID);

  expect(manualReviewOrder.orderId).toBe(MANUAL_REVIEW_ORDER_ID);
  expect(manualReviewDetail.queueFamily).toBe("manual_review_queue");
  expect(manualReviewDetail.queueEntryReason).toBe(
    "dispatch_manual_review_required",
  );
  expect(manualReviewDispatchJobs).toEqual([]);
  expect(manualReviewDispatchError).toMatchObject({
    error: {
      code: "DISPATCH_REQUIRES_MANUAL_REVIEW",
      details: {
        gateTypes: ["service_area"],
        reasonCodes: expect.arrayContaining(["STOP_REQUIRES_MANUAL_REVIEW"]),
      },
    },
  });

  const artifactPath = resolve(
    process.cwd(),
    "..",
    "..",
    BACKEND_ARTIFACT_RELATIVE_PATH,
  );
  mkdirSync(
    resolve(
      process.cwd(),
      "..",
      "..",
      "support/sidecars/MAP-REL-001/artifacts",
    ),
    {
      recursive: true,
    },
  );
  writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        serviceableOrder: {
          orderId: SERVICEABLE_ORDER_ID,
          requestId: "req-map-closeout-serviceable-001",
          requestBody: serviceableRequestBody,
          apiOrder: {
            orderId: serviceableDetail.orderId,
            status: serviceableDetail.status,
            complianceFlags: serviceableDetail.complianceFlags,
            pickup: serviceableDetail.pickup,
            dropoff: serviceableDetail.dropoff,
            spatialAudit: serviceableDetail.spatialAudit,
            serviceAreaGate: serviceableDetail.complianceGates?.find(
              (gate) => gate.gateType === "service_area",
            ),
          },
          persistedWrite: serviceablePersistedWrite?.payload ?? null,
          auditEvent: serviceableAuditLog ?? null,
          immutableSnapshotCheck: {
            mutatedReasonCodes:
              serviceableMutated.spatialAudit?.reasonCodes ?? [],
            freshReasonCodes:
              freshServiceableDetail.spatialAudit?.reasonCodes ?? [],
            freshPickupLocation:
              freshServiceableDetail.spatialAudit?.stops[0]?.location ?? null,
          },
          opsVisibility: {
            providerStatus: serviceableOpsMap.providerStatus,
            fallbackReason: serviceableOpsMap.fallbackReason,
            routeSegments: serviceableOpsMap.routeSegments.filter(
              (segment) => segment.orderId === SERVICEABLE_ORDER_ID,
            ),
            points: serviceableOpsMap.points.filter(
              (point) => point.orderId === SERVICEABLE_ORDER_ID,
            ),
            overlays: serviceableOpsMap.overlays,
          },
        },
        manualReviewOrder: {
          orderId: MANUAL_REVIEW_ORDER_ID,
          requestId: "req-map-closeout-manual-review-001",
          requestBody: manualReviewRequestBody,
          apiOrder: {
            orderId: manualReviewDetail.orderId,
            status: manualReviewDetail.status,
            queueFamily: manualReviewDetail.queueFamily,
            queueEntryReason: manualReviewDetail.queueEntryReason,
            spatialAudit: manualReviewDetail.spatialAudit,
            serviceAreaGate: manualReviewDetail.complianceGates?.find(
              (gate) => gate.gateType === "service_area",
            ),
          },
          persistedWrite: manualReviewPersistedWrite?.payload ?? null,
          dispatchAttempt: {
            errorResponse: manualReviewDispatchError,
            dispatchJobsForOrder: manualReviewDispatchJobs,
          },
        },
      },
      null,
      2,
    ),
  );
});
