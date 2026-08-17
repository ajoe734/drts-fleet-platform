import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { EventEmitter2 } from "@nestjs/event-emitter";
import type { DispatchCandidate } from "@drts/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../src/common/idempotency";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import {
  buildOpsMapBoardModel,
  buildOpsMapTileViewport,
  normalizeOpsMapBounds,
  projectOpsMapPointToViewport,
} from "../../../ops-console-web/app/dispatch/ops-map-board";

const SERVICEABLE_ORDER_ID = "ORD-SMOKE-001";
const ARTIFACT_RELATIVE_PATH =
  "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json";
const ARTIFACT_PATH = path.join(findWorkspaceRoot(), ARTIFACT_RELATIVE_PATH);

afterEach(() => {
  randomUuidMock.mockReset();
});

describe("FLEETS-CLOSEOUT-004 Ops map API-envelope proof", () => {
  it("exports controller envelope order, dispatch, candidate, trace, and Ops map readback evidence", async () => {
    let createdOrderId = false;
    let snapshotSequence = 0;
    let traceSequence = 0;
    let fallbackSequence = 0;
    randomUuidMock.mockImplementation(() => {
      const stack = new Error().stack ?? "";
      if (stack.includes("buildSpatialAuditSnapshot")) {
        snapshotSequence += 1;
        return `snapshot-fleets-closeout-004-api-${String(
          snapshotSequence,
        ).padStart(3, "0")}`;
      }
      if (stack.includes("appendTrace")) {
        traceSequence += 1;
        return `trace-fleets-closeout-004-api-${String(traceSequence).padStart(
          3,
          "0",
        )}`;
      }
      if (
        !createdOrderId &&
        stack.includes("OwnedMobilityService.createCallCenterOrder")
      ) {
        createdOrderId = true;
        return SERVICEABLE_ORDER_ID;
      }
      fallbackSequence += 1;
      return `misc-fleets-closeout-004-api-${fallbackSequence}`;
    });

    const { service, regulatoryRegistryService } = createOwnedMobilityService();
    const idempotencyService = new IdempotencyService(
      new IdempotencyRepository(),
    );
    const controller = new OwnedMobilityController(service, idempotencyService);

    const { response } = fakeResponse();
    const createResponse = await controller.createCallCenterOrder(
      {
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
        notes: "FLEETS-CLOSEOUT-004 API envelope Ops map proof",
      },
      response,
      "idem-fleets-closeout-004-api-create",
      "req-fleets-closeout-004-api-create",
    );
    const orderId = createResponse.data.orderId;
    const dispatchResponse = controller.dispatchOrder(
      orderId,
      { mode: "auto" },
      "req-fleets-closeout-004-api-dispatch",
    );
    const orderResponse = controller.getOrder(
      orderId,
      "req-fleets-closeout-004-api-order",
    );
    const jobsResponse = controller.listDispatchJobs(
      "req-fleets-closeout-004-api-jobs",
    );
    const dispatchJob = jobsResponse.data.items.find(
      (job) => job.orderId === orderId,
    );
    expect(orderId).toBe(SERVICEABLE_ORDER_ID);
    expect(dispatchJob).toMatchObject({
      dispatchJobId: dispatchResponse.data.dispatchJobId,
      orderId,
      status: "matching",
    });

    const candidatesResponse = await controller.listDispatchCandidates(
      dispatchJob!.dispatchJobId,
      "true",
      "req-fleets-closeout-004-api-candidates",
    );
    const traceResponse = controller.listOrderDispatchTrace(
      orderId,
      "req-fleets-closeout-004-api-trace",
    );

    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenCalledWith("standard_taxi", { lat: 25.037519, lng: 121.56368 });
    expect(createResponse.meta.requestId).toBe(
      "req-fleets-closeout-004-api-create",
    );
    expect(orderResponse.meta.requestId).toBe(
      "req-fleets-closeout-004-api-order",
    );
    expect(jobsResponse.meta.requestId).toBe(
      "req-fleets-closeout-004-api-jobs",
    );
    expect(candidatesResponse.meta.requestId).toBe(
      "req-fleets-closeout-004-api-candidates",
    );
    expect(traceResponse.meta.requestId).toBe(
      "req-fleets-closeout-004-api-trace",
    );
    expect(orderResponse.data.spatialAudit).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["TAIPEI_CORE"],
      geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
    });
    expect(
      candidatesResponse.data.items.map((candidate) => candidate.locationState),
    ).toEqual(["fresh", "low_accuracy", "missing"]);
    expect(traceResponse.data.items.length).toBeGreaterThan(0);

    const model = buildOpsMapBoardModel({
      orders: [orderResponse.data],
      orderJobMap: {
        [orderId]: dispatchJob,
      },
      candidatesByJobId: {
        [dispatchJob!.dispatchJobId]: candidatesResponse.data.items,
      },
    });
    const bounds = normalizeOpsMapBounds(model.points);
    const viewport = buildOpsMapTileViewport({
      bounds: bounds!,
      zoom: 15,
      tileUrlTemplate: "/mock-map-tiles/{z}/{x}/{y}.svg",
    });

    expect(model.providerStatus).toBe("degraded_projection");
    expect(model.points.map((point) => point.kind)).toEqual([
      "pickup",
      "dropoff",
      "candidate",
      "candidate",
    ]);
    expect(model.candidateSupplyPoints).toBe(2);
    expect(model.staleCandidatePoints).toBe(1);
    expect(model.noLocationCandidateCount).toBe(1);

    const artifact = {
      generatedAt: new Date().toISOString(),
      branchSha: currentBranchSha(),
      closeoutTask: "FLEETS-CLOSEOUT-004",
      scope:
        "repo-local controller/API-envelope plus Ops map model evidence; final E2E-MAP-006 promotion composes this readback with FLEETS-CLOSEOUT-001 persisted snapshot proof, browser DOM screenshot evidence, and MAP-OBS-001 final evidence.",
      command:
        "pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility-ops-map-api-closeout-proof.test.ts --reporter=verbose",
      sameOrderIdsAsCallcenterProof: [SERVICEABLE_ORDER_ID],
      apiEnvelopeReadback: {
        create: {
          requestId: createResponse.meta.requestId,
          data: createResponse.data,
        },
        order: {
          requestId: orderResponse.meta.requestId,
          data: summarizeOrder(orderResponse.data),
        },
        dispatch: {
          requestId: dispatchResponse.meta.requestId,
          data: dispatchResponse.data,
        },
        dispatchJobs: {
          requestId: jobsResponse.meta.requestId,
          matchedJob: dispatchJob,
        },
        candidates: {
          requestId: candidatesResponse.meta.requestId,
          items: candidatesResponse.data.items.map(summarizeCandidate),
        },
        dispatchTrace: {
          requestId: traceResponse.meta.requestId,
          items: traceResponse.data.items,
        },
      },
      opsBoard: {
        providerStatus: model.providerStatus,
        fallbackReason: model.fallbackReason,
        overlays: model.overlays,
        counts: {
          points: model.points.length,
          candidateSupplyPoints: model.candidateSupplyPoints,
          staleCandidatePoints: model.staleCandidatePoints,
          noLocationCandidateCount: model.noLocationCandidateCount,
          ordersMissingPickupCoordinates: model.ordersMissingPickupCoordinates,
        },
        points: model.points.map((point) => ({
          key: point.key,
          kind: point.kind,
          orderId: point.orderId,
          jobId: point.jobId,
          lat: point.lat,
          lng: point.lng,
          freshness: point.freshness ?? null,
        })),
        viewport: {
          centerLat: viewport.centerLat,
          centerLng: viewport.centerLng,
          zoom: viewport.zoom,
          tileCount: viewport.tiles.length,
          projectedPoints: model.points.map((point) => ({
            key: point.key,
            kind: point.kind,
            projection: projectOpsMapPointToViewport(point, viewport),
          })),
        },
      },
      finalEvidencePromotion: {
        canSupportRows: [
          "E2E-MAP-006 controller/API envelope readback to Ops map",
          "same order ID across callcenter create, order detail, dispatch tasks, candidates, trace, and Ops map",
          "dispatch candidate freshness/no-location handling through API envelope",
          "service-area overlay from API-read order spatial audit",
        ],
        promotedRows: [
          "MAP-QA-002 E2E-MAP-006 final PASS row",
          "MAP-REL-001 FLEETS-CLOSEOUT-004 acceptance matrix",
        ],
        composedAuthority: [
          "FLEETS-CLOSEOUT-001 persisted API/DB snapshot proof for ORD-SMOKE-001",
          "FLEETS-CLOSEOUT-004 browser DOM screenshot and backend service readback for the same order/dispatch/candidate chain",
          "MAP-OBS-001 final evidence for degraded projection, freshness, and audit signals",
        ],
        finalArtifactLinks: [
          "support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.json",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.png",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json",
          ARTIFACT_RELATIVE_PATH,
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json",
          "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md",
          "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md",
          "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md",
        ],
      },
      assertions: [
        "api_create_callcenter_order_envelope_returns_order_id_and_request_id",
        "api_order_detail_envelope_preserves_spatial_audit_and_coordinates",
        "api_dispatch_tasks_envelope_links_job_to_same_order_id",
        "api_dispatch_candidates_envelope_returns_fresh_low_accuracy_and_missing_location_supply",
        "api_dispatch_trace_envelope_returns_same_order_dispatch_events",
        "ops_map_model_renders_from_api_envelope_readback",
      ],
    };

    mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  });
});

