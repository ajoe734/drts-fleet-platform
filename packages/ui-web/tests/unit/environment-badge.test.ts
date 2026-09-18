import { describe, expect, it } from "vitest";
import {
  resolveRuntimeEnvironmentTier,
  RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS,
  RUNTIME_ENVIRONMENT_TIER_TONE,
} from "../../src/environment-badge/runtime-environment";
import {
  normalizeServerRuntimeEnv,
  resolveRuntimeEnvironment,
  resolveRuntimeHealth,
} from "../../src/environment-badge/environment-resolver";

describe("resolveRuntimeEnvironmentTier", () => {
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
      resolveRuntimeEnvironmentTier({
        APP_ENV: "staging",
        NODE_ENV: "production",
      }),
    ).toBe("staging");
  });

  it("does not trust NODE_ENV=production alone as proof of a real production deploy", () => {
    // `next build` always bakes NODE_ENV=production into the bundle, even for
    // staging/dev deployments. Without an explicit DRTS_ENV/APP_ENV signal,
    // NODE_ENV=production must resolve to `unknown`.
    expect(resolveRuntimeEnvironmentTier({ NODE_ENV: "production" })).toBe(
      "unknown",
    );
    expect(
      resolveRuntimeEnvironmentTier({
        APP_ENV: "staging",
        NODE_ENV: "production",
      }),
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

describe("normalizeServerRuntimeEnv", () => {
  it("normalizes explicit valid environment values", () => {
    expect(normalizeServerRuntimeEnv("development")).toBe("development");
    expect(normalizeServerRuntimeEnv("dev")).toBe("development");
    expect(normalizeServerRuntimeEnv("staging")).toBe("staging");
    expect(normalizeServerRuntimeEnv("stage")).toBe("staging");
    expect(normalizeServerRuntimeEnv("production")).toBe("production");
    expect(normalizeServerRuntimeEnv("prod")).toBe("production");
    expect(normalizeServerRuntimeEnv("preview")).toBe("preview");
    expect(normalizeServerRuntimeEnv("test")).toBe("test");
  });

  it("handles case-insensitivity and whitespace", () => {
    expect(normalizeServerRuntimeEnv("  PRODUCTION  ")).toBe("production");
    expect(normalizeServerRuntimeEnv("  Dev  ")).toBe("development");
    expect(normalizeServerRuntimeEnv("Staging")).toBe("staging");
    expect(normalizeServerRuntimeEnv("  PREVIEW ")).toBe("preview");
  });

  it("rejects URL and domain guessing", () => {
    expect(normalizeServerRuntimeEnv("https://drts.io")).toBe("unknown");
    expect(normalizeServerRuntimeEnv("http://localhost:3000")).toBe("unknown");
    expect(normalizeServerRuntimeEnv("api.drts.internal")).toBe("unknown");
    expect(normalizeServerRuntimeEnv("admin.drts.com")).toBe("unknown");
  });

  it("resolves missing, empty, or unrecognized values to unknown", () => {
    expect(normalizeServerRuntimeEnv(undefined)).toBe("unknown");
    expect(normalizeServerRuntimeEnv(null)).toBe("unknown");
    expect(normalizeServerRuntimeEnv("")).toBe("unknown");
    expect(normalizeServerRuntimeEnv("   ")).toBe("unknown");
    expect(normalizeServerRuntimeEnv("custom_cluster")).toBe("unknown");
  });
});

describe("resolveRuntimeEnvironment and resolveRuntimeHealth safety", () => {
  it("never treats fixture/mock mode as production", () => {
    expect(
      resolveRuntimeEnvironment({ env: "production", isFixture: true }),
    ).toBe("mock");
    expect(resolveRuntimeEnvironment({ env: "production", isMock: true })).toBe(
      "mock",
    );
  });

  it("never marks unverified or unknown health as healthy", () => {
    expect(resolveRuntimeHealth({ status: undefined })).toBe("unknown");
    expect(resolveRuntimeHealth({ status: null })).toBe("unknown");
    expect(resolveRuntimeHealth({ status: "" })).toBe("unknown");
    expect(resolveRuntimeHealth({ status: "arbitrary" })).toBe("unknown");
    expect(resolveRuntimeHealth({ responseOk: false, status: "healthy" })).toBe(
      "down",
    );
  });
});
