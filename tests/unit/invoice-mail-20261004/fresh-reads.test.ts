import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { financeIdentity } from "./fixtures";

describe("invoice links on a replica with a stale invoice cache", () => {
  it("reads newly issued invoices and removes deleted invoices without serving another tenant", async () => {
    const issuer = new BillingSettlementService(new AuditNotificationService());
    const invoice = await issuer.generateTenantInvoice(
      financeIdentity.tenantId!,
      {
        tenantId: financeIdentity.tenantId!,
        periodStart: "2026-03-01T00:00:00Z",
        periodEnd: "2026-03-31T23:59:59Z",
      },
    );
    let records = [invoice];
    // Database I/O only; actual controller, service, repository and view mapping run.
    const query = vi.fn(async (_sql: string, values: unknown[]) => ({
      rows: records
        .filter(
          (record) =>
            record.tenantId === values[0] &&
            (values.length === 1 || record.invoiceId === values[1]),
        )
        .map((record) => ({ record: structuredClone(record) })),
    }));
    const reader = new BillingSettlementService(
      new AuditNotificationService(),
      new BillingSettlementRepository({
        isEnabled: () => true,
        query,
      } as unknown as DatabaseService),
    );
    const controller = new BillingSettlementController(reader);
    expect(reader.listTenantInvoices(financeIdentity.tenantId!)).toEqual([]);
    const detail = await controller.getTenantInvoice(
      invoice.invoiceId,
      undefined,
      undefined,
      financeIdentity,
    );
    expect(detail.data).toMatchObject({
      invoiceId: invoice.invoiceId,
      amount: invoice.amount,
    });
    const list = await controller.listTenantInvoices(
      undefined,
      undefined,
      financeIdentity,
    );
    expect(list.data.items.map((item) => item.invoiceId)).toEqual([
      invoice.invoiceId,
    ]);
    expect(
      (
        await controller.listTenantInvoices(undefined, undefined, {
          ...financeIdentity,
          tenantId: "another-tenant",
        })
      ).data.items,
    ).toEqual([]);

    records = [];
    expect(
      (
        await controller.listTenantInvoices(
          undefined,
          undefined,
          financeIdentity,
        )
      ).data.items,
    ).toEqual([]);
    await expect(
      controller.getTenantInvoice(
        invoice.invoiceId,
        undefined,
        undefined,
        financeIdentity,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      controller.listTenantInvoices(undefined, undefined, financeIdentity),
    ).rejects.toThrow("database unavailable");
  });
});
