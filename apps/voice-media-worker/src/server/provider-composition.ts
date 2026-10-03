import {
  SandboxSpeechToTextAdapter,
  SandboxTextToSpeechAdapter,
  VoiceMediaProviderError,
  createUnconfiguredSpeechToTextAdapter,
  createUnconfiguredTextToSpeechAdapter,
} from "../media-provider";
import {
  TwmAsrNetworkAdapter,
  TwmTtsNetworkAdapter,
  type TwmHttpResponse,
  type TwmHttpTransport,
  type TwmWebSocketEvent,
  type TwmWebSocketFactory,
  type TwmWebSocketLike,
} from "../providers/twm/twm-network-client";
import type { TwmAsrRouteProfile } from "../providers/twm/twm-adapter";
import { isStrictVoiceMediaEnvironment } from "./environment";
import type { VoiceSessionProviderFactory } from "./session-composer";

/**
 * Composes this worker's per-session ASR/TTS provider factory from its
 * actual runtime environment (SD §3.5, §11; see
 * docs/04-uat/audit-voice-runtime-20261002.md). TWM is this design's
 * documented *reference route* -- not yet an awarded vendor (SD §92) -- so
 * `productionCapable` is hardcoded `false` here regardless of whether
 * credentials are configured: no verified TWM account, base URL, or
 * observed voices/models matrix exists yet (UV-EXEC-027/028), and this
 * module must never fabricate that attestation just because a login/HTTP
 * transport can be constructed. A strict (staging/production) environment
 * therefore always fails closed for the "twm" provider here, before any
 * network instance is ever constructed -- same posture `/ready` reports.
 *
 * Every `TWM_*` field is `undefined` in every environment today: no such
 * variable is declared anywhere in this repo's deployment workflows or
 * secrets. A fresh adapter instance is constructed per session (never a
 * shared singleton) because each one owns exactly one stateful WebSocket
 * connection (`TwmAsrNetworkAdapter`) -- reusing one across concurrent
 * sessions would corrupt their ASR state.
 */
export interface VoiceMediaCompositionConfig {
  env?: NodeJS.ProcessEnv;
}

export interface VoiceMediaComposition {
  providerFactory: VoiceSessionProviderFactory;
  /** Always `false` today -- see module doc. Drives `/ready`'s honest
   * not-ready posture in a strict environment. */
  productionCapable: boolean;
  notCapableReason: string;
}

const TWM_NOT_CAPABLE_REASON =
  "The 'twm' ASR/TTS provider is wired (SD §11 reference route) but is never production-capable: no verified TWM account, base URL, or observed voices/models matrix exists yet (UV-EXEC-027/028). See docs/04-uat/audit-voice-runtime-20261002.md.";

class NativeTwmWebSocket implements TwmWebSocketLike {
  constructor(private readonly socket: WebSocket) {}

  send(data: Uint8Array | string): void {
    this.socket.send(data);
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: TwmWebSocketEvent) => void,
  ): void {
    this.socket.addEventListener(type, (event: Event) => {
      listener({ data: (event as MessageEvent).data });
    });
  }
}

function buildTwmHttpTransport(baseUrl: string): TwmHttpTransport {
  return async (method, path, init) => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      ...(init?.headers !== undefined ? { headers: init.headers } : {}),
      ...(init?.body !== undefined ? { body: init.body } : {}),
      ...(init?.signal !== undefined ? { signal: init.signal } : {}),
    });
    return response as unknown as TwmHttpResponse;
  };
}

function buildTwmWebSocketFactory(): TwmWebSocketFactory {
  return (url: string) => new NativeTwmWebSocket(new WebSocket(url));
}

interface TwmAccountConfig {
  accountId: string;
  accountSecret: string;
  apiBaseUrl: string;
}

/** Reads the TWM account configuration seam. Every field is `undefined` in
 * every environment today (see module doc). This function only defines
 * where a future authorized procurement/credential would be read from; it
 * never invents a value. */
function readTwmAccountConfig(
  env: NodeJS.ProcessEnv,
): TwmAccountConfig | undefined {
  const accountId = env.TWM_ACCOUNT_ID?.trim();
  const accountSecret = env.TWM_ACCOUNT_SECRET?.trim();
  const apiBaseUrl = env.TWM_API_BASE_URL?.trim();
  if (!accountId || !accountSecret || !apiBaseUrl) return undefined;
  return { accountId, accountSecret, apiBaseUrl };
}