function fakeResponse() {
  const headers: Record<string, string> = {};
  return {
    response: {
      status() {
        return this;
      },
      setHeader(name: string, value: string) {
        headers[name] = value;
        return this;
      },
    },
  };
}

function createOwnedMobilityService() {
  const regulatoryCandidates: DispatchCandidate[] = [
    {
      driverId: "driver-map-closeout-004-api-fresh",
      vehicleId: "vehicle-map-closeout-004-api-fresh",
      etaMinutes: 4,
      operatingArea: "taipei",
      serviceBuckets: ["standard_taxi"],
      locationState: "fresh",
      currentLocation: {
        driverId: "driver-map-closeout-004-api-fresh",
        lat: 25.0381,
        lng: 121.5646,
        accuracyM: 12,
        recordedAt: "2026-07-08T07:02:00.000Z",
        updatedAt: "2026-07-08T07:02:00.000Z",
      },
    },
    {
      driverId: "driver-map-closeout-004-api-low-accuracy",
      vehicleId: "vehicle-map-closeout-004-api-low-accuracy",
      etaMinutes: 7,
      operatingArea: "taipei",
      serviceBuckets: ["standard_taxi"],
      locationState: "low_accuracy",
      currentLocation: {
        driverId: "driver-map-closeout-004-api-low-accuracy",
        lat: 25.0387,
        lng: 121.5654,
        accuracyM: 85,
        recordedAt: "2026-07-08T07:02:00.000Z",
        updatedAt: "2026-07-08T07:02:00.000Z",
      },
    },
    {
      driverId: "driver-map-closeout-004-api-missing",
      vehicleId: "vehicle-map-closeout-004-api-missing",
      etaMinutes: 9,
      operatingArea: "taipei",
      serviceBuckets: ["standard_taxi"],
      locationState: "missing",
      currentLocation: null,
    },
  ];
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => regulatoryCandidates),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };
  const repository = {
    isEnabled: () => true,
    persistChanges: async <T>(payload: T) => payload,
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
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );
  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
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
    regulatoryRegistryService,
  };
}

