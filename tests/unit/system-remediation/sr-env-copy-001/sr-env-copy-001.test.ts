import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  normalizeServerRuntimeEnv,
  resolveRuntimeEnvironment,
  resolveRuntimeHealth,
} from "../../../../packages/ui-web/src/environment-badge/environment-resolver";
import {
  resolveRuntimeEnvironmentTier,
  RUNTIME_ENVIRONMENT_TIERS,
  RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS,
  RUNTIME_ENVIRONMENT_TIER_TONE,
} from "../../../../packages/ui-web/src/environment-badge/runtime-environment";

import {
  resolveAuthoritativeAdminShellEnv,
  t as adminT,
} from "../../../../apps/platform-admin-web/lib/translations";
import { t as opsT } from "../../../../apps/ops-console-web/lib/translations";
import {
  resolveAuthoritativeShellEnv as resolveTenantShellEnv,
  t as tenantT,
} from "../../../../apps/tenant-console-web/lib/translations";
import {
  resolveAuthoritativeFleetShellEnv,
  t as fleetT,
} from "../../../../apps/fleet-partner-portal-web/lib/translations";
import {
  resolveAuthoritativeBankShellEnv,
  t as bankT,
} from "../../../../apps/bank-console-web/lib/translations";
import {
  resolveAuthoritativeEnterpriseShellEnv,
  t as enterpriseT,
} from "../../../../apps/enterprise-dispatch-web/lib/translations";

