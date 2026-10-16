import { describe, expect, it, vi } from "vitest";

import { MapGeofenceObservabilityService } from "../../../apps/api/src/modules/operational-observability/map-geofence-observability.service";
import { ServiceAreaRepository } from "../../../apps/api/src/modules/service-area/service-area.repository";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import type { DatabaseService } from "../../../apps/api/src/common/db";

/**
 * Real `ServiceAreaRepository` lifecycle readback through a mocked
 * `DatabaseService` socket boundary only. Queries are routed by actual SQL
 * statement/table name into in-memory maps, mirroring Postgres
 * `ON CONFLICT ... DO UPDATE SET record = EXCLUDED.record` semantics, so the
 * repository's real SQL-building and JSONB-readback code paths run exactly
 * as in production.
 */
function createMockDatabaseService() {
  const persistedServiceAreasById = new Map<string, unknown>();
  const persistedStopPoliciesById = new Map<string, unknown>();
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INSERT INTO ops.service_area_boundaries")) {
      persistedServiceAreasById.set(
        params![0] as string,
        JSON.parse(params![10] as string),
      );
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO ops.stop_policies")) {
      persistedStopPoliciesById.set(
        params![0] as string,
        JSON.parse(params![15] as string),
      );
      return { rows: [] };
    }
    if (
      sql.includes("SELECT record") &&
      sql.includes("FROM ops.service_area_boundaries")
    ) {
      return {
        rows: Array.from(persistedServiceAreasById.values()).map(
          (record) => ({ record }),
        ),
      };
    }
    if (
      sql.includes("SELECT record") &&
      sql.includes("FROM ops.stop_policies")
    ) {
      return {
        rows: Array.from(persistedStopPoliciesById.values()).map(
          (record) => ({ record }),
        ),
      };
    }
    throw new Error(`Unexpected SQL in test double: ${sql}`);
  });
  const databaseService = { isEnabled: () => true, query };
  return {
    databaseService: databaseService as unknown as DatabaseService,
    query,
    persistedServiceAreasById,
    persistedStopPoliciesById,
  };
}

function lastInsertCall(
  query: ReturnType<typeof vi.fn>,
  table: "ops.service_area_boundaries" | "ops.stop_policies",
) {
  const calls = query.mock.calls.filter(([sql]: [string]) =>
    sql.includes(`INSERT INTO ${table}`),
  );
  return calls[calls.length - 1]! as [string, unknown[]];
}

function lastInsertParams(
  query: ReturnType<typeof vi.fn>,
  table: "ops.service_area_boundaries" | "ops.stop_policies",
) {
  return lastInsertCall(query, table)[1];
}

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
const FIXED_REQUESTED_AT = new Date("2026-07-01T00:00:00.000Z");
const context = {
  actorId: "platform-admin-geo-001",
  actorType: "platform_admin" as const,
  requestId: "req-service-area-polygon-holes-repo-lifecycle",
};

