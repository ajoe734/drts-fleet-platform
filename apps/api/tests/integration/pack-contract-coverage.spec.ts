import { afterEach, describe, expect, it, vi } from "vitest";

import { DriverSettingsController } from "../../src/modules/driver-settings/driver-settings.controller";
import { DriverSettingsService } from "../../src/modules/driver-settings/driver-settings.service";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { TenantsController } from "../../src/modules/platform-admin/tenants.controller";
import { TenantsService } from "../../src/modules/platform-admin/tenants.service";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

function expectIsoString(value: string) {
  expect(Number.isNaN(Date.parse(value))).toBe(false);
}

function expectMutationContracts(
  data: Record<string, unknown>,
  expected: {
    actionId: string;
    resourceId: string;
    resourceType: string;
    staleAfterMs: number;
  },
) {
  const receipt = data.receipt as Record<string, unknown>;
  const refresh = data.refresh as Record<string, unknown>;
  const availableActions = data.availableActions as Array<
    Record<string, unknown>
  >;

  expect(receipt).toEqual(
    expect.objectContaining({
      actionId: expected.actionId,
      auditId: expect.any(String),
      resourceId: expected.resourceId,
      resourceType: expected.resourceType,
      status: "completed",
      message: expect.any(String),
    }),
  );
  expect(String(receipt.auditId)).toContain(expected.actionId);

  expect(refresh).toEqual(
    expect.objectContaining({
      staleAfterMs: expected.staleAfterMs,
      dataFreshness: "fresh",
      source: "live",
    }),
  );
  expectIsoString(String(refresh.generatedAt));

  expect(Array.isArray(availableActions)).toBe(true);
  expect(availableActions.length).toBeGreaterThan(0);
  expect(availableActions[0]).toEqual(
    expect.objectContaining({
      action: expect.any(String),
      enabled: expect.any(Boolean),
      riskLevel: expect.stringMatching(/^(low|medium|high)$/),
    }),
  );
}

function createPlatformAdminHarness() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const service = new TenantsService(auditNotificationService as never);
  const controller = new TenantsController(service);

  return { controller, service };
}

function createOpsConsoleHarness() {
  const regulatoryRegistryService = {
    getVehicleDispatchability: vi.fn(() => true),
  };
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
  };
  const taskEventsService = {};
  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService as never,
  );
  const controller = new OwnedMobilityController(service);

  return { controller, regulatoryRegistryService };
}

function createTenantHarness() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
    notifyApprovalRecipients: vi.fn(),
  };
  const service = new TenantPartnerService(auditNotificationService as never);
  cleanups.push(() => service.onModuleDestroy());

  return {
    controller: new TenantPartnerController(service, {} as never),
  };
}

function createDriverHarness() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const service = new DriverSettingsService(auditNotificationService as never);

  return {
    controller: new DriverSettingsController(service),
  };
}

describe("Pack contract coverage", () => {
  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for platform-admin rollout mutations", () => {
    const { controller, service } = createPlatformAdminHarness();
    const created = service.create({
      code: "alpha_dispatch",
      name: "Alpha Dispatch",
    });

    const response = controller.setRolloutStage(
      created.id,
      { stage: "sandbox" },
      "req-platform-rollout",
    );
    const data = response.data as Record<string, unknown>;

    expect(data.id).toBe(created.id);
    expect((data.rollout as Record<string, unknown>).stage).toBe("sandbox");
    expectMutationContracts(data, {
      actionId: "update_platform_tenant_rollout",
      resourceId: created.id,
      resourceType: "platform_tenant",
      staleAfterMs: 30_000,
    });
  });

  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for ops-console queue check-in", () => {
    const { controller, regulatoryRegistryService } = createOpsConsoleHarness();

    const response = controller.queueCheckIn(
      {
        siteId: "site-tpe-terminal-a",
        vehicleId: "vehicle-001",
      },
      "req-ops-queue-check-in",
    );
    const data = response.data as Record<string, unknown>;

    expect(data.siteId).toBe("site-tpe-terminal-a");
    expect(data.vehicleId).toBe("vehicle-001");
    expect(data.status).toBe("checked_in");
    expectMutationContracts(data, {
      actionId: "queue_check_in",
      resourceId: String(data.queueEntryId),
      resourceType: "queue_entry",
      staleAfterMs: 5_000,
    });
    expect(
      regulatoryRegistryService.getVehicleDispatchability,
    ).toHaveBeenCalledWith("vehicle-001", "standard_taxi");
  });

  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for tenant cost-center upserts", () => {
    const { controller } = createTenantHarness();

    const response = controller.upsertCostCenter(
      {
        code: "FINANCE-OPS",
        name: "Finance Ops",
      },
      "tenant-demo-001",
      "req-tenant-cost-center",
    );
    const data = response.data as Record<string, unknown>;

    expect(data.tenantId).toBe("tenant-demo-001");
    expect(data.code).toBe("FINANCE-OPS");
    expect(data.activeFlag).toBe(true);
    expectMutationContracts(data, {
      actionId: "upsert_cost_center",
      resourceId: "FINANCE-OPS",
      resourceType: "tenant_cost_center",
      staleAfterMs: 30_000,
    });
  });

  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for driver settings updates", () => {
    const { controller } = createDriverHarness();

    const response = controller.updateSettings(
      "driver-001",
      {
        autoAcceptEnabled: true,
        preferredAreas: ["taipei_city"],
      },
      "req-driver-settings",
    );
    const data = response.data as Record<string, unknown>;

    expect(data.driverId).toBe("driver-001");
    expect(data.autoAcceptEnabled).toBe(true);
    expect(data.preferredAreas).toEqual(["taipei_city"]);
    expectMutationContracts(data, {
      actionId: "update_driver_settings",
      resourceId: "driver-001",
      resourceType: "driver_settings",
      staleAfterMs: 15_000,
    });
  });
});
