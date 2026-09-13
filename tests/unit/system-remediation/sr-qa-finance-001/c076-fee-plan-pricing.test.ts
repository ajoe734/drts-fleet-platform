import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

function createService() {
  const auditNotificationService = new AuditNotificationService();
  return new BillingSettlementService(auditNotificationService, undefined, {
    listReconciliationIssues: () => [],
  } as any);
}

describe("SR-QA-FINANCE-001 - C076: 費率草稿、比較、發布與不可變快照", () => {
  describe("1. Fee Plan Publication and Validation", () => {
    it("publishes a valid driver fee plan and records snapshot metadata", async () => {
      const service = createService();

      const published = await service.publishDriverFeePlan({
        planName: "Standard Fleet Fee Plan",
        version: "2026-Q2-v1",
        serviceFeeBps: 1200, // 12%
        reimbursementMode: "platform_funded",
      });

      expect(published.feePlanId).toBeDefined();
      expect(published.planName).toBe("Standard Fleet Fee Plan");
      expect(published.version).toBe("2026-Q2-v1");
      expect(published.serviceFeeBps).toBe(1200);
      expect(published.reimbursementMode).toBe("platform_funded");
      expect(published.status).toBe("published");
      expect(published.publishedAt).toBeDefined();

      const plans = service.listDriverFeePlans();
      expect(plans).toHaveLength(1);
      expect(plans[0]!.version).toBe("2026-Q2-v1");
    });

    it("rejects duplicate planName and version with FEE_PLAN_IMMUTABLE (409 Conflict)", async () => {
      const service = createService();

      await service.publishDriverFeePlan({
        planName: "Standard Fleet Fee Plan",
        version: "2026-Q2-v1",
        serviceFeeBps: 1200,
        reimbursementMode: "platform_funded",
      });

      await expect(
        service.publishDriverFeePlan({
          planName: "Standard Fleet Fee Plan",
          version: "2026-Q2-v1",
          serviceFeeBps: 1500,
          reimbursementMode: "mixed",
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: "FEE_PLAN_IMMUTABLE",
      });
    });

    it("validates that planName and version cannot be blank", async () => {
      const service = createService();

      await expect(
        service.publishDriverFeePlan({
          planName: "   ",
          version: "2026-06",
          serviceFeeBps: 1000,
          reimbursementMode: "platform_funded",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });

      await expect(
        service.publishDriverFeePlan({
          planName: "Valid Name",
          version: "   ",
          serviceFeeBps: 1000,
          reimbursementMode: "platform_funded",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
    });
  });

  describe("2. Immutable Snapshot vs New Statements", () => {
    it("applies latest published fee plan to newly generated driver statements while preserving past snapshot", async () => {
      const service = createService();

      // Publish initial plan v1 (10%)
      await service.publishDriverFeePlan({
        planName: "Platform Tier Plan",
        version: "2026-03",
        serviceFeeBps: 1000,
        reimbursementMode: "platform_funded",
      });

      // Generate statements for March
      const marchStatements = await service.generateDriverStatements({
        periodMonth: "2026-03",
      });
      expect(marchStatements.items.length).toBeGreaterThan(0);
      const marchSnapshotVersion = marchStatements.items[0]!.feePlanVersion;
      expect(marchSnapshotVersion).toBe("2026-03");

      // Now publish updated plan v2 (15%)
      await service.publishDriverFeePlan({
        planName: "Platform Tier Plan",
        version: "2026-04",
        serviceFeeBps: 1500,
        reimbursementMode: "platform_funded",
      });

      // Query past statements: historical statement still has v1 snapshot
      const pastStatements = await service.listDriverStatements();
      const pastMarchStatement = pastStatements.find(
        (stmt) => stmt.periodMonth === "2026-03",
      );
      expect(pastMarchStatement?.feePlanVersion).toBe("2026-03");
      expect(pastMarchStatement?.feePlanVersion).not.toBe("2026-04");

      // Verify active fee plan is now v2
      const allPlans = service.listDriverFeePlans();
      expect(allPlans[0]!.version).toBe("2026-04");
    });
  });
});
