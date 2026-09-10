/**
 * Provider-neutral ASR/TTS adapter boundary for the standalone voice media
 * worker (SD §3.2 row "Media worker" / "ASR adapter", §3.4, §3.5, §11).
 *
 * This mirrors the fail-closed provider-selection shape used by the CTI
 * adapter (`apps/api/src/modules/callcenter/voice-cti.adapter.ts`) but is
 * deliberately not shared code with it: per SD §3.2, CTI and media worker
 * are peer components with separate ownership, and this app is meant to
 * scale/deploy independently of `apps/api` (SD §3.4). No vendor is selected
 * here -- UV-EXEC-011 wires an actual TWM (or alternative) adapter behind
 * these interfaces; this file only fixes the seam and ships a fixed-fixture
 * sandbox implementation.
 */

export class VoiceMediaProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VoiceMediaProviderError";
  }
}

// ---------------------------------------------------------------------------
// ASR (speech-to-text) adapter
// ---------------------------------------------------------------------------

export interface VoiceAsrSegmentResult {
  segmentId: string;
  /** SD §11.1 step 5: `final=0` may still revise; `final=1` freezes it. */
  revision: number;
  text: string;
  final: boolean;
  language: string;
}

export interface VoiceAsrTranscribeRequest {
  sessionId: string;
  /** Opaque audio chunk; the sandbox adapter never inspects real bytes. */
  audioChunk: Uint8Array;
  sequence: number;
}

export interface VoiceSpeechToTextAdapter {
  readonly providerName: string;
  /** SD acceptance: sandbox must never be mistaken for a validated provider. */
  readonly isProductionCapable: boolean;
  transcribe(
    request: VoiceAsrTranscribeRequest,
  ): Promise<VoiceAsrSegmentResult>;
}

// ---------------------------------------------------------------------------
// TTS (text-to-speech) adapter
// ---------------------------------------------------------------------------

export interface VoiceTtsPlaybackHandle {
  playbackId: string;
  /** Ties this playback to the media-epoch generation it was created under. */
  generation: number;
  /** Fixture: pre-baked chunks. A real adapter streams instead. */
  audioChunks: readonly Uint8Array[];
}

export interface VoiceTtsSynthesizeRequest {
  sessionId: string;
  text: string;
  languageCode: string;
  generation: number;
}

export interface VoiceTextToSpeechAdapter {
  readonly providerName: string;
  readonly isProductionCapable: boolean;
  synthesize(
    request: VoiceTtsSynthesizeRequest,
  ): Promise<VoiceTtsPlaybackHandle>;
}

// ---------------------------------------------------------------------------
// Sandbox (fixture) adapters -- never production-capable
// ---------------------------------------------------------------------------

let sandboxSegmentCounter = 0;

/**
 * Deterministic fixture ASR adapter: always returns a fixed final segment
 * regardless of the audio bytes given. Useful for exercising the session
 * harness/contract without a real speech engine.
 */
export class SandboxSpeechToTextAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "sandbox";
  readonly isProductionCapable = false as const;

  async transcribe(): Promise<VoiceAsrSegmentResult> {
    sandboxSegmentCounter += 1;
    return {
      segmentId: `sbx-segment-${sandboxSegmentCounter}`,
      revision: 1,
      text: "對，從這個入口上車。",
      final: true,
      language: "cmn-TW",
    };
  }
}

let sandboxPlaybackCounter = 0;

