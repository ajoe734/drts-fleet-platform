import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  PARTNER_REFERRAL_CHANNEL_KEY,
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
  type IdentityContext,
} from "@drts/contracts";

const partnerIdentity: IdentityContext = {
  actorType: "partner_api_key",
  actorId: "partner-referral-demo-001",
  realm: "partner",
  authMode: "bootstrap_headers",
  roleFamilies: ["partner"],
  roles: ["partner"],
  scopes: ["billing:read"],
  tenantId: "tenant-demo-001",
  partnerId: "partner-referral-demo-001",
  partnerProgramId: "program-referral-community",
  partnerEntrySlug: "referral-demo-community",
  supportedExecutionModes: ["discussion_planning"],
};

describe("SR-QA-FINANCE-001 - C086 & C087: 通路分潤、對帳明細與總覽匯出", () => {
  describe("1. C086: 用量→分潤→對帳明細→CSV", () => {
    it("computes referral statement with 15% revenue share, GMV, and active riders (drts_pays_partner)", () => {
      const auditNotifications = new AuditNotificationService();
      const service = new BillingSettlementService(auditNotifications);

      const statement = service.getReferralStatement(
        "referral-demo-community",
        "2026-06",
      );

      expect(statement.channelKey).toBe(PARTNER_REFERRAL_CHANNEL_KEY);
      expect(statement.direction).toBe(REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER);
      expect(statement.totals.tripCount).toBe(2);
      expect(statement.totals.activeRiderCount).toBe(2);
      expect(statement.totals.gmv.amountMinor).toBe(150000); // 1500 NTD
      expect(statement.totals.shareTotal.amountMinor).toBe(22500); // 225 NTD (15%)
      expect(statement.lines).toHaveLength(2);
      expect(statement.lines[0]!.rateType).toBe("percent");
      expect(statement.lines[0]!.rateValue).toBe(15);
    });

    it("resolves referral revenue share rule dynamically and rejects unregistered channels", () => {
      const auditNotifications = new AuditNotificationService();
      const service = new BillingSettlementService(auditNotifications);

      const validRule = service.resolveReferralRevenueShareRule(
        "referral-demo-community",
        "2026-06-15T00:00:00Z",
      );
      expect(validRule).not.toBeNull();
      expect(validRule?.rateType).toBe("percent");
      expect(validRule?.value).toBe(15);
      expect(validRule?.settlementDirection).toBe(
        REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
      );

      const invalidRule = service.resolveReferralRevenueShareRule(
        "unregistered-channel-slug",
        "2026-06-15T00:00:00Z",
      );
      expect(invalidRule).toBeNull();
    });

    it("lists referral statement periods only when attributed rides exist", async () => {
      const auditNotifications = new AuditNotificationService();
      const service = new BillingSettlementService(auditNotifications);

      const statements = await service.listReferralStatements("referral-demo-community");
      expect(statements.length).toBeGreaterThanOrEqual(1);
      expect(statements.map((s) => s.period)).toContain("2026-06");
      expect(statements.every((s) => s.partnerEntrySlug === "referral-demo-community")).toBe(
        true,
      );
    });
  });

  describe("2. C087: 通路總覽匯出 (R26)", () => {
    it("integrates partner referral dashboard metrics with authoritative settlement statements", async () => {
      const auditNotifications = new AuditNotificationService();
      const settlements = new BillingSettlementService(auditNotifications);
      const partners = new TenantPartnerService(auditNotifications);

      const statement = settlements.getReferralStatement(
        "referral-demo-community",
        "2026-06",
      );
      const dashboard = await partners.getPartnerReferralDashboard(
        partnerIdentity,
        settlements,
        "2026-06",
      );

      expect(dashboard.period).toBe("2026-06");
      expect(dashboard.tripCount).toBe(statement.totals.tripCount);
      expect(dashboard.gmv).toEqual(statement.totals.gmv);
      expect(dashboard.estimatedShareAmount).toEqual(statement.totals.shareTotal);
    });

    it("verifies portal UI binds channel-overview-export to real report endpoint with query filters", async () => {
      const dashboardSource = await readFile(
        "apps/channel-partner-portal-web/app/dashboard/page.tsx",
        "utf8",
      );

      expect(dashboardSource).toContain('data-drt-operation="channel-overview-export"');
      expect(dashboardSource).toContain("statements/${encodeURIComponent(currentPeriod)}/artifact");
      expect(dashboardSource).toContain("download={`referral-statement-${currentPeriod}.csv`}");
    });
  });
});
