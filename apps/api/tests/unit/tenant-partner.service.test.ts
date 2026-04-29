import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../src/modules/tenant-partner/webhook-dispatch.service";

describe("TenantPartnerService sensitive-data governance", () => {
  afterEach(() => {
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT;
    delete process.env.PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT;
  });

  it("loads partner ingress credentials from environment secrets", () => {
    process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT =
      "pk_test_alpha_ingress_secret";

    const service = new TenantPartnerService(new AuditNotificationService());
    const resolution = service.authenticatePartnerBootstrap(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: "pk_test_alpha_ingress_secret",
      },
      "req-partner-env-001",
    );

    expect(resolution.identity).toMatchObject({
      actorType: "partner_api_key",
      actorId: "partner-key-alpha-demo",
      realm: "partner",
      tenantId: "tenant-demo-001",
      partnerEntrySlug: "bank-demo-alpha-airport",
    });
  });

  it("redacts webhook delivery signatures and tenant passenger audit payloads", async () => {
    const auditNotificationService = new AuditNotificationService();
    const webhookDispatchService = new WebhookDispatchService(
      vi.fn(async () => ({ ok: true, status: 202 })) as never,
    );
    const service = new TenantPartnerService(
      auditNotificationService,
      undefined,
      webhookDispatchService,
      [],
    );

    service.upsertPassenger(
      "tenant-demo-001",
      {
        fullName: "王小美",
        mobile: "0911222333",
        email: "xiaomei.wang@acme.example",
        departmentName: "總務部",
        activeFlag: true,
      },
      "req-passenger-audit-001",
    );

    const createdWebhook = service.createWebhookEndpoint(
      "tenant-demo-001",
      {
        url: "https://tenant.example/webhooks/dispatch",
        secret: "whsec_test_alpha",
        events: ["tenant.webhook.test"],
      },
      "req-webhook-001",
    );
    await service.sendTestWebhook(
      "tenant-demo-001",
      {
        webhookId: createdWebhook.webhookId,
      },
      "req-webhook-002",
    );

    const passengerAudit = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "upsert_passenger");
    expect(passengerAudit).toBeDefined();
    expect(
      JSON.stringify(passengerAudit?.newValuesSummary ?? {}),
    ).not.toContain("0911222333");
    expect(
      JSON.stringify(passengerAudit?.newValuesSummary ?? {}),
    ).not.toContain("xiaomei.wang@acme.example");
    expect(passengerAudit?.newValuesSummary).toMatchObject({
      fullName: "王*美",
      mobile: "******2333",
      email: "x***@acme.example",
      metadataKeys: [],
    });

    const [delivery] = service.listWebhookDeliveriesByWebhook(
      "tenant-demo-001",
      createdWebhook.webhookId,
    ) as Array<Record<string, unknown>>;
    expect(delivery.signature).toMatch(/^[0-9a-f]{20}$/);
    expect(delivery).toMatchObject({
      secretVersion: 1,
      signatureVersion: 1,
    });
    expect(delivery).not.toHaveProperty("rawBody");
    expect(delivery).not.toHaveProperty("retryPolicySnapshot");
  });

  it("creates and updates partner entries through the platform-admin lifecycle with audit metadata", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantPartnerService(auditNotificationService);

    const created = service.createPlatformPartnerEntry(
      {
        tenantId: "tenant-demo-001",
        partnerCode: "bank_growth_plus",
        partnerType: "bank_partner",
        programId: "program-growth-plus-airport",
        programCode: "GROWTH_PLUS",
        bankCode: "BANK_GROWTH_PLUS",
        entrySlug: "bank-growth-plus-airport",
        displayName: "Bank Growth Plus Airport",
        businessDispatchSubtype: "credit_card_airport_transfer",
        authMode: "partner_api_key",
        eligibilityMode: "reference_required",
        entryHost: "partner.bank-growth.example",
        entryPath: "/airport-transfer",
        themeAccent: "#1254c7",
        brandingMetadata: {
          supportEmail: "growth-plus@bank.example",
          supportPhone: "0800-123-456",
        },
      },
      "req-partner-create-001",
    );

    expect(created).toMatchObject({
      partnerCode: "bank_growth_plus",
      programId: "program-growth-plus-airport",
      entrySlug: "bank-growth-plus-airport",
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      status: "active",
      activeFlag: true,
      brandingMetadata: {
        supportEmail: "growth-plus@bank.example",
        supportPhone: "0800-123-456",
      },
      auditMetadata: {
        source: "platform_admin_console",
        requestId: "req-partner-create-001",
        createdBy: "platform_admin",
        updatedBy: "platform_admin",
      },
    });

    const updated = service.updatePlatformPartnerEntry(
      created.entrySlug,
      {
        displayName: "Bank Growth Plus Premium Airport",
        eligibilityMode: "bank_card_inline",
        entryPath: "/airport-transfer/premium",
        status: "inactive",
        brandingMetadata: {
          supportEmail: "premium@bank.example",
        },
      },
      "req-partner-update-001",
    );

    expect(updated).toMatchObject({
      displayName: "Bank Growth Plus Premium Airport",
      eligibilityMode: "bank_card_inline",
      entryPath: "/airport-transfer/premium",
      status: "inactive",
      activeFlag: false,
      brandingMetadata: {
        supportEmail: "premium@bank.example",
        supportPhone: "0800-123-456",
      },
      auditMetadata: {
        source: "platform_admin_console",
        requestId: "req-partner-update-001",
        updatedBy: "platform_admin",
      },
    });

    expect(service.listPlatformPartnerEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entrySlug: "bank-growth-plus-airport",
          status: "inactive",
        }),
      ]),
    );

    expect(auditNotificationService.listAuditLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionName: "create_partner_entry",
          resourceType: "partner_entry",
          resourceId: "bank-growth-plus-airport",
        }),
        expect.objectContaining({
          actionName: "update_partner_entry",
          resourceType: "partner_entry",
          resourceId: "bank-growth-plus-airport",
        }),
      ]),
    );
  });
});
