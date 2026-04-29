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
});
