import type {
  DispatchCandidate,
  DispatchJobRecord,
  OwnedOrderRecord,
  OwnedOrderSpatialAuditSnapshot,
} from "@drts/contracts";
import { describe, expect, it } from "vitest";
import {
  buildOpsMapBoardModel,
  buildOpsMapOverlaySummary,
  buildOpsMapTileViewport,
  getDefaultOpsMapZoom,
  hasOpsMapCoordinates,
  normalizeOpsMapBounds,
  projectOpsMapPointToViewport,
  resolveOpsMapTileUrlTemplate,
  unprojectOpsMapViewportPoint,
} from "../../app/dispatch/ops-map-board";

function order(overrides: Partial<OwnedOrderRecord> = {}): OwnedOrderRecord {
  return {
    orderId: "order-1",
    orderNo: "ORD-001",
    pickup: {
      address: "台北市信義區市府路 1 號",
      addressName: "台北市政府",
      lat: 25.037519,
      lng: 121.56368,
    },
    dropoff: {
      address: "台北市信義區松仁路 100 號",
      addressName: "信義辦公室",
      lat: 25.033879,
      lng: 121.568743,
    },
    spatialAudit: spatialAudit(),
    ...overrides,
  } as unknown as OwnedOrderRecord;
}

function job(overrides: Partial<DispatchJobRecord> = {}): DispatchJobRecord {
  return {
    dispatchJobId: "job-1",
    orderId: "order-1",
    status: "reserved",
    mode: "auto",
    latestEtaMinutes: 6,
    createdAt: "2026-06-30T10:00:00.000Z",
    updatedAt: "2026-06-30T10:01:00.000Z",
    ...overrides,
  };
}

function candidate(
  overrides: Partial<DispatchCandidate> = {},
): DispatchCandidate {
  return {
    vehicleId: "VH-001",
    driverId: "driver-1",
    operatingArea: "TPE-CORE",
    serviceBuckets: ["standard_taxi"],
    etaMinutes: 5,
    currentLocation: {
      driverId: "driver-1",
      lat: 25.03688,
      lng: 121.56608,
      accuracyM: 8,
      recordedAt: "2026-06-30T10:01:00.000Z",
      updatedAt: "2026-06-30T10:01:10.000Z",
    },
    locationState: "fresh",
    ...overrides,
  };
}

function spatialAudit(
  overrides: Partial<OwnedOrderSpatialAuditSnapshot> = {},
): OwnedOrderSpatialAuditSnapshot {
  return {
    snapshotId: "spatial-snapshot-1",
    snapshotVersion: 1,
    capturedAt: "2026-06-30T10:00:00.000Z",
    capturedReason: "booking_creation",
    actorId: "ops-1",
    actorType: "ops_user",
    surface: "ops_console",
    serviceProductType: "taxi_realtime",
    decision: "serviceable",
    stops: [],
    serviceAreaEvaluation: {
      decision: "serviceable",
      serviceProductType: "taxi_realtime",
      evaluatedAt: "2026-06-30T10:00:00.000Z",
      stops: [
        {
          kind: "pickup",
          location: { lat: 25.037519, lng: 121.56368 },
          serviceAreaCodes: ["TPE-CORE"],
          policyCodes: ["PICKUP_ZONE_A"],
          geometryVersionRefs: ["boundary:TPE:v4"],
          decision: "serviceable",
          reasonCodes: [],
          reasonMessages: [],
        },
        {
          kind: "dropoff",
          location: { lat: 25.033879, lng: 121.568743 },
          serviceAreaCodes: ["TPE-CORE"],
          policyCodes: ["DROPOFF_ZONE_B"],
          geometryVersionRefs: ["boundary:TPE:v4"],
          decision: "serviceable",
          reasonCodes: [],
          reasonMessages: [],
        },
      ],
      serviceAreaCodes: ["TPE-CORE"],
      geometryVersionRefs: ["boundary:TPE:v4"],
      reasonCodes: [],
      reasonMessages: [],
    },
    serviceAreaCodes: ["TPE-CORE"],
    geometryVersionRefs: ["boundary:TPE:v4"],
    reasonCodes: [],
    reasonMessages: [],
    missingItems: [],
    auditEvents: [],
    ...overrides,
  } as OwnedOrderSpatialAuditSnapshot;
}

