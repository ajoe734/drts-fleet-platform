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
  "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json";
const ARTIFACT_PATH = path.join(findWorkspaceRoot(), ARTIFACT_RELATIVE_PATH);

afterEach(() => {
  randomUuidMock.mockReset();
});

describe("FLEETS-CLOSEOUT-004 backend-linked Ops map proof", () => {
  it("exports backend order, dispatch, candidate, and Ops map readback evidence", async () => {
    let createdOrderId = false;
    let snapshotSequence = 0;
    let traceSequence = 0;
    let fallbackSequence = 0;
    randomUuidMock.mockImplementation(() => {
      const stack = new Error().stack ?? "";
      if (stack.includes("buildSpatialAuditSnapshot")) {
        snapshotSequence += 1;
        return `snapshot-fleets-closeout-004-${String(
          snapshotSequence,
        ).padStart(3, "0")}`;
      }
      if (stack.includes("appendTrace")) {
        traceSequence += 1;
        return `trace-fleets-closeout-004-${String(traceSequence).padStart(
          3,
          "0",
        )}`;
      }
      if (!createdOrderId && stack.includes("createCallCenterOrder")) {
        createdOrderId = true;
        return SERVICEABLE_ORDER_ID;
      }
      fallbackSequence += 1;
      return `misc-fleets-closeout-004-${fallbackSequence}`;
    });

    const { service, regulatoryRegistryService } = createOwnedMobilityService();

    const order = service.createCallCenterOrder(
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
        notes: "FLEETS-CLOSEOUT-004 backend-linked Ops map proof",
      },
      "req-fleets-closeout-004-create",
    );

    const dispatchJob = service.dispatchOrder(
      order.orderId,
      { mode: "auto" },
      "req-fleets-closeout-004-dispatch",
    );
    const orderDetail = service.getOrder(order.orderId);
    const dispatchJobs = service.listDispatchJobs();
    const storedDispatchJob = dispatchJobs.find(
      (candidate) => candidate.dispatchJobId === dispatchJob.dispatchJobId,
    );
    const candidates = await service.listDispatchCandidates(
      dispatchJob.dispatchJobId,
      true,
    );

    expect(order.orderId).toBe(SERVICEABLE_ORDER_ID);
    expect(storedDispatchJob).toMatchObject({
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId: order.orderId,
      status: "matching",
    });
    expect(candidates).toHaveLength(3);
    expect(
      regulatoryRegistryService.getEligibleCandidates,
    ).toHaveBeenCalledWith("standard_taxi", { lat: 25.037519, lng: 121.56368 });

    const model = buildOpsMapBoardModel({
      orders: [orderDetail],
      orderJobMap: {
        [order.orderId]: storedDispatchJob,
      },
      candidatesByJobId: {
        [dispatchJob.dispatchJobId]: candidates,
      },
    });
    const bounds = normalizeOpsMapBounds(model.points);
    const viewport = buildOpsMapTileViewport({
      bounds: bounds!,
      zoom: 15,
      tileUrlTemplate: "/mock-map-tiles/{z}/{x}/{y}.svg",
    });

    expect(model.providerStatus).toBe("degraded_projection");
    expect(model.fallbackReason).toBe("missing_coordinates");
    expect(model.points.map((point) => point.kind)).toEqual([
      "pickup",
      "dropoff",
      "candidate",
      "candidate",
    ]);
    expect(model.candidateSupplyPoints).toBe(2);
    expect(model.staleCandidatePoints).toBe(1);
    expect(model.noLocationCandidateCount).toBe(1);
    expect(model.overlays.serviceAreaCodes).toEqual(["TAIPEI_CORE"]);
    expect(model.overlays.geometryVersionRefs).toEqual([
      "service_area:TAIPEI_CORE@1",
    ]);

    const artifact = {
      generatedAt: new Date().toISOString(),
      branchSha: currentBranchSha(),
      closeoutTask: "FLEETS-CLOSEOUT-004",
      scope:
        "repo-local backend service-layer plus Ops map model evidence; not final stage/API/DB evidence and not MAP-QA-002-FINAL-EVIDENCE.md",
      command:
        "pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility-ops-map-closeout-proof.test.ts --reporter=verbose",
      sameOrderIdsAsCallcenterProof: [SERVICEABLE_ORDER_ID],
      backendReadback: {
        order: summarizeOrder(orderDetail),
        dispatchJob: storedDispatchJob,
        dispatchTrace: service.listDispatchTrace(order.orderId),
        candidates: candidates.map(summarizeCandidate),
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
          "E2E-MAP-006 backend/API readback to Ops map",
          "same persisted order ID across callcenter, dispatch, and Ops map",
          "dispatch candidate location freshness and no-location handling",
          "service-area overlay from backend spatial audit",
        ],
        stillRequiredBeforeFinalPass: [
          "reviewer-accepted stage API or DB export for the same order/dispatch/candidate readback",
          "browser trace or screenshot tied to this backend-generated order ID",
          "MAP-OBS-001 final metrics/audit evidence",
          "MAP-QA-002 final row-level artifact links",
        ],
      },
      assertions: [
        "backend_order_readback_preserves_pickup_dropoff_coordinates",
        "backend_dispatch_job_links_to_same_order_id",
        "backend_candidate_api_returns_fresh_low_accuracy_and_missing_location_supply",
        "ops_map_model_renders_backend_order_pickup_dropoff_and_visible_candidates",
        "ops_map_model_exposes_service_area_overlay_from_backend_spatial_audit",
        "ops_map_model_marks_missing_candidate_location_as_degraded_projection",
      ],
    };

    mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  });
});

function createOwnedMobilityService() {
  const regulatoryCandidates: DispatchCandidate[] = [
    {
      driverId: "driver-map-closeout-004-fresh",
      vehicleId: "vehicle-map-closeout-004-fresh",
      etaMinutes: 4,
      operatingArea: "taipei",
      serviceBuckets: ["standard_taxi"],
      locationState: "fresh",
      currentLocation: {
        driverId: "driver-map-closeout-004-fresh",
        lat: 25.0381,
        lng: 121.5646,
        accuracyM: 12,
        recordedAt: "2026-07-08T06:02:00.000Z",
        updatedAt: "2026-07-08T06:02:00.000Z",
      },
    },
    {
      driverId: "driver-map-closeout-004-low-accuracy",
      vehicleId: "vehicle-map-closeout-004-low-accuracy",
      etaMinutes: 7,
      operatingArea: "taipei",
      serviceBuckets: ["standard_taxi"],
      locationState: "low_accuracy",
      currentLocation: {
        driverId: "driver-map-closeout-004-low-accuracy",
        lat: 25.0387,
        lng: 121.5654,
        accuracyM: 85,
        recordedAt: "2026-07-08T06:02:00.000Z",
        updatedAt: "2026-07-08T06:02:00.000Z",
      },
    },
    {
      driverId: "driver-map-closeout-004-missing",
      vehicleId: "vehicle-map-closeout-004-missing",
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
    const { execFileSync } =
      require("node:child_process") as typeof import("node:child_process");
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
