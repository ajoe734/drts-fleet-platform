import { describe, expect, it } from "vitest";

import type {
  TenantRolloutGateStatus,
  TenantRolloutStage,
} from "@drts/contracts";

import { TenantRolloutService } from "../../src/modules/tenant-rollout/tenant-rollout.service";
import type { PersistedTenantRolloutRecord } from "../../src/modules/tenant-rollout/tenant-rollout.types";

function buildTenant(
  stage: TenantRolloutStage,
  gateStatus: TenantRolloutGateStatus,
  overrides: Partial<PersistedTenantRolloutRecord> = {},
): PersistedTenantRolloutRecord {
  const base: PersistedTenantRolloutRecord = {
    id: "tenant-matrix-001",
    code: "matrix",
    name: "Matrix Tenant",
    status: stage === "rollback_hold" ? "rollback_hold" : "active",
    enabledModules: ["enterprise_dispatch"],
    quotas: {
      activeDrivers: 10,
      monthlyBookings: 100,
      monthlyApiCalls: 1000,
    },
    bootstrapDefaults: {
      roleDefaults: [
        {
          roleCode: "tenant_admin",
          displayName: "Tenant Admin",
          required: true,
          invitedAt: "2026-05-01T00:00:00.000Z",
          acknowledgedAt: "2026-05-01T00:05:00.000Z",
        },
      ],
      billingBaseline: {
        invoiceTitle: "Matrix Tenant",
        contactName: "Finance Owner",
        email: "finance@matrix.example",
      },
      notificationSubscriptions: [],
      webhookEvents: [],
    },
    integrationPackage: {
      mode: "api_key_and_webhook",
      apiKeyScopes: ["tenant:bookings:write"],
      sandboxBaseUrl: "https://sandbox.matrix.example",
      productionBaseUrl: "https://api.matrix.example",
    },
    rollout: {
      stage: stage === "rollback_hold" ? "production" : stage,
      sandboxStatus: stage === "sandbox" ? gateStatus : "approved",
      pilotStatus: stage === "pilot" ? gateStatus : "approved",
      productionStatus:
        stage === "production" || stage === "rollback_hold"
          ? gateStatus
          : "pending",
      cutoverOwner: "Launch Lead",
      rollbackOwner: "Rollback Lead",
      rollbackPrepared: true,
      lastPromotedAt: "2026-05-01T00:00:00.000Z",
      notes: null,
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    rolloutStateMachine: {
      tenantId: "tenant-matrix-001",
      stage,
      gateStatus,
      cutoverOwnerUserId: null,
      cutoverOwnerDisplayName: "Launch Lead",
      rollbackOwnerUserId: null,
      rollbackOwnerDisplayName: "Rollback Lead",
      rollbackPrepared: true,
      enteredStageAt: "2026-05-01T00:00:00.000Z",
      enteredGateAt: "2026-05-01T00:00:00.000Z",
      lastUpdatedBy: "test",
      lastUpdatedAt: "2026-05-01T00:00:00.000Z",
      availableActions: [],
    },
    rolloutStateMachineMeta: {
      previousStage: stage === "rollback_hold" ? "production" : stage,
      previousTenantStatus: "active",
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

function actionEnabled(
  tenant: PersistedTenantRolloutRecord,
  action: string,
) {
  const descriptor = tenant.rolloutStateMachine?.availableActions.find(
    (candidate) => candidate.action === action,
  );
  return descriptor?.enabled ?? false;
}

describe("TenantRolloutService", () => {
  const service = new TenantRolloutService();

  it.each([
    {
      stage: "sandbox",
      gateStatus: "pending",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "sandbox",
      gateStatus: "ready",
      expected: {
        set_gate_ready: false,
        approve_gate: true,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "sandbox",
      gateStatus: "approved",
      expected: {
        set_gate_ready: false,
        approve_gate: false,
        set_stage_pilot: true,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "sandbox",
      gateStatus: "blocked",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "pilot",
      gateStatus: "pending",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "pilot",
      gateStatus: "ready",
      expected: {
        set_gate_ready: false,
        approve_gate: true,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "pilot",
      gateStatus: "approved",
      expected: {
        set_gate_ready: false,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: true,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "pilot",
      gateStatus: "blocked",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "production",
      gateStatus: "pending",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "production",
      gateStatus: "ready",
      expected: {
        set_gate_ready: false,
        approve_gate: true,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "production",
      gateStatus: "approved",
      expected: {
        set_gate_ready: false,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "production",
      gateStatus: "blocked",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "rollback_hold",
      gateStatus: "pending",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "rollback_hold",
      gateStatus: "ready",
      expected: {
        set_gate_ready: false,
        approve_gate: true,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "rollback_hold",
      gateStatus: "approved",
      expected: {
        set_gate_ready: false,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: true,
        set_stage_sandbox: false,
      },
    },
    {
      stage: "rollback_hold",
      gateStatus: "blocked",
      expected: {
        set_gate_ready: true,
        approve_gate: false,
        set_stage_pilot: false,
        set_stage_production: false,
        set_stage_sandbox: false,
      },
    },
  ])(
    "computes availableActions for $stage / $gateStatus",
    ({ stage, gateStatus, expected }) => {
      const tenant = buildTenant(stage, gateStatus);
      service.hydrateTenant(tenant);

      expect(actionEnabled(tenant, "set_gate_ready")).toBe(
        expected.set_gate_ready,
      );
      expect(actionEnabled(tenant, "approve_gate")).toBe(
        expected.approve_gate,
      );
      expect(actionEnabled(tenant, "set_stage_sandbox")).toBe(
        expected.set_stage_sandbox,
      );
      expect(actionEnabled(tenant, "set_stage_pilot")).toBe(
        expected.set_stage_pilot,
      );
      expect(actionEnabled(tenant, "set_stage_production")).toBe(
        expected.set_stage_production,
      );
      expect(actionEnabled(tenant, "enter_rollback_hold")).toBe(
        stage !== "rollback_hold",
      );
    },
  );

  it("promotes sandbox approved tenants into pilot pending and syncs the legacy projection", () => {
    const tenant = buildTenant("sandbox", "approved");

    const updated = service.setStage(tenant, "pilot", "test");

    expect(updated.stage).toBe("pilot");
    expect(updated.gateStatus).toBe("pending");
    expect(tenant.rollout.stage).toBe("pilot");
    expect(tenant.rollout.sandboxStatus).toBe("approved");
    expect(tenant.rollout.pilotStatus).toBe("pending");
  });

  it("enters rollback hold, then resumes the prior production stage after approval", () => {
    const tenant = buildTenant("production", "approved");

    service.enterRollbackHold(tenant, "test");
    expect(tenant.rolloutStateMachine?.stage).toBe("rollback_hold");
    expect(tenant.status).toBe("rollback_hold");

    service.setGateStatus(tenant, "ready", "test");
    service.setGateStatus(tenant, "approved", "test");
    const resumed = service.setStage(tenant, "production", "test");

    expect(resumed.stage).toBe("production");
    expect(resumed.gateStatus).toBe("pending");
    expect(tenant.status).toBe("active");
    expect(tenant.rollout.stage).toBe("production");
  });
});
