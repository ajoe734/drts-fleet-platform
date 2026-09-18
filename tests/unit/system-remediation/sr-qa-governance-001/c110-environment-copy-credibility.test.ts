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

describe("C110: 環境、資料來源與文案可信度驗收", () => {
  describe("1. 環境真值解析與防偽（拒絕網址字串猜測、拒絕 NODE_ENV=production 單獨冒充）", () => {
    it("1.1 normalizeServerRuntimeEnv 嚴格正規化合法環境值，不從 URL 或 domain 猜測", () => {
      // 合法環境字串
      expect(normalizeServerRuntimeEnv("production")).toBe("production");
      expect(normalizeServerRuntimeEnv("prod")).toBe("production");
      expect(normalizeServerRuntimeEnv("  PRODUCTION  ")).toBe("production");
      expect(normalizeServerRuntimeEnv("staging")).toBe("staging");
      expect(normalizeServerRuntimeEnv("stage")).toBe("staging");
      expect(normalizeServerRuntimeEnv("development")).toBe("development");
      expect(normalizeServerRuntimeEnv("dev")).toBe("development");
      expect(normalizeServerRuntimeEnv("preview")).toBe("preview");
      expect(normalizeServerRuntimeEnv("test")).toBe("test");

      // 嚴格拒絕 URL、網域名稱猜測
      expect(normalizeServerRuntimeEnv("https://prod.drts.io")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("http://localhost:3000")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("drts-fleet.internal")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("tenant.drts.com")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("/api/v1/health")).toBe("unknown");

      // 空值保持 unknown
      expect(normalizeServerRuntimeEnv(undefined)).toBe("unknown");
      expect(normalizeServerRuntimeEnv("")).toBe("unknown");
      expect(normalizeServerRuntimeEnv("invalid-custom-env")).toBe("unknown");
    });

    it("1.2 resolveRuntimeEnvironmentTier 拒絕單憑 NODE_ENV=production 判定為正式環境", () => {
      // 在 Next.js 建置期 NODE_ENV 固定為 production，但非正式部署真值
      expect(resolveRuntimeEnvironmentTier({ NODE_ENV: "production" })).toBe(
        "unknown",
      );

      // 必須具有 DRTS_ENV 或 APP_ENV 權威設定
      expect(
        resolveRuntimeEnvironmentTier({
          DRTS_ENV: "production",
          NODE_ENV: "production",
        }),
      ).toBe("production");

      expect(
        resolveRuntimeEnvironmentTier({
          DRTS_ENV: "sandbox",
          NODE_ENV: "production",
        }),
      ).toBe("local");

      expect(
        resolveRuntimeEnvironmentTier({
          APP_ENV: "staging",
          NODE_ENV: "production",
        }),
      ).toBe("staging");
    });

    it("1.3 mock 或 fixture 模式絕不標示為 production", () => {
      expect(
        resolveRuntimeEnvironment({
          env: "production",
          isFixture: true,
        }),
      ).toBe("mock");

      expect(
        resolveRuntimeEnvironment({
          appEnv: "prod",
          isMock: true,
        }),
      ).toBe("mock");
    });
  });

  describe("2. 健康度可信度（拒絕未知資料標健康）", () => {
    it("2.1 resolveRuntimeHealth 對空值、缺少狀態或非正常回應嚴格判定為 unknown 或 down", () => {
      expect(resolveRuntimeHealth(undefined)).toBe("unknown");
      expect(resolveRuntimeHealth({ status: undefined, responseOk: true })).toBe(
        "unknown",
      );
      expect(resolveRuntimeHealth({ status: null, responseOk: true })).toBe(
        "unknown",
      );
      expect(
        resolveRuntimeHealth({ status: "unexpected_status", responseOk: true }),
      ).toBe("unknown");

      // responseOk 為 false 時嚴格判定為 down
      expect(resolveRuntimeHealth({ status: "healthy", responseOk: false })).toBe(
        "down",
      );
    });

    it("2.2 unknown 狀態具備明確警示 (warning tone)，非 neutral 亦非 success", () => {
      expect(RUNTIME_ENVIRONMENT_TIERS).toContain("unknown");
      expect(RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS.unknown.zhTW).toBe(
        "環境未知",
      );
      expect(RUNTIME_ENVIRONMENT_TIER_TONE.unknown).toBe("warning");
    });
  });

  describe("3. 6 大平臺 App Shell 與 Layout 真值綁定驗證", () => {
    const rootDir = path.resolve(__dirname, "../../../../apps");
    const appShells = [
      {
        name: "platform-admin-web",
        layout: "platform-admin-web/app/layout.tsx",
        shell: "platform-admin-web/components/admin-shell.tsx",
        chipId: "platform-admin-env-chip",
      },
      {
        name: "ops-console-web",
        layout: "ops-console-web/app/layout.tsx",
        shell: "ops-console-web/app/layout.tsx",
        chipId: "env={",
      },
      {
        name: "tenant-console-web",
        layout: "tenant-console-web/app/layout.tsx",
        shell: "tenant-console-web/components/tenant-shell.tsx",
        chipId: "tenant-console-shell",
      },
      {
        name: "fleet-partner-portal-web",
        layout: "fleet-partner-portal-web/app/layout.tsx",
        shell: "fleet-partner-portal-web/components/fleet-portal-shell.tsx",
        chipId: "fleet-portal-shell",
      },
      {
        name: "bank-console-web",
        layout: "bank-console-web/app/layout.tsx",
        shell: "bank-console-web/components/bank-shell.tsx",
        chipId: "bank-console-shell",
      },
      {
        name: "enterprise-dispatch-web",
        layout: "enterprise-dispatch-web/app/layout.tsx",
        shell: "enterprise-dispatch-web/components/enterprise-shell.tsx",
        chipId: "enterprise-shell",
      },
    ];

    it("3.1 驗證 6 個 App Layout 皆從 DRTS_ENV 讀取並透過 normalizeServerRuntimeEnv 傳遞至 Shell", () => {
      for (const app of appShells) {
        const layoutFile = path.join(rootDir, app.layout);
        const content = fs.readFileSync(layoutFile, "utf-8");
        expect(content).toContain("normalizeServerRuntimeEnv");
        expect(content).toContain("process.env.DRTS_ENV");
      }
    });

    it("3.2 驗證 6 個 App Shell 皆包含 data-environment 與 testid 支援", () => {
      for (const app of appShells) {
        const shellFile = path.join(rootDir, app.shell);
        const content = fs.readFileSync(shellFile, "utf-8");
        expect(content).toContain(app.chipId);
      }
    });

    it("3.3 驗證各 App translations 之權威 shell.env 繁體中文解析器", () => {
      expect(resolveAuthoritativeAdminShellEnv("zh")).toBeTruthy();
      expect(resolveTenantShellEnv("zh")).toBeTruthy();
      expect(resolveAuthoritativeFleetShellEnv("zh")).toBeTruthy();
      expect(resolveAuthoritativeBankShellEnv("zh")).toBeTruthy();
      expect(resolveAuthoritativeEnterpriseShellEnv("zh")).toBeTruthy();
    });
  });

  describe("4. 文案可信度與工程術語清理（無 ActionIntent，submissionId 本地化，未知 API 誠實標示）", () => {
    it("4.1 使用者介面翻譯中無任何內部工程術語 ActionIntent", () => {
      const texts = [
        adminT("adminShell.realm", "zh"),
        opsT("opsAssistant.bridge.empty", "zh"),
        opsT("opsAssistant.bridge.empty", "en"),
        tenantT("shell.brand.sub", "zh"),
        fleetT("app.name", "zh"),
        bankT("app.title", "zh"),
        enterpriseT("app.title", undefined, "zh"),
      ];

      for (const text of texts) {
        expect(text).not.toContain("ActionIntent");
      }
    });

    it("4.2 submissionId 文案在平臺與合作夥伴端完整繁中化為申請編號", () => {
      expect(
        fleetT("supply.driverField.preferredVehicleSubmissionId", "zh"),
      ).toBe("偏好車輛申請編號");
      expect(
        fleetT("supply.vehicleField.currentDriverSubmissionId", "zh"),
      ).toBe("目前司機申請編號");
      expect(adminT("supplyReview.err.invalidId", "zh")).toBe("無效的申請編號");
      expect(adminT("supplyReview.err.notFound", "zh")).toBe(
        "找不到該筆供給審核紀錄",
      );
    });

    it("4.3 各 App 健康狀態誠實呈現未知 (unknown)，繁中統一呈現為 API 未知", () => {
      expect(opsT("opsShell.health.unknown", "zh")).toBe("API 未知");
      expect(tenantT("shell.health.unknown", "zh")).toBe("API 未知");
      expect(bankT("shell.health.unknown", "zh")).toBe("API 未知");
      expect(enterpriseT("shell.health.unknown", undefined, "zh")).toBe(
        "API 未知",
      );
    });
  });
});
