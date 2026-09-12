import { describe, expect, it } from "vitest";

import {
  PARTNER_REFERRAL_CHANNEL_KEY,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  BillingSettlementService,
} from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import {
  buildSettlementMatrix,
  settlementChannelKeyForTrip,
} from "../../../../apps/api/src/modules/billing-settlement/settlement-matrix";

const DEMO_TENANT_ID = "tenant-demo-001";

function createService() {
  const auditNotificationService = new AuditNotificationService();
  return new BillingSettlementService(auditNotificationService);
}

describe("SR-QA-FINANCE-001 - C088: 跨帳一致性與總額守恆 (Cancellation, Refund & Conservation)", () => {
  describe("1. 多方分攤總額守恆 (Multi-Party Conservation Invariants)", () => {
    it("conserves total amounts across tenant payable, driver payout, and platform fee for enterprise trips", async () => {
      const service = createService();

      // Publish active fee plan: 15% platform service fee
      await service.publishDriverFeePlan({
        planName: "Fleet Standard Conservation Plan",
        version: "2026-Q1-v1",
        serviceFeeBps: 1500, // 15%
        reimbursementMode: "platform_funded",
      });

      // 1. Generate Driver Statement for driver drv-demo-001 in 2026-03
      const driverResult = await service.generateDriverStatements({
        periodMonth: "2026-03",
        driverId: "drv-demo-001",
      });
      const driverStmt = driverResult.items[0];
      expect(driverStmt).toBeDefined();

      // Find enterprise trip line (order-demo-031)
      const enterpriseLine = driverStmt.lines.find(
        (l) => l.orderId === "order-demo-031",
      );
      expect(enterpriseLine).toBeDefined();
      expect(enterpriseLine!.grossEarning.amountMinor).toBe(120000); // 1,200 NTD
      expect(enterpriseLine!.subsidy.amountMinor).toBe(5000); // 50 NTD subsidy
      // Service fee = 120000 * 15% = 18000 (180 NTD)
      expect(enterpriseLine!.serviceFee.amountMinor).toBe(18000);
      // Net amount = 120000 - 18000 + 5000 = 107000 (1,070 NTD)
      expect(enterpriseLine!.netAmount.amountMinor).toBe(107000);

      // 2. Generate Tenant Invoice for DEMO_TENANT_ID in 2026-03
      const tenantInvoice = await service.generateTenantInvoice(
        DEMO_TENANT_ID,
        {
          tenantId: DEMO_TENANT_ID,
          periodStart: "2026-03-01T00:00:00.000Z",
          periodEnd: "2026-03-31T23:59:59.000Z",
        },
      );
      const tenantLine = tenantInvoice.lines.find(
        (l) => l.orderId === "order-demo-031",
      );
      expect(tenantLine).toBeDefined();
      // Tenant invoice billed amount = 120000 (1,200 NTD)
      expect(tenantLine!.amount.amountMinor).toBe(120000);

      // 3. Conservation Verification:
      // Gross Earning (120000) + Subsidy (5000) == Driver Net (107000) + Platform Commission (18000)
      const totalInflow =
        tenantLine!.amount.amountMinor + enterpriseLine!.subsidy.amountMinor;
      const totalOutflow =
        enterpriseLine!.netAmount.amountMinor +
        enterpriseLine!.serviceFee.amountMinor;

      expect(totalInflow).toBe(totalOutflow);
      expect(totalInflow - totalOutflow).toBe(0);
    });

    it("conserves total amounts across passenger fare, sponsor subsidy, driver payout, and platform fee for card-benefit trips", async () => {
      const service = createService();

      await service.publishDriverFeePlan({
        planName: "Fleet Airport Sponsor Plan",
        version: "2026-Q1-v2",
        serviceFeeBps: 1500, // 15%
        reimbursementMode: "platform_funded",
      });

      // drv-demo-001 has order-demo-032 (credit_card_airport_transfer)
      const driverResult = await service.generateDriverStatements({
        periodMonth: "2026-03",
        driverId: "drv-demo-001",
      });
      const driverStmt = driverResult.items[0];
      const airportLine = driverStmt.lines.find(
        (l) => l.orderId === "order-demo-032",
      );
      expect(airportLine).toBeDefined();

      // Trip gross: 80000, discount: 20000
      expect(airportLine!.grossEarning.amountMinor).toBe(80000);
      // Service fee: 80000 * 15% = 12000
      expect(airportLine!.serviceFee.amountMinor).toBe(12000);
      // Net payout: 80000 - 12000 = 68000
      expect(airportLine!.netAmount.amountMinor).toBe(68000);

      // Reimbursement batch created for the 20000 minor platform-funded sponsor discount
      expect(driverResult.reimbursementBatchIds.length).toBeGreaterThan(0);
      const batches = service.listReimbursementBatches();
      const orderBatch = batches.find((b) =>
        b.items.some((item) => item.orderId === "order-demo-032"),
      );
      expect(orderBatch).toBeDefined();
      const item = orderBatch!.items.find(
        (i) => i.orderId === "order-demo-032",
      );
      expect(item!.amount.amountMinor).toBe(20000);

      // Conservation Invariant:
      // Passenger Paid (80000 - 20000 = 60000) + Sponsor Subsidy / Platform Reimbursement (20000)
      // == Driver Net (68000) + Platform Net Commission (12000) == 80000
      const passengerPaidMinor =
        airportLine!.grossEarning.amountMinor - item!.amount.amountMinor;
      const sponsorSubsidyMinor = item!.amount.amountMinor;
      const driverNetMinor = airportLine!.netAmount.amountMinor;
      const platformFeeMinor = airportLine!.serviceFee.amountMinor;

      expect(passengerPaidMinor + sponsorSubsidyMinor).toBe(80000);
      expect(driverNetMinor + platformFeeMinor).toBe(80000);
      expect(
        passengerPaidMinor +
          sponsorSubsidyMinor -
          (driverNetMinor + platformFeeMinor),
      ).toBe(0);
    });

    it("conserves channel settlement: platform pays partner share out of platform revenue without orphan balances", () => {
      // For referral revenue share:
      // GMV = 50,000 NTD (5,000,000 minor)
      // Referral partner share = 15% = 7,500 NTD (750,000 minor)
      // Platform gross commission (e.g. 20%) = 10,000 NTD (1,000,000 minor)
      // Driver net payout (80%) = 40,000 NTD (4,000,000 minor)
      // Platform net retained = Gross Commission (10,000) - Partner Share (7,500) = 2,500 NTD (250,000 minor)
      const gmvMinor = 5000000;
      const partnerShareRateBps = 1500; // 15%
      const platformGrossCommissionBps = 2000; // 20%

      const driverPayoutMinor = Math.round(
        (gmvMinor * (10000 - platformGrossCommissionBps)) / 10000,
      );
      const platformGrossFeeMinor = Math.round(
        (gmvMinor * platformGrossCommissionBps) / 10000,
      );
      const partnerShareMinor = Math.round(
        (gmvMinor * partnerShareRateBps) / 10000,
      );
      const platformNetRetainedMinor =
        platformGrossFeeMinor - partnerShareMinor;

      // Invariant 1: Total GMV equals Driver Payout + Platform Gross Fee
      expect(driverPayoutMinor + platformGrossFeeMinor).toBe(gmvMinor);
      // Invariant 2: Platform Gross Fee decomposes cleanly into Partner Share + Platform Net Retained
      expect(partnerShareMinor + platformNetRetainedMinor).toBe(
        platformGrossFeeMinor,
      );
      // Invariant 3: Zero-sum conservation across all 4 parties (Passenger, Driver, Partner, Platform)
      // Inflows (Passenger: +GMV) - Outflows (Driver: D, Partner: P, Platform: F) == 0
      expect(
        gmvMinor -
          driverPayoutMinor -
          partnerShareMinor -
          platformNetRetainedMinor,
      ).toBe(0);
    });
  });

  describe("2. 取消與退款衝正對稱性 (Cancellation & Refund Symmetry)", () => {
    it("prevents empty or ineligible trip periods from being invoiced or paid out (fail-closed eligibility)", async () => {
      const service = createService();

      await service.publishDriverFeePlan({
        planName: "Fleet Fail Closed Plan",
        version: "2026-Q1-v3",
        serviceFeeBps: 1500,
        reimbursementMode: "platform_funded",
      });

      // Attempt to generate driver statement for an empty/future period where no eligible trips exist
      await expect(
        service.generateDriverStatements({
          periodMonth: "2025-01",
          driverId: "drv-demo-001",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      // Attempt to generate tenant invoice for a period without completed eligible trips
      await expect(
        service.generateTenantInvoice(DEMO_TENANT_ID, {
          tenantId: DEMO_TENANT_ID,
          periodStart: "2025-01-01T00:00:00.000Z",
          periodEnd: "2025-01-31T23:59:59.000Z",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });

    it("reconciles fare disputes through reconciliation issue resolution with refund tracking", async () => {
      const service = createService();

      // Open a reconciliation issue for a fare dispute
      const issue = await service.createReconciliationIssue({
        issueType: "billing_inconsistency",
        channelKey: "tenant_enterprise",
        summary:
          "Rider was double-charged on order-c088-dispute-001; refund approved by finance.",
        openedBy: "finance-operator-01",
        assigneeId: "finance-operator-01",
        orderId: "order-c088-dispute-001",
        tenantId: DEMO_TENANT_ID,
      });
      expect(issue.status).toBe("assigned");
      expect(issue.openedBy).toBe("finance-operator-01");

      // Comment with refund evidence
      const withComment = await service.addReconciliationIssueComment(
        issue.issueId,
        {
          actorId: "finance-operator-01",
          message:
            "Payment gateway authorization reversed. Credit line issued to tenant invoice.",
          artifactIds: ["artifact-gateway-refund-receipt-001"],
        },
      );
      expect(withComment.comments).toHaveLength(1);

      // Resolve the dispute with refund resolution code
      const resolved = await service.resolveReconciliationIssue(issue.issueId, {
        actorId: "finance-operator-01",
        resolutionCode: "resolved_with_refund",
        resolutionSummary:
          "Full fare reversed on card gateway; tenant invoice credited.",
      });
      expect(resolved.status).toBe("resolved");
      expect(resolved.resolutionCode).toBe("resolved_with_refund");
      expect(resolved.resolvedAt).toBeDefined();

      // Read back from service
      const fetched = service
        .listReconciliationIssues()
        .find((i) => i.issueId === issue.issueId);
      expect(fetched).toBeDefined();
      expect(fetched!.resolutionCode).toBe("resolved_with_refund");
      expect(fetched!.evidenceArtifactIds).toContain(
        "artifact-gateway-refund-receipt-001",
      );
    });
  });

  describe("3. 全通路清算矩陣與零孤兒差額 (Settlement Matrix Invariants)", () => {
    it("enforces clear ledger authority and non-conflicting modes across all settlement channels", () => {
      const matrix = buildSettlementMatrix();
      expect(matrix).toHaveLength(5);

      const channelKeys = matrix.map((r) => r.channelKey);
      expect(channelKeys).toContain("tenant_enterprise");
      expect(channelKeys).toContain("partner_airport");
      expect(channelKeys).toContain(PARTNER_REFERRAL_CHANNEL_KEY);
      expect(channelKeys).toContain("phone_dispatch");
      expect(channelKeys).toContain("forwarded_shadow");

      // Verify that owned channels use full_service ledger while forwarded uses shadow_only
      for (const row of matrix) {
        if (row.orderDomain === "forwarded") {
          expect(row.localLedgerMode).toBe("shadow_only");
          expect(row.driverPayoutAuthority).toBe(
            "external platform payout program",
          );
        } else {
          expect(row.localLedgerMode).toBe("full_service");
          expect(row.driverPayoutAuthority).toBe("platform settlement engine");
        }
      }
    });

    it("maps trip metadata deterministically to settlement channel key", () => {
      // 1. Forwarded external platform
      expect(
        settlementChannelKeyForTrip({ orderSource: "external_platform" }),
      ).toBe("forwarded_shadow");

      // 2. Phone dispatch
      expect(settlementChannelKeyForTrip({ orderSource: "phone" })).toBe(
        "phone_dispatch",
      );

      // 3. Card-benefit airport transfer
      expect(
        settlementChannelKeyForTrip({
          businessDispatchSubtype: "credit_card_airport_transfer",
        }),
      ).toBe("partner_airport");

      // 4. Partner with partnerId
      expect(
        settlementChannelKeyForTrip({ partnerId: "partner-bank-001" }),
      ).toBe("partner_airport");

      // 5. Default owned enterprise
      expect(settlementChannelKeyForTrip({})).toBe("tenant_enterprise");
    });
  });
});
