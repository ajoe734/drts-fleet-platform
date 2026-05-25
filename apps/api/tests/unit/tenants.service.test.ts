import { describe, expect, it, vi } from "vitest";

import { TenantsService } from "../../src/modules/platform-admin/tenants.service";
import { ApiRequestError } from "../../src/common/api-envelope";

function expectApiError(fn: () => unknown, errorCode: string) {
  try {
    fn();
    throw new Error(`Expected ApiRequestError with code ${errorCode}`);
  } catch (e) {
    expect(e).toBeInstanceOf(ApiRequestError);
    const response = (e as ApiRequestError).getResponse() as {
      error: { code: string };
    };
    expect(response.error.code).toBe(errorCode);
  }
}

function getApiError(fn: () => unknown) {
  try {
    fn();
    throw new Error("Expected ApiRequestError");
  } catch (e) {
    expect(e).toBeInstanceOf(ApiRequestError);
    return e as ApiRequestError;
  }
}

function createService() {
  const auditNotificationService = {
    recordAuditLog: vi.fn(),
  };
  const platformAdminRepository = {
    loadState: vi.fn().mockResolvedValue({
      platformTenants: [],
      publicInfoVersions: [],
      placardVersions: [],
    }),
    persistChanges: vi.fn().mockResolvedValue(undefined),
    reportPersistenceFailure: vi.fn(),
  };

  const service = new TenantsService(
    auditNotificationService as never,
    platformAdminRepository as never,
  );

  return {
    service,
    auditNotificationService,
    platformAdminRepository,
  };
}

