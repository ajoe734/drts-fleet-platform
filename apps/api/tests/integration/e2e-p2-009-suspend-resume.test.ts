import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";

describe("E2E-P2-009 suspend + resume", () => {
  it("suspends experiment authorizations, requires an actual suspended state before resume, and returns to active with regulator packet context", () => {
    const sandboxGovernanceService = new SandboxGovernanceService(
      new AuditNotificationService(),
    );

    const jurisdiction = sandboxGovernanceService.createJurisdiction({
      jurisdictionCode: "ca-dmv",
      name: "California DMV Sandbox",
      regulatorName: "California DMV",
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      actorId: "ops-user-e2e-p2-009",
    });
    sandboxGovernanceService.publishJurisdictionVersion(
      jurisdiction.jurisdictionId,
      jurisdiction.currentVersionId as string,
      {
        effectiveFrom: "2026-06-26T00:00:00.000Z",
        actorId: "ops-user-e2e-p2-009",
      },
    );

    const experiment = sandboxGovernanceService.createExperiment({
      programCode: "phase2-tesla-fsd-sandbox-202606",
      name: "Phase 2 Tesla FSD sandbox",
      jurisdictionIds: [jurisdiction.jurisdictionId],
      effectiveFrom: "2026-06-26T00:00:00.000Z",
      actorId: "ops-user-e2e-p2-009",
    });
    sandboxGovernanceService.publishExperimentVersion(
      experiment.experimentId,
      experiment.currentVersionId as string,
      {
        effectiveFrom: "2026-06-26T00:00:00.000Z",
        actorId: "ops-user-e2e-p2-009",
      },
    );

    expect(() =>
      sandboxGovernanceService.resumeExperimentAuthorizations(
        experiment.experimentId,
        {
          effectiveFrom: "2026-06-26T08:00:00.000Z",
          actorId: "ops-user-e2e-p2-009",
          reason: "Should fail before suspension.",
        },
      ),
    ).toThrowError(ApiRequestError);

    const suspended = sandboxGovernanceService.suspendExperimentAuthorizations(
      experiment.experimentId,
      {
        effectiveFrom: "2026-06-26T09:00:00.000Z",
        actorId: "ops-user-e2e-p2-009",
        reason: "Regulator requested temporary pause.",
      },
    );

    const approvalDocument = sandboxGovernanceService.createApprovalDocument({
      experimentId: experiment.experimentId,
      jurisdictionId: jurisdiction.jurisdictionId,
      documentType: "operating_plan",
      title: "Resume operating plan",
      summary: "Regulator packet for resumption.",
      artifactFileName: "resume-operating-plan.pdf",
      artifactContentType: "application/pdf",
      artifactContentBase64: Buffer.from("resume-plan").toString("base64"),
      effectiveFrom: "2026-06-26T09:30:00.000Z",
      actorId: "ops-user-e2e-p2-009",
    });
    sandboxGovernanceService.publishApprovalDocumentVersion(
      approvalDocument.documentId,
      approvalDocument.currentVersionId as string,
      {
        effectiveFrom: "2026-06-26T09:30:00.000Z",
        actorId: "ops-user-e2e-p2-009",
      },
    );

    const resumed = sandboxGovernanceService.resumeExperimentAuthorizations(
      experiment.experimentId,
      {
        effectiveFrom: "2026-06-26T10:00:00.000Z",
        actorId: "ops-user-e2e-p2-009",
        reason: "Resume packet approved.",
      },
    );
    const current = sandboxGovernanceService.getExperiment(
      experiment.experimentId,
      "2026-06-26T10:00:00.000Z",
    );

    expect(suspended).toMatchObject({
      experimentId: experiment.experimentId,
      effectiveVersion: expect.objectContaining({
        authorizationStatus: "suspended",
      }),
    });
    expect(resumed).toMatchObject({
      experimentId: experiment.experimentId,
      effectiveVersion: expect.objectContaining({
        authorizationStatus: "active",
      }),
    });
    expect(current).toMatchObject({
      experimentId: experiment.experimentId,
      effectiveVersion: expect.objectContaining({
        authorizationStatus: "active",
      }),
    });
    expect(
      sandboxGovernanceService.listApprovalDocuments("2026-06-26T10:00:00.000Z"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: approvalDocument.documentId,
          title: "Resume operating plan",
        }),
      ]),
    );
  });
});
