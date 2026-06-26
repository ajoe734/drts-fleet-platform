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

  it("stores approval artifact hashes, supersedes prior versions, and supports rollback", () => {
    const service = createService();
    const jurisdiction = service.createJurisdiction({
      jurisdictionCode: "us-ca-cpuc",
      name: "California CPUC",
      regulatorName: "California Public Utilities Commission",
      actorId: "ops-user-1",
    });
    const jurisdictionVersionId = jurisdiction.currentVersionId as string;
    service.publishJurisdictionVersion(
      jurisdiction.jurisdictionId,
      jurisdictionVersionId,
      {
        actorId: "ops-user-1",
      },
    );

    const experiment = service.createExperiment({
      programCode: PROGRAM_ID,
      name: "Tesla San Francisco Beta",
      jurisdictionIds: [jurisdiction.jurisdictionId],
      actorId: "ops-user-1",
    });
    service.publishExperimentVersion(
      experiment.experimentId,
      experiment.currentVersionId as string,
      {
        actorId: "ops-user-1",
      },
    );

    const initial = service.createApprovalDocument({
      experimentId: experiment.experimentId,
      jurisdictionId: jurisdiction.jurisdictionId,
      documentType: "permit",
      title: "Pilot Permit",
      artifactFileName: "permit-v1.pdf",
      artifactContentType: "application/pdf",
      artifactContentBase64: Buffer.from("permit-v1").toString("base64"),
      actorId: "ops-user-1",
    });
    const initialVersionId = initial.currentVersionId as string;
    service.publishApprovalDocumentVersion(initial.documentId, initialVersionId, {
      actorId: "ops-user-1",
    });

    const next = service.uploadApprovalDocumentVersion(initial.documentId, {
      artifactFileName: "permit-v2.pdf",
      artifactContentType: "application/pdf",
      artifactContentBase64: Buffer.from("permit-v2").toString("base64"),
      summary: "updated regulator stamp",
      actorId: "ops-user-2",
    });

    expect(next.versions.at(-1)?.artifactSha256).toHaveLength(64);
    expect(next.versions.at(-1)?.supersedesVersionId).toBe(initialVersionId);

    const rolledBack = service.rollbackApprovalDocumentVersion(
      initial.documentId,
      initialVersionId,
      {
        actorId: "ops-user-3",
        publish: true,
      },
    );

    expect(rolledBack.versions.at(-1)).toMatchObject({
      rollbackFromVersionId: initialVersionId,
      lifecycleStatus: "published",
    });
    expect(rolledBack.effectiveVersion?.artifactSha256).toBe(
      rolledBack.versions[0]?.artifactSha256,
    );
  });

  it("creates reproducible compliance snapshots including routes and enrollments", async () => {
    const service = createService();
    const jurisdiction = service.createJurisdiction({
      jurisdictionCode: "us-nv-dot",
      name: "Nevada DOT",
      regulatorName: "Nevada Department of Transportation",
      actorId: "ops-user-1",
      policyVersions: {
        compliancePolicyVersion: "cp-2026-06",
      },
    });
    service.publishJurisdictionVersion(
      jurisdiction.jurisdictionId,
      jurisdiction.currentVersionId as string,
      {
        actorId: "ops-user-1",
      },
    );

    const experiment = service.createExperiment({
      programCode: PROGRAM_ID,
      name: "Tesla Las Vegas Pilot",
      jurisdictionIds: [jurisdiction.jurisdictionId],
      policyVersions: {
        routePolicyVersion: "route-9",
        schedulePolicyVersion: "sched-4",
        enrollmentPolicyVersion: "enroll-2",
        capabilityPolicyVersion: "cap-7",
        compliancePolicyVersion: "cp-2026-06",
      },
      requiredCapabilities: [
        {
          capability: "av_dispatch",
          required: true,
          minSchemaVersion: "2.0",
          notes: null,
        },
      ],
      actorId: "ops-user-1",
    });
    service.publishExperimentVersion(
      experiment.experimentId,
      experiment.currentVersionId as string,
      {
        actorId: "ops-user-1",
      },
    );

    const document = service.createApprovalDocument({
      experimentId: experiment.experimentId,
      jurisdictionId: jurisdiction.jurisdictionId,
      documentType: "operating_plan",
      title: "Operating Plan",
      artifactFileName: "plan.pdf",
      artifactContentType: "application/pdf",
      artifactContentBase64: Buffer.from("plan-v1").toString("base64"),
      actorId: "ops-user-1",
    });
    const publishedDocument = service.publishApprovalDocumentVersion(
      document.documentId,
      document.currentVersionId as string,
      {
        actorId: "ops-user-1",
      },
    );

    const asOf = publishedDocument.effectiveVersion?.effectiveFrom as string;
    const snapshotA = service.generateComplianceSnapshot(experiment.experimentId, {
      asOf,
      actorId: "auditor-1",
    });
    const snapshotB = service.generateComplianceSnapshot(experiment.experimentId, {
      asOf,
      actorId: "auditor-2",
    });

    expect(snapshotA.snapshotHashSha256).toBe(snapshotB.snapshotHashSha256);
    expect(snapshotA.policyVersions).toMatchObject({
      routePolicyVersion: "route-9",
      schedulePolicyVersion: "sched-4",
      enrollmentPolicyVersion: "enroll-2",
      capabilityPolicyVersion: "cap-7",
      compliancePolicyVersion: "cp-2026-06",
    });
    expect(snapshotA.approvalDocuments).toHaveLength(1);
    expect(snapshotA.jurisdictions).toHaveLength(1);
    expect(snapshotA.routes).toHaveLength(1);
    expect(snapshotA.vehicleEnrollments).toHaveLength(1);
  });

  it("suspends and resumes experiment authorizations by publishing derivative versions", () => {
    const service = createService();
    const jurisdiction = service.createJurisdiction({
      jurisdictionCode: "jp-tokyo",
      name: "Tokyo Sandbox",
      regulatorName: "Tokyo Mobility Bureau",
    });
    service.publishJurisdictionVersion(
      jurisdiction.jurisdictionId,
      jurisdiction.currentVersionId as string,
      {},
    );

    const experiment = service.createExperiment({
      programCode: PROGRAM_ID,
      name: "Tokyo Nightly Pilot",
      jurisdictionIds: [jurisdiction.jurisdictionId],
    });
    service.publishExperimentVersion(
      experiment.experimentId,
      experiment.currentVersionId as string,
      {},
    );

    const suspended = service.suspendExperimentAuthorizations(
      experiment.experimentId,
      {
        actorId: "ops-user-2",
      },
    );
    expect(suspended.effectiveVersion?.authorizationStatus).toBe("suspended");

    const resumed = service.resumeExperimentAuthorizations(
      experiment.experimentId,
      {
        actorId: "ops-user-3",
      },
    );
    expect(resumed.effectiveVersion?.authorizationStatus).toBe("active");
    expect(resumed.versions).toHaveLength(3);
  });
});
