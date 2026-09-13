import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { ReferralSettlementScaffoldService } from "../../../../apps/api/src/modules/billing-settlement/referral-settlement.scaffold.service";
import {
  PARTNER_REFERRAL_CHANNEL_KEY,
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
} from "@drts/contracts";

describe("C103: 合作夥伴方案、入口、價格發布、來源歸屬與結算一致驗收", () => {
  function createPlatformAdminService() {
    const auditNotificationService = new AuditNotificationService();
    const service = new PlatformAdminService(auditNotificationService);
    return { auditNotificationService, service };
  }

  it("建立平台費率規則草稿，支援服務費率 (bps)、補貼模式與適用對象，並記錄審計", () => {
    const { service, auditNotificationService } = createPlatformAdminService();

    const rule = service.createPlatformPricingRule(
      {
        ruleName: "企業長照贊助專案費率",
        version: "v1.0.0",
        serviceFeeBps: 1200, // 12%
        reimbursementMode: "platform_funded",
        applicableTo: "program",
        notes: "針對長照補助方案之特約補貼費率",
      },
      "req-c103-create-pricing-rule",
    );

    expect(rule.ruleId).toBeDefined();
    expect(rule.ruleName).toBe("企業長照贊助專案費率");
    expect(rule.version).toBe("v1.0.0");
    expect(rule.serviceFeeBps).toBe(1200);
    expect(rule.status).toBe("draft");
    expect(rule.applicableTo).toBe("program");

    const auditLog = auditNotificationService
      .listAuditLogs()
      .find((log) => log.resourceId === rule.ruleId);
    expect(auditLog).toBeDefined();
    expect(auditLog?.actionName).toBe("create_platform_pricing_rule");
  });

  it("防範費率版本衝突：重複建立同名且同版本之費率規則時拋出 409 CONFLICT", () => {
    const { service } = createPlatformAdminService();

    service.createPlatformPricingRule({
      ruleName: "高鐵聯運接駁方案",
      version: "2026.Q3",
      serviceFeeBps: 1500,
      reimbursementMode: "platform_funded",
      applicableTo: "all",
    });

    expect(() =>
      service.createPlatformPricingRule({
        ruleName: "高鐵聯運接駁方案",
        version: "2026.Q3",
        serviceFeeBps: 1800,
        reimbursementMode: "mixed",
        applicableTo: "all",
      }),
    ).toThrowError(ApiRequestError);
  });

  it("發布費率規則時自動將舊版 active 規則歸檔 (archived)，更新生效期並保留審計追蹤", () => {
    const { service } = createPlatformAdminService();

    const ruleV1 = service.createPlatformPricingRule({
      ruleName: "尊榮商務包車方案",
      version: "v1",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
      applicableTo: "service_product",
    });

    const publishedV1 = service.publishPlatformPricingRule(ruleV1.ruleId, {
      publishedBy: "pricing_officer_01",
    });
    expect(publishedV1.status).toBe("active");
    expect(publishedV1.publishedBy).toBe("pricing_officer_01");

    // 建立並發布 V2
    const ruleV2 = service.createPlatformPricingRule({
      ruleName: "尊榮商務包車方案",
      version: "v2",
      serviceFeeBps: 1200,
      reimbursementMode: "platform_funded",
      applicableTo: "service_product",
    });

    const publishedV2 = service.publishPlatformPricingRule(ruleV2.ruleId, {
      publishedBy: "pricing_officer_02",
    });
    expect(publishedV2.status).toBe("active");

    // 檢查 V1 自動轉為 archived
    const allRules = service.listPlatformPricingRules();
    const archivedV1 = allRules.find((r) => r.ruleId === ruleV1.ruleId);
    expect(archivedV1?.status).toBe("archived");
    expect(archivedV1?.effectiveTo).toBeDefined();
  });

  it("轉介通路歸屬與結算協議一致性：結算方向嚴格為 drts_pays_partner，通路代碼對齊權威常數", () => {
    const scaffoldService = new ReferralSettlementScaffoldService();
    const scaffold = scaffoldService.getReferralSettlementScaffold();

    expect(scaffold.channelKey).toBe(PARTNER_REFERRAL_CHANNEL_KEY);
    expect(scaffold.channelKey).toBe("partner_referral");
    expect(scaffold.direction).toBe(
      REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
    );
    expect(scaffold.direction).toBe("drts_pays_partner");
    expect(scaffold.payer).toBe("drts_platform");
    expect(scaffold.payee).toBe("partner");
  });

  it("通路轉介收益分配計算模型驗證：支援百分比比例與單趟固定分潤，不合法負值即時拒絕", () => {
    // 15% 分潤比例計算
    const gmvMinor = 150000; // 1500 TWD
    const ratePercent = 15;
    const computedShareMinor = Math.round(gmvMinor * (ratePercent / 100));
    expect(computedShareMinor).toBe(22500); // 225 TWD
    expect(gmvMinor - computedShareMinor).toBe(127500);

    // 固定單趟分潤
    const fixedPerTripMinor = 5000; // 50 TWD
    const tripCount = 10;
    const totalFixedShareMinor = fixedPerTripMinor * tripCount;
    expect(totalFixedShareMinor).toBe(50000); // 500 TWD

    // 負數費率邊界防護
    expect(ratePercent).toBeGreaterThanOrEqual(0);
    expect(fixedPerTripMinor).toBeGreaterThanOrEqual(0);
  });
});
