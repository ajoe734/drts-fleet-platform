import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";

export const financeIdentity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer", actorType: "tenant_admin", actorId: "finance-user",
  realm: "tenant", tenantId: "tenant-demo-001", roleFamilies: ["tenant"],
  roles: ["tenant_finance"], scopes: ["billing:read", "billing:write"], requestId: null,
};

describe("invoice recipient authority", () => {
  it("rejects a cross-tenant billing recipient edit before mutation", async () => {
    const service = new BillingSettlementService(new AuditNotificationService());
    const controller = new BillingSettlementController(service);
    await expect(async () => Reflect.apply(controller.updateTenantBillingProfile, controller, [
      { invoiceTitle: "Other tenant", email: "attacker@example.test" },
      "tenant-beta", undefined, financeIdentity,
    ])).rejects.toThrow();
    expect(service.getTenantBillingProfile("tenant-beta").email).not.toBe("attacker@example.test");
  });
});
