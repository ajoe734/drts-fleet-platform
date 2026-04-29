import { describe, expect, it, vi } from "vitest";

import { TenantsService } from "../../src/modules/platform-admin/tenants.service";

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

    const pilot = service.setRolloutStage(created.id, {
      stage: "pilot",
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
});