/** `accountCapabilityVerified` stays hardcoded `false` here for the same
 * reason `productionCapable` does (see module doc) regardless of what
 * `TWM_ASR_MODEL_NAME` etc. are set to. */
function buildTwmAsrProfile(env: NodeJS.ProcessEnv): TwmAsrRouteProfile {
  const sampleRateHz = Number(env.TWM_ASR_SAMPLE_RATE_HZ ?? 16_000);
  return {
    modelName: env.TWM_ASR_MODEL_NAME?.trim() || "unconfigured",
    audioType:
      env.TWM_ASR_AUDIO_TYPE === "g711_ulaw" ? "g711_ulaw" : "pcm_s16le",
    sampleRateHz: sampleRateHz === 8_000 ? 8_000 : 16_000,
    timeouts: {
      minSilenceDurMs: 500,
      maxPacketLossDurSec: 2,
      noSpeechTimeoutMs: 5_000,
      idleTimeoutMs: 30_000,
      maxDurationMs: 600_000,
      eosDrainMs: 2_000,
    },
    accountCapabilityVerified: false,
  };
}

function buildTwmAdapters(
  twmAccount: TwmAccountConfig,
  env: NodeJS.ProcessEnv,
): ReturnType<VoiceSessionProviderFactory["createAdapters"]> {
  return {
    asrAdapter: new TwmAsrNetworkAdapter(
      buildTwmHttpTransport(twmAccount.apiBaseUrl),
      buildTwmWebSocketFactory(),
      {
        accountId: twmAccount.accountId,
        accountSecret: twmAccount.accountSecret,
      },
      buildTwmAsrProfile(env),
      false,
    ),
    ttsAdapter: new TwmTtsNetworkAdapter(
      buildTwmHttpTransport(twmAccount.apiBaseUrl),
      {
        accountId: twmAccount.accountId,
        accountSecret: twmAccount.accountSecret,
      },
      // No verified voices/models matrix exists (see module doc) -- an
      // empty list is honest: `buildSynthesisRequest` fails closed for
      // every language rather than routing to a fabricated voice.
      [],
      false,
    ),
  };
}

export function composeVoiceMediaProviders(
  config: VoiceMediaCompositionConfig = {},
): VoiceMediaComposition {
  const env = config.env ?? process.env;
  const productionMode = isStrictVoiceMediaEnvironment(env);
  const requestedProviderName = env.VOICE_MEDIA_PROVIDER_NAME?.trim() || "twm";
  const twmAccount = readTwmAccountConfig(env);

  // Stateless, so a single shared instance across sessions is safe.
  const sandboxAsr = new SandboxSpeechToTextAdapter();
  const sandboxTts = new SandboxTextToSpeechAdapter();

  const providerFactory: VoiceSessionProviderFactory = {
    createAdapters(sessionId: string) {
      if (requestedProviderName === "twm") {
        if (productionMode) {
          // Same fail-closed policy the CTI adapter and
          // `VoiceMediaProviderRegistry` already enforce elsewhere: a
          // strict environment never falls back to an unverified
          // provider, and "twm" is never production-capable (module
          // doc) -- fail before constructing any network instance.
          throw new VoiceMediaProviderError(
            "VOICE_MEDIA_PROVIDER_NOT_CONFIGURED",
            TWM_NOT_CAPABLE_REASON,
            { requestedProviderName, sessionId },
          );
        }
        if (!twmAccount) {
          return {
            asrAdapter: createUnconfiguredSpeechToTextAdapter("twm"),
            ttsAdapter: createUnconfiguredTextToSpeechAdapter("twm"),
          };
        }
        return buildTwmAdapters(twmAccount, env);
      }
      if (requestedProviderName === "sandbox") {
        if (productionMode) {
          throw new VoiceMediaProviderError(
            "VOICE_MEDIA_PROVIDER_NOT_CONFIGURED",
            "No production-capable media provider is configured; refusing to fall back to the sandbox fixture.",
            { requestedProviderName, sessionId },
          );
        }
        return { asrAdapter: sandboxAsr, ttsAdapter: sandboxTts };
      }
      throw new VoiceMediaProviderError(
        "VOICE_MEDIA_PROVIDER_UNKNOWN",
        `Media provider '${requestedProviderName}' is not registered.`,
        { requestedProviderName, sessionId },
      );
    },
  };

  return {
    providerFactory,
    productionCapable: false,
    notCapableReason: TWM_NOT_CAPABLE_REASON,
  };
}
