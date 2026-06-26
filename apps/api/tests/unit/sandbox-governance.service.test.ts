import { describe, expect, it } from "vitest";

import { PHASE2_AUDIT_EVENT_CATALOG } from "@drts/contracts";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";

function createAuditContext(requestId: string) {
  return {
    actorId: "ops-user-001",
    actorType: "ops_user" as const,
    tenantId: "tenant-demo-001",
    moduleName: "sandbox-governance",
    requestId,
  };
}

describe("SandboxGovernanceService.upsertProviderCapabilityRequirement", () => {
  it("returns ActionReceipt data for configured and amended requirement writes", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new SandboxGovernanceService(auditNotificationService);

    const configured = service.upsertProviderCapabilityRequirement({
      sandboxProgramId: "program-1",
      capability: "av_dispatch",
      required: true,
      auditContext: createAuditContext("req-configured-001"),
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
      auditContext: createAuditContext("req-amended-001"),
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