describe("ServiceAreaRepository + ServiceAreaService: real SQL-routed lifecycle and fresh active readback for polygon holes", () => {
  it("carries holes through create -> submitForReview -> publish, real SQL $5/$11 bindings, and a fresh onModuleInit readback (HOLE-EVAL-1..5)", async () => {
    const { databaseService, query, persistedServiceAreasById } =
      createMockDatabaseService();
    const realRepository = new ServiceAreaRepository(databaseService);
    const writerService = new ServiceAreaService(
      realRepository,
      undefined,
      new MapGeofenceObservabilityService(),
    );

    // --- Phase A: real create -> submitForReview -> publish lifecycle ---
    const created = await writerService.createServiceArea(
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
        effectiveUntil: null,
      },
      context,
    );

    const [createSql, createParams] = lastInsertCall(
      query,
      "ops.service_area_boundaries",
    );
    // Area geometry is bound as $5 and wrapped in ST_Multi (MultiPolygon
    // column), unlike stop-policy geometry ($7, plain Polygon, no ST_Multi).
    expect(createSql).toContain("ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5)");
    expect(createParams[3]).toBe("draft"); // $4
    const createdGeoJson = JSON.parse(createParams[4] as string); // $5
    expect(createdGeoJson).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [120.25, 22.58],
          [120.35, 22.58],
          [120.35, 22.68],
          [120.25, 22.68],
          [120.25, 22.58],
        ],
        [
          [120.28, 22.61],
          [120.28, 22.65],
          [120.32, 22.65],
          [120.32, 22.61],
          [120.28, 22.61],
        ],
      ],
    });
    const createdRecord = JSON.parse(createParams[10] as string); // $11
    expect(createdRecord).toMatchObject({
      serviceAreaId: created.record.serviceAreaId,
      areaCode: "KHH_DONUT_CORE",
      status: "draft",
      version: 1,
      geometry: {
        type: "polygon",
        coordinates: KHH_DONUT_OUTER,
        holes: [KHH_DONUT_HOLE],
      },
    });

    expect(
      writerService
        .exportGeoJson()
        .features.some((f) => f.id === created.record.serviceAreaId),
    ).toBe(true);
    expect(
      writerService
        .exportOperationalGeoJson(FIXED_REQUESTED_AT)
        .features.some((f) => f.id === created.record.serviceAreaId),
    ).toBe(false);
    expect(
      writerService
        .evaluate({
          serviceProductType: "taxi_realtime",
          pickup: { lat: 22.595, lng: 120.265 },
          requestedAt: FIXED_REQUESTED_AT.toISOString(),
        })
        .serviceAreaCodes.includes("KHH_DONUT_CORE"),
    ).toBe(false);

    // Draft reload isolation: a fresh repository/service reload still
    // includes the draft in the admin export but excludes it operationally.
    const draftReloadService = new ServiceAreaService(
      new ServiceAreaRepository(databaseService),
    );
    await draftReloadService.onModuleInit();
    expect(
      draftReloadService
        .exportGeoJson()
        .features.some((f) => f.id === created.record.serviceAreaId),
    ).toBe(true);
    expect(
      draftReloadService
        .exportOperationalGeoJson(FIXED_REQUESTED_AT)
        .features.some((f) => f.id === created.record.serviceAreaId),
    ).toBe(false);

    await writerService.submitServiceAreaForReview(
      created.record.serviceAreaId,
      context,
    );
    expect(lastInsertParams(query, "ops.service_area_boundaries")[3]).toBe(
      "review",
    );
    expect(
      writerService
        .exportOperationalGeoJson(FIXED_REQUESTED_AT)
        .features.some((f) => f.id === created.record.serviceAreaId),
    ).toBe(false);

    const publishedArea = await writerService.publishServiceArea(
      created.record.serviceAreaId,
      {
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        reason: "activate kaohsiung donut",
      },
      context,
    );
    expect(lastInsertParams(query, "ops.service_area_boundaries")[3]).toBe(
      "active",
    );
    const finalRecord = persistedServiceAreasById.get(
      publishedArea.record.serviceAreaId,
    ) as {
      status: string;
      version: number;
      effectiveFrom: string;
      effectiveUntil: string | null;
      geometry: { holes?: unknown[] };
    };
    expect(finalRecord).toMatchObject({
      status: "active",
      version: 1,
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
    });
    expect(finalRecord.geometry.holes).toEqual([KHH_DONUT_HOLE]);

    // --- Phase B: fresh loadState() + onModuleInit() active readback ---
    const freshAreaRepo = new ServiceAreaRepository(databaseService);
    const freshAreaService = new ServiceAreaService(
      freshAreaRepo,
      undefined,
      new MapGeofenceObservabilityService(),
    );
    await freshAreaService.onModuleInit();

    const freshAreas = freshAreaService.listServiceAreas();
    expect(
      freshAreas.find(
        (a) => a.areaCode === "KHH_DONUT_CORE" && a.status === "active",
      )?.geometry,
    ).toMatchObject({ holes: [KHH_DONUT_HOLE] });
    expect(freshAreas.some((a) => a.areaCode === "TAIPEI_CORE")).toBe(true);
    expect(freshAreas.some((a) => a.areaCode === "TAOYUAN_AIRPORT")).toBe(
      true,
    );

    // HOLE-EVAL-1: outer-inside
    expect(
      freshAreaService.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.595, lng: 120.265 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT.toISOString(),
      }),
    ).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["KHH_DONUT_CORE"],
      geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
    });
    // HOLE-EVAL-2: hole-inside
    expect(
      freshAreaService.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.63, lng: 120.3 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT.toISOString(),
      }),
    ).toMatchObject({
      decision: "not_serviceable",
      serviceAreaCodes: [],
      reasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
    });
    // HOLE-EVAL-4: hole-edge
    expect(
      freshAreaService.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.61, lng: 120.3 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT.toISOString(),
      }),
    ).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["KHH_DONUT_CORE"],
    });
    // HOLE-EVAL-5: outside
    expect(
      freshAreaService.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.5, lng: 120.2 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT.toISOString(),
      }),
    ).toMatchObject({ decision: "not_serviceable", serviceAreaCodes: [] });
    // HOLE-EVAL-3: outer-boundary (on the outer ring's edge, not interior)
    expect(
      freshAreaService.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.58, lng: 120.3 },
        dropoff: null,
        requestedAt: FIXED_REQUESTED_AT.toISOString(),
      }),
    ).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["KHH_DONUT_CORE"],
    });
    // HOLE-EVAL-6: a real (non-null) dropoff landing inside the hole gets
    // the exact uncovered-leg reason and empty area/policy/version refs,
    // while the pickup leg (outer-interior) retains its own legitimate refs.
    const mixedLegResult = freshAreaService.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 22.595, lng: 120.265 },
      dropoff: { lat: 22.63, lng: 120.3 },
      requestedAt: FIXED_REQUESTED_AT.toISOString(),
    });
    expect(mixedLegResult.decision).toBe("not_serviceable");
    expect(mixedLegResult.stops).toEqual([
      expect.objectContaining({
        kind: "pickup",
        decision: "serviceable",
        serviceAreaCodes: ["KHH_DONUT_CORE"],
        geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
        reasonCodes: [],
      }),
      expect.objectContaining({
        kind: "dropoff",
        decision: "not_serviceable",
        serviceAreaCodes: [],
        geometryVersionRefs: [],
        reasonCodes: ["DROPOFF_AREA_NOT_SERVICEABLE"],
      }),
    ]);

    const adminFeature = freshAreaService
      .exportGeoJson()
      .features.find((f) => f.id === publishedArea.record.serviceAreaId)!;
    expect(adminFeature.properties).toMatchObject({
      areaCode: "KHH_DONUT_CORE",
      status: "active",
    });
    expect(adminFeature.properties.sourceGeometry).toMatchObject({
      holes: [KHH_DONUT_HOLE],
    });
    expect(adminFeature.geometry.coordinates).toHaveLength(2);

    const operationalFeature = freshAreaService
      .exportOperationalGeoJson(FIXED_REQUESTED_AT)
      .features.find((f) => f.id === publishedArea.record.serviceAreaId)!;
    expect(operationalFeature).toBeDefined();
    expect(operationalFeature.geometry.coordinates).toHaveLength(2);

    // --- Phase C: separate stop-policy donut lifecycle + fresh readback (HOLE-EVAL-7) ---
    const policy = await writerService.createStopPolicy(
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
        effectiveUntil: null,
      },
      context,
    );
    expect(lastInsertParams(query, "ops.stop_policies")[3]).toBe("draft");

    await writerService.submitStopPolicyForReview(
      policy.record.stopPolicyId,
      context,
    );
    expect(lastInsertParams(query, "ops.stop_policies")[3]).toBe("review");

    const publishedPolicy = await writerService.publishStopPolicy(
      policy.record.stopPolicyId,
      {
        effectiveFrom: "2026-06-01T00:00:00.000Z",
        effectiveUntil: null,
        reason: "activate curb donut policy",
      },
      context,
    );
    const [policyInsertSql, policyInsertParams] = lastInsertCall(
      query,
      "ops.stop_policies",
    );
    // Stop-policy geometry is bound as $7, a plain Polygon column with no
    // ST_Multi wrapper, unlike service-area geometry ($5, ST_Multi).
    expect(policyInsertSql).toContain("ST_SetSRID(ST_GeomFromGeoJSON($7)");
    expect(policyInsertSql).not.toContain("ST_Multi");
    expect(policyInsertParams[3]).toBe("active");
    const policyGeoJson = JSON.parse(policyInsertParams[6] as string); // $7
    expect(policyGeoJson).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [120.26, 22.66],
          [120.275, 22.66],
          [120.275, 22.675],
          [120.26, 22.675],
          [120.26, 22.66],
        ],
        [
          [120.265, 22.665],
          [120.265, 22.67],
          [120.27, 22.67],
          [120.27, 22.665],
          [120.265, 22.665],
        ],
      ],
    });
    const policyRecord = JSON.parse(policyInsertParams[15] as string); // $16
    expect(policyRecord).toMatchObject({
      stopPolicyId: policy.record.stopPolicyId,
      policyCode: "KHH_CURB_DONUT_POLICY",
      status: "active",
      version: 1,
      serviceAreaCodes: ["KHH_DONUT_CORE"],
      reasonCode: "KHH_CURB_RESTRICTED",
    });

    const freshPolicyService = new ServiceAreaService(
      new ServiceAreaRepository(databaseService),
      undefined,
      new MapGeofenceObservabilityService(),
    );
    await freshPolicyService.onModuleInit();

    const operationalExport =
      freshPolicyService.exportOperationalGeoJson(FIXED_REQUESTED_AT);
    expect(
      operationalExport.features.some(
        (f) => f.id === publishedArea.record.serviceAreaId,
      ),
    ).toBe(true);
    const policyFeature = operationalExport.features.find(
      (f) => f.id === publishedPolicy.record.stopPolicyId,
    )!;
    expect(policyFeature).toBeDefined();
    expect(policyFeature.geometry.coordinates).toHaveLength(2);
    expect(policyFeature.properties.sourceGeometry).toMatchObject({
      holes: expect.any(Array),
    });

    // HOLE-EVAL-7a: inside policy outer ring, outside its hole -> denied.
    const denied = freshPolicyService.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 22.662, lng: 120.262 },
      dropoff: null,
      requestedAt: FIXED_REQUESTED_AT.toISOString(),
    });
    expect(denied).toMatchObject({
      decision: "not_serviceable",
      serviceAreaCodes: ["KHH_DONUT_CORE"],
      reasonCodes: ["KHH_CURB_RESTRICTED"],
    });

    // HOLE-EVAL-7b: inside the policy's own hole -> excluded from the policy.
    const excluded = freshPolicyService.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 22.667, lng: 120.267 },
      dropoff: null,
      requestedAt: FIXED_REQUESTED_AT.toISOString(),
    });
    expect(excluded).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["KHH_DONUT_CORE"],
      reasonCodes: [],
    });
  });
});
