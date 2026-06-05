import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { FleetPartnerService } from "../../apps/api/src/modules/fleet-partner/fleet-partner.service";

function createService() {
  const billingSettlementService = new BillingSettlementService(
    new AuditNotificationService(),
  );
  billingSettlementService.publishDriverFeePlan({
    planName: "Phase1 Driver Fee Plan",
    version: "drv-fee-v1",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });

  const fleetPartnerService = new FleetPartnerService(billingSettlementService);

  return {
    billingSettlementService,
    fleetPartnerService,
  };
}

describe("FleetPartnerService", () => {
  it("supports revenue share rule CRUD", async () => {
    const { fleetPartnerService } = createService();

    const created = fleetPartnerService.createRevenueShareRule(
      "fleet-demo-001",
      {
        appliesTo: "platform_source",
        sourcePlatform: "api",
        formula: "fixed_per_trip",
        fixedAmountMinor: 5000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
    );

    expect(
      fleetPartnerService
        .listRevenueShareRules("fleet-demo-001")
        .some((rule) => rule.ruleId === created.ruleId),
    ).toBe(true);

    const updated = fleetPartnerService.updateRevenueShareRule(
      "fleet-demo-001",
      created.ruleId,
      {
        fixedAmountMinor: 6500,
      },
    );
    expect(updated.fixedAmountMinor).toBe(6500);
    expect(
      fleetPartnerService.getRevenueShareRule("fleet-demo-001", created.ruleId)
        .fixedAmountMinor,
    ).toBe(6500);

    await fleetPartnerService.deleteRevenueShareRule(
      "fleet-demo-001",
      created.ruleId,
    );
    expect(
      fleetPartnerService
        .listRevenueShareRules("fleet-demo-001")
        .some((rule) => rule.ruleId === created.ruleId),
    ).toBe(false);
  });

  it("builds a monthly fleet partner statement from driver statements and applies specific rules before all_trips", async () => {
    const { fleetPartnerService } = createService();

    fleetPartnerService.createRevenueShareRule("fleet-demo-001", {
      appliesTo: "platform_source",
      sourcePlatform: "api",
      formula: "fixed_per_trip",
      fixedAmountMinor: 5000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    const statements = await fleetPartnerService.listFleetPartnerStatements(
      "fleet-demo-001",
      "2026-03",
    );

    expect(statements).toHaveLength(1);
    expect(statements[0]?.periodMonth).toBe("2026-03");
    expect(statements[0]?.lines).toHaveLength(3);
    expect(statements[0]?.grossEarningBasis.amountMinor).toBe(350000);
    expect(statements[0]?.driverNetAmountBasis.amountMinor).toBe(312500);
    expect(statements[0]?.shareAmount.amountMinor).toBe(26600);

    const apiTripLine = statements[0]?.lines.find(
      (line) => line.orderId === "order-demo-032",
    );
    expect(apiTripLine?.formula).toBe("fixed_per_trip");
    expect(apiTripLine?.shareAmount.amountMinor).toBe(5000);
  });
});
