import { describe, expect, it, vi } from "vitest";

import type {
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
  SafetyOperatorQualificationRecord,
  VehicleEnrollmentRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";

const PROGRAM_ID = "phase2-tesla-fsd-sandbox-202606";
const BASE_TIMESTAMP = "2026-06-26T00:00:00.000Z";

function createService() {
  return new SandboxGovernanceService(
    {
      recordAuditLog: vi.fn(),
    } as never,
    undefined,
  );
}

function buildArea(
  overrides: Partial<ApprovedOperatingAreaRecord> = {},
): ApprovedOperatingAreaRecord {
  return {
    areaId: "odd-downtown-core",
    sandboxProgramId: PROGRAM_ID,
    name: "Downtown core ODD",
    areaKind: "operating_area",
    version: 1,
    active: true,
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [121.5205, 25.0425],
            [121.5355, 25.0425],
            [121.5355, 25.0565],
            [121.5205, 25.0565],
            [121.5205, 25.0425],
          ],
        ],
      ],
    },
    schedules: [],
    effectiveFrom: BASE_TIMESTAMP,
    effectiveUntil: "2026-07-01T00:00:00.000Z",
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    ...overrides,
  };
}

function buildRoute(
  overrides: Partial<ApprovedRouteRecord> = {},
): ApprovedRouteRecord {
  return {
    routeId: "route-downtown-loop",
    sandboxProgramId: PROGRAM_ID,
    name: "Downtown loop",
    areaId: "odd-downtown-core",
    version: 1,
    active: true,
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [121.522, 25.044],
          [121.526, 25.047],
          [121.529, 25.05],
          [121.533, 25.054],
        ],
      ],
    },
    schedules: [],
    effectiveFrom: BASE_TIMESTAMP,
    effectiveUntil: "2026-07-01T00:00:00.000Z",
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    ...overrides,
  };
}

function buildVehicleEnrollment(
  overrides: Partial<VehicleEnrollmentRecord> = {},
): VehicleEnrollmentRecord {
  return {
    enrollmentId: "veh-enroll-001",
    sandboxProgramId: PROGRAM_ID,
    vehicleId: "veh-av-demo-001",
    providerCode: "tesla_fleet",
    version: 1,
    status: "active",
    approvedAreaIds: ["odd-downtown-core"],
    approvedRouteIds: ["route-downtown-loop"],
    maxConcurrentTrips: 1,
    effectiveFrom: BASE_TIMESTAMP,
    effectiveUntil: "2026-07-01T00:00:00.000Z",
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    ...overrides,
  };
}

function buildQualification(
  overrides: Partial<SafetyOperatorQualificationRecord> = {},
): SafetyOperatorQualificationRecord {
  return {
    qualificationId: "safety-op-qual-001",
    sandboxProgramId: PROGRAM_ID,
    safetyOperatorId: "safety-op-001",
    providerCode: "tesla_fleet",
    version: 1,
    status: "qualified",
    approvedAreaIds: ["odd-downtown-core"],
    approvedRouteIds: ["route-downtown-loop"],
    certificationRefs: ["cert-av-001"],
    effectiveFrom: BASE_TIMESTAMP,
    effectiveUntil: "2026-07-01T00:00:00.000Z",
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    ...overrides,
  };
}

function expectApiRequestErrorMessage(fn: () => unknown, messagePattern: RegExp) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    const response = (error as ApiRequestError).getResponse() as {
      error: { message: string };
    };
    expect(response.error.message).toMatch(messagePattern);
    return;
  }

  throw new Error("Expected ApiRequestError to be thrown.");
}

