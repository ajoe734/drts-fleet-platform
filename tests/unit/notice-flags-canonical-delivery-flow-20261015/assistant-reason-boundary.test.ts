import { describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { PlatformAdminAssistantService } from "../../../apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.service";
import { resolvePlatformAdminAssistantAction } from "../../../apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.actions";
import type { ExecutePlatformAdminAssistantActionCommand } from "../../../apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.types";
import { principal } from "./wire-harness";

describe("assistant direct caller confirmation reason boundary", () => {
  it("typed original notice action carries maintenance schedule/expiry through the actual assistant command", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
      const audit = new AuditNotificationService();
      const domain = new PlatformAdminService(audit);
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
      const command: ExecutePlatformAdminAssistantActionCommand = {
        toolName: "action.create_platform_notice",
        payload: {
          title: "Typed maintenance window",
          body: "Scheduled original in-app notice",
          severity: "maintenance",
          targetAudience: "tenants",
          scheduledAt: "2026-11-01T01:00:00Z",
          expiresAt: "2026-11-01T02:00:00Z",
        },
        reason: "Approved maintenance announcement",
      };
      const originalCount = domain.listPlatformNotices().length;
      expect(() =>
        assistant.executeAction(session.sessionId, identity, {
          toolName: command.toolName,
          payload: command.payload,
        }),
      ).toThrow();
      for (const reason of [null, "", "   "]) {
        expect(() =>
          assistant.executeAction(session.sessionId, identity, {
            ...command,
            reason,
          }),
        ).toThrow();
      }
      expect(domain.listPlatformNotices()).toHaveLength(originalCount);
      const result = assistant.executeAction(
        session.sessionId,
        identity,
        command,
        "typed-notice-window",
      );
      expect(result.receipt.status).toBe("completed");
      expect(domain.listPlatformNotices()[0]).toMatchObject({
        severity: "maintenance",
        status: "scheduled",
        scheduledAt: "2026-11-01T01:00:00.000Z",
        expiresAt: "2026-11-01T02:00:00.000Z",
        reason: command.reason,
        storageMode: "process_memory",
      });
      vi.setSystemTime(new Date("2026-11-01T01:00:00Z"));
      expect(domain.listPlatformNotices()[0]?.status).toBe("active");
      vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
      expect(domain.listPlatformNotices()[0]).toMatchObject({
        status: "resolved",
        downlistedReason: "expired",
      });
      expect(
        audit
          .listAuditLogs()
          .find(
            (a) =>
              a.requestId === "typed-notice-window" &&
              a.moduleName === "platform-admin-assistant",
          )?.newValuesSummary,
      ).toMatchObject({ reason: command.reason });
    } finally {
      vi.useRealTimers();
    }
  });
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
  it("actual assistant retains missing-reason rejection and maintenance state/window audit binding", () => {
    const audit = new AuditNotificationService();
    const domain = new PlatformAdminService(audit);
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
    identity.roleFamilies = ["platform"];
    identity.roles = ["superadmin"];
    const session = assistant.createSession(identity);
    const command = {
      toolName: "action.set_maintenance_mode" as const,
      payload: {
        enabled: true,
        scheduledStart: "2026-11-01T01:00:00Z",
        scheduledEnd: "2026-11-01T02:00:00Z",
      },
    };
    expect(() =>
      assistant.executeAction(session.sessionId, identity, {
        ...command,
        reason: "  ",
      }),
    ).toThrow();
    expect(domain.getMaintenanceMode().enabled).toBe(false);
    const result = assistant.executeAction(
      session.sessionId,
      identity,
      { ...command, reason: "Approved maintenance" },
      "maintenance-reason",
    );
    expect(result.receipt.status).toBe("completed");
    expect(domain.getMaintenanceMode()).toMatchObject({
      enabled: true,
      reason: "Approved maintenance",
      scheduledStart: "2026-11-01T01:00:00.000Z",
      scheduledEnd: "2026-11-01T02:00:00.000Z",
    });
    expect(
      audit
        .listAuditLogs()
        .find((a) => a.actionName === "enable_maintenance_mode")
        ?.newValuesSummary,
    ).toMatchObject({ reason: "Approved maintenance" });
  });
});
