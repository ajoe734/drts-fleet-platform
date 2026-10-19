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
  const calls = query.mock.calls.filter((call) =>
    (call[0] as string).includes(`INSERT INTO ${table}`),
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
    );
    // Full equality against the real mutation ACK (`publishedArea.record`),
    // not just a status/version/date subset: a field the service forgot to
    // persist (or persisted stale) would stay invisible to a `toMatchObject`
    // check but is caught here.
    expect(finalRecord).toEqual(publishedArea.record);
    expect((finalRecord as { geometry: { holes?: unknown[] } }).geometry.holes).toEqual([
      KHH_DONUT_HOLE,
    ]);

    // --- Phase B: fresh loadState() + onModuleInit() active readback ---
    const freshAreaRepo = new ServiceAreaRepository(databaseService);
    const freshAreaService = new ServiceAreaService(
      freshAreaRepo,
      undefined,
      new MapGeofenceObservabilityService(),
    );
    await freshAreaService.onModuleInit();

    const freshAreas = freshAreaService.listServiceAreas();
    // Full equality against the real mutation ACK (`publishedArea.record`),
    // not just a `holes`-only geometry subset: any field the fresh
    // onModuleInit readback silently dropped or diverged on (e.g. metadata,
    // timestamps, serviceProductTypes) would have stayed invisible to a
    // `toMatchObject` check on `geometry` alone but is caught here.
    const freshActiveArea = freshAreas.find(
      (a) => a.areaCode === "KHH_DONUT_CORE" && a.status === "active",
    );
    expect(freshActiveArea).toEqual(publishedArea.record);
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
    // Supplementary (not one of the matrix items below): outer-boundary
    // point on the outer ring's own edge, not its interior, is serviceable.
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
    // Pre-effective: the exact same outer-inside pickup as HOLE-EVAL-1, but
    // requested before `effectiveFrom` (2026-06-01) -- must be excluded.
    expect(
      freshAreaService.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.595, lng: 120.265 },
        dropoff: null,
        requestedAt: "2026-05-15T00:00:00.000Z",
      }),
    ).toMatchObject({ decision: "not_serviceable", serviceAreaCodes: [] });
    // Pre-effective operational export: `evaluate`'s exclusion above is
    // driven by a distinct `activeServiceAreas` filter and does not exercise
    // `exportOperationalGeoJson`'s own `recordIsEffective` gate
    // (service-area.service.ts's `exportOperationalGeoJson`, which filters
    // the real feature-export path, not the evaluation path). Assert that
    // path independently so a regression there cannot hide behind a passing
    // `evaluate` check.
    expect(
      freshAreaService
        .exportOperationalGeoJson(new Date("2026-05-15T00:00:00.000Z"))
        .features.some((f) => f.id === publishedArea.record.serviceAreaId),
    ).toBe(false);
    // HOLE-EVAL-3 (mixed-leg form, matching apps/api/tests/unit/service-area.service.test.ts's
    // "HOLE-EVAL-3 (outer-inside pickup, hole-inside dropoff)" -- previously
    // mislabeled "HOLE-EVAL-6" here): a real (non-null) dropoff landing
    // inside the hole gets the exact uncovered-leg reason and empty
    // area/policy/version refs, while the pickup leg (outer-interior)
    // retains its own legitimate refs.
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

    // HOLE-EVAL-6: a separate enclave service area, published through the
    // same real repository, that sits entirely inside KHH_DONUT_CORE's hole
    // covers that hole exclusively (not emulated with a deny StopPolicy).
    const enclave = await writerService.createServiceArea(
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
        effectiveUntil: null,
      },
      context,
    );
    await writerService.submitServiceAreaForReview(
      enclave.record.serviceAreaId,
      context,
    );
    await writerService.publishServiceArea(
      enclave.record.serviceAreaId,
      { effectiveFrom: "2026-06-01T00:00:00.000Z", reason: "activate enclave" },
      context,
    );
    const freshEnclaveService = new ServiceAreaService(
      new ServiceAreaRepository(databaseService),
      undefined,
      new MapGeofenceObservabilityService(),
    );
    await freshEnclaveService.onModuleInit();
    const enclaveResult = freshEnclaveService.evaluate({
      serviceProductType: "taxi_realtime",
      pickup: { lat: 22.63, lng: 120.3 },
      dropoff: null,
      requestedAt: FIXED_REQUESTED_AT.toISOString(),
    });
    expect(enclaveResult).toMatchObject({
      decision: "serviceable",
      serviceAreaCodes: ["KHH_ENCLAVE_SHUTTLE"],
      geometryVersionRefs: ["service_area:KHH_ENCLAVE_SHUTTLE@1"],
    });
    expect(enclaveResult.serviceAreaCodes).not.toContain("KHH_DONUT_CORE");

    const adminFeature = freshAreaService
      .exportGeoJson()
      .features.find((f) => f.id === publishedArea.record.serviceAreaId)!;
    expect(adminFeature.properties).toMatchObject({
      areaCode: "KHH_DONUT_CORE",
      status: "active",
      version: 1,
      serviceProductTypes: ["taxi_realtime"],
    });
    expect(adminFeature.properties.sourceGeometry).toEqual({
      type: "polygon",
      coordinates: KHH_DONUT_OUTER,
      holes: [KHH_DONUT_HOLE],
    });
    expect(adminFeature.geometry.coordinates).toHaveLength(2);
    expect(adminFeature.geometry.coordinates[0]).toEqual([
      [120.25, 22.58],
      [120.35, 22.58],
      [120.35, 22.68],
      [120.25, 22.68],
      [120.25, 22.58],
    ]);
    expect(adminFeature.geometry.coordinates[1]).toEqual([
      [120.28, 22.61],
      [120.28, 22.65],
      [120.32, 22.65],
      [120.32, 22.61],
      [120.28, 22.61],
    ]);

    const operationalFeature = freshAreaService
      .exportOperationalGeoJson(FIXED_REQUESTED_AT)
      .features.find((f) => f.id === publishedArea.record.serviceAreaId)!;
    expect(operationalFeature).toBeDefined();
    expect(operationalFeature.properties).toMatchObject({
      areaCode: "KHH_DONUT_CORE",
      status: "active",
    });
    expect(operationalFeature.properties.sourceGeometry).toEqual({
      type: "polygon",
      coordinates: KHH_DONUT_OUTER,
      holes: [KHH_DONUT_HOLE],
    });
    expect(operationalFeature.geometry.coordinates).toHaveLength(2);
    expect(operationalFeature.geometry.coordinates).toEqual(
      adminFeature.geometry.coordinates,
    );

    // --- Phase C: separate stop-policy donut lifecycle + fresh readback (HOLE-EVAL-7) ---
    const KHH_CURB_DONUT_POLICY_OUTER = [
      { lat: 22.66, lng: 120.26 },
      { lat: 22.66, lng: 120.275 },
      { lat: 22.675, lng: 120.275 },
      { lat: 22.675, lng: 120.26 },
    ];
    const KHH_CURB_DONUT_POLICY_HOLE = [
      { lat: 22.665, lng: 120.265 },
      { lat: 22.665, lng: 120.27 },
      { lat: 22.67, lng: 120.27 },
      { lat: 22.67, lng: 120.265 },
    ];
    const policy = await writerService.createStopPolicy(
      {
        policyCode: "KHH_CURB_DONUT_POLICY",
        displayName: "Kaohsiung curb donut restriction",
        direction: "pickup",
        effect: "deny",
        geometry: {
          type: "polygon",
          coordinates: KHH_CURB_DONUT_POLICY_OUTER,
          holes: [KHH_CURB_DONUT_POLICY_HOLE],
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
    // Full equality against the real mutation ACK (`publishedPolicy.record`),
    // not a field-subset-plus-geometry check: a field the service forgot to
    // persist (or persisted stale) -- e.g. `reasonMessage` -- would have
    // stayed invisible to the prior `toMatchObject` check but is caught here.
    expect(policyRecord).toEqual(publishedPolicy.record);

    const freshPolicyService = new ServiceAreaService(
      new ServiceAreaRepository(databaseService),
      undefined,
      new MapGeofenceObservabilityService(),
    );
    await freshPolicyService.onModuleInit();

    // Full equality against the real mutation ACK (`publishedPolicy.record`),
    // not just a fresh sourceGeometry/ring-count check: a field the fresh
    // onModuleInit readback silently dropped or diverged on (e.g.
    // `reasonMessage`, `effectiveUntil`) would have stayed invisible but is
    // caught here.
    const freshActivePolicy = freshPolicyService
      .listStopPolicies()
      .find(
        (p) => p.policyCode === "KHH_CURB_DONUT_POLICY" && p.status === "active",
      );
    expect(freshActivePolicy).toEqual(publishedPolicy.record);

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
    // Exact fresh GeoJSON ring coordinates against the already-literal
    // expected SQL rings (`policyGeoJson`, asserted above against the real
    // $7 bind parameter), not just a ring-count check: a hole silently
    // dropped, duplicated, or re-wound on fresh readback would have stayed
    // green under `toHaveLength(2)` but is caught here.
    expect(policyFeature.geometry.coordinates).toEqual(
      policyGeoJson.coordinates,
    );
    // The prior check only asserted `holes: expect.any(Array)`, which stays
    // green even if a hole is silently dropped or replaced on fresh
    // readback; assert the exact fresh sourceGeometry instead.
    expect(policyFeature.properties.sourceGeometry).toEqual({
      type: "polygon",
      coordinates: KHH_CURB_DONUT_POLICY_OUTER,
      holes: [KHH_CURB_DONUT_POLICY_HOLE],
    });
    // Exact fresh version/effective fields, not merely their presence: a
    // version bumped on persist but not on readback (or a dropped/garbled
    // effective window) would have gone unchecked here before.
    expect(policyFeature.properties.version).toBe(publishedPolicy.record.version);
    expect(policyFeature.properties.effectiveFrom).toBe(
      publishedPolicy.record.effectiveFrom,
    );
    expect(policyFeature.properties.effectiveUntil).toBe(
      publishedPolicy.record.effectiveUntil,
    );

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
    expect(denied.stops[0]).toMatchObject({
      policyCodes: ["KHH_CURB_DONUT_POLICY"],
      geometryVersionRefs: [
        "service_area:KHH_DONUT_CORE@1",
        "stop_policy:KHH_CURB_DONUT_POLICY@1",
      ],
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
    expect(excluded.stops[0]).toMatchObject({
      policyCodes: [],
      geometryVersionRefs: ["service_area:KHH_DONUT_CORE@1"],
    });

    // Pre-effective: the exact HOLE-EVAL-7a pickup, but requested before the
    // policy's `effectiveFrom` (2026-06-01) -- the policy must not apply yet
    // (area itself is also pre-effective at this timestamp).
    expect(
      freshPolicyService.evaluate({
        serviceProductType: "taxi_realtime",
        pickup: { lat: 22.662, lng: 120.262 },
        dropoff: null,
        requestedAt: "2026-05-15T00:00:00.000Z",
      }),
    ).toMatchObject({ decision: "not_serviceable", serviceAreaCodes: [] });
    // Pre-effective operational export: `evaluate`'s exclusion above cannot
    // isolate the policy's own date filtering (both the area and the policy
    // are pre-effective at this timestamp, and the area's absence alone
    // would already block this area-scoped policy match regardless of the
    // policy's effectiveness). Assert `exportOperationalGeoJson`'s real
    // `recordIsEffective` gate directly for both the area and the policy
    // feature so a regression in either's export-time filtering cannot hide
    // behind a passing `evaluate` check.
    const preEffectiveExport = freshPolicyService.exportOperationalGeoJson(
      new Date("2026-05-15T00:00:00.000Z"),
    );
    expect(
      preEffectiveExport.features.some(
        (f) => f.id === publishedArea.record.serviceAreaId,
      ),
    ).toBe(false);
    expect(
      preEffectiveExport.features.some(
        (f) => f.id === publishedPolicy.record.stopPolicyId,
      ),
    ).toBe(false);
  });
});
