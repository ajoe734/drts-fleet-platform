import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";
import { ForwarderService } from "../../src/modules/forwarder/forwarder.service";
import { GrabTaiwanAdapter } from "../../src/modules/forwarder/grab-taiwan.adapter";
import { SandboxAdapter } from "../../src/modules/forwarder/sandbox.adapter";
import { PlatformAdminAssistantReadToolService } from "../../src/modules/platform-admin-assistant/platform-admin-assistant-read-tools.service";
import { PlatformAdminService } from "../../src/modules/platform-admin/platform-admin.service";
import { PlatformTenantGovernanceService } from "../../src/modules/platform-admin/tenant-governance.service";
import { TenantsService } from "../../src/modules/platform-admin/tenants.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

function createIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "pa-admin-001",
    realm: "platform",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["platform-admin.read", "platform-admin.write"],
    requestId: "req-pa-assistant-tools-001",
    ...overrides,
  };
}

async function createRegistry() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService,
  );
  const tenantsService = new TenantsService(auditNotificationService);
  const platformTenantGovernanceService = new PlatformTenantGovernanceService(
    tenantsService,
    tenantPartnerService,
  );
  const platformAdminService = new PlatformAdminService(
    auditNotificationService,
  );
  const featureFlagsService = new FeatureFlagsService();
  const forwarderService = new ForwarderService(
    {} as ConstructorParameters<typeof ForwarderService>[0],
    auditNotificationService,
    [new GrabTaiwanAdapter(), new SandboxAdapter()],
  );
  await forwarderService.onModuleInit();
  auditNotificationService.recordAuditLog({
    actorId: "pa-admin-001",
    actorType: "platform_admin",
    tenantId: null,
    moduleName: "audit-notification",
    actionName: "assistant_test_seed",
    resourceType: "assistant_fixture",
    resourceId: "platform-admin-read-tools",
  });

  return new PlatformAdminAssistantReadToolService(
    tenantsService,
    platformTenantGovernanceService,
    tenantPartnerService,
    platformAdminService,
    featureFlagsService,
    forwarderService,
    auditNotificationService,
  );
}

describe("PlatformAdminAssistantReadToolService", () => {
  it("lists registered caller-scoped tool definitions", async () => {
    const registry = await createRegistry();

    expect(registry.listDefinitions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "data.list_partner_entries" }),
        expect.objectContaining({ name: "data.list_payment_records" }),
        expect.objectContaining({ name: "data.list_pricing_rules" }),
        expect.objectContaining({ name: "data.list_feature_flags" }),
        expect.objectContaining({ name: "data.list_adapter_health" }),
        expect.objectContaining({ name: "audit.list_platform_audit_entries" }),
      ]),
    );
  });

  it("returns tenant, partner, payment, pricing, flag, and adapter records without widening scope", async () => {
    const registry = await createRegistry();
    const identity = createIdentity();

    const tenantResult = await registry.execute(identity, {
      toolName: "data.list_tenant_summaries",
      input: { tenantId: "tenant-demo-001" },
    });
    const governanceResult = await registry.execute(identity, {
      toolName: "data.get_tenant_governance_summary",
      input: { tenantId: "tenant-demo-001" },
    });
    const partnerResult = await registry.execute(identity, {
      toolName: "data.list_partner_entries",
      input: { tenantId: "tenant-demo-001" },
    });
    const paymentResult = await registry.execute(identity, {
      toolName: "data.list_payment_records",
      input: { status: "paid" },
    });
    const pricingResult = await registry.execute(identity, {
      toolName: "data.list_pricing_rules",
      input: { applicableTo: "all" },
    });
    const flagResult = await registry.execute(identity, {
      toolName: "data.list_feature_flags",
    });
    const adapterResult = await registry.execute(identity, {
      toolName: "data.list_adapter_health",
    });

    expect(tenantResult.family).toBe("data");
    expect(governanceResult.family).toBe("data");
    expect(partnerResult.family).toBe("data");
    expect(paymentResult.family).toBe("data");
    expect(pricingResult.family).toBe("data");
    expect(flagResult.family).toBe("data");
    expect(adapterResult.family).toBe("data");

    if (
      tenantResult.family !== "data" ||
      governanceResult.family !== "data" ||
      partnerResult.family !== "data" ||
      paymentResult.family !== "data" ||
      pricingResult.family !== "data" ||
      flagResult.family !== "data" ||
      adapterResult.family !== "data"
    ) {
      throw new Error("expected data tool results");
    }

    expect(tenantResult.items[0]?.recordId).toBe("tenant-demo-001");
    expect(governanceResult.items[0]?.fields.tenantId).toBe("tenant-demo-001");
    expect(partnerResult.items[0]?.fields.tenantId).toBe("tenant-demo-001");
    expect(paymentResult.items[0]?.fields.status).toBe("paid");
    expect(pricingResult.items[0]?.fields.applicableTo).toBe("all");
    expect(
      flagResult.items.some((item) => item.recordId === "phase1.read-models"),
    ).toBe(true);
    expect(adapterResult.items.length).toBeGreaterThan(0);
  });

  it("returns caller-scoped actor audit entries and platform audit filters", async () => {
    const registry = await createRegistry();
    const identity = createIdentity();

    const actorAuditResult = await registry.execute(identity, {
      toolName: "audit.list_actor_audit_entries",
    });
    const platformAuditResult = await registry.execute(identity, {
      toolName: "audit.list_platform_audit_entries",
      input: { moduleName: "audit-notification" },
    });
    const receiptAuditResult = await registry.execute(identity, {
      toolName: "audit.get_action_receipt_audit_entry",
      input: { auditId: "11111111-1111-4111-8111-111111111111" },
    });

    expect(actorAuditResult.family).toBe("audit");
    expect(platformAuditResult.family).toBe("audit");
    expect(receiptAuditResult.family).toBe("audit");

    if (
      actorAuditResult.family !== "audit" ||
      platformAuditResult.family !== "audit" ||
      receiptAuditResult.family !== "audit"
    ) {
      throw new Error("expected audit tool results");
    }

    expect(
      actorAuditResult.items.every((entry) => entry.actorId === "pa-admin-001"),
    ).toBe(true);
    expect(platformAuditResult.items[0]?.metadata?.moduleName).toBe(
      "audit-notification",
    );
    expect(receiptAuditResult.items[0]?.auditId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("rejects execution without caller identity", async () => {
    const registry = await createRegistry();

    await expect(
      registry.execute(null, {
        toolName: "data.list_tenant_summaries",
      }),
    ).rejects.toMatchObject({
      status: 401,
      response: {
        error: {
          code: "ASSISTANT_TOOL_IDENTITY_REQUIRED",
        },
      },
    });
  });
});
