import { describe, expect, it, vi } from "vitest";

import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";

function createService() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };

  const service = new FeatureFlagsService(
    undefined,
    auditNotificationService as never,
  );

  return {
    service,
    auditNotificationService,
  };
}

describe("FeatureFlagsService", () => {
  it("records audit evidence when updating a global feature flag", async () => {
    const { service, auditNotificationService } = createService();

    const updated = await service.updateFlag(
      "driver-app.shift",
      true,
      "req-flag-update-001",
      {
        actorId: "platform-admin-e2e-001",
        actorType: "platform_admin",
      } as never,
    );

    expect(updated).toMatchObject({
      key: "driver-app.shift",
      enabled: true,
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-flag-update-001",
        actorId: "platform-admin-e2e-001",
        actorType: "platform_admin",
        moduleName: "feature-flags",
        actionName: "update_feature_flag",
        resourceType: "feature_flag",
        resourceId: "driver-app.shift",
        newValuesSummary: expect.objectContaining({
          enabled: true,
          tenantId: null,
        }),
      }),
    );
  });

  it("records audit evidence when upserting a tenant override", async () => {
    const { service, auditNotificationService } = createService();

    const updated = await service.upsertTenantOverride(
      "driver-app.shift",
      "tenant-e2e-011",
      true,
      "Enable shift planning for pilot tenant.",
      "req-flag-override-001",
      {
        actorId: "platform-admin-e2e-002",
        actorType: "platform_admin",
      } as never,
    );

    expect(updated).toMatchObject({
      key: "driver-app.shift",
      enabled: true,
      tenantId: "tenant-e2e-011",
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-flag-override-001",
        actorId: "platform-admin-e2e-002",
        actorType: "platform_admin",
        tenantId: "tenant-e2e-011",
        moduleName: "feature-flags",
        actionName: "upsert_feature_flag_tenant_override",
        resourceType: "feature_flag",
        resourceId: "driver-app.shift",
        newValuesSummary: expect.objectContaining({
          enabled: true,
          tenantId: "tenant-e2e-011",
        }),
      }),
    );
  });
});