describe("SR-ENV-COPY-001 — 各 app 環境標示與使用者文案清理", () => {
  describe("1. 驗收條件：env 從 runtime 權威值，不靠 domain 字串猜", () => {
    it("1.1 normalizeServerRuntimeEnv 正規化合法環境值並支援大小寫與空白", () => {
      expect(normalizeServerRuntimeEnv("production")).toBe("production");
      expect(normalizeServerRuntimeEnv("prod")).toBe("production");
      expect(normalizeServerRuntimeEnv("  PRODUCTION  ")).toBe("production");
      expect(normalizeServerRuntimeEnv("staging")).toBe("staging");
      expect(normalizeServerRuntimeEnv("stage")).toBe("staging");
      expect(normalizeServerRuntimeEnv("development")).toBe("development");
      expect(normalizeServerRuntimeEnv("dev")).toBe("development");
      expect(normalizeServerRuntimeEnv("preview")).toBe("preview");
      expect(normalizeServerRuntimeEnv("test")).toBe("test");
    });

    it("1.2 normalizeServerRuntimeEnv 嚴格拒絕由 URL 或 domain 字串猜測環境", () => {
      expect(normalizeServerRuntimeEnv("https://prod.drts.io")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("http://localhost:3000")).toBe(
        "unknown",
      );
      expect(normalizeServerRuntimeEnv("drts-fleet.internal")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("tenant.drts.com")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("/app/dashboard")).toBe("unknown");
    });

    it("1.3 未設定、空字串或未識別環境值保持 unknown，不預設為 production", () => {
      expect(normalizeServerRuntimeEnv(undefined)).toBe("unknown");
      expect(normalizeServerRuntimeEnv(null)).toBe("unknown");
      expect(normalizeServerRuntimeEnv("")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("   ")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("custom-env-123")).toBe("unknown");
    });

    it("1.4 resolveRuntimeEnvironmentTier 不將單獨的 NODE_ENV=production 視為正式環境", () => {
      // next build 固定將 NODE_ENV 設為 production，故不能以此作為正式部署之真值
      expect(resolveRuntimeEnvironmentTier({ NODE_ENV: "production" })).toBe(
        "unknown",
      );
      expect(
        resolveRuntimeEnvironmentTier({
          DRTS_ENV: "production",
          NODE_ENV: "production",
        }),
      ).toBe("production");
      expect(
        resolveRuntimeEnvironmentTier({
          APP_ENV: "staging",
          NODE_ENV: "production",
        }),
      ).toBe("staging");
    });

    it("1.5 mock 或 fixture 模式絕不標示為 production", () => {
      const mockEnv = resolveRuntimeEnvironment({
        env: "production",
        isFixture: true,
      });
      expect(mockEnv).toBe("mock");

      const fixtureEnv = resolveRuntimeEnvironment({
        appEnv: "prod",
        isMock: true,
      });
      expect(fixtureEnv).toBe("mock");
    });
  });

  describe("2. 驗收條件：prod 也不把未知資料標健康", () => {
    it("2.1 resolveRuntimeHealth 對 undefined、null、空值或未識別狀態回傳 unknown", () => {
      expect(resolveRuntimeHealth(undefined)).toBe("unknown");
      expect(
        resolveRuntimeHealth({ status: undefined, responseOk: true }),
      ).toBe("unknown");
      expect(resolveRuntimeHealth({ status: null, responseOk: true })).toBe(
        "unknown",
      );
      expect(resolveRuntimeHealth({ status: "", responseOk: true })).toBe(
        "unknown",
      );
      expect(
        resolveRuntimeHealth({ status: "unexpected_status", responseOk: true }),
      ).toBe("unknown");
    });

    it("2.2 resolveRuntimeHealth 正確解析健康、降級與中斷", () => {
      expect(
        resolveRuntimeHealth({ status: "healthy", responseOk: true }),
      ).toBe("healthy");
      expect(resolveRuntimeHealth({ status: "ok", responseOk: true })).toBe(
        "healthy",
      );
      expect(
        resolveRuntimeHealth({ status: "degraded", responseOk: true }),
      ).toBe("degraded");
      expect(
        resolveRuntimeHealth({ status: "warning", responseOk: true }),
      ).toBe("degraded");
      expect(resolveRuntimeHealth({ status: "down", responseOk: true })).toBe(
        "down",
      );
      expect(
        resolveRuntimeHealth({ status: "healthy", responseOk: false }),
      ).toBe("down");
    });

    it("2.3 unknown 環境與未知健康狀態均有對應 tone，非 neutral 亦非 success", () => {
      expect(RUNTIME_ENVIRONMENT_TIERS).toContain("unknown");
      expect(RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS.unknown.zhTW).toBe(
        "環境未知",
      );
      expect(RUNTIME_ENVIRONMENT_TIER_TONE.unknown).toBe("warning");
      expect(RUNTIME_ENVIRONMENT_TIER_TONE.unknown).not.toBe("neutral");
      expect(RUNTIME_ENVIRONMENT_TIER_TONE.unknown).not.toBe("success");
    });
  });

  describe("3. 驗收條件：各 app shell 的權威環境顯示解析器與 Layout 串接", () => {
    it("3.1 驗證 6 個 app layout 皆自 DRTS_ENV 讀取並使用 normalizeServerRuntimeEnv 傳遞至 Shell", () => {
      const rootDir = path.resolve(__dirname, "../../../../apps");
      const layouts = [
        "platform-admin-web/app/layout.tsx",
        "ops-console-web/app/layout.tsx",
        "tenant-console-web/app/layout.tsx",
        "fleet-partner-portal-web/app/layout.tsx",
        "bank-console-web/app/layout.tsx",
        "enterprise-dispatch-web/app/layout.tsx",
      ];

      for (const layoutPath of layouts) {
        const fullPath = path.join(rootDir, layoutPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        expect(content).toContain("normalizeServerRuntimeEnv");
        expect(content).toContain("process.env.DRTS_ENV");
      }
    });

    it("3.2 驗證 6 個 app shell 皆具備 data-environment 與 testid 支援", () => {
      const rootDir = path.resolve(__dirname, "../../../../apps");
      const shells = [
        {
          file: "platform-admin-web/components/admin-shell.tsx",
          testId: "platform-admin-env-chip",
        },
        { file: "ops-console-web/app/layout.tsx", testId: "env={" },
        {
          file: "tenant-console-web/components/tenant-shell.tsx",
          testId: "tenant-console-shell",
        },
        {
          file: "fleet-partner-portal-web/components/fleet-portal-shell.tsx",
          testId: "fleet-portal-shell",
        },
        {
          file: "bank-console-web/components/bank-shell.tsx",
          testId: "bank-console-shell",
        },
        {
          file: "enterprise-dispatch-web/components/enterprise-shell.tsx",
          testId: "enterprise-shell",
        },
      ];

      for (const item of shells) {
        const fullPath = path.join(rootDir, item.file);
        const content = fs.readFileSync(fullPath, "utf-8");
        expect(content).toContain(item.testId);
      }
    });

    it("3.3 各 app translations 權威 shell.env 解析器測試", () => {
      expect(resolveAuthoritativeAdminShellEnv("zh")).toBeTruthy();
      expect(resolveTenantShellEnv("zh")).toBeTruthy();
      expect(resolveAuthoritativeFleetShellEnv("zh")).toBeTruthy();
      expect(resolveAuthoritativeBankShellEnv("zh")).toBeTruthy();
      expect(resolveAuthoritativeEnterpriseShellEnv("zh")).toBeTruthy();
    });
  });

  describe("4. 驗收條件：文案清理（ActionIntent、submissionId、工程術語）", () => {
    it("4.1 各 app 翻譯字典中無使用者可見的 ActionIntent 內部字串", () => {
      const allAppTranslations = [
        adminT("adminShell.realm", "zh"),
        opsT("opsAssistant.bridge.empty", "zh"),
        opsT("opsAssistant.bridge.empty", "en"),
        tenantT("shell.brand.sub", "zh"),
        fleetT("app.name", "zh"),
        bankT("app.title", "zh"),
        enterpriseT("app.title", undefined, "zh"),
      ];

      for (const text of allAppTranslations) {
        expect(text).not.toContain("ActionIntent");
      }
    });

    it("4.2 ops-console-web 中的 opsAssistant 提示文案使用可用動作而非 ActionIntent", () => {
      expect(opsT("opsAssistant.bridge.empty", "zh")).toBe(
        "聚焦到支援的詳情頁後，助理才能針對該資源解析可執行的動作。",
      );
      expect(opsT("opsAssistant.bridge.empty", "en")).toBe(
        "Focus a supported detail view to let the assistant resolve available actions against that resource.",
      );
    });

    it("4.3 fleet-partner-portal-web 與 platform-admin-web 中的 submissionId 文案繁中化", () => {
      expect(
        fleetT("supply.driverField.preferredVehicleSubmissionId", "zh"),
      ).toBe("偏好車輛申請編號");
      expect(
        fleetT("supply.vehicleField.currentDriverSubmissionId", "zh"),
      ).toBe("目前司機申請編號");
      expect(
        fleetT("supply.driverField.preferredVehicleSubmissionId", "en"),
      ).toBe("Preferred vehicle application ID");
      expect(
        fleetT("supply.vehicleField.currentDriverSubmissionId", "en"),
      ).toBe("Current driver application ID");
      expect(adminT("supplyReview.err.invalidId", "zh")).toBe("無效的申請編號");
      expect(adminT("supplyReview.err.notFound", "zh")).toBe(
        "找不到該筆供給審核紀錄",
      );
    });

    it("4.4 各 app 健康狀態均支援未知狀態 (unknown)，繁中為 API 未知", () => {
      expect(opsT("opsShell.health.unknown", "zh")).toBe("API 未知");
      expect(opsT("opsShell.health.unknown", "en")).toBe("API unknown");
      expect(tenantT("shell.health.unknown", "zh")).toBe("API 未知");
      expect(tenantT("shell.health.unknown", "en")).toBe("unknown");
      expect(bankT("shell.health.unknown", "zh")).toBe("API 未知");
      expect(bankT("shell.health.unknown", "en")).toBe("unknown");
      expect(enterpriseT("shell.health.unknown", undefined, "zh")).toBe(
        "API 未知",
      );
      expect(enterpriseT("shell.health.unknown", undefined, "en")).toBe(
        "API unknown",
      );
    });
  });
});
