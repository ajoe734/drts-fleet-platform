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
  it("emits a UI runtime envelope from listEnvelope() with availableActions, emptyState, refresh, and per-row UI fields", () => {
    const { service } = createService();

    // Seed tenant only -> items.length > 0 -> emptyState should be null.
    const envelope = service.listEnvelope();

    expect(envelope.refresh).toMatchObject({
      dataFreshness: "fresh",
      source: "live",
      staleAfterMs: 30_000,
    });
    expect(envelope.availableActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "create_tenant",
          enabled: true,
          riskLevel: "medium",
        }),
      ]),
    );
    expect(envelope.emptyState).toBeNull();
    expect(envelope.items.length).toBeGreaterThan(0);
    const item = envelope.items[0];
    expect(item.cutoverOwnerDisplayName).toBe(item.rollout.cutoverOwner);
    expect(item.rollbackOwnerDisplayName).toBe(item.rollout.rollbackOwner);
    expect(item.lastActivityAt).toBe(item.updatedAt);
    expect(item.availableActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "view", enabled: true }),
      ]),
    );
    expect(item.crossAppLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetApp: "ops-console",
          resourceType: "tenant",
          resourceId: item.id,
          openMode: "new_tab",
        }),
      ]),
    );
  });

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
      pilotStatus: "approved",
    });
    expect(production.rollout).toMatchObject({
      stage: "production",
      sandboxStatus: "approved",
      pilotStatus: "approved",
      productionStatus: "approved",
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
    const { service } = createService();
    const created = service.create({ name: "Hold Test", code: "hold_test" });

    service.setRollbackHold(created.id);

    expectApiError(
      () => service.setRolloutStage(created.id, { stage: "pilot" }),
      "TENANT_IN_ROLLBACK_HOLD",
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

    const held = service.setRollbackHold(created.id);

    expect(held.status).toBe("rollback_hold");
    expect(held.rollout.productionStatus).toBe("blocked");
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: "set_tenant_rollback_hold" }),
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
    const production = service.setRolloutStage(created.id, {
      stage: "production",
    });

    expect(production.rollout.stage).toBe("production");
    expect(production.rollout.productionStatus).toBe("approved");
  });
});
