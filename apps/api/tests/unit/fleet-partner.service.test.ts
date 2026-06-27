import { describe, expect, it, vi } from "vitest";

import type {
  DriverStatementRecord,
  FleetPartnerStatementRecord,
} from "@drts/contracts";

import type { BillingSettlementTripRecord } from "../../src/modules/billing-settlement/billing-settlement.service";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";

const money = (amountMinor: number) => ({
  currency: "NTD",
  amountMinor,
});

function createTrip(
  orderId: string,
  completedAt: string,
): BillingSettlementTripRecord {
  return {
    orderId,
    tenantId: "tenant-demo",
    driverId: "drv-demo-001",
    completedAt,
    grossFare: money(100_000),
    platformServiceFee: money(15_000),
    platformFundedDiscount: money(0),
    driverReimbursement: money(0),
    eligibleForDriverStatement: true,
    eligibleForTenantInvoice: true,
    orderSource: "tenant",
    sourcePlatform: "tenant_console",
    serviceProduct: "airport_transfer",
    businessDispatchSubtype: null,
    tenantServiceProgramId: null,
    partnerId: null,
    partnerProgramId: null,
    benefitReference: null,
    issuerAuthorizationRef: null,
  };
}

function createDriverStatement(
  statementId: string,
  feePlanVersion: string,
  multiplier = 1,
): DriverStatementRecord {
  const lines = ["order-demo-031", "order-demo-032"].map((orderId) => ({
    lineId: `${statementId}-${orderId}`,
    orderId,
    grossEarning: money(100_000 * multiplier),
    serviceFee: money(15_000 * multiplier),
    subsidy: money(0),
    netAmount: money(85_000 * multiplier),
  }));

  return {
    statementId,
    driverId: "drv-demo-001",
    periodMonth: "2026-03",
    receiptNo: `DRV-202603-${statementId}`,
    payoutStatus: "pending",
    grossEarning: money(
      lines.reduce((sum, line) => sum + line.grossEarning.amountMinor, 0),
    ),
    serviceFee: money(
      lines.reduce((sum, line) => sum + line.serviceFee.amountMinor, 0),
    ),
    subsidy: money(0),
    netAmount: money(
      lines.reduce((sum, line) => sum + line.netAmount.amountMinor, 0),
    ),
    feePlanVersion,
    lines,
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z",
  };
}

describe("FleetPartnerService statements", () => {
  it("uses the active generated driver statements instead of every historical fee-plan version", async () => {
    const activeStatement = createDriverStatement(
      "statement-active",
      "active-v2",
    );
    const staleStatement = createDriverStatement(
      "statement-stale",
      "old-v1",
      2,
    );
    const trips = [
      createTrip("order-demo-031", "2026-03-15T08:00:00.000Z"),
      createTrip("order-demo-032", "2026-03-20T08:00:00.000Z"),
    ];
    const billingSettlementService = {
      generateDriverStatements: vi.fn().mockResolvedValue({
        items: [activeStatement],
        reimbursementBatchIds: [],
      }),
      listDriverStatements: vi
        .fn()
        .mockReturnValue([activeStatement, staleStatement]),
      listSettlementTripsForPeriodMonth: vi.fn().mockResolvedValue(trips),
    };

    const service = new FleetPartnerService(
      billingSettlementService as never,
      {} as never,
      {} as never,
    );
    const partner = service.createFleetPartner({
      legalName: "E2E Fleet Partner Co., Ltd.",
      displayName: "E2E Fleet Partner",
      businessRegistrationNo: "E2E-FLEET-001",
      contactName: "Fleet Ops",
      contactPhone: "+886-2-5550-0014",
      active: true,
      partnershipType: "fleet_management",
    });
    service.createDriverFleetAffiliation("drv-demo-001", {
      fleetPartnerId: partner.fleetPartnerId,
      affiliationType: "managed_by",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: null,
    });
    service.createRevenueShareRule(partner.fleetPartnerId, {
      appliesTo: "all_trips",
      formula: "percent_of_gross",
      rateBps: 1000,
      fixedAmountMinor: null,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: null,
    });

    const [statement] = (await service.listFleetPartnerStatements(
      partner.fleetPartnerId,
      "2026-03",
    )) as FleetPartnerStatementRecord[];

    expect(statement.grossEarningBasis.amountMinor).toBe(
      activeStatement.grossEarning.amountMinor,
    );
    expect(statement.shareAmount.amountMinor).toBe(20_000);
    expect(statement.lines).toHaveLength(2);
    expect(
      billingSettlementService.listDriverStatements,
    ).not.toHaveBeenCalled();
  });
});
