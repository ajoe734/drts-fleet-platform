import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { PlatformAdminAssistantService } from "../../../apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.service";
import { resolvePlatformAdminAssistantAction } from "../../../apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.actions";
import { principal } from "./wire-harness";

describe("assistant direct caller confirmation reason boundary", () => {
  it("existing executeAction must carry its validated confirmation reason into the canonical notice and audit", () => {
    const audit = new AuditNotificationService();
    const domain = new PlatformAdminService(audit);
    // Provider, retrieval and orchestrator bridges are not invoked by this
    // production command path. The command, authorization and audits are real.
    const assistant = new PlatformAdminAssistantService(
      {} as never,
      {} as never,
      domain,
      audit,
      {} as never,
      undefined,
      undefined,
      {} as never,
    );
    const identity = principal("platform");
    identity.roles = ["superadmin"];
    identity.roleFamilies = ["platform"];
    const session = assistant.createSession(identity);
    const result = assistant.executeAction(
      session.sessionId,
      identity,
      {
        toolName: "action.create_platform_notice",
        payload: {
          title: "Assistant critical",
          body: "Actual caller",
          severity: "critical",
          targetAudience: "drivers",
        },
        reason: "Confirmed incident response",
      },
      "assistant-reason-probe",
    );
    expect(result.receipt.status).toBe("completed");
    const actual = domain
      .listPlatformNotices()
      .find((n) => n.title === "Assistant critical");
    expect(actual?.reason).toBe("Confirmed incident response");
    expect(
      audit.listAuditLogs().find((a) => a.resourceId === actual?.noticeId)
        ?.newValuesSummary,
    ).toMatchObject({ reason: "Confirmed incident response" });
  });
  it("task-owned action already supports explicit confirmed reason without weakening high-risk descriptors", () => {
    const audit = new AuditNotificationService();
    const domain = new PlatformAdminService(audit);
    const action = resolvePlatformAdminAssistantAction(domain, {
      toolName: "action.create_platform_notice",
      payload: {
        title: "Confirmed action",
        body: "Scope boundary",
        severity: "critical",
        targetAudience: "ops",
      },
    })!;
    expect(action.descriptor).toMatchObject({
      riskLevel: "high",
      requiresReason: true,
    });
    const result = action.execute(domain, "direct-action", "Incident response");
    expect(result.data).toMatchObject({
      reason: "Incident response",
      storageMode: "process_memory",
    });
    expect(() => action.execute(domain, "missing-reason")).toThrow();
  });
});
