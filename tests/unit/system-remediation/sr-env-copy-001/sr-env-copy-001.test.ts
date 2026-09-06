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

import type {
  RuntimeEnvironment,
  RuntimeHealthStatus,
} from "../../../../packages/ui-web/src/environment-badge/types";

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
    expect(resolveRuntimeEnvironment({ nodeEnv: "production" })).toBe("production");
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
