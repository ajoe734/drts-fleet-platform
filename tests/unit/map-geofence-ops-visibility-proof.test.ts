import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";
import type {
  DispatchCandidate,
  DispatchJobRecord,
  OwnedOrderRecord,
  OwnedOrderSpatialAuditSnapshot,
  ServiceAreaEvaluationDecision,
} from "@drts/contracts";

import {
  buildOpsMapBoardModel,
  buildOpsMapTileViewport,
  normalizeOpsMapBounds,
  projectOpsMapPointToViewport,
} from "../../apps/ops-console-web/app/dispatch/ops-map-board";

const GENERATED_AT = "2026-07-08T04:20:00.000Z";
const SERVICEABLE_ORDER_ID = "ORD-SMOKE-001";
const MANUAL_REVIEW_ORDER_ID = "ORD-MAP-MANUAL-001";
const ARTIFACT_PATH =
  "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json";

describe("FLEETS-CLOSEOUT-004 Ops map backend-linked visibility proof packet", () => {
  test("exports same-order pins, overlays, supply freshness, and fallback evidence", () => {
    const serviceableOrder = order({
      orderId: SERVICEABLE_ORDER_ID,
      orderNo: SERVICEABLE_ORDER_ID,
      pickup: {
        address: "No. 1, City Hall Road, Xinyi District, Taipei",
        addressName: "Taipei City Hall pickup",
        lat: 25.037519,
        lng: 121.56368,
      },
      dropoff: {
        address: "No. 100, Songren Road, Xinyi District, Taipei",
        addressName: "Songren Road dropoff",
        lat: 25.033879,
        lng: 121.568743,
      },
      spatialAudit: spatialAudit({
        snapshotId: "snapshot-serviceable-001",
        decision: "serviceable",
        serviceAreaCodes: ["TAIPEI_CORE"],
        geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
        stopPolicyCodes: ["PICKUP_ZONE_A", "DROPOFF_ZONE_B"],
      }),
    });
    const manualReviewOrder = order({
      orderId: MANUAL_REVIEW_ORDER_ID,
      orderNo: MANUAL_REVIEW_ORDER_ID,
      pickup: {
        address: "信義醫院管制入口",
        addressName: "Xinyi hospital controlled pickup",
        lat: 25.0338,
        lng: 121.5645,
      },
      dropoff: {
        address: "市府轉運站",
        addressName: "City Hall bus station",
        lat: 25.041,
        lng: 121.55,
      },
      spatialAudit: spatialAudit({
        snapshotId: "snapshot-manual-review-001",
        decision: "manual_review",
        serviceAreaCodes: ["TAIPEI_CORE"],
        geometryVersionRefs: [
          "service_area:TAIPEI_CORE@1",
          "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
        ],
        reasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
        reasonMessages: ["Hospital controlled entrance requires Ops review."],
        stopPolicyCodes: ["XINYI_HOSPITAL_MANUAL_REVIEW"],
      }),
    });
    const job = dispatchJob(serviceableOrder.orderId);
    const model = buildOpsMapBoardModel({
      orders: [serviceableOrder, manualReviewOrder],
      orderJobMap: {
        [serviceableOrder.orderId]: job,
      },
      candidatesByJobId: {
        [job.dispatchJobId]: [
          candidate(),
          candidate({
            vehicleId: "VH-MAP-CLOSEOUT-LOW-ACC",
            driverId: "DRV-MAP-CLOSEOUT-LOW-ACC",
            locationState: "low_accuracy",
            currentLocation: {
              driverId: "DRV-MAP-CLOSEOUT-LOW-ACC",
              lat: 25.0382,
              lng: 121.5652,
              accuracyM: 85,
              recordedAt: GENERATED_AT,
              updatedAt: GENERATED_AT,
            },
          }),
          candidate({
            vehicleId: "VH-MAP-CLOSEOUT-MISSING",
            driverId: "DRV-MAP-CLOSEOUT-MISSING",
            locationState: "missing",
            currentLocation: null,
          }),
        ],
      },
    });
    const bounds = normalizeOpsMapBounds(model.points);
    const viewport = buildOpsMapTileViewport({
      bounds: bounds!,
      zoom: 15,
      tileUrlTemplate: "/mock-map-tiles/{z}/{x}/{y}.svg",
    });
    const viewportPoints = model.points.map((point) => ({
      key: point.key,
      kind: point.kind,
      orderId: point.orderId,
      jobId: point.jobId,
      freshness: point.freshness ?? null,
      projection: projectOpsMapPointToViewport(point, viewport),
    }));
    const noVisibleFallbackModel = buildOpsMapBoardModel({
      orders: [
        order({
          orderId: "ORD-NO-SPATIAL-001",
          orderNo: "ORD-NO-SPATIAL-001",
          pickup: { address: "caller only knew a storefront name" },
          dropoff: { address: "caller did not know the destination" },
          spatialAudit: null,
        }),
      ],
      orderJobMap: {},
      candidatesByJobId: {},
    });
    const artifact = {
      generatedAt: new Date().toISOString(),
      branchSha: currentBranchSha(),
      closeoutTask: "FLEETS-CLOSEOUT-004",
      scope:
        "repo-local Ops map model evidence; final E2E-MAP-006 promotion composes this model with FLEETS-CLOSEOUT-001 persisted snapshot proof, browser DOM screenshot evidence, backend/API readbacks, and MAP-OBS-001 final evidence.",
      command:
        "pnpm exec vitest run tests/unit/map-geofence-ops-visibility-proof.test.ts --reporter=verbose",
      sameOrderIdsAsCallcenterProof: [
        serviceableOrder.orderId,
        manualReviewOrder.orderId,
      ],
      opsBoard: {
        providerStatus: model.providerStatus,
        fallbackReason: model.fallbackReason,
        counts: {
          points: model.points.length,
          candidateSupplyPoints: model.candidateSupplyPoints,
          staleCandidatePoints: model.staleCandidatePoints,
          noLocationCandidateCount: model.noLocationCandidateCount,
          ordersMissingPickupCoordinates: model.ordersMissingPickupCoordinates,
        },
        overlays: model.overlays,
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
          projectedPoints: viewportPoints,
        },
        browserDomContract: [
          `.spatial-point[data-ops-map-point-kind="pickup"][data-ops-map-order-id="${SERVICEABLE_ORDER_ID}"]`,
          `.spatial-point[data-ops-map-point-kind="dropoff"][data-ops-map-order-id="${SERVICEABLE_ORDER_ID}"]`,
          '.spatial-point[data-ops-map-point-kind="candidate"][data-ops-map-freshness="fresh"]',
          '.spatial-point[data-ops-map-point-kind="candidate"][data-ops-map-freshness="low_accuracy"]',
          `[data-ops-map-policy-codes*="XINYI_HOSPITAL_MANUAL_REVIEW"]`,
          '[data-ops-map-fallback-reason="missing_coordinates"]',
        ],
      },
      noVisibleFallback: {
        providerStatus: noVisibleFallbackModel.providerStatus,
        fallbackReason: noVisibleFallbackModel.fallbackReason,
        points: noVisibleFallbackModel.points,
      },
      finalEvidencePromotion: {
        canSupportRows: [
          "E2E-MAP-006",
          "Ops visibility",
          "service overlays",
          "stale supply",
          "no-location supply",
          "fallback state",
        ],
        promotedRows: [
          "MAP-QA-002 E2E-MAP-006 final PASS row",
          "MAP-REL-001 FLEETS-CLOSEOUT-004 acceptance matrix",
        ],
        composedAuthority: [
          "FLEETS-CLOSEOUT-001 persisted API/DB snapshot proof for ORD-SMOKE-001 and ORD-MAP-MANUAL-001",
          "FLEETS-CLOSEOUT-004 browser DOM screenshot and backend/API readbacks for the same serviceable order chain",
          "MAP-OBS-001 final evidence for degraded projection, freshness, and audit signals",
        ],
        finalArtifactLinks: [
          "support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-backend-proof-20260708T050500Z.json",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.json",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-browser-dom-proof.png",
          ARTIFACT_PATH,
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json",
          "support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json",
          "support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md",
          "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md",
          "support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md",
        ],
      },
      assertions: [
        "ops_points_include_same_callcenter_order_id",
        "ops_points_include_pickup_dropoff_and_candidate_supply",
        "ops_overlays_include_service_area_stop_policy_and_geometry_versions",
        "ops_counts_include_low_accuracy_and_no_location_supply",
        "ops_fallback_distinguishes_missing_coordinates_from_no_visible_points",
        "ops_viewport_projects_all_visible_points",
      ],
    };

    expect(model.providerStatus).toBe("degraded_projection");
    expect(model.fallbackReason).toBe("missing_coordinates");
    expect(model.points.map((point) => point.kind)).toEqual([
      "pickup",
      "dropoff",
      "candidate",
      "candidate",
      "pickup",
      "dropoff",
    ]);
    expect(
      model.points
        .filter((point) => point.orderId === serviceableOrder.orderId)
        .map((point) => point.kind),
    ).toEqual(["pickup", "dropoff", "candidate", "candidate"]);
    expect(model.candidateSupplyPoints).toBe(2);
    expect(model.staleCandidatePoints).toBe(1);
    expect(model.noLocationCandidateCount).toBe(1);
    expect(model.overlays).toMatchObject({
      serviceAreaCodes: ["TAIPEI_CORE"],
      policyCodes: [
        "PICKUP_ZONE_A",
        "DROPOFF_ZONE_B",
        "XINYI_HOSPITAL_MANUAL_REVIEW",
      ],
      geometryVersionRefs: [
        "service_area:TAIPEI_CORE@1",
        "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
      ],
      reasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
      decisions: ["serviceable", "manual_review"],
    });
    expect(viewportPoints.every((point) => point.projection.visible)).toBe(
      true,
    );
    expect(noVisibleFallbackModel.providerStatus).toBe("no_spatial_data");
    expect(noVisibleFallbackModel.fallbackReason).toBe("no_visible_points");
    expect(artifact.assertions).toHaveLength(6);

    mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  });
});

