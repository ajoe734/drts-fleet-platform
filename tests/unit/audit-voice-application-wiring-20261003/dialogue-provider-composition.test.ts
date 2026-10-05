import { describe, it, expect } from "vitest";
import { composeVoiceDialogueProvider } from "../../../apps/voice-media-worker/src/dialogue/dialogue-provider-composition";
import { VoiceMediaProviderError } from "../../../apps/voice-media-worker/src/media-provider";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 residual ("no explicit
 * non-strict fixture opt-in"): `server.ts` previously constructed
 * `OpenAiRealtimeFixtureAdapter` unconditionally, every time, with no
 * decision point distinguishing "fixture mode is an intentional
 * non-strict choice" from "no real provider exists." These tests exercise
 * `composeVoiceDialogueProvider`'s real decision logic: a strict
 * environment always fails closed (mirroring
 * `composeVoiceMediaProviders`'s already-established ASR/TTS convention),
 * and a non-strict one requires an explicit `VOICE_DIALOGUE_PROVIDER_NAME=
 * fixture` opt-in rather than silently defaulting.
 */

function baseEnv(): NodeJS.ProcessEnv {
  return { NODE_ENV: "test" };
}

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003: composeVoiceDialogueProvider", () => {
  it("is never production-capable today, regardless of configuration (no live VoiceDialogueProvider exists)", () => {
    const composition = composeVoiceDialogueProvider({ env: baseEnv() });
    expect(composition.productionCapable).toBe(false);
    expect(composition.notCapableReason).toMatch(/VoiceDialogueProvider/);
  });

  it("fails closed, without constructing anything, when no explicit opt-in is configured in a non-strict environment", () => {
    const composition = composeVoiceDialogueProvider({ env: baseEnv() });
    expect(() => composition.createProvider()).toThrow(
      VoiceMediaProviderError,
    );
  });

  it("constructs the real fixture adapter once explicitly opted into, in a non-strict environment", () => {
    const composition = composeVoiceDialogueProvider({
      env: { ...baseEnv(), VOICE_DIALOGUE_PROVIDER_NAME: "fixture" },
    });
    expect(composition.createProvider()).toBeInstanceOf(
      OpenAiRealtimeFixtureAdapter,
    );
  });

  it("fails closed in a strict (staging/production) environment even with the explicit opt-in set", () => {
    const composition = composeVoiceDialogueProvider({
      env: {
        ...baseEnv(),
        DRTS_ENV: "production",
        VOICE_DIALOGUE_PROVIDER_NAME: "fixture",
      },
    });
    expect(() => composition.createProvider()).toThrow(
      VoiceMediaProviderError,
    );
  });

  it("fails closed in a strict (staging) environment with no opt-in configured at all", () => {
    const composition = composeVoiceDialogueProvider({
      env: { ...baseEnv(), DRTS_ENV: "staging" },
    });
    expect(() => composition.createProvider()).toThrow(
      VoiceMediaProviderError,
    );
  });

  it("rejects any other provider name the same as an absent one -- never a typo silently falling through to fixture", () => {
    const composition = composeVoiceDialogueProvider({
      env: { ...baseEnv(), VOICE_DIALOGUE_PROVIDER_NAME: "live" },
    });
    expect(() => composition.createProvider()).toThrow(
      VoiceMediaProviderError,
    );
  });
});