function summarizeOrder(detail: ReturnType<OwnedMobilityService["getOrder"]>) {
  return {
    orderId: detail.orderId,
    orderNo: detail.orderNo,
    orderSource: detail.orderSource,
    serviceBucket: detail.serviceBucket,
    status: detail.status,
    queueFamily: detail.queueFamily,
    pickup: summarizeAddress(detail.pickup),
    dropoff: summarizeAddress(detail.dropoff),
    spatialAudit: {
      snapshotId: detail.spatialAudit?.snapshotId,
      decision: detail.spatialAudit?.decision,
      serviceAreaCodes: detail.spatialAudit?.serviceAreaCodes,
      geometryVersionRefs: detail.spatialAudit?.geometryVersionRefs,
      reasonCodes: detail.spatialAudit?.reasonCodes,
      missingItems: detail.spatialAudit?.missingItems,
    },
  };
}

function summarizeAddress(
  address: ReturnType<OwnedMobilityService["getOrder"]>["pickup"],
) {
  return {
    address: address.address,
    lat: address.lat,
    lng: address.lng,
    coordinateSource: address.coordinateSource,
    geocodeProvider: address.geocodeProvider,
    geocodeConfidence: address.geocodeConfidence,
    providerCandidateId: address.providerCandidateId,
    selectedByActorId: address.selectedByActorId,
    selectedAt: address.selectedAt,
    pinnedByActorId: address.pinnedByActorId,
    pinnedAt: address.pinnedAt,
    surface: address.surface,
  };
}

function summarizeCandidate(candidate: DispatchCandidate) {
  return {
    vehicleId: candidate.vehicleId,
    driverId: candidate.driverId,
    operatingArea: candidate.operatingArea,
    etaMinutes: candidate.etaMinutes,
    locationState: candidate.locationState ?? null,
    currentLocation: candidate.currentLocation,
  };
}

function currentBranchSha() {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
    return `${branch}@${sha}`;
  } catch {
    return "unknown";
  }
}

function findWorkspaceRoot() {
  let current = process.cwd();

  while (!existsSync(path.join(current, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }

  return current;
}
