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
});