describe("TenantsService", () => {
  it("provisions bootstrap defaults and rollout state when creating a tenant", () => {
    const { service, platformAdminRepository } = createService();

    const created = service.create({
      name: "Acme Mobility",
      code: "acme_mobility",
      integrationMode: "api_key_and_webhook",
      bootstrapAdminEmail: "admin@acme.example",
      sandboxBaseUrl: "https://sandbox.acme.example",
    });

    expect(created.bootstrapDefaults.billingBaseline).toMatchObject({
      invoiceTitle: "Acme Mobility",
      contactName: "Acme Mobility Billing Owner",
      email: "admin@acme.example",
    });
    expect(created.bootstrapDefaults.roleDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleCode: "tenant_admin",
          required: true,
        }),
      ]),
    );
    expect(created.integrationPackage).toMatchObject({
      mode: "api_key_and_webhook",
      sandboxBaseUrl: "https://sandbox.acme.example",
    });
    expect(created.rollout).toMatchObject({
      stage: "sandbox",
      sandboxStatus: "ready",
      pilotStatus: "pending",
      productionStatus: "pending",
      rollbackPrepared: false,
      enteredStageAt: expect.any(String),
      enteredGateAt: expect.any(String),
      lastUpdatedBy: "platform_admin",
    });
    expect(platformAdminRepository.persistChanges).toHaveBeenCalledWith({
      platformTenants: [expect.objectContaining({ id: created.id })],
    });
  });

  it("updates onboarding defaults without losing existing settings", () => {
    const { service } = createService();
    const created = service.create({
      name: "Beta Dispatch",
      code: "beta_dispatch",
    });

    const updated = service.updateOnboarding(created.id, {
      billingBaseline: {
        invoiceTitle: "Beta Dispatch Ltd.",
        contactName: "Beta Finance",
        email: "finance@beta.example",
      },
      integrationPackage: {
        mode: "partner_managed",
        apiKeyScopes: [],
        sandboxBaseUrl: "https://sandbox.beta.example",
        productionBaseUrl: "https://api.beta.example",
      },
      rollout: {
        cutoverOwner: "Launch Manager",
        rollbackOwner: "Ops Escalation",
        rollbackPrepared: true,
        notes: "Pilot requires webhook replay dry-run.",
      },
    });

    expect(updated.bootstrapDefaults.billingBaseline).toMatchObject({
      invoiceTitle: "Beta Dispatch Ltd.",
      contactName: "Beta Finance",
      email: "finance@beta.example",
    });
    expect(updated.integrationPackage).toMatchObject({
      mode: "partner_managed",
      apiKeyScopes: [],
      sandboxBaseUrl: "https://sandbox.beta.example",
      productionBaseUrl: "https://api.beta.example",
    });
    expect(updated.rollout).toMatchObject({
      cutoverOwner: "Launch Manager",
      rollbackOwner: "Ops Escalation",
      rollbackPrepared: true,
      notes: "Pilot requires webhook replay dry-run.",
    });
  });

  it("promotes rollout stages and approves prior gates", () => {
    const { service } = createService();
    const created = service.create({
      name: "Gamma Fleet",
      code: "gamma_fleet",
    });

    // approve sandbox gate before promoting to pilot
    service.updateOnboarding(created.id, {
      rollout: { sandboxStatus: "approved" },
    });

    const pilot = service.setRolloutStage(created.id, {
      stage: "pilot",
    });
    service.setRolloutGateStatus(created.id, "approved");

    // set production prerequisites before promoting
    for (const role of created.bootstrapDefaults.roleDefaults) {
      if (role.required) {
        service.inviteRole(created.id, { roleCode: role.roleCode });
        service.acknowledgeRole(created.id, { roleCode: role.roleCode });
      }
    }
    service.updateOnboarding(created.id, {
      rollout: {
        cutoverOwner: "Launch Lead",
        rollbackOwner: "Ops Lead",
        rollbackPrepared: true,
      },
    });

    const production = service.setRolloutStage(created.id, {
      stage: "production",
      notes: "Production cutover completed.",
    });

    expect(pilot.rollout).toMatchObject({
      stage: "pilot",
      sandboxStatus: "approved",
      pilotStatus: "pending",
    });
    expect(production.rollout).toMatchObject({
      stage: "production",
      sandboxStatus: "approved",
      pilotStatus: "approved",
      productionStatus: "pending",
      enteredStageAt: expect.any(String),
      enteredGateAt: expect.any(String),
      lastUpdatedBy: "platform_admin",
      notes: "Production cutover completed.",
    });
    expect(production.rollout.lastPromotedAt).toEqual(expect.any(String));
  });

  it("blocks promotion to pilot when sandbox is not approved", () => {
    const { service } = createService();
    const created = service.create({ name: "Sandbox Fail", code: "sbx_fail" });

    // sandbox starts in "ready" state, not "approved"
    expectApiError(
      () => service.setRolloutStage(created.id, { stage: "pilot" }),
      "TENANT_PROMOTION_GATE_BLOCKED",
    );
  });

  it("blocks promotion to production when required roles are not acknowledged", () => {
    const { service } = createService();
    const created = service.create({ name: "Role Gate", code: "role_gate" });

    // prepare rollout prerequisites except role acknowledgment
    service.updateOnboarding(created.id, {
      rollout: {
        sandboxStatus: "approved",
        cutoverOwner: "Owner",
        rollbackOwner: "Rollback Lead",
        rollbackPrepared: true,
      },
    });
    // promote to pilot first (sets pilot approved)
    service.setRolloutStage(created.id, { stage: "pilot" });
    service.setRolloutGateStatus(created.id, "approved");

    expectApiError(
      () => service.setRolloutStage(created.id, { stage: "production" }),
      "TENANT_PROMOTION_GATE_BLOCKED",
    );
  });

  it("blocks promotion to production when rollback is not prepared", () => {
    const { service } = createService();
    const created = service.create({ name: "Rollback Gate", code: "rb_gate" });

    service.updateOnboarding(created.id, {
      rollout: {
        sandboxStatus: "approved",
        cutoverOwner: "Owner",
        rollbackOwner: "Rollback Lead",
        rollbackPrepared: false,
      },
    });
    service.setRolloutStage(created.id, { stage: "pilot" });
    service.setRolloutGateStatus(created.id, "approved");

    // acknowledge required roles
    for (const role of created.bootstrapDefaults.roleDefaults) {
      if (role.required) {
        service.inviteRole(created.id, { roleCode: role.roleCode });
        service.acknowledgeRole(created.id, { roleCode: role.roleCode });
      }
    }

    expectApiError(
      () => service.setRolloutStage(created.id, { stage: "production" }),
      "TENANT_PROMOTION_GATE_BLOCKED",
    );
  });

  it("blocks promotion when tenant is in rollback_hold", () => {
    const { service, auditNotificationService } = createService();
    const created = service.create({ name: "Hold Test", code: "hold_test" });

    service.setRollbackHold(created.id);

    const error = getApiError(() =>
      service.setRolloutStage(created.id, { stage: "pilot" }),
    );
    const response = error.getResponse() as {
      error: { code: string; details?: { reasonCode?: string } };
    };
    expect(response.error.code).toBe("TENANT_PROMOTION_GATE_BLOCKED");
    expect(response.error.details?.reasonCode).toBe(
      "production_rollback_hold_active",
    );
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "reject_platform_tenant_rollout_transition",
        newValuesSummary: expect.objectContaining({
          attemptedStage: "pilot",
          reasonCode: "production_rollback_hold_active",
        }),
      }),
    );
  });

  it("returns rollout state machine read model and updates gate status", () => {
    const { service, auditNotificationService } = createService();
    const created = service.create({
      name: "Read Model Test",
      code: "read_model_test",
    });

    const initialState = service.getRolloutStateMachine(created.id);
    expect(initialState).toMatchObject({
      tenantId: created.id,
      stage: "sandbox",
      gateStatus: "ready",
    });

    const updated = service.setRolloutGateStatus(
      created.id,
      "approved",
      "Sandbox sign-off complete.",
    );
    const state = service.getRolloutStateMachine(created.id);

    expect(updated.rollout.sandboxStatus).toBe("approved");
    expect(updated.rollout.notes).toBe("Sandbox sign-off complete.");
    expect(state).toMatchObject({
      tenantId: created.id,
      stage: "sandbox",
      gateStatus: "approved",
    });
    expect(
      state.availableActions.find(
        (action) => action.action === "promote_to_pilot",
      ),
    ).toMatchObject({ enabled: true });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "update_platform_tenant_rollout_gate",
        oldValuesSummary: expect.objectContaining({
          stage: "sandbox",
          sandboxStatus: "ready",
        }),
        newValuesSummary: expect.objectContaining({
          stage: "sandbox",
          sandboxStatus: "approved",
          reason: "Sandbox sign-off complete.",
        }),
      }),
    );
  });

  it("invites a role and records invitedAt timestamp", () => {
    const { service, auditNotificationService } = createService();
    const created = service.create({
      name: "Invite Test",
      code: "invite_test",
    });

    const updated = service.inviteRole(created.id, {
      roleCode: "tenant_admin",
      inviteeEmail: "admin@invite.example",
    });

    const role = updated.bootstrapDefaults.roleDefaults.find(
      (r) => r.roleCode === "tenant_admin",
    );
    expect(role?.invitedAt).toEqual(expect.any(String));
    expect(role?.acknowledgedAt).toBeNull();
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: "invite_tenant_role" }),
    );
  });

  it("rejects invite for unknown role code", () => {
    const { service } = createService();
    const created = service.create({ name: "Bad Role", code: "bad_role" });

    expectApiError(
      () => service.inviteRole(created.id, { roleCode: "nonexistent_role" }),
      "TENANT_ROLE_NOT_FOUND",
    );
  });

  it("acknowledges a previously invited role", () => {
    const { service, auditNotificationService } = createService();
    const created = service.create({ name: "Ack Test", code: "ack_test" });

    service.inviteRole(created.id, { roleCode: "tenant_admin" });
    const updated = service.acknowledgeRole(created.id, {
      roleCode: "tenant_admin",
    });

    const role = updated.bootstrapDefaults.roleDefaults.find(
      (r) => r.roleCode === "tenant_admin",
    );
    expect(role?.acknowledgedAt).toEqual(expect.any(String));
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: "acknowledge_tenant_role" }),
    );
  });

  it("rejects acknowledgment when role has not been invited", () => {
    const { service } = createService();
    const created = service.create({ name: "No Invite", code: "no_invite" });

    expectApiError(
      () => service.acknowledgeRole(created.id, { roleCode: "tenant_admin" }),
      "TENANT_ROLE_NOT_INVITED",
    );
  });

  it("sets rollback hold and blocks production status", () => {
    const { service, auditNotificationService } = createService();
    const created = service.create({ name: "Hold Corp", code: "hold_corp" });

    const held = service.setRollbackHold(
      created.id,
      "Incident escalated during cutover.",
    );

    expect(held.status).toBe("rollback_hold");
    expect(held.rollout).toMatchObject({
      stage: "rollback_hold",
      productionStatus: "blocked",
      enteredGateAt: expect.any(String),
      lastUpdatedBy: "platform_admin",
      notes: "Incident escalated during cutover.",
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "set_tenant_rollback_hold",
        oldValuesSummary: expect.objectContaining({
          status: "active",
          rollout: expect.objectContaining({
            stage: "sandbox",
          }),
        }),
        newValuesSummary: expect.objectContaining({
          status: "rollback_hold",
          rollout: expect.objectContaining({
            stage: "rollback_hold",
            productionStatus: "blocked",
            reason: "Incident escalated during cutover.",
          }),
        }),
      }),
    );
  });

  it("resolves rollback hold back to active production with audit trail", () => {
    const { service, auditNotificationService } = createService();
    const created = service.create({ name: "Recover Corp", code: "recover" });

    service.updateOnboarding(created.id, {
      rollout: {
        sandboxStatus: "approved",
        pilotStatus: "approved",
        productionStatus: "blocked",
      },
    });
    service.setRollbackHold(created.id, "Rollback started.");

    const resolved = service.resolveRollbackHold(
      created.id,
      "Recovery verified and monitoring enabled.",
    );

    expect(resolved.status).toBe("active");
    expect(resolved.rollout).toMatchObject({
      stage: "production",
      productionStatus: "blocked",
      notes: "Recovery verified and monitoring enabled.",
      lastUpdatedBy: "platform_admin",
    });
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: "resolve_tenant_rollback_hold",
        newValuesSummary: expect.objectContaining({
          status: "active",
          rollout: expect.objectContaining({
            stage: "production",
            productionStatus: "blocked",
            reason: "Recovery verified and monitoring enabled.",
          }),
        }),
      }),
    );
  });

  it("suspends and reactivates a tenant", () => {
    const { service } = createService();
    const created = service.create({ name: "Toggle", code: "toggle_co" });

    const paused = service.setStatus(created.id, "paused");
    expect(paused.status).toBe("paused");

    const active = service.setStatus(created.id, "active");
    expect(active.status).toBe("active");
  });

  it("allows production promotion when all gates are satisfied", () => {
    const { service } = createService();
    const created = service.create({ name: "Full Gate", code: "full_gate" });

    // invite and acknowledge all required roles
    for (const role of created.bootstrapDefaults.roleDefaults) {
      if (role.required) {
        service.inviteRole(created.id, { roleCode: role.roleCode });
        service.acknowledgeRole(created.id, { roleCode: role.roleCode });
      }
    }

    // set rollout prerequisites
    service.updateOnboarding(created.id, {
      rollout: {
        sandboxStatus: "approved",
        cutoverOwner: "Launch Lead",
        rollbackOwner: "Ops Lead",
        rollbackPrepared: true,
      },
    });

    // promote through stages
    service.setRolloutStage(created.id, { stage: "pilot" });
    service.setRolloutGateStatus(created.id, "approved");
    const production = service.setRolloutStage(created.id, {
      stage: "production",
    });

    expect(production.rollout.stage).toBe("production");
    expect(production.rollout.productionStatus).toBe("pending");
  });
});