/** Deterministic fixture TTS adapter: returns a fixed, empty-audio playback handle. */
export class SandboxTextToSpeechAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "sandbox";
  readonly isProductionCapable = false as const;

  async synthesize(
    request: VoiceTtsSynthesizeRequest,
  ): Promise<VoiceTtsPlaybackHandle> {
    sandboxPlaybackCounter += 1;
    return {
      playbackId: `sbx-playback-${sandboxPlaybackCounter}`,
      generation: request.generation,
      audioChunks: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Unconfigured production slot (no vendor decided; SD §3.3/§3.5)
// ---------------------------------------------------------------------------

export function createUnconfiguredSpeechToTextAdapter(
  providerName: string,
): VoiceSpeechToTextAdapter {
  return {
    providerName,
    isProductionCapable: false,
    async transcribe(): Promise<VoiceAsrSegmentResult> {
      throw new VoiceMediaProviderError(
        "VOICE_MEDIA_PROVIDER_NOT_CONFIGURED",
        `ASR provider '${providerName}' has no adapter configuration; refusing to transcribe until a real adapter is selected and configured.`,
        { providerName },
      );
    },
  };
}

export function createUnconfiguredTextToSpeechAdapter(
  providerName: string,
): VoiceTextToSpeechAdapter {
  return {
    providerName,
    isProductionCapable: false,
    async synthesize(): Promise<VoiceTtsPlaybackHandle> {
      throw new VoiceMediaProviderError(
        "VOICE_MEDIA_PROVIDER_NOT_CONFIGURED",
        `TTS provider '${providerName}' has no adapter configuration; refusing to synthesize until a real adapter is selected and configured.`,
        { providerName },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Fail-closed provider resolution (same policy as the CTI adapter: sandbox
// may serve non-production traffic; production traffic requires an
// `isProductionCapable` provider, with an optional verified fallback, else
// fail closed).
// ---------------------------------------------------------------------------

interface NamedProvider {
  readonly providerName: string;
  readonly isProductionCapable: boolean;
}

function resolveProvider<T extends NamedProvider>(
  providers: ReadonlyMap<string, T>,
  requestedProviderName: string,
  productionMode: boolean,
  fallbackProviderName: string | undefined,
): T {
  const requested = providers.get(requestedProviderName);

  if (!productionMode) {
    if (!requested) {
      throw new VoiceMediaProviderError(
        "VOICE_MEDIA_PROVIDER_UNKNOWN",
        `Media provider '${requestedProviderName}' is not registered.`,
        { requestedProviderName },
      );
    }
    return requested;
  }

  if (requested?.isProductionCapable) {
    return requested;
  }

  if (fallbackProviderName) {
    const fallback = providers.get(fallbackProviderName);
    if (fallback?.isProductionCapable) {
      return fallback;
    }
  }

  throw new VoiceMediaProviderError(
    "VOICE_MEDIA_PROVIDER_NOT_CONFIGURED",
    `No production-capable media provider is configured to serve '${requestedProviderName}' traffic; failing closed rather than falling back to an unverified/sandbox adapter.`,
    { requestedProviderName },
  );
}

export interface VoiceMediaProviderRegistryConfig {
  asrProviders: readonly VoiceSpeechToTextAdapter[];
  ttsProviders: readonly VoiceTextToSpeechAdapter[];
  productionMode: boolean;
  productionAsrFallbackProviderName?: string;
  productionTtsFallbackProviderName?: string;
}

export class VoiceMediaProviderRegistry {
  private readonly asrProviders = new Map<string, VoiceSpeechToTextAdapter>();
  private readonly ttsProviders = new Map<string, VoiceTextToSpeechAdapter>();

  constructor(private readonly config: VoiceMediaProviderRegistryConfig) {
    for (const provider of config.asrProviders) {
      this.asrProviders.set(provider.providerName, provider);
    }
    for (const provider of config.ttsProviders) {
      this.ttsProviders.set(provider.providerName, provider);
    }
  }

  resolveAsr(requestedProviderName: string): VoiceSpeechToTextAdapter {
    return resolveProvider(
      this.asrProviders,
      requestedProviderName,
      this.config.productionMode,
      this.config.productionAsrFallbackProviderName,
    );
  }

  resolveTts(requestedProviderName: string): VoiceTextToSpeechAdapter {
    return resolveProvider(
      this.ttsProviders,
      requestedProviderName,
      this.config.productionMode,
      this.config.productionTtsFallbackProviderName,
    );
  }
}
