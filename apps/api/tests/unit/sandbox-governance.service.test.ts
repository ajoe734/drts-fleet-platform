import { describe, expect, it, vi } from "vitest";

import type {
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
  SafetyOperatorQualificationRecord,
  VehicleEnrollmentRecord,
} from "@drts/contracts";
import { PHASE2_AUDIT_EVENT_CATALOG } from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
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

async function expectApiRequestErrorMessage(
  fn: () => unknown | Promise<unknown>,
  messagePattern: RegExp,
) {
  try {
    await fn();
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

    await service.updateOperatingAreas(
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

  it("rejects overlapping effective windows for the same operating area", async () => {
    const service = createService();

    await expectApiRequestErrorMessage(
      async () =>
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
    await service.updateOperatingAreas(
      { items: [buildArea(), buildArea({ version: 2, effectiveFrom: "2026-07-01T00:00:00.000Z", effectiveUntil: null, updatedAt: "2026-07-01T00:00:00.000Z" })] },
      { actorId: "tester", actorType: "system", tenantId: null },
    );
    await service.updateRoutes(
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

  it("enforces vehicle enrollment lifecycle across versions", async () => {
    const service = createService();

    await service.updateVehicleEnrollments(
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

    await expectApiRequestErrorMessage(
      async () =>
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

  it("enforces safety-operator qualification lifecycle across versions", async () => {
    const service = createService();

    await service.updateSafetyOperatorQualifications(
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

    await expectApiRequestErrorMessage(
      async () =>
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

  it("clears seed fixtures when persistence loads empty tables", async () => {
    const repository = {
      loadOperatingAreas: vi.fn().mockResolvedValue([]),
      loadRoutes: vi.fn().mockResolvedValue([]),
      loadVehicleEnrollments: vi.fn().mockResolvedValue([]),
      loadSafetyOperatorQualifications: vi.fn().mockResolvedValue([]),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new SandboxGovernanceService(
      { recordAuditLog: vi.fn() } as never,
      repository as never,
    );

    await service.onModuleInit();

    expect(service.listOperatingAreas()).toEqual([]);
    expect(service.listRoutes()).toEqual([]);
    expect(service.listVehicleEnrollments()).toEqual([]);
    expect(service.listSafetyOperatorQualifications()).toEqual([]);
  });

  it("rolls back in-memory changes and rethrows when persistence fails", async () => {
    const repository = {
      replaceOperatingAreas: vi.fn().mockRejectedValue(new Error("db offline")),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new SandboxGovernanceService(
      { recordAuditLog: vi.fn() } as never,
      repository as never,
    );
    const previous = service.listOperatingAreas();

    await expect(
      service.updateOperatingAreas(
        { items: [buildArea({ areaId: "new-area" })] },
        { actorId: "tester", actorType: "system", tenantId: null },
      ),
    ).rejects.toThrow("db offline");

    expect(service.listOperatingAreas()).toEqual(previous);
    expect(repository.reportPersistenceFailure).toHaveBeenCalledWith(
      expect.any(Error),
      "replace areas",
    );
  });

  it("returns ActionReceipt data for configured and amended provider capability requirement writes", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new SandboxGovernanceService(auditNotificationService);

    const configured = service.upsertProviderCapabilityRequirement({
      sandboxProgramId: "program-1",
      capability: "av_dispatch",
      required: true,
      auditContext: {
        actorId: "ops-user-001",
        actorType: "ops_user",
        tenantId: "tenant-demo-001",
        moduleName: "sandbox-governance",
        requestId: "req-configured-001",
      },
    });

    expect(configured.receipt).toEqual({
      actionId: "req-configured-001",
      auditId: configured.auditLog.auditId,
      resourceType: "provider_capability_requirement",
      resourceId: "program-1:av_dispatch",
      status: "completed",
      message: "Provider capability requirement configured.",
    });
    expect(configured.auditLog).toMatchObject({
      actionName:
        PHASE2_AUDIT_EVENT_CATALOG.sandbox
          .providerCapabilityRequirementConfigured,
      resourceType: "provider_capability_requirement",
      resourceId: "program-1:av_dispatch",
      newValuesSummary: {
        sandboxProgramId: "program-1",
        capability: "av_dispatch",
        required: true,
        minSchemaVersion: null,
        notes: null,
        resourceVersion: "v1",
      },
    });

    const amended = service.upsertProviderCapabilityRequirement({
      sandboxProgramId: "program-1",
      capability: "av_dispatch",
      required: false,
      minSchemaVersion: "2026.06",
      notes: "Escalated to stricter provider compliance.",
      auditContext: {
        actorId: "ops-user-001",
        actorType: "ops_user",
        tenantId: "tenant-demo-001",
        moduleName: "sandbox-governance",
        requestId: "req-amended-001",
      },
    });

    expect(amended.receipt).toEqual({
      actionId: "req-amended-001",
      auditId: amended.auditLog.auditId,
      resourceType: "provider_capability_requirement",
      resourceId: "program-1:av_dispatch",
      status: "completed",
      message: "Provider capability requirement amended.",
    });
    expect(amended.auditLog).toMatchObject({
      actionName:
        PHASE2_AUDIT_EVENT_CATALOG.sandbox.providerCapabilityRequirementAmended,
      resourceType: "provider_capability_requirement",
      resourceId: "program-1:av_dispatch",
      oldValuesSummary: {
        sandboxProgramId: "program-1",
        capability: "av_dispatch",
        required: true,
        minSchemaVersion: null,
        notes: null,
      },
      newValuesSummary: {
        sandboxProgramId: "program-1",
        capability: "av_dispatch",
        required: false,
        minSchemaVersion: "2026.06",
        notes: "Escalated to stricter provider compliance.",
        resourceVersion: "v2",
        supersedesAuditId: configured.auditLog.auditId,
        amendsResourceVersion: "v1",
      },
    });

    const persistedAudit = auditNotificationService
      .getAuditLogsSnapshot()
      .find((auditLog) => auditLog.auditId === amended.auditLog.auditId);

    expect(persistedAudit).toMatchObject({
      auditId: amended.auditLog.auditId,
      actionName:
        PHASE2_AUDIT_EVENT_CATALOG.sandbox.providerCapabilityRequirementAmended,
      newValuesSummary: expect.objectContaining({
        supersedesAuditId: configured.auditLog.auditId,
        amendsResourceVersion: "v1",
      }),
    });
  });
});
