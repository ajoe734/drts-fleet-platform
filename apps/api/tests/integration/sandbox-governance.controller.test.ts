import { describe, expect, it } from "vitest";

import { SandboxGovernanceController } from "../../src/modules/sandbox-governance/sandbox-governance.controller";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";

function createController() {
  return new SandboxGovernanceController(new SandboxGovernanceService());
}

describe("sandbox-governance controller routes", () => {
  it("serves CRUD, publish, suspend/resume, rollback, and snapshot flows", () => {
    const controller = createController();

    const jurisdiction = controller.createJurisdiction(
      {
        jurisdictionCode: "us-az-dot",
        name: "Arizona DOT Sandbox",
        regulatorName: "Arizona Department of Transportation",
        actorId: "reg-user-1",
      },
      "req-jur-create",
    ).data;

    controller.publishJurisdictionVersion(
      jurisdiction.jurisdictionId,
      jurisdiction.currentVersionId as string,
      { actorId: "reg-user-1" },
      "req-jur-publish",
    );

    const experiment = controller.createExperiment(
      {
        programCode: "phoenix-fsd",
        name: "Phoenix FSD Pilot",
        jurisdictionIds: [jurisdiction.jurisdictionId],
        notificationMatrix: [
          {
            trigger: "experiment_published",
            recipients: [
              {
                recipientId: "roc-oncall",
                kind: "distribution_list",
                target: "roc-oncall@example.com",
                channels: ["email", "slack"],
              },
            ],
            escalationWithinMinutes: 15,
            retentionDays: 365,
          },
        ],
        policyVersions: {
          routePolicyVersion: "route-2026-06",
        },
        actorId: "reg-user-1",
      },
      "req-exp-create",
    ).data;

    const publishedExperiment = controller.publishExperimentVersion(
      experiment.experimentId,
      experiment.currentVersionId as string,
      { actorId: "reg-user-1" },
      "req-exp-publish",
    ).data;
    expect(publishedExperiment.effectiveVersion?.authorizationStatus).toBe(
      "active",
    );

    const document = controller.createApprovalDocument(
      {
        experimentId: experiment.experimentId,
        jurisdictionId: jurisdiction.jurisdictionId,
        documentType: "safety_case",
        title: "Safety Case",
        artifactFileName: "safety-case-v1.pdf",
        artifactContentType: "application/pdf",
        artifactContentBase64: Buffer.from("safety-case-v1").toString("base64"),
        actorId: "reg-user-1",
      },
      "req-doc-create",
    ).data;

    const publishedDocument = controller.publishApprovalDocumentVersion(
      document.documentId,
      document.currentVersionId as string,
      { actorId: "reg-user-1" },
      "req-doc-publish",
    ).data;

    const superseded = controller.uploadApprovalDocumentVersion(
      document.documentId,
      {
        artifactFileName: "safety-case-v2.pdf",
        artifactContentType: "application/pdf",
        artifactContentBase64: Buffer.from("safety-case-v2").toString("base64"),
        summary: "Added remote-ops appendix",
        actorId: "reg-user-2",
      },
      "req-doc-v2",
    ).data;
    expect(superseded.versions.at(-1)?.supersedesVersionId).toBe(
      document.currentVersionId,
    );

    const suspended = controller.suspendExperimentAuthorizations(
      experiment.experimentId,
      { actorId: "ops-user-2" },
      "req-exp-suspend",
    ).data;
    expect(suspended.effectiveVersion?.authorizationStatus).toBe("suspended");

    const resumed = controller.resumeExperimentAuthorizations(
      experiment.experimentId,
      { actorId: "ops-user-3" },
      "req-exp-resume",
    ).data;
    expect(resumed.effectiveVersion?.authorizationStatus).toBe("active");

    const rolledBack = controller.rollbackApprovalDocumentVersion(
      document.documentId,
      document.currentVersionId as string,
      { actorId: "auditor-1", publish: true },
      "req-doc-rollback",
    ).data;
    expect(rolledBack.effectiveVersion?.rollbackFromVersionId).toBe(
      document.currentVersionId,
    );

    const snapshot = controller.generateComplianceSnapshot(
      experiment.experimentId,
      publishedDocument.effectiveVersion?.effectiveFrom as string,
      "auditor-1",
      "req-snapshot",
    ).data;

    expect(snapshot.snapshotHashSha256).toHaveLength(64);
    expect(snapshot.approvalDocuments).toHaveLength(1);
    expect(snapshot.jurisdictions).toHaveLength(1);
    expect(
      controller.listExperiments("2026-06-26T01:00:00.000Z", "req-list").data
        .items,
    ).toHaveLength(1);
  });
});
