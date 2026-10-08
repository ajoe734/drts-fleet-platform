import { isStrictVoiceMediaEnvironment } from "../server/environment";
import { VoiceMediaProviderError } from "../media-provider";
import { OpenAiRealtimeFixtureAdapter } from "../providers/native-voice/native-voice-adapter";
import type { VoiceDialogueProvider } from "./voice-dialogue-provider";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 residual ("no explicit
 * non-strict fixture opt-in"): `server.ts` previously constructed
 * `OpenAiRealtimeFixtureAdapter` unconditionally, every time, regardless of
 * environment -- the same unconditional-fixture-fallback posture
 * `../server/provider-composition.ts` already refuses for the ASR/TTS
 * media providers (see that module's own doc). This mirrors that exact
 * convention for the dialogue *provider* instead: a strict (staging/
 * production) environment always fails closed here, before any provider
 * instance is ever constructed, and a non-strict environment requires an
 * explicit opt-in (`VOICE_DIALOGUE_PROVIDER_NAME=fixture`) rather than
 * silently defaulting to fixture mode just because nothing else exists.
 *
 * No live `VoiceDialogueProvider` implementation exists at all yet (see
 * `../providers/native-voice/native-voice-adapter.ts`'s own doc) -- unlike
 * `composeVoiceMediaProviders`, there is no real-provider branch to add
 * here later; this seam exists so that fact is an explicit, testable
 * configuration decision instead of an implicit default.
 */
export interface VoiceDialogueComposition {
  createProvider: () => VoiceDialogueProvider;
  /** Always `true` today -- see module doc; kept as a real field (not a
   * hardcoded assumption at every call site) for the same reason
   * `VoiceMediaComposition.productionCapable` is. */
  productionCapable: false;
  notCapableReason: string;
}

const DIALOGUE_NOT_CAPABLE_REASON =
  "No live VoiceDialogueProvider implementation exists yet; only the fixture-mode provider can ever be composed, and only with an explicit VOICE_DIALOGUE_PROVIDER_NAME=fixture opt-in outside a strict environment.";

export interface VoiceDialogueCompositionConfig {
  env?: NodeJS.ProcessEnv;
}

export function composeVoiceDialogueProvider(
  config: VoiceDialogueCompositionConfig = {},
): VoiceDialogueComposition {
  const env = config.env ?? process.env;
  const strict = isStrictVoiceMediaEnvironment(env);
  const requestedProviderName = env.VOICE_DIALOGUE_PROVIDER_NAME?.trim();

  return {
    createProvider: () => {
      if (strict) {
        // Same fail-closed policy `composeVoiceMediaProviders` already
        // enforces for ASR/TTS: a strict environment never falls back to
        // an unverified fixture, whatever `VOICE_DIALOGUE_PROVIDER_NAME`
        // says.
        throw new VoiceMediaProviderError(
          "VOICE_DIALOGUE_PROVIDER_NOT_CONFIGURED",
          DIALOGUE_NOT_CAPABLE_REASON,
          { requestedProviderName, strict },
        );
      }
      if (requestedProviderName !== "fixture") {
        // Explicit opt-in required (R4 residual): absent or any other
        // value refuses to silently default to fixture mode just because
        // it is the only thing that exists.
        throw new VoiceMediaProviderError(
          "VOICE_DIALOGUE_PROVIDER_NOT_CONFIGURED",
          "No VoiceDialogueProvider is configured for this non-strict environment; set VOICE_DIALOGUE_PROVIDER_NAME=fixture to explicitly opt into fixture-mode dialogue.",
          { requestedProviderName, strict },
        );
      }
      return new OpenAiRealtimeFixtureAdapter();
    },
    productionCapable: false,
    notCapableReason: DIALOGUE_NOT_CAPABLE_REASON,
  };
}
