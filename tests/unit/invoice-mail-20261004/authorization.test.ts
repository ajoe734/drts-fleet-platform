import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { financeIdentity } from "./fixtures";

describe("invoice recipient authority", () => {
  it("rejects a cross-tenant billing recipient edit before mutation", async () => {
    const service = new BillingSettlementService(
      new AuditNotificationService(),
    );
    const controller = new BillingSettlementController(service);
    await expect(async () =>
      Reflect.apply(controller.updateTenantBillingProfile, controller, [
        { invoiceTitle: "Other tenant", email: "attacker@example.test" },
        "tenant-beta",
        undefined,
        financeIdentity,
      ]),
    ).rejects.toThrow();
    expect(service.getTenantBillingProfile("tenant-beta").email).not.toBe(
      "attacker@example.test",
    );
  });

  it("uses the authenticated tenant without a selector and enforces read/write authority on every invoice entry", async () => {
    const service = new BillingSettlementService(
      new AuditNotificationService(),
    );
    const controller = new BillingSettlementController(service);
    const command = {
      invoiceTitle: "Authorized tenant",
      email: "finance@example.test",
    };
    const profile = await controller.updateTenantBillingProfile(
      command,
      undefined,
      undefined,
      financeIdentity,
    );
    expect(profile.data.tenantId).toBe(financeIdentity.tenantId);
    expect(
      controller.getTenantBillingProfile(undefined, undefined, financeIdentity)
        .data.email,
    ).toBe(command.email);
    const period = {
      tenantId: financeIdentity.tenantId!,
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-03-31T23:59:59Z",
    };
    const generated = await controller.generateTenantInvoice(
      period,
      undefined,
      undefined,
      financeIdentity,
    );
    const readOnly = { ...financeIdentity, scopes: ["tenant:billing:read"] };
    expect(
      (
        await controller.getTenantInvoice(
          generated.data.invoiceId,
          undefined,
          undefined,
          readOnly,
        )
      ).data.invoiceId,
    ).toBe(generated.data.invoiceId);
    expect(
      (await controller.listTenantInvoices(undefined, undefined, readOnly)).data
        .items,
    ).toHaveLength(1);
    for (const identity of [
      undefined,
      { ...financeIdentity, realm: "platform" as const },
      { ...financeIdentity, scopes: [] },
    ]) {
      await expect(async () =>
        controller.getTenantBillingProfile(undefined, undefined, identity),
      ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
      await expect(
        controller.updateTenantBillingProfile(
          command,
          undefined,
          undefined,
          identity,
        ),
      ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
      await expect(
        controller.generateTenantInvoice(
          period,
          undefined,
          undefined,
          identity,
        ),
      ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
      await expect(
        controller.listTenantInvoices(undefined, undefined, identity),
      ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
      await expect(
        controller.getTenantInvoice(
          generated.data.invoiceId,
          undefined,
          undefined,
          identity,
        ),
      ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
    }
    await expect(
      controller.updateTenantBillingProfile(
        command,
        undefined,
        undefined,
        readOnly,
      ),
    ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
    await expect(
      controller.generateTenantInvoice(period, undefined, undefined, readOnly),
    ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
    await expect(
      controller.listTenantInvoices(
        "another-tenant",
        undefined,
        financeIdentity,
      ),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH" });
    await expect(
      controller.getTenantInvoice(
        generated.data.invoiceId,
        "another-tenant",
        undefined,
        financeIdentity,
      ),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH" });
    await expect(
      controller.generateTenantInvoice(
        { ...period, tenantId: "another-tenant" },
        undefined,
        undefined,
        financeIdentity,
      ),
    ).rejects.toThrow();
  });
});
