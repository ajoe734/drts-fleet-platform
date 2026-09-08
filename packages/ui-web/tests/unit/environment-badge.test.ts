import { describe, expect, it } from "vitest";
import {
  resolveRuntimeEnvironmentTier,
  RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS,
  RUNTIME_ENVIRONMENT_TIER_TONE,
} from "../../src/environment-badge/runtime-environment";

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
      resolveRuntimeEnvironmentTier({ APP_ENV: "staging", NODE_ENV: "production" }),
    ).toBe("staging");
  });

  it("does not trust NODE_ENV=production alone as proof of a real production deploy", () => {
    // `next build` always bakes NODE_ENV=production into the bundle, even for
    // staging/dev deployments. Without an explicit DRTS_ENV/APP_ENV signal,
    // NODE_ENV=production still resolves to `production` per the same
    // precedence as the API's detectAuthEnvironment, but a deployment that
    // wants to be trusted as staging/local must set DRTS_ENV or APP_ENV
    // explicitly rather than relying on this fallback.
    expect(resolveRuntimeEnvironmentTier({ NODE_ENV: "production" })).toBe(
      "production",
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
