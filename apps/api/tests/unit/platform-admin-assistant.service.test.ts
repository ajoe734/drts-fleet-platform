import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { PlatformAdminAssistantService } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.service";
import { MockPlatformAdminAssistantProvider } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.provider";
import { PlatformAdminService } from "../../src/modules/platform-admin/platform-admin.service";

function platformIdentity(actorId = "pa-admin-001"): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId,
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["superadmin"],
    scopes: ["foundation:read", "foundation:write"],
    requestId: "req-platform-admin-001",
  };
}

describe("PlatformAdminAssistantService", () => {
  it("binds assistant sessions to the current platform control-plane identity", () => {
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      new PlatformAdminService(new AuditNotificationService()),
      new AuditNotificationService(),
    );

    const session = service.createSession(platformIdentity("pa-admin-777"), {
      title: "Tenant rollout triage",
    });

    expect(session.actor).toMatchObject({
      actorId: "pa-admin-777",
      actorType: "platform_admin",
      realm: "platform",
      roleFamilies: ["platform"],
    });
    expect(service.listSessions(platformIdentity("pa-admin-777"))).toHaveLength(
      1,
    );
    expect(service.listSessions(platformIdentity("pa-admin-888"))).toHaveLength(
      0,
    );
  });

  it("rejects access from a different human control-plane identity", () => {
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      new PlatformAdminService(new AuditNotificationService()),
      new AuditNotificationService(),
    );
    const session = service.createSession(platformIdentity("pa-admin-777"), {});

    expect(() =>
      service.listMessages(session.sessionId, platformIdentity("pa-admin-888")),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ASSISTANT_SESSION_FORBIDDEN",
          }),
        }),
      }),
    );
  });

  it("stores provider-generated plans from the mock provider without requiring a real key", async () => {
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      new PlatformAdminService(new AuditNotificationService()),
      new AuditNotificationService(),
    );
    const identity = platformIdentity();
    const session = service.createSession(identity, {});

    const response = await service.createMessage(session.sessionId, identity, {
      message: "Review the current rollout blockers for tenant t-demo.",
    });

    expect(response.answer).toContain("Mock assistant response");
    expect(response.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "§7.3 Current route map",
        }),
      ]),
    );
    expect(response.suggestedPrompts.length).toBeGreaterThan(0);
    expect(response.actionPlan?.steps).toHaveLength(3);
    expect(service.listPlans(session.sessionId, identity)).toEqual([
      expect.objectContaining({
        sessionId: session.sessionId,
        title: "Mock action plan",
      }),
    ]);
  });

  it("returns a descriptor-backed preview for registered assistant actions", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      new PlatformAdminService(auditNotificationService),
      auditNotificationService,
    );
    const identity = platformIdentity();
    const session = service.createSession(identity, {});

    const preview = service.previewAction(session.sessionId, identity, {
      toolName: "action.create_platform_notice",
      payload: {
        title: "Scheduled pause",
        body: "Maintenance notice body",
        severity: "warning",
        targetAudience: "all",
      },
    });

    expect(preview).toEqual({
      toolName: "action.create_platform_notice",
      descriptor: {
        action: "create_platform_notice",
        enabled: true,
        riskLevel: "medium",
        requiresReason: false,
      },
      confirmationRequired: true,
    });
  });

  it("rejects execution when the action descriptor cannot be resolved", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      new PlatformAdminService(auditNotificationService),
      auditNotificationService,
    );
    const identity = platformIdentity();
    const session = service.createSession(identity, {});

    expect(() =>
      service.executeAction(
        session.sessionId,
        identity,
        {
          toolName: "action.unknown_action" as never,
          payload: {},
        } as never,
        "req-missing-descriptor-001",
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ASSISTANT_ACTION_DESCRIPTOR_NOT_FOUND",
          }),
        }),
      }),
    );
  });

  it("rejects execution when the resolved descriptor is disabled", () => {
    const auditNotificationService = new AuditNotificationService();
    const platformAdminService = new PlatformAdminService(
      auditNotificationService,
    );
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      platformAdminService,
      auditNotificationService,
    );
    const identity = platformIdentity();
    const session = service.createSession(identity, {});

    expect(() =>
      service.executeAction(
        session.sessionId,
        identity,
        {
          toolName: "action.set_maintenance_mode",
          payload: {
            enabled: false,
          },
        },
        "req-disabled-001",
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ASSISTANT_ACTION_DISABLED",
            details: expect.objectContaining({
              disabledReasonCode: "maintenance_mode_already_disabled",
            }),
          }),
        }),
      }),
    );
  });

  it("requires a non-empty reason before executing high-risk assistant actions", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      new PlatformAdminService(auditNotificationService),
      auditNotificationService,
    );
    const identity = platformIdentity();
    const session = service.createSession(identity, {});

    expect(() =>
      service.executeAction(
        session.sessionId,
        identity,
        {
          toolName: "action.set_maintenance_mode",
          payload: {
            enabled: true,
            reason: "Operator maintenance",
          },
          reason: "   ",
        },
        "req-high-risk-001",
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "ASSISTANT_ACTION_REASON_REQUIRED",
          }),
        }),
      }),
    );
  });

  it("returns ActionReceipt plus assistantAuditId for descriptor-backed execution", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new PlatformAdminAssistantService(
      new MockPlatformAdminAssistantProvider(),
      new PlatformAdminService(auditNotificationService),
      auditNotificationService,
    );
    const identity = platformIdentity();
    const session = service.createSession(identity, {});

    const result = service.executeAction(
      session.sessionId,
      identity,
      {
        toolName: "action.create_platform_notice",
        payload: {
          title: "Maintenance notice",
          body: "Adapters degraded",
          severity: "critical",
          targetAudience: "ops",
        },
      },
      "req-execute-001",
    );

    expect(result.receipt).toMatchObject({
      actionId: "req-execute-001",
      auditId: expect.any(String),
      resourceType: "platform_notice",
      resourceId: expect.stringMatching(/^notice_/),
      status: "completed",
      message: "Platform notice created.",
    });
    expect(result.assistantAuditId).toEqual(expect.any(String));
  });
});
