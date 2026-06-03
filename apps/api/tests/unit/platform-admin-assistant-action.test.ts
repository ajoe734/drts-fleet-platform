import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { PlatformAdminService } from "../../src/modules/platform-admin/platform-admin.service";
import { resolvePlatformAdminAssistantAction } from "../../src/modules/platform-admin-assistant/platform-admin-assistant.actions";

describe("resolvePlatformAdminAssistantAction", () => {
  it("returns null for an unregistered assistant action", () => {
    const service = new PlatformAdminService(new AuditNotificationService());

    const resolved = resolvePlatformAdminAssistantAction(service, {
      toolName: "action.unknown_action" as never,
      payload: {},
    } as never);

    expect(resolved).toBeNull();
  });

  it("surfaces disabledReasonCode when maintenance mode is already in the requested state", () => {
    const service = new PlatformAdminService(new AuditNotificationService());

    const resolved = resolvePlatformAdminAssistantAction(service, {
      toolName: "action.set_maintenance_mode",
      payload: {
        enabled: false,
      },
    });

    expect(resolved).toMatchObject({
      descriptor: {
        action: "set_maintenance_mode",
        enabled: false,
        disabledReasonCode: "maintenance_mode_already_disabled",
        riskLevel: "high",
        requiresReason: true,
      },
    });
  });
});