function order(overrides: Partial<OwnedOrderRecord>): OwnedOrderRecord {
  return {
    orderSource: "phone",
    orderDomain: "owned",
    status: "ready_for_dispatch",
    serviceBucket: "standard_taxi",
    dispatchSemantics: "realtime",
    complianceFlags: [],
    ...overrides,
  } as OwnedOrderRecord;
}

function spatialAudit({
  snapshotId,
  decision,
  serviceAreaCodes,
  geometryVersionRefs,
  reasonCodes = [],
  reasonMessages = [],
  stopPolicyCodes,
}: {
  snapshotId: string;
  decision: ServiceAreaEvaluationDecision;
  serviceAreaCodes: string[];
  geometryVersionRefs: string[];
  reasonCodes?: string[];
  reasonMessages?: string[];
  stopPolicyCodes: string[];
}): OwnedOrderSpatialAuditSnapshot {
  return {
    snapshotId,
    snapshotVersion: 1,
    capturedAt: GENERATED_AT,
    capturedReason: "booking_creation",
    actorId: "ops-agent-fleets-closeout",
    actorType: "ops_user",
    surface: "callcenter",
    serviceProductType: "taxi_realtime",
    decision,
    stops: [],
    serviceAreaEvaluation: {
      decision,
      serviceProductType: "taxi_realtime",
      evaluatedAt: GENERATED_AT,
      stops: stopPolicyCodes.map((policyCode, index) => ({
        kind: index === 0 ? "pickup" : "dropoff",
        location:
          index === 0
            ? { lat: 25.037519, lng: 121.56368 }
            : { lat: 25.033879, lng: 121.568743 },
        serviceAreaCodes,
        policyCodes: [policyCode],
        geometryVersionRefs,
        decision,
        reasonCodes,
        reasonMessages,
      })),
      serviceAreaCodes,
      geometryVersionRefs,
      reasonCodes,
      reasonMessages,
    },
    serviceAreaCodes,
    geometryVersionRefs,
    reasonCodes,
    reasonMessages,
    missingItems: [],
    auditEvents: [
      {
        auditId: `${snapshotId}-AUDIT`,
        actionName: "order.spatial_audit.snapshot_created",
        actorId: "ops-agent-fleets-closeout",
        actorType: "ops_user",
        createdAt: GENERATED_AT,
      },
    ],
  };
}

function dispatchJob(orderId: string): DispatchJobRecord {
  return {
    dispatchJobId: "JOB-OPS-CLOSEOUT-001",
    orderId,
    status: "matching",
    mode: "auto",
    latestEtaMinutes: 6,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
  };
}

function candidate(overrides: Partial<DispatchCandidate> = {}) {
  return {
    vehicleId: "VH-MAP-CLOSEOUT-FRESH",
    driverId: "DRV-MAP-CLOSEOUT-FRESH",
    operatingArea: "TAIPEI_CORE",
    serviceBuckets: ["standard_taxi"],
    etaMinutes: 5,
    currentLocation: {
      driverId: "DRV-MAP-CLOSEOUT-FRESH",
      lat: 25.0378,
      lng: 121.5642,
      accuracyM: 8,
      recordedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
    },
    locationState: "fresh",
    ...overrides,
  } as DispatchCandidate;
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
