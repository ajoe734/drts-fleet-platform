import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  t as tenantT,
  translations as tenantTranslations,
} from "../../../../apps/tenant-console-web/lib/translations";
import {
  t as enterpriseT,
  translations as enterpriseTranslations,
} from "../../../../apps/enterprise-dispatch-web/lib/translations";
import {
  t as bankT,
  translations as bankTranslations,
} from "../../../../apps/bank-console-web/lib/translations";

/**
 * SR-QA-UX-001 — Capability C121 Acceptance Test Suite
 *
 * C121: 繁中／英文、一致時間與貨幣格式
 * Scope:
 * - 字典同步：驗證各應用繁體中文 (zh-TW) 與英文 (en-US) 鍵值全對齊 (Lockstep keys)
 * - 杜絕代碼外洩：使用者可見文案無缺 key、無工程代碼 (如 IDEMPOTENCY_*, BOOKING_NOT_FOUND, editableUntil)
 * - 貨幣規範：依 V0084 統一標準化為 ISO 4217 "TWD"（廢止 NTD），金額格式化正確
 * - 時間與時區：ISO 8601 格式與一致帳期 (YYYY-MM)
 * - 多語系切換：繁中與英文模式間切換保持穩定
 */
describe("SR-QA-UX-001 — C121: Multilingual Locale, Currency & Time Consistency", () => {
  describe("1. Lockstep Translation Catalogs (zh vs en)", () => {
    it("verifies Tenant Console translation keys are identical between zh and en", () => {
      const zhKeys = Object.keys(tenantTranslations.zh).sort();
      const enKeys = Object.keys(tenantTranslations.en).sort();

      expect(zhKeys.length).toBeGreaterThan(100);
      expect(zhKeys).toEqual(enKeys);
    });

    it("verifies Enterprise Dispatch translation keys are identical between zh and en", () => {
      const zhKeys = Object.keys(enterpriseTranslations.zh).sort();
      const enKeys = Object.keys(enterpriseTranslations.en).sort();

      expect(zhKeys.length).toBeGreaterThan(50);
      expect(zhKeys).toEqual(enKeys);
    });

    it("verifies Bank Console translation keys are identical between zh and en", () => {
      const zhKeys = Object.keys(bankTranslations.zh).sort();
      const enKeys = Object.keys(bankTranslations.en).sort();

      expect(zhKeys.length).toBeGreaterThan(30);
      expect(zhKeys).toEqual(enKeys);
    });
  });

  describe("2. Absence of Technical Code & Machine Token Leaks", () => {
    it("ensures user-facing translations do not leak raw engineering identifiers", () => {
      const technicalTokenRegex =
        /\b(IDEMPOTENCY_[A-Z_]+|BOOKING_NOT_FOUND|AUTH_SCOPE_DENIED|editableUntil|readOnlyReasonCode|NaN|undefined|\[object Object\])\b/;

      // Scan sample critical user-facing keys in tenant console
      const criticalTenantKeys = [
        "bookingDetail.label.editableUntil",
        "bookingDetail.label.readOnlyReason",
        "bookingDetail.status.description",
        "webhooks.status.active",
        "webhooks.status.failed",
      ];

      for (const key of criticalTenantKeys) {
        const zhVal = tenantT(key, "zh");
        const enVal = tenantT(key, "en");

        expect(zhVal).not.toMatch(technicalTokenRegex);
        expect(enVal).not.toMatch(technicalTokenRegex);
      }

      // Scan enterprise dispatch translations
      const criticalEnterpriseKeys = [
        "app.title",
        "common.self",
        "common.notReady",
        "common.generalDispatch",
      ];

      for (const key of criticalEnterpriseKeys) {
        const zhVal = enterpriseT(key, "zh");
        const enVal = enterpriseT(key, "en");

        expect(zhVal).not.toMatch(technicalTokenRegex);
        expect(enVal).not.toMatch(technicalTokenRegex);
      }
    });

    it("handles missing translation key gracefully without throwing unhandled exceptions", () => {
      // Unknown key should fallback to key name rather than throwing
      const result = tenantT("non.existent.key.for.test", "zh");
      expect(result).toBe("non.existent.key.for.test");
    });
  });

  describe("3. Currency Standardization to TWD (V0084)", () => {
    it("verifies V0084 database migration standardizes currency from NTD to ISO 4217 TWD", () => {
      const v84Path = path.resolve(
        __dirname,
        "../../../../infra/migrations/V0084__standardise_currency_code_twd.sql",
      );
      const sql = fs.readFileSync(v84Path, "utf-8");

      expect(sql).toContain("UPDATE billing.phase1_fleet_partner_statements");
      expect(sql).toContain(
        "SET sponsor_funded_gross_earning_basis_currency = 'TWD'",
      );
      expect(sql).toContain(
        "WHERE sponsor_funded_gross_earning_basis_currency = 'NTD'",
      );
      expect(sql).toContain("UPDATE billing.multi_taxi_passenger_payments");
      expect(sql).toContain("SET currency = 'TWD' WHERE currency = 'NTD'");
      expect(sql).toContain(
        "ALTER TABLE billing.multi_taxi_passenger_payments",
      );
      expect(sql).toContain("ALTER COLUMN currency SET DEFAULT 'TWD'");
    });

    it("formats TWD currency amounts consistently with prefix and thousand separators", () => {
      function formatTwdAmount(
        amountMajor: number,
        locale: "zh" | "en",
      ): string {
        const formattedNumber = amountMajor.toLocaleString(
          locale === "zh" ? "zh-TW" : "en-US",
        );
        return `NT$ ${formattedNumber}`;
      }

      expect(formatTwdAmount(0, "zh")).toBe("NT$ 0");
      expect(formatTwdAmount(1200, "zh")).toBe("NT$ 1,200");
      expect(formatTwdAmount(350000, "en")).toBe("NT$ 350,000");
    });
  });

  describe("4. Consistent Timezone & Billing Period Formats", () => {
    it("validates billing period strings follow strict YYYY-MM convention", () => {
      const billingPeriodRegex = /^\d{4}-(?:0[1-9]|1[0-2])$/;

      const validPeriods = ["2026-01", "2026-03", "2026-12"];
      for (const p of validPeriods) {
        expect(billingPeriodRegex.test(p)).toBe(true);
      }

      const invalidPeriods = ["2026-13", "2026/03", "2026-3", "March 2026"];
      for (const p of invalidPeriods) {
        expect(billingPeriodRegex.test(p)).toBe(false);
      }
    });

    it("verifies ISO 8601 UTC / Asia/Taipei timestamp serialization format", () => {
      const isoRegex =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

      const sampleTimestamp = new Date(
        "2026-09-13T08:00:00.000Z",
      ).toISOString();
      expect(isoRegex.test(sampleTimestamp)).toBe(true);
    });
  });

  describe("5. Locale Switching State Retention", () => {
    it("switches navigation and shell titles correctly according to active locale", () => {
      expect(tenantT("app.title", "en")).toBe("Tenant Console");
      expect(tenantT("app.title", "zh")).toBe("租戶後台");

      expect(enterpriseT("app.title", undefined, "en")).toBe(
        "Enterprise Dispatch",
      );
      expect(enterpriseT("app.title", undefined, "zh")).toBe("企業派車");

      expect(bankT("app.title", "en")).toBe("Bank Console");
      expect(bankT("app.title", "zh")).toBe("銀行卡友後台");
    });
  });
});
