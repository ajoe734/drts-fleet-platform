import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { PlatformAdminAssistantService } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.service";
import { MockPlatformAdminAssistantProvider } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.provider";

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
});
