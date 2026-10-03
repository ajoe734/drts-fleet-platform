import { describe, it, expect } from "vitest";
import { composeVoiceMediaProviders } from "../../../apps/voice-media-worker/src/server/provider-composition";
import { VoiceMediaProviderError } from "../../../apps/voice-media-worker/src/media-provider";
import { TwmAsrNetworkAdapter } from "../../../apps/voice-media-worker/src/providers/twm/twm-network-client";

/**
 * Codex review round 3 (reopen, AUDIT-VOICE-RUNTIME-20261002) R4:
 * `composeVoiceMediaProviders` is the actual configuration/composition
 * entry `server.ts` now calls -- these tests exercise its real decision
 * logic (environment -> which provider class gets constructed, and the
 * fail-closed policy in a strict environment) rather than asserting on a
 * fixture/live label. No network call is ever made; `TWM_API_BASE_URL`
 * only has to be a syntactically valid URL for the adapter's constructor to
 * run, since `isProductionCapable` is hardcoded `false` regardless (see
 * module doc) and nothing here calls `login`/`connect`.
 */

function baseEnv(): NodeJS.ProcessEnv {
  return { NODE_ENV: "test" };
}

describe("AUDIT-VOICE-RUNTIME-20261002: composeVoiceMediaProviders", () => {
  it("is never production-capable today, regardless of configuration (no verified TWM account exists)", () => {
    const composition = composeVoiceMediaProviders({ env: baseEnv() });
    expect(composition.productionCapable).toBe(false);
    expect(composition.notCapableReason).toMatch(/twm/i);
  });

  it("resolves to the explicit unconfigured (fail-closed) adapter when no TWM credentials are configured", () => {
    const composition = composeVoiceMediaProviders({ env: baseEnv() });
    const { asrAdapter, ttsAdapter } =
      composition.providerFactory.createAdapters("sess-1");
    expect(asrAdapter.providerName).toBe("twm");
    expect(asrAdapter.isProductionCapable).toBe(false);
    expect(ttsAdapter.providerName).toBe("twm");
  });

  it("the unconfigured adapter fails closed on actual use instead of silently no-op succeeding", async () => {
    const composition = composeVoiceMediaProviders({ env: baseEnv() });
    const { asrAdapter } = composition.providerFactory.createAdapters("sess-1");
    await expect(
      asrAdapter.transcribe({
        sessionId: "sess-1",
        audioChunk: new Uint8Array([1]),
        sequence: 1,
      }),
    ).rejects.toThrow(VoiceMediaProviderError);
  });

  it("constructs a real TwmAsrNetworkAdapter (never production-capable) once account configuration is present", () => {
    const composition = composeVoiceMediaProviders({
      env: {
        ...baseEnv(),
        TWM_ACCOUNT_ID: "acct-1",
        TWM_ACCOUNT_SECRET: "secret-1",
        TWM_API_BASE_URL: "https://twm.example.invalid",
      },
    });
    const { asrAdapter } = composition.providerFactory.createAdapters("sess-1");
    expect(asrAdapter).toBeInstanceOf(TwmAsrNetworkAdapter);
    // Hardcoded false even with credentials configured -- see module doc:
    // no verified account/capability-matrix exists yet.
    expect(asrAdapter.isProductionCapable).toBe(false);
  });

  it("constructs a fresh adapter instance per session id (never a shared singleton) once TWM is configured", () => {
    const composition = composeVoiceMediaProviders({
      env: {
        ...baseEnv(),
        TWM_ACCOUNT_ID: "acct-1",
        TWM_ACCOUNT_SECRET: "secret-1",
        TWM_API_BASE_URL: "https://twm.example.invalid",
      },
    });
    const first = composition.providerFactory.createAdapters("sess-a");
    const second = composition.providerFactory.createAdapters("sess-b");
    expect(first.asrAdapter).not.toBe(second.asrAdapter);
    expect(first.ttsAdapter).not.toBe(second.ttsAdapter);
  });

  it("fails closed for the 'twm' provider in a strict environment, before constructing any instance, even with credentials configured", () => {
    const composition = composeVoiceMediaProviders({
      env: {
        DRTS_ENV: "production",
        TWM_ACCOUNT_ID: "acct-1",
        TWM_ACCOUNT_SECRET: "secret-1",
        TWM_API_BASE_URL: "https://twm.example.invalid",
      },
    });
    expect(() => composition.providerFactory.createAdapters("sess-1")).toThrow(
      VoiceMediaProviderError,
    );
  });

  it("fails closed for the sandbox provider in a strict environment instead of silently using the fixture", () => {
    const composition = composeVoiceMediaProviders({
      env: { DRTS_ENV: "production", VOICE_MEDIA_PROVIDER_NAME: "sandbox" },
    });
    expect(() => composition.providerFactory.createAdapters("sess-1")).toThrow(
      VoiceMediaProviderError,
    );
  });

  it("uses the sandbox fixture in a non-strict environment when explicitly requested", () => {
    const composition = composeVoiceMediaProviders({
      env: { ...baseEnv(), VOICE_MEDIA_PROVIDER_NAME: "sandbox" },
    });
    const { asrAdapter } = composition.providerFactory.createAdapters("sess-1");
    expect(asrAdapter.providerName).toBe("sandbox");
  });

  it("fails closed for an unknown requested provider name", () => {
    const composition = composeVoiceMediaProviders({
      env: { ...baseEnv(), VOICE_MEDIA_PROVIDER_NAME: "unknown-vendor" },
    });
    expect(() => composition.providerFactory.createAdapters("sess-1")).toThrow(
      VoiceMediaProviderError,
    );
  });
});
