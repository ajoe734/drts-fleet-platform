import { describe, expect, it, vi } from "vitest";

import type { PlatformAdminTenantRecord, TenantRolloutGateStatus } from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { TenantsService } from "../../src/modules/platform-admin/tenants.service";
import { buildTenantRolloutStateMachineRecord } from "../../src/modules/tenant-rollout/tenant-rollout-state";
import { TenantRolloutService } from "../../src/modules/tenant-rollout/tenant-rollout.service";

function expectApiError(fn: () => unknown, errorCode: string) {
  try {
    fn();
    throw new Error(`Expected ApiRequestError with code ${errorCode}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    const response = (error as ApiRequestError).getResponse() as {
      error: { code: string };
    };
    expect(response.error.code).toBe(errorCode);
  }
}

function createAuditNotificationService() {
  return {
    recordAuditLog: vi.fn((input) => ({
      auditId: "audit-test-id",
      createdAt: "2026-05-26T00:00:00.000Z",
      requestId: input?.requestId ?? "request-test-id",
      ...input,
    })),
  };
}

function createTenantRolloutService() {
  const tenants = new TenantsService(
    createAuditNotificationService() as never,
    {
      loadState: vi.fn().mockResolvedValue({
        platformTenants: [],
        publicInfoVersions: [],
        placardVersions: [],
      }),
      persistChanges: vi.fn().mockResolvedValue(undefined),
      reportPersistenceFailure: vi.fn(),
    } as never,
  );

  return {
    tenants,
    rollout: new TenantRolloutService(tenants),
  };
}

function acknowledgeRequiredRoles(tenants: TenantsService, tenantId: string) {
  const tenant = tenants.get(tenantId);
  for (const role of tenant.bootstrapDefaults.roleDefaults) {
    if (!role.required) {
      continue;
    }
    tenants.inviteRole(tenantId, { roleCode: role.roleCode });
    tenants.acknowledgeRole(tenantId, { roleCode: role.roleCode });
  }
}

function createTenantFixture(
  currentStage: PlatformAdminTenantRecord["rollout"]["stage"] | "rollback_hold",
  gateStatus: TenantRolloutGateStatus,
): PlatformAdminTenantRecord {
  const base: PlatformAdminTenantRecord = {
    id: "tenant-fixture-001",
    code: "fixture",
    name: "Fixture Tenant",
    status: currentStage === "rollback_hold" ? "rollback_hold" : "active",
    enabledModules: ["enterprise_dispatch"],
    quotas: {
      activeDrivers: 25,
      monthlyBookings: 500,
      monthlyApiCalls: 10_000,
    },
    bootstrapDefaults: {
      billingBaseline: {
        invoiceTitle: "Fixture Tenant",
        contactName: "Fixture Billing",
        email: "billing@fixture.example",
      },
      roleDefaults: [
        {
          roleCode: "tenant_admin",
          displayName: "Tenant Admin",
          required: true,
          invitedAt: "2026-05-25T00:00:00.000Z",
          acknowledgedAt: "2026-05-25T01:00:00.000Z",
        },
      ],
      notificationSubscriptions: [],
      webhookEvents: [],
    },
    integrationPackage: {
      mode: "api_key_and_webhook",
      apiKeyScopes: ["tenant:bookings:write"],
      sandboxBaseUrl: "https://sandbox.fixture.example",
      productionBaseUrl: "https://api.fixture.example",
    },
    rollout: {
      stage: currentStage === "rollback_hold" ? "pilot" : currentStage,
      sandboxStatus: "approved",
      pilotStatus: "approved",
      productionStatus: "approved",
      cutoverOwner: "Launch Lead",
      rollbackOwner: "Ops Lead",
      rollbackPrepared: true,
      lastPromotedAt: "2026-05-25T02:00:00.000Z",
      lastRollbackAt:
        currentStage === "rollback_hold" ? "2026-05-26T01:00:00.000Z" : null,
      notes: "Fixture rollout state.",
    },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
  };

  if (currentStage === "sandbox") {
    base.rollout.sandboxStatus = gateStatus;
    base.rollout.pilotStatus = "pending";
    base.rollout.productionStatus = "pending";
  } else if (currentStage === "pilot") {
    base.rollout.pilotStatus = gateStatus;
    base.rollout.productionStatus = "pending";
  } else if (currentStage === "production") {
    base.rollout.productionStatus = gateStatus;
  } else {
    base.rollout.productionStatus = gateStatus;
    base.rollout.rollbackPrepared = gateStatus !== "pending";
  }

  return base;
}

describe("TenantRolloutStateMachineRecord", () => {
  const stages = ["sandbox", "pilot", "production", "rollback_hold"] as const;
  const statuses = ["pending", "ready", "approved", "blocked"] as const;

  for (const stage of stages) {
    for (const status of statuses) {
      it(`builds state for ${stage} with ${status} gate`, () => {
        const record = buildTenantRolloutStateMachineRecord(
          createTenantFixture(stage, status),
        );

        expect(record.currentStage).toBe(stage);
        const gate = record.gates.find((entry) => entry.gateCode === stage);
        expect(gate).toBeDefined();
        expect(gate?.status).toBe(status);
        expect(record.nextActions.length).toBeGreaterThan(0);
        expect(record.rollback.rollbackActions.length).toBeGreaterThan(0);
        expect(record.refresh.source).toBe("live");
      });
    }
  }
});

describe("TenantRolloutService", () => {
  it("returns rollout state with gates, next actions, and rollback metadata", () => {
    const { tenants, rollout } = createTenantRolloutService();
    const created = tenants.create({ name: "State Corp", code: "state_corp" });

    const state = rollout.getState(created.id);

    expect(state.tenantId).toBe(created.id);
    expect(state.gates).toHaveLength(4);
    expect(state.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "tenant.rollout.advance.pilot" }),
      ]),
    );
    expect(state.rollback).toMatchObject({
      rollbackPrepared: false,
      cutoverOwner: null,
      rollbackOwner: null,
    });
  });

  it("advances rollout and returns an action receipt", () => {
    const { tenants, rollout } = createTenantRolloutService();
    const created = tenants.create({ name: "Advance Corp", code: "advance_corp" });

    tenants.updateOnboarding(created.id, {
      rollout: { sandboxStatus: "approved" },
    });

    const receipt = rollout.advance(created.id, {
      targetStage: "pilot",
      reason: "Sandbox validation completed",
      evidenceRefs: ["uat-1", "audit-22"],
    });

    expect(receipt).toMatchObject({
      auditId: "audit-test-id",
      resourceId: created.id,
      resourceType: "platform_tenant_rollout",
      status: "completed",
    });
    expect(tenants.get(created.id).rollout.stage).toBe("pilot");
  });

  it("advances from pilot to production when rollout gates are satisfied", () => {
    const { tenants, rollout } = createTenantRolloutService();
    const created = tenants.create({ name: "Production Corp", code: "production_corp" });

    tenants.updateOnboarding(created.id, {
      rollout: {
        sandboxStatus: "approved",
        cutoverOwner: "Launch Lead",
        rollbackOwner: "Ops Lead",
        rollbackPrepared: true,
      },
    });
    acknowledgeRequiredRoles(tenants, created.id);

    rollout.advance(created.id, {
      targetStage: "pilot",
      reason: "Sandbox validated",
      evidenceRefs: ["sandbox-qa"],
    });
    const receipt = rollout.advance(created.id, {
      targetStage: "production",
      reason: "Pilot metrics approved",
      evidenceRefs: ["pilot-signoff", "ops-checklist"],
    });

    expect(receipt).toMatchObject({
      auditId: "audit-test-id",
      resourceId: created.id,
      resourceType: "platform_tenant_rollout",
      status: "completed",
    });
    expect(tenants.get(created.id).rollout).toMatchObject({
      stage: "production",
      productionStatus: "approved",
      rollbackPrepared: true,
    });
  });

  it("enters rollback hold and resolves back to the safe stage", () => {
    const { tenants, rollout } = createTenantRolloutService();
    const created = tenants.create({ name: "Rollback Corp", code: "rollback_corp" });

    tenants.updateOnboarding(created.id, {
      rollout: {
        sandboxStatus: "approved",
      },
    });
    rollout.advance(created.id, {
      targetStage: "pilot",
      reason: "Ready for pilot",
      evidenceRefs: ["pilot-ready"],
    });

    const holdReceipt = rollout.advance(created.id, {
      targetStage: "rollback_hold",
      reason: "Incident mitigation",
      evidenceRefs: ["inc-123"],
    });
    expect(holdReceipt).toMatchObject({
      auditId: "audit-test-id",
      resourceId: created.id,
      resourceType: "platform_tenant_rollout",
      status: "completed",
    });
    expect(tenants.get(created.id)).toMatchObject({
      status: "rollback_hold",
      rollout: {
        stage: "pilot",
        productionStatus: "blocked",
      },
    });

    const resolveReceipt = rollout.advance(created.id, {
      targetStage: "pilot",
      reason: "Pilot restored",
      evidenceRefs: ["mitigation-complete"],
    });
    expect(resolveReceipt).toMatchObject({
      auditId: "audit-test-id",
      resourceId: created.id,
      resourceType: "platform_tenant_rollout",
      status: "completed",
    });
    expect(tenants.get(created.id).status).toBe("active");
  });

  it("rejects invalid rollout transitions", () => {
    const { tenants, rollout } = createTenantRolloutService();
    const created = tenants.create({ name: "Invalid Corp", code: "invalid_corp" });

    expectApiError(
      () =>
        rollout.advance(created.id, {
          targetStage: "production",
          reason: "Skipping pilot",
          evidenceRefs: [],
        }),
      "TENANT_PROMOTION_GATE_BLOCKED",
    );
  });

  it("rejects resolving rollback hold to a different stage", () => {
    const { tenants, rollout } = createTenantRolloutService();
    const created = tenants.create({ name: "Bad Resolve Corp", code: "bad_resolve_corp" });

    tenants.updateOnboarding(created.id, {
      rollout: {
        sandboxStatus: "approved",
      },
    });
    rollout.advance(created.id, {
      targetStage: "pilot",
      reason: "Pilot enabled",
      evidenceRefs: ["sandbox-ok"],
    });
    rollout.advance(created.id, {
      targetStage: "rollback_hold",
      reason: "Hold for investigation",
      evidenceRefs: ["incident-77"],
    });

    expectApiError(
      () =>
        rollout.advance(created.id, {
          targetStage: "sandbox",
          reason: "Wrong recovery path",
          evidenceRefs: ["manual-override"],
        }),
      "TENANT_ROLLBACK_RESOLUTION_INVALID",
    );
  });
});
