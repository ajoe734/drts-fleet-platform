import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";

function createService() {
  const auditNotificationService = new AuditNotificationService();
  return new BillingSettlementService(auditNotificationService);
}

describe("BillingSettlementService settlement matrix", () => {
  it("returns the canonical channel-aware settlement matrix", () => {
    const service = createService();

    expect(service.listSettlementMatrix()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "tenant_enterprise",
          orderDomain: "owned",
          localLedgerMode: "full_service",
        }),
        expect.objectContaining({
          channelKey: "partner_airport",
          receiptOwner: expect.stringContaining("partner"),
        }),
        expect.objectContaining({
          channelKey: "phone_dispatch",
          orderSources: expect.arrayContaining(["phone"]),
        }),
        expect.objectContaining({
          channelKey: "forwarded_shadow",
          orderDomain: "forwarded",
          localLedgerMode: "shadow_only",
        }),
      ]),
    );
  });

  it("carries channel context into generated invoices, statements, and reimbursements", async () => {
    const service = createService();

    const invoice = await service.generateTenantInvoice(
      "tenant-demo-001",
      {
        tenantId: "tenant-demo-001",
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-31T23:59:59.000Z",
      },
      "req-invoice-001",
    );

    expect(invoice.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "tenant_enterprise",
          orderSource: "portal",
        }),
        expect.objectContaining({
          channelKey: "partner_airport",
          orderSource: "api",
        }),
      ]),
    );

    service.publishDriverFeePlan({
      planName: "Phase 1 demo plan",
      version: "2026-03",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
    });
    const generated = await service.generateDriverStatements({
      periodMonth: "2026-03",
    });

    const generatedLines = generated.items.flatMap(
      (statement) => statement.lines,
    );
    expect(generatedLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "tenant_enterprise",
        }),
        expect.objectContaining({
          channelKey: "partner_airport",
        }),
      ]),
    );

    const reimbursementBatches = service.listReimbursementBatches();
    expect(reimbursementBatches[0]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channelKey: "partner_airport",
          reason: "platform_funded_discount",
        }),
      ]),
    );
  });
});