describe("ops map board model", () => {
  it("builds governed order and candidate points with service-area overlays", () => {
    const model = buildOpsMapBoardModel({
      orders: [order()],
      orderJobMap: { "order-1": job() },
      candidatesByJobId: {
        "job-1": [
          candidate(),
          candidate({
            vehicleId: "VH-002",
            driverId: "driver-2",
            locationState: "low_accuracy",
          }),
        ],
      },
    });

    expect(model.providerStatus).toBe("ready");
    expect(model.fallbackReason).toBe("none");
    expect(model.points.map((point) => point.kind)).toEqual([
      "pickup",
      "dropoff",
      "candidate",
      "candidate",
    ]);
    expect(model.routeSegments).toEqual([
      expect.objectContaining({
        key: "order-1:route",
        orderId: "order-1",
        jobId: "job-1",
        pickup: { lat: 25.037519, lng: 121.56368 },
        dropoff: { lat: 25.033879, lng: 121.568743 },
      }),
    ]);
    expect(model.candidateSupplyPoints).toBe(2);
    expect(model.staleCandidatePoints).toBe(1);
    expect(model.noLocationCandidateCount).toBe(0);
    expect(model.overlays).toMatchObject({
      serviceAreaCodes: ["TPE-CORE"],
      policyCodes: ["PICKUP_ZONE_A", "DROPOFF_ZONE_B"],
      geometryVersionRefs: ["boundary:TPE:v4"],
      decisions: ["serviceable"],
    });
  });

  it("marks the board as degraded when orders or candidates lack governed coordinates", () => {
    const model = buildOpsMapBoardModel({
      orders: [
        order({
          pickup: { address: "caller only knew a storefront name" },
        }),
      ],
      orderJobMap: { "order-1": job() },
      candidatesByJobId: {
        "job-1": [
          candidate({
            currentLocation: null,
            locationState: "missing",
          }),
        ],
      },
    });

    expect(model.providerStatus).toBe("degraded_projection");
    expect(model.fallbackReason).toBe("missing_coordinates");
    expect(model.points.map((point) => point.kind)).toEqual(["dropoff"]);
    expect(model.routeSegments).toEqual([]);
    expect(model.ordersMissingPickupCoordinates).toBe(1);
    expect(model.noLocationCandidateCount).toBe(1);
    expect(hasOpsMapCoordinates(model.points[0])).toBe(true);
  });

  it("reports no spatial data when no visible order can be projected", () => {
    const model = buildOpsMapBoardModel({
      orders: [
        order({
          pickup: { address: "text-only pickup" },
          dropoff: { address: "text-only dropoff" },
          spatialAudit: null,
        }),
      ],
      orderJobMap: {},
      candidatesByJobId: {},
    });

    expect(model.providerStatus).toBe("no_spatial_data");
    expect(model.fallbackReason).toBe("no_visible_points");
    expect(model.points).toEqual([]);
    expect(model.overlays.serviceAreaCodes).toEqual([]);
  });

  it("deduplicates manual-review policy and reason overlays", () => {
    const overlays = buildOpsMapOverlaySummary([
      order({
        spatialAudit: spatialAudit({
          decision: "manual_review",
          reasonCodes: ["STOP_POLICY_REVIEW", "STOP_POLICY_REVIEW"],
          serviceAreaCodes: ["TPE-CORE", "TPE-CORE"],
          serviceAreaEvaluation: {
            ...spatialAudit().serviceAreaEvaluation!,
            stops: [
              {
                kind: "pickup",
                location: { lat: 25.037519, lng: 121.56368 },
                serviceAreaCodes: ["TPE-CORE"],
                policyCodes: ["PICKUP_ZONE_A", "PICKUP_ZONE_A"],
                geometryVersionRefs: ["boundary:TPE:v4"],
                decision: "manual_review",
                reasonCodes: ["STOP_POLICY_REVIEW"],
                reasonMessages: ["Manual curb review required."],
              },
            ],
          },
        }),
      }),
    ]);

    expect(overlays.serviceAreaCodes).toEqual(["TPE-CORE"]);
    expect(overlays.policyCodes).toEqual(["PICKUP_ZONE_A"]);
    expect(overlays.reasonCodes).toEqual(["STOP_POLICY_REVIEW"]);
    expect(overlays.decisions).toEqual(["manual_review"]);
  });

  it("builds a Web Mercator tile viewport and projects pins into it", () => {
    const model = buildOpsMapBoardModel({
      orders: [order()],
      orderJobMap: { "order-1": job() },
      candidatesByJobId: { "job-1": [candidate()] },
    });
    const bounds = normalizeOpsMapBounds(model.points);

    expect(bounds).not.toBeNull();
    const viewport = buildOpsMapTileViewport({
      bounds: bounds!,
      zoom: getDefaultOpsMapZoom(bounds!),
      tileUrlTemplate: "https://tiles.example.test/{z}/{x}/{y}.png",
    });
    const pickupProjection = projectOpsMapPointToViewport(
      model.points[0]!,
      viewport,
    );

    expect(viewport.zoom).toBeGreaterThanOrEqual(3);
    expect(viewport.zoom).toBeLessThanOrEqual(18);
    expect(viewport.tiles.length).toBeGreaterThan(0);
    expect(viewport.tiles[0]?.src).toContain(`/${viewport.zoom}/`);
    expect(pickupProjection.visible).toBe(true);
    expect(pickupProjection.leftPct).toBeGreaterThanOrEqual(0);
    expect(pickupProjection.leftPct).toBeLessThanOrEqual(100);
    expect(pickupProjection.topPct).toBeGreaterThanOrEqual(0);
    expect(pickupProjection.topPct).toBeLessThanOrEqual(100);

    const unprojected = unprojectOpsMapViewportPoint(
      {
        leftPx: (pickupProjection.leftPct / 100) * viewport.width,
        topPx: (pickupProjection.topPct / 100) * viewport.height,
      },
      viewport,
    );
    expect(unprojected.lat).toBeCloseTo(model.points[0]!.lat, 6);
    expect(unprojected.lng).toBeCloseTo(model.points[0]!.lng, 6);
  });

  it("uses deterministic mock tiles only for local/test/mock runtimes", () => {
    expect(resolveOpsMapTileUrlTemplate({ MAP_PROVIDER_MODE: "mock" })).toBe(
      "/mock-map-tiles/{z}/{x}/{y}.svg",
    );
    expect(
      resolveOpsMapTileUrlTemplate({
        MAP_PROVIDER_MODE: "external",
        MAP_PROVIDER_TILE_URL_TEMPLATE:
          "https://tiles.example.test/{z}/{x}/{y}.png",
      }),
    ).toBe("https://tiles.example.test/{z}/{x}/{y}.png");
    expect(
      resolveOpsMapTileUrlTemplate({
        DRTS_ENV: "production",
        MAP_PROVIDER_MODE: "external",
        NODE_ENV: "production",
      }),
    ).toBe("");
  });
});