describe("SandboxGovernanceService", () => {
  it("keeps multiple operating-area versions under the same logical area id", async () => {
    const service = createService();

    service.updateOperatingAreas(
      {
        items: [
          buildArea(),
          buildArea({
            version: 2,
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            effectiveUntil: null,
            updatedAt: "2026-07-01T00:00:00.000Z",
          }),
        ],
      },
      { actorId: "tester", actorType: "system", tenantId: null },
    );

    expect(service.listOperatingAreas()).toHaveLength(2);

    const result = await service.validatePointInApprovedArea({
      sandboxProgramId: PROGRAM_ID,
      point: { lat: 25.05, lng: 121.528 },
      asOf: "2026-07-02T00:00:00.000Z",
    });

    expect(result.inApprovedArea).toBe(true);
    expect(result.matches).toEqual([
      {
        areaId: "odd-downtown-core",
        areaKind: "operating_area",
        name: "Downtown core ODD",
      },
    ]);
  });

  it("rejects overlapping effective windows for the same operating area", () => {
    const service = createService();

    expectApiRequestErrorMessage(
      () =>
        service.updateOperatingAreas(
          {
            items: [
              buildArea({ effectiveUntil: "2026-07-15T00:00:00.000Z" }),
              buildArea({
                version: 2,
                effectiveFrom: "2026-07-10T00:00:00.000Z",
                effectiveUntil: null,
                updatedAt: "2026-07-10T00:00:00.000Z",
              }),
            ],
          },
          { actorId: "tester", actorType: "system", tenantId: null },
        ),
      /overlapping effective windows/i,
    );
  });

  it("deduplicates matching route ids across historical route versions", async () => {
    const service = createService();
    service.updateOperatingAreas(
      { items: [buildArea(), buildArea({ version: 2, effectiveFrom: "2026-07-01T00:00:00.000Z", effectiveUntil: null, updatedAt: "2026-07-01T00:00:00.000Z" })] },
      { actorId: "tester", actorType: "system", tenantId: null },
    );
    service.updateRoutes(
      {
        items: [
          buildRoute(),
          buildRoute({
            version: 2,
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            effectiveUntil: null,
            updatedAt: "2026-07-01T00:00:00.000Z",
          }),
        ],
      },
      { actorId: "tester", actorType: "system", tenantId: null },
    );

    const result = await service.validateRouteContainment({
      sandboxProgramId: PROGRAM_ID,
      candidatePath: buildRoute().geometry,
      asOf: "2026-07-02T00:00:00.000Z",
      toleranceMeters: 25,
    });

    expect(result.routeIds).toEqual(["route-downtown-loop"]);
  });

  it("enforces vehicle enrollment lifecycle across versions", () => {
    const service = createService();

    service.updateVehicleEnrollments(
      {
        items: [
          buildVehicleEnrollment(),
          buildVehicleEnrollment({
            version: 2,
            status: "suspended",
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            effectiveUntil: null,
            updatedAt: "2026-07-01T00:00:00.000Z",
          }),
        ],
      },
      { actorId: "tester", actorType: "system", tenantId: null },
    );

    expect(service.listVehicleEnrollments()).toHaveLength(2);

    expectApiRequestErrorMessage(
      () =>
        service.updateVehicleEnrollments(
          {
            items: [
              buildVehicleEnrollment(),
              buildVehicleEnrollment({
                version: 2,
                status: "pending",
                effectiveFrom: "2026-07-01T00:00:00.000Z",
                effectiveUntil: null,
                updatedAt: "2026-07-01T00:00:00.000Z",
              }),
            ],
          },
          { actorId: "tester", actorType: "system", tenantId: null },
        ),
      /cannot transition from suspended to pending/i,
    );
  });

  it("enforces safety-operator qualification lifecycle across versions", () => {
    const service = createService();

    service.updateSafetyOperatorQualifications(
      {
        items: [
          buildQualification(),
          buildQualification({
            version: 2,
            status: "suspended",
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            effectiveUntil: null,
            updatedAt: "2026-07-01T00:00:00.000Z",
          }),
        ],
      },
      { actorId: "tester", actorType: "system", tenantId: null },
    );

    expect(service.listSafetyOperatorQualifications()).toHaveLength(2);

    expectApiRequestErrorMessage(
      () =>
        service.updateSafetyOperatorQualifications(
          {
            items: [
              buildQualification(),
              buildQualification({
                version: 2,
                status: "pending",
                effectiveFrom: "2026-07-01T00:00:00.000Z",
                effectiveUntil: null,
                updatedAt: "2026-07-01T00:00:00.000Z",
              }),
            ],
          },
          { actorId: "tester", actorType: "system", tenantId: null },
        ),
      /cannot transition from suspended to pending/i,
    );
  });
});
