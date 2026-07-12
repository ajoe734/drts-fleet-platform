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

function createAuditedService() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  return {
    auditNotificationService,
    service: new SandboxGovernanceService(
      auditNotificationService as never,
      undefined,
    ),
  };
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

  it("rejects geometry records whose active flag conflicts with lifecycle status", async () => {
    const service = createService();

    await expectApiRequestErrorMessage(
      async () =>
        service.updateOperatingAreas(
          {
            items: [
              buildArea({
                active: true,
                lifecycleStatus: "draft",
              }),
            ],
          },
          { actorId: "tester", actorType: "system", tenantId: null },
        ),
      /active flag must match lifecycleStatus/i,
    );
  });

  it("deduplicates matching route ids across historical route versions", async () => {
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

  it("keeps operating-area drafts out of the evaluator until published", async () => {
    const service = createService();
    const actor = {
      actorId: "map-editor",
      actorType: "ops_user" as const,
      tenantId: null,
    };
    const draftArea = buildArea({
      areaId: "odd-riverside-draft",
      name: "Riverside ODD",
      active: true,
      effectiveUntil: "2026-07-10T00:00:00.000Z",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [121.6, 25.1],
              [121.61, 25.1],
              [121.61, 25.11],
              [121.6, 25.11],
              [121.6, 25.1],
            ],
          ],
        ],
      },
    });

    const draft = await service.createOperatingAreaDraft(
      { item: draftArea, actorId: "map-editor" },
      actor,
    );

    expect(draft.lifecycleStatus).toBe("draft");
    expect(draft.active).toBe(false);
    await expect(
      service.validatePointInApprovedArea({
        sandboxProgramId: PROGRAM_ID,
        point: { lat: 25.105, lng: 121.605 },
        asOf: "2026-07-02T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({ inApprovedArea: false });

    const review = await service.submitOperatingAreaForReview(
      draft.areaId,
      draft.version,
      { actorId: "reviewer" },
      actor,
    );
    expect(review.lifecycleStatus).toBe("review");

    const published = await service.publishOperatingArea(
      draft.areaId,
      draft.version,
      { actorId: "approver" },
      actor,
    );

    expect(published.lifecycleStatus).toBe("active");
    await expect(
      service.validatePointInApprovedArea({
        sandboxProgramId: PROGRAM_ID,
        point: { lat: 25.105, lng: 121.605 },
        asOf: "2026-07-02T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      inApprovedArea: true,
      matches: [
        {
          areaId: "odd-riverside-draft",
          areaKind: "operating_area",
          name: "Riverside ODD",
        },
      ],
    });

    const geoJson = service.exportOperatingAreasGeoJson();
    expect(geoJson.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Feature",
          properties: expect.objectContaining({
            areaId: "odd-riverside-draft",
            lifecycleStatus: "active",
          }),
        }),
      ]),
    );
  });

  it("publishes and retires route drafts through the evaluator lifecycle", async () => {
    const service = createService();
    const actor = {
      actorId: "map-editor",
      actorType: "ops_user" as const,
      tenantId: null,
    };
    const draftRoute = buildRoute({
      routeId: "route-riverside-draft",
      name: "Riverside test route",
      areaId: null,
      active: true,
      effectiveUntil: "2026-07-10T00:00:00.000Z",
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [121.6, 25.1],
            [121.605, 25.105],
            [121.61, 25.11],
          ],
        ],
      },
    });

    const draft = await service.createRouteDraft(
      { item: draftRoute, actorId: "map-editor" },
      actor,
    );

    expect(draft).toMatchObject({
      routeId: "route-riverside-draft",
      active: false,
      lifecycleStatus: "draft",
    });
    await expect(
      service.validateRouteContainment({
        sandboxProgramId: PROGRAM_ID,
        candidatePath: draftRoute.geometry,
        asOf: "2026-07-02T00:00:00.000Z",
        toleranceMeters: 25,
      }),
    ).resolves.toMatchObject({ contained: false, routeIds: [] });

    const review = await service.submitRouteForReview(
      draft.routeId,
      draft.version,
      { actorId: "reviewer" },
      actor,
    );
    expect(review.lifecycleStatus).toBe("review");

    const published = await service.publishRoute(
      draft.routeId,
      draft.version,
      { actorId: "approver" },
      actor,
    );
    expect(published.lifecycleStatus).toBe("active");
    await expect(
      service.validateRouteContainment({
        sandboxProgramId: PROGRAM_ID,
        candidatePath: draftRoute.geometry,
        asOf: "2026-07-02T00:00:00.000Z",
        toleranceMeters: 25,
      }),
    ).resolves.toMatchObject({
      contained: true,
      routeIds: ["route-riverside-draft"],
    });

    const retired = await service.retireRoute(
      draft.routeId,
      draft.version,
      {
        actorId: "approver",
        effectiveUntil: "2026-07-03T00:00:00.000Z",
      },
      actor,
    );
    expect(retired.lifecycleStatus).toBe("retired");
    await expect(
      service.validateRouteContainment({
        sandboxProgramId: PROGRAM_ID,
        candidatePath: draftRoute.geometry,
        asOf: "2026-07-04T00:00:00.000Z",
        toleranceMeters: 25,
      }),
    ).resolves.toMatchObject({ contained: false, routeIds: [] });
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

  it("bootstraps seed fixtures when persistence loads empty tables", async () => {
    const repository = {
      loadOperatingAreas: vi.fn().mockResolvedValue([]),
      loadRoutes: vi.fn().mockResolvedValue([]),
      loadVehicleEnrollments: vi.fn().mockResolvedValue([]),
      loadSafetyOperatorQualifications: vi.fn().mockResolvedValue([]),
      replaceOperatingAreas: vi.fn().mockResolvedValue(undefined),
      replaceRoutes: vi.fn().mockResolvedValue(undefined),
      replaceVehicleEnrollments: vi.fn().mockResolvedValue(undefined),
      replaceSafetyOperatorQualifications: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    };
    const service = new SandboxGovernanceService(
      { recordAuditLog: vi.fn() } as never,
      repository as never,
    );

    await service.onModuleInit();

    expect(repository.replaceOperatingAreas).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ areaId: "odd-downtown-core" }),
      ]),
    );
    expect(repository.replaceRoutes).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ routeId: "route-downtown-loop" }),
      ]),
    );
    expect(repository.replaceVehicleEnrollments).toHaveBeenCalledWith([
      expect.objectContaining({ vehicleId: "veh-av-demo-001" }),
    ]);
    expect(repository.replaceSafetyOperatorQualifications).toHaveBeenCalledWith(
      [expect.objectContaining({ safetyOperatorId: "safety-op-001" })],
    );
    expect(service.listOperatingAreas()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ areaId: "odd-downtown-core" }),
      ]),
    );
    expect(service.listRoutes()).toEqual([
      expect.objectContaining({ routeId: "route-downtown-loop" }),
    ]);
    expect(service.listVehicleEnrollments()).toEqual([
      expect.objectContaining({ vehicleId: "veh-av-demo-001" }),
    ]);
    expect(service.listSafetyOperatorQualifications()).toEqual([
      expect.objectContaining({ safetyOperatorId: "safety-op-001" }),
    ]);
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

  it("audits experiment, jurisdiction, and approval document lifecycle mutations", () => {
    const { auditNotificationService, service } = createAuditedService();
    const actor = {
      actorId: "platform-admin-1",
      actorType: "platform_admin" as const,
      tenantId: "tenant-map-ops",
    };

    const jurisdiction = service.createJurisdiction(
      {
        jurisdictionCode: "us-ca-cpuc-audit",
        name: "California CPUC Audit",
        regulatorName: "California Public Utilities Commission",
        actorId: "reg-user-1",
      },
      actor,
      "req-jur-create",
    );
    const jurisdictionVersionId = jurisdiction.currentVersionId as string;
    const updatedJurisdiction = service.updateJurisdiction(
      jurisdiction.jurisdictionId,
      {
        regulatorName: "California Public Utilities Commission Sandbox Desk",
        actorId: "reg-user-2",
      },
      actor,
      "req-jur-update",
    );
    service.publishJurisdictionVersion(
      jurisdiction.jurisdictionId,
      updatedJurisdiction.currentVersionId as string,
      { actorId: "reg-user-3" },
      actor,
      "req-jur-publish",
    );

    const experiment = service.createExperiment(
      {
        programCode: "audit-fsd-pilot",
        name: "Audit FSD Pilot",
        jurisdictionIds: [jurisdiction.jurisdictionId],
        actorId: "ops-user-1",
      },
      actor,
      "req-exp-create",
    );
    const experimentVersionId = experiment.currentVersionId as string;
    const updatedExperiment = service.updateExperiment(
      experiment.experimentId,
      {
        description: "Adds map governance audit coverage.",
        actorId: "ops-user-2",
      },
      actor,
      "req-exp-update",
    );
    service.publishExperimentVersion(
      experiment.experimentId,
      updatedExperiment.currentVersionId as string,
      { actorId: "ops-user-3" },
      actor,
      "req-exp-publish",
    );
    service.suspendExperimentAuthorizations(
      experiment.experimentId,
      { actorId: "ops-user-4" },
      actor,
      "req-exp-suspend",
    );
    service.resumeExperimentAuthorizations(
      experiment.experimentId,
      { actorId: "ops-user-5" },
      actor,
      "req-exp-resume",
    );

    const document = service.createApprovalDocument(
      {
        experimentId: experiment.experimentId,
        jurisdictionId: jurisdiction.jurisdictionId,
        documentType: "permit",
        title: "Audit Permit",
        artifactFileName: "audit-permit-v1.pdf",
        artifactContentType: "application/pdf",
        artifactContentBase64:
          Buffer.from("audit-permit-v1").toString("base64"),
        actorId: "reg-user-4",
      },
      actor,
      "req-doc-create",
    );
    const documentVersionId = document.currentVersionId as string;
    const uploadedDocument = service.uploadApprovalDocumentVersion(
      document.documentId,
      {
        artifactFileName: "audit-permit-v2.pdf",
        artifactContentType: "application/pdf",
        artifactContentBase64:
          Buffer.from("audit-permit-v2").toString("base64"),
        actorId: "reg-user-5",
      },
      actor,
      "req-doc-upload",
    );
    service.publishApprovalDocumentVersion(
      document.documentId,
      uploadedDocument.currentVersionId as string,
      { actorId: "reg-user-6" },
      actor,
      "req-doc-publish",
    );
    service.rollbackApprovalDocumentVersion(
      document.documentId,
      documentVersionId,
      { actorId: "auditor-1", publish: false },
      actor,
      "req-doc-rollback",
    );
    service.archiveApprovalDocument(
      document.documentId,
      actor,
      "req-doc-archive",
    );

    service.rollbackExperimentVersion(
      experiment.experimentId,
      experimentVersionId,
      { actorId: "auditor-2", publish: false },
      actor,
      "req-exp-rollback",
    );
    service.archiveExperiment(
      experiment.experimentId,
      actor,
      "req-exp-archive",
    );
    service.rollbackJurisdictionVersion(
      jurisdiction.jurisdictionId,
      jurisdictionVersionId,
      { actorId: "auditor-3", publish: false },
      actor,
      "req-jur-rollback",
    );
    service.archiveJurisdiction(
      jurisdiction.jurisdictionId,
      actor,
      "req-jur-archive",
    );

    const actionNames = auditNotificationService.recordAuditLog.mock.calls.map(
      ([entry]) => entry.actionName,
    );
    expect(actionNames).toEqual(
      expect.arrayContaining([
        "sandbox_governance.jurisdiction.created",
        "sandbox_governance.jurisdiction.updated",
        "sandbox_governance.jurisdiction.published",
        "sandbox_governance.jurisdiction.rolled_back",
        "sandbox_governance.jurisdiction.archived",
        "sandbox_governance.experiment.created",
        "sandbox_governance.experiment.updated",
        "sandbox_governance.experiment.published",
        "sandbox_governance.experiment.authorization_suspended",
        "sandbox_governance.experiment.authorization_resumed",
        "sandbox_governance.experiment.rolled_back",
        "sandbox_governance.experiment.archived",
        "sandbox_governance.approval_document.created",
        "sandbox_governance.approval_document.version_uploaded",
        "sandbox_governance.approval_document.published",
        "sandbox_governance.approval_document.rolled_back",
        "sandbox_governance.approval_document.archived",
      ]),
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "sandbox_governance.experiment.created",
        actorId: "platform-admin-1",
        actorType: "platform_admin",
        moduleName: "sandbox-governance",
        requestId: "req-exp-create",
        resourceId: experiment.experimentId,
        resourceType: "sandbox_experiment",
        tenantId: "tenant-map-ops",
        newValuesSummary: expect.objectContaining({
          lifecycleStatus: "draft",
          programCode: "audit-fsd-pilot",
        }),
      }),
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
    service.publishApprovalDocumentVersion(
      initial.documentId,
      initialVersionId,
      {
        actorId: "ops-user-1",
      },
    );

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
    const snapshotA = service.generateComplianceSnapshot(
      experiment.experimentId,
      {
        asOf,
        actorId: "auditor-1",
      },
    );
    const snapshotB = service.generateComplianceSnapshot(
      experiment.experimentId,
      {
        asOf,
        actorId: "auditor-2",
      },
    );

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
