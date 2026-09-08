/**
 * SR-ENV-COPY-001 Unit & Contract Tests
 *
 * Verifies:
 * 1. env comes from runtime authoritative values, never guessed from domain/URL strings.
 * 2. Fixture/mock data is never labeled as production ("fixture/dev不叫正式").
 * 3. Unknown data is never labeled as healthy ("prod也不把未知資料標健康").
 * 4. Token-backed display styling and realm alignment per @drts/ui-tokens and design canvas.
 * 5. All 6 translation files have zero occurrences of ActionIntent or raw submissionId in user-facing copy.
 * 6. Dynamic environment and health strings are present and localized.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STATUS_TONES,
  type StatusToneName,
} from "../../../../packages/ui-tokens/src/colors";

import {
  getEnvironmentDisplay,
  getHealthDisplay,
  resolveRuntimeEnvironment,
  resolveRuntimeHealth,
} from "../../../../packages/ui-web/src/environment-badge/environment-resolver";
import { EnvironmentBadge } from "../../../../packages/ui-web/src/environment-badge/environment-badge";

import {
  resolveRuntimeEnvironmentTier,
  RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS,
  RUNTIME_ENVIRONMENT_TIER_TONE,
} from "../../../../packages/ui-web/src/environment-badge/runtime-environment";

import type {
  RuntimeEnvironment,
  RuntimeHealthStatus,
} from "../../../../packages/ui-web/src/environment-badge/types";

import { t as tenantT } from "../../../../apps/tenant-console-web/lib/translations";
import { t as adminT } from "../../../../apps/platform-admin-web/lib/translations";

const REPO_ROOT = resolve(__dirname, "../../../..");

const TRANSLATION_FILES = [
  "apps/platform-admin-web/lib/translations.ts",
  "apps/ops-console-web/lib/translations.ts",
  "apps/tenant-console-web/lib/translations.ts",
  "apps/fleet-partner-portal-web/lib/translations.ts",
  "apps/bank-console-web/lib/translations.ts",
  "apps/enterprise-dispatch-web/lib/translations.ts",
];

describe("SR-ENV-COPY-001: Authority-First Runtime Environment Resolver", () => {
  it("resolves production only from explicit authoritative runtime values", () => {
    expect(resolveRuntimeEnvironment({ env: "production" })).toBe("production");
    expect(resolveRuntimeEnvironment({ env: "prod" })).toBe("production");
    expect(resolveRuntimeEnvironment({ appEnv: "PRODUCTION" })).toBe("production");
  });

  it("does not trust nodeEnv=production alone without authoritative env or appEnv", () => {
    expect(resolveRuntimeEnvironment({ nodeEnv: "production" })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ nodeEnv: "prod" })).toBe("unknown");
  });

  it("never infers environment by guessing from domain or hostname strings", () => {
    // Domain names, URLs, or internal hosts must NOT be treated as production
    expect(resolveRuntimeEnvironment({ env: "https://drts.io" })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: "https://drts.internal" })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: "api.drts.io/production" })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: "console.drts.com" })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: "app.drts.io" })).toBe("unknown");
  });

  it("never labels fixture or mock data as production ('fixture/dev不叫正式')", () => {
    // Even if env says production, if isFixture or isMock is true, it is mock
    expect(
      resolveRuntimeEnvironment({
        env: "production",
        isFixture: true,
      }),
    ).toBe("mock");

    expect(
      resolveRuntimeEnvironment({
        appEnv: "production",
        isMock: true,
      }),
    ).toBe("mock");

    expect(
      resolveRuntimeEnvironment({
        nodeEnv: "production",
        isFixture: true,
        isMock: true,
      }),
    ).toBe("mock");
  });

  it("correctly normalizes non-production environments", () => {
    expect(resolveRuntimeEnvironment({ env: "staging" })).toBe("staging");
    expect(resolveRuntimeEnvironment({ env: "stage" })).toBe("staging");
    expect(resolveRuntimeEnvironment({ env: "preview" })).toBe("preview");
    expect(resolveRuntimeEnvironment({ env: "sandbox" })).toBe("sandbox");
    expect(resolveRuntimeEnvironment({ env: "dev" })).toBe("dev");
    expect(resolveRuntimeEnvironment({ env: "development" })).toBe("dev");
    expect(resolveRuntimeEnvironment({ env: "local" })).toBe("dev");
    expect(resolveRuntimeEnvironment({ env: "mock" })).toBe("mock");
    expect(resolveRuntimeEnvironment({ env: "fixture" })).toBe("mock");
  });

  it("resolves empty, null, undefined, or unknown environments to 'unknown' rather than defaulting to production", () => {
    expect(resolveRuntimeEnvironment()).toBe("unknown");
    expect(resolveRuntimeEnvironment({})).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: "" })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: "   " })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: null })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: undefined })).toBe("unknown");
    expect(resolveRuntimeEnvironment({ env: "unrecognized_custom_env" })).toBe("unknown");
  });
});

describe("SR-ENV-COPY-001: Authority-First Health Status Resolver", () => {
  it("never marks unverified or unknown data as healthy ('prod也不把未知資料標健康')", () => {
    expect(resolveRuntimeHealth()).toBe("unknown");
    expect(resolveRuntimeHealth({})).toBe("unknown");
    expect(resolveRuntimeHealth({ status: null })).toBe("unknown");
    expect(resolveRuntimeHealth({ status: undefined })).toBe("unknown");
    expect(resolveRuntimeHealth({ status: "" })).toBe("unknown");
    expect(resolveRuntimeHealth({ status: "arbitrary_data" })).toBe("unknown");
  });

  it("returns down immediately when network response fails", () => {
    expect(resolveRuntimeHealth({ responseOk: false, status: "healthy" })).toBe("down");
    expect(resolveRuntimeHealth({ responseOk: false })).toBe("down");
  });

  it("correctly classifies verified health statuses", () => {
    expect(resolveRuntimeHealth({ status: "healthy", responseOk: true })).toBe("healthy");
    expect(resolveRuntimeHealth({ status: "ok", responseOk: true })).toBe("healthy");
    expect(resolveRuntimeHealth({ status: "UP", responseOk: true })).toBe("healthy");
    expect(resolveRuntimeHealth({ status: "degraded", responseOk: true })).toBe("degraded");
    expect(resolveRuntimeHealth({ status: "warning", responseOk: true })).toBe("degraded");
    expect(resolveRuntimeHealth({ status: "down", responseOk: true })).toBe("down");
    expect(resolveRuntimeHealth({ status: "unhealthy", responseOk: true })).toBe("down");
    expect(resolveRuntimeHealth({ status: "checking" })).toBe("checking");
  });
});

describe("SR-ENV-COPY-001: UI Tokens and Realm Design Compliance", () => {
  it("maps environment levels to strict ui-tokens status tones", () => {
    const expectations: Record<RuntimeEnvironment, StatusToneName> = {
      production: "success",
      staging: "info",
      preview: "info",
      sandbox: "warning",
      dev: "warning",
      mock: "neutral",
      unknown: "neutral",
    };

    for (const [env, expectedTone] of Object.entries(expectations) as [
      RuntimeEnvironment,
      StatusToneName,
    ][]) {
      const display = getEnvironmentDisplay(env, "light");
      expect(display.tone).toBe(expectedTone);
      expect(display.colors.fg).toBe(STATUS_TONES[expectedTone].light.fg);
      expect(display.colors.bg).toBe(STATUS_TONES[expectedTone].light.bg);
      expect(display.colors.border).toBe(STATUS_TONES[expectedTone].light.border);
      expect(display.labelZhTW.length).toBeGreaterThan(0);
      expect(display.labelEn.length).toBeGreaterThan(0);
    }
  });

  it("maps health states to correct status tones and labels", () => {
    const healthExpectations: Record<RuntimeHealthStatus, StatusToneName> = {
      healthy: "success",
      degraded: "warning",
      down: "danger",
      checking: "info",
      unknown: "neutral",
    };

    for (const [health, expectedTone] of Object.entries(healthExpectations) as [
      RuntimeHealthStatus,
      StatusToneName,
    ][]) {
      const display = getHealthDisplay(health, "light");
      expect(display.tone).toBe(expectedTone);
      expect(display.colors.fg).toBe(STATUS_TONES[expectedTone].light.fg);
      expect(display.labelZhTW.length).toBeGreaterThan(0);
      expect(display.labelEn.length).toBeGreaterThan(0);
    }
  });
});

describe("SR-ENV-COPY-001: User Copy Cleaning in Translation Catalogs", () => {
  it("ensures zero user-facing occurrences of ActionIntent across all 6 applications", () => {
    for (const relPath of TRANSLATION_FILES) {
      const fullPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(fullPath, "utf-8");

      expect(
        content,
        `File ${relPath} should not contain ActionIntent in user-facing copy`,
      ).not.toContain("ActionIntent");
    }
  });

  it("ensures zero occurrences of raw 'submissionId' in Chinese user copy across all 6 applications", () => {
    for (const relPath of TRANSLATION_FILES) {
      const fullPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(fullPath, "utf-8");

      // In Chinese translations, ensure no literal "submissionId" appears as plain text.
      // Template placeholders like {submissionId} are allowed for variable interpolation,
      // but raw un-interpolated text like "偏好車輛 submissionId" or "無效的 submissionId" must not exist.
      const lines = content.split("\n");
      const zhLinesWithRawSubmissionId = lines.filter((line) => {
        const hasChinese = /[\u4e00-\u9fa5]/.test(line);
        if (!hasChinese) return false;
        // Strip out template placeholder braces like {submissionId}
        const textWithoutPlaceholders = line.replace(/\{[a-zA-Z0-9_]+\}/g, "");
        return textWithoutPlaceholders.includes("submissionId");
      });

      expect(
        zhLinesWithRawSubmissionId,
        `File ${relPath} should not contain raw 'submissionId' in Chinese lines:\n${zhLinesWithRawSubmissionId.join("\n")}`,
      ).toEqual([]);
    }
  });

  it("ensures all 6 translation catalogs provide dynamic environment strings", () => {
    for (const relPath of TRANSLATION_FILES) {
      const fullPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(fullPath, "utf-8");

      // Verify that environment keys exist in each translation catalog
      const hasEnvKeys =
        content.includes(".environment") || content.includes(".env");
      expect(
        hasEnvKeys,
        `File ${relPath} must provide environment translation keys`,
      ).toBe(true);

      // Verify presence of Traditional Chinese environment labels
      expect(
        content.includes("正式環境"),
        `File ${relPath} must include '正式環境'`,
      ).toBe(true);
      expect(
        content.includes("開發環境") || content.includes("預覽環境"),
        `File ${relPath} must include non-production environment label`,
      ).toBe(true);
    }
  });
});

describe("SR-ENV-COPY-001: Runtime Environment Tier Resolver", () => {
  it("resolves production from DRTS_ENV, taking precedence over APP_ENV and NODE_ENV", () => {
    expect(
      resolveRuntimeEnvironmentTier({
        DRTS_ENV: "production",
        APP_ENV: "staging",
        NODE_ENV: "production",
      }),
    ).toBe("production");
  });

  it("falls back to APP_ENV when DRTS_ENV is absent", () => {
    expect(
      resolveRuntimeEnvironmentTier({ APP_ENV: "staging", NODE_ENV: "production" }),
    ).toBe("staging");
  });

  it("does not trust NODE_ENV=production alone as proof of a real production deploy", () => {
    expect(resolveRuntimeEnvironmentTier({ NODE_ENV: "production" })).toBe(
      "unknown",
    );
    expect(
      resolveRuntimeEnvironmentTier({ APP_ENV: "staging", NODE_ENV: "production" }),
    ).toBe("staging");
  });

  it("resolves local/test tiers", () => {
    expect(resolveRuntimeEnvironmentTier({ NODE_ENV: "development" })).toBe(
      "local",
    );
    expect(resolveRuntimeEnvironmentTier({ DRTS_ENV: "sandbox" })).toBe(
      "local",
    );
    expect(resolveRuntimeEnvironmentTier({ NODE_ENV: "test" })).toBe("test");
    expect(resolveRuntimeEnvironmentTier({ CI: "true" })).toBe("test");
  });

  it("never guesses a healthy-looking tier for unrecognized or missing signals", () => {
    expect(resolveRuntimeEnvironmentTier({})).toBe("unknown");
    expect(
      resolveRuntimeEnvironmentTier({ DRTS_ENV: "some-custom-value" }),
    ).toBe("unknown");
  });

  it("every tier has a localized label and a non-neutral-for-unknown tone", () => {
    for (const tier of Object.keys(
      RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS,
    ) as (keyof typeof RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS)[]) {
      expect(RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS[tier].en).toBeTruthy();
      expect(RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS[tier].zhTW).toBeTruthy();
    }
    expect(RUNTIME_ENVIRONMENT_TIER_TONE.unknown).not.toBe("neutral");
    expect(RUNTIME_ENVIRONMENT_TIER_TONE.unknown).not.toBe("success");
    expect(RUNTIME_ENVIRONMENT_TIER_TONE.production).toBe("danger");
  });
});

describe("SR-ENV-COPY-001: EnvironmentBadge Component Regression Tests", () => {
  it("applies source override on every path: tier=production with isFixture=true renders mock, never production", () => {
    const elZh = EnvironmentBadge({ tier: "production", isFixture: true, locale: "zh-TW" });
    expect(elZh.props["data-environment"]).toBe("mock");
    expect(elZh.props["data-environment-tier"]).toBe("local");
    expect(elZh.props["data-tone"]).toBe("neutral");
    // Verify children text contains 模擬資料, not 正式環境
    const textChild = elZh.props.children[1];
    expect(textChild.props.children).toBe("模擬資料");

    const elEn = EnvironmentBadge({ tier: "production", isFixture: true, locale: "en" });
    expect(elEn.props["data-environment"]).toBe("mock");
    expect(elEn.props["data-environment-tier"]).toBe("local");
    expect(elEn.props["data-tone"]).toBe("neutral");
    const textChildEn = elEn.props.children[1];
    expect(textChildEn.props.children).toBe("MOCK DATA");
  });

  it("applies source override on every path: tier=production with isMock=true renders mock, never production", () => {
    const el = EnvironmentBadge({ tier: "production", isMock: true, locale: "zh-TW" });
    expect(el.props["data-environment"]).toBe("mock");
    expect(el.props["data-environment-tier"]).toBe("local");
    expect(el.props["data-tone"]).toBe("neutral");
    const textChild = el.props.children[1];
    expect(textChild.props.children).toBe("模擬資料");
  });

  it("applies source override on every path: env=production with isFixture=true renders mock, never production", () => {
    const el = EnvironmentBadge({ env: "production", isFixture: true, locale: "zh-TW" });
    expect(el.props["data-environment"]).toBe("mock");
    expect(el.props["data-environment-tier"]).toBe("local");
    expect(el.props["data-tone"]).toBe("neutral");
    const textChild = el.props.children[1];
    expect(textChild.props.children).toBe("模擬資料");
  });

  it("renders production only when tier=production and no fixture/mock flag is present", () => {
    const elZh = EnvironmentBadge({ tier: "production", locale: "zh-TW" });
    expect(elZh.props["data-environment"]).toBe("production");
    expect(elZh.props["data-environment-tier"]).toBe("production");
    expect(elZh.props["data-tone"]).toBe("success");
    const textChild = elZh.props.children[1];
    expect(textChild.props.children).toBe("正式環境");

    const elEn = EnvironmentBadge({ env: "production", locale: "en" });
    expect(elEn.props["data-environment"]).toBe("production");
    expect(elEn.props["data-environment-tier"]).toBe("production");
    expect(elEn.props["data-tone"]).toBe("success");
    const textChildEn = elEn.props.children[1];
    expect(textChildEn.props.children).toBe("PRODUCTION");
  });

  it("correctly renders non-production tiers without guessing", () => {
    const elLocal = EnvironmentBadge({ tier: "local", locale: "zh-TW" });
    expect(elLocal.props["data-environment"]).toBe("dev");
    expect(elLocal.props["data-environment-tier"]).toBe("local");

    const elTest = EnvironmentBadge({ tier: "test", locale: "zh-TW" });
    expect(elTest.props["data-environment"]).toBe("preview");
    expect(elTest.props["data-environment-tier"]).toBe("test");

    const elUnknown = EnvironmentBadge({ tier: "unknown", locale: "zh-TW" });
    expect(elUnknown.props["data-environment"]).toBe("unknown");
    expect(elUnknown.props["data-environment-tier"]).toBe("unknown");

    const elEmpty = EnvironmentBadge({});
    expect(elEmpty.props["data-environment"]).toBe("unknown");
    expect(elEmpty.props["data-environment-tier"]).toBe("unknown");
  });
});

describe("SR-ENV-COPY-001: Translation Catalogs Default Environment Safety", () => {
  it("ensures default shell.env and adminShell.environment never default to production or 正式環境", () => {
    for (const relPath of TRANSLATION_FILES) {
      const fullPath = resolve(REPO_ROOT, relPath);
      const content = readFileSync(fullPath, "utf-8");

      // Neither shell.env nor adminShell.environment default key may be "production" or "正式環境"
      const defaultShellEnvMatches = content.match(
        /"(shell\.env|adminShell\.environment)"\s*:\s*"(production|正式環境)"/g,
      );
      expect(
        defaultShellEnvMatches,
        `File ${relPath} must not have default shell.env/adminShell.environment set to production/正式環境`,
      ).toBeNull();

      // Neither shell.env nor adminShell.environment default key may be statically hardcoded to "preview" or "預覽環境"
      const hardcodedPreviewMatches = content.match(
        /"(shell\.env|adminShell\.environment)"\s*:\s*"(preview|預覽環境)"/g,
      );
      expect(
        hardcodedPreviewMatches,
        `File ${relPath} must not have static hardcoded preview for shell.env/adminShell.environment`,
      ).toBeNull();
    }
  });

  it("dynamically resolves tenant shell.env from runtime environment variables (never static preview)", () => {
    const originalDrtsEnv = process.env.DRTS_ENV;
    const originalAppEnv = process.env.APP_ENV;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      // Test production runtime
      process.env.DRTS_ENV = "production";
      expect(tenantT("shell.env", "en")).toBe("production");
      expect(tenantT("shell.env", "zh")).toBe("正式環境");

      // Test staging runtime
      process.env.DRTS_ENV = "staging";
      expect(tenantT("shell.env", "en")).toBe("staging");
      expect(tenantT("shell.env", "zh")).toBe("預發環境");

      // Test preview runtime
      process.env.DRTS_ENV = "preview";
      expect(tenantT("shell.env", "en")).toBe("preview");
      expect(tenantT("shell.env", "zh")).toBe("預覽環境");

      // Test sandbox runtime
      process.env.DRTS_ENV = "sandbox";
      expect(tenantT("shell.env", "en")).toBe("sandbox");
      expect(tenantT("shell.env", "zh")).toBe("沙盒環境");

      // Test dev runtime
      process.env.DRTS_ENV = "development";
      expect(tenantT("shell.env", "en")).toBe("development");
      expect(tenantT("shell.env", "zh")).toBe("開發環境");

      // Test mock runtime
      process.env.DRTS_ENV = "mock";
      expect(tenantT("shell.env", "en")).toBe("mock data");
      expect(tenantT("shell.env", "zh")).toBe("模擬資料");

      // Test unknown: URL / domain guessing rejected
      process.env.DRTS_ENV = "https://tenant.drts.io";
      expect(tenantT("shell.env", "en")).toBe("unknown");
      expect(tenantT("shell.env", "zh")).toBe("未知環境");

      // Test unknown: NODE_ENV=production alone does NOT claim production
      delete process.env.DRTS_ENV;
      delete process.env.APP_ENV;
      process.env.NODE_ENV = "production";
      expect(tenantT("shell.env", "en")).toBe("unknown");
      expect(tenantT("shell.env", "zh")).toBe("未知環境");
    } finally {
      if (originalDrtsEnv !== undefined) process.env.DRTS_ENV = originalDrtsEnv;
      else delete process.env.DRTS_ENV;
      if (originalAppEnv !== undefined) process.env.APP_ENV = originalAppEnv;
      else delete process.env.APP_ENV;
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
      else delete process.env.NODE_ENV;
    }
  });

  it("dynamically resolves platform adminShell.environment from runtime environment variables (never static preview)", () => {
    const originalDrtsEnv = process.env.DRTS_ENV;
    const originalAppEnv = process.env.APP_ENV;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      // Test production runtime
      process.env.DRTS_ENV = "production";
      expect(adminT("adminShell.environment", "en")).toBe("production");
      expect(adminT("adminShell.environment", "zh")).toBe("正式環境");

      // Test staging runtime
      process.env.DRTS_ENV = "staging";
      expect(adminT("adminShell.environment", "en")).toBe("staging");
      expect(adminT("adminShell.environment", "zh")).toBe("預發環境");

      // Test preview runtime
      process.env.DRTS_ENV = "preview";
      expect(adminT("adminShell.environment", "en")).toBe("preview");
      expect(adminT("adminShell.environment", "zh")).toBe("預覽環境");

      // Test sandbox runtime
      process.env.DRTS_ENV = "sandbox";
      expect(adminT("adminShell.environment", "en")).toBe("sandbox");
      expect(adminT("adminShell.environment", "zh")).toBe("沙盒環境");

      // Test dev runtime
      process.env.DRTS_ENV = "development";
      expect(adminT("adminShell.environment", "en")).toBe("development");
      expect(adminT("adminShell.environment", "zh")).toBe("開發環境");

      // Test mock runtime
      process.env.DRTS_ENV = "mock";
      expect(adminT("adminShell.environment", "en")).toBe("mock data");
      expect(adminT("adminShell.environment", "zh")).toBe("模擬資料");

      // Test unknown: URL / domain guessing rejected
      process.env.DRTS_ENV = "https://admin.drts.internal";
      expect(adminT("adminShell.environment", "en")).toBe("unknown");
      expect(adminT("adminShell.environment", "zh")).toBe("未知環境");

      // Test unknown: NODE_ENV=production alone does NOT claim production
      delete process.env.DRTS_ENV;
      delete process.env.APP_ENV;
      process.env.NODE_ENV = "production";
      expect(adminT("adminShell.environment", "en")).toBe("unknown");
      expect(adminT("adminShell.environment", "zh")).toBe("未知環境");
    } finally {
      if (originalDrtsEnv !== undefined) process.env.DRTS_ENV = originalDrtsEnv;
      else delete process.env.DRTS_ENV;
      if (originalAppEnv !== undefined) process.env.APP_ENV = originalAppEnv;
      else delete process.env.APP_ENV;
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
      else delete process.env.NODE_ENV;
    }
  });
});
