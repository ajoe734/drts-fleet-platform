import { VoiceMediaProviderError } from "../../media-provider";
import type {
  VoiceTextToSpeechAdapter,
  VoiceTtsPlaybackHandle,
  VoiceTtsSynthesizeRequest,
} from "../../media-provider";
import type { VoiceSynthesisAborter } from "../../media/output-fence";

import type { TwmTtsSynthesisHandle, TwmTtsTransport } from "./twm-transport";
import type {
  TwmTtsCancellationRecord,
  TwmTtsModelCatalogEntry,
  TwmTtsVoiceSelection,
} from "./twm-types";

/**
 * TWM TTS adapter (SD §11.2, §11.4, §11.5). Wraps the documented
 * login → models → synthesize flow behind `VoiceTextToSpeechAdapter`. It
 * never guesses a `voice.model`: every selection must resolve to an entry
 * the deployment has explicitly marked `verified` in the fetched
 * `/api/v1/tts/models` catalog (SD §11.2 acceptance). Never production
 * capable on its own -- see UV-EXEC-027/028.
 */

export interface TwmTtsAdapterOptions {
  transport: TwmTtsTransport;
  /**
   * Deployment-provided language → voice mapping. This is a *request*, not
   * an authorization: `synthesize` still validates it against the fetched
   * catalog's `verified` flag before use.
   */
  languageVoiceMap: Readonly<Record<string, TwmTtsVoiceSelection>>;
  speakingRate?: number;
  textType?: string;
  /** SD §11.2: `1` = streamed S16LE PCM 16 kHz mono; `0` = file mode with a WAV header. */
  streamMode?: 0 | 1;
}

let playbackCounter = 0;

export class TwmTextToSpeechAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "twm";
  readonly isProductionCapable = false as const;

  private token: string | null = null;
  private catalog: readonly TwmTtsModelCatalogEntry[] | null = null;
  private readonly handlesByPlaybackId = new Map<string, TwmTtsSynthesisHandle>();
  private readonly cancellationByPlaybackId = new Map<
    string,
    TwmTtsCancellationRecord
  >();

  constructor(private readonly options: TwmTtsAdapterOptions) {}

  private async ensureToken(): Promise<string> {
    if (this.token) return this.token;
    const login = await this.options.transport.login();
    this.token = login.token;
    return this.token;
  }

  private async ensureCatalog(
    token: string,
  ): Promise<readonly TwmTtsModelCatalogEntry[]> {
    if (this.catalog) return this.catalog;
    this.catalog = await this.options.transport.fetchModels(token);
    return this.catalog;
  }

  /**
   * SD §11.2: refuses to open a language/accent whose voice/model/textType
   * combination has not been verified for this deployment, even if TWM's
   * catalog lists it.
   */
  private async resolveVerifiedVoice(
    languageCode: string,
    textType: string,
  ): Promise<TwmTtsVoiceSelection> {
    const requested = this.options.languageVoiceMap[languageCode];
    if (!requested) {
      throw new VoiceMediaProviderError(
        "VOICE_MEDIA_LANGUAGE_NOT_CONFIGURED",
        `No TWM TTS voice is configured for languageCode '${languageCode}'.`,
        { languageCode },
      );
    }
    const token = await this.ensureToken();
    const catalog = await this.ensureCatalog(token);
    const matched = catalog.find(
      (entry) =>
        entry.model === requested.model &&
        entry.languageCode === requested.languageCode &&
        entry.name === requested.name,
    );
    if (!matched || !matched.verified || !matched.textTypes.includes(textType)) {
      throw new VoiceMediaProviderError(
        "VOICE_MEDIA_VOICE_UNVERIFIED",
        `TWM voice '${requested.model}/${requested.name}' (${languageCode}, textType=${textType}) is not a verified selection for this deployment; refusing to open it.`,
        { languageCode, voice: requested, textType },
      );
    }
    return requested;
  }

  async synthesize(
    request: VoiceTtsSynthesizeRequest,
  ): Promise<VoiceTtsPlaybackHandle> {
    const textType = this.options.textType ?? "common";
    const voice = await this.resolveVerifiedVoice(request.languageCode, textType);
    const token = await this.ensureToken();
    const synthesized = await this.options.transport.synthesize(token, {
      text: request.text,
      textType,
      voice,
      speakingRate: this.options.speakingRate ?? 1.0,
      streamMode: this.options.streamMode ?? 1,
    });
    playbackCounter += 1;
    const playbackId = `twm-playback-${playbackCounter}`;
    this.handlesByPlaybackId.set(playbackId, synthesized);
    return {
      playbackId,
      generation: request.generation,
      audioChunks: synthesized.audioChunks,
    };
  }

  /**
   * SD §11.4: local stop must clear playback immediately and only
   * best-effort abort the HTTP transport afterward -- it never waits for or
   * claims a provider cancellation ACK, and never claims zero billing.
   * Register the returned aborter with `VoiceMediaOutputFence` alongside the
   * local clear.
   */
  createAborter(playbackId: string): VoiceSynthesisAborter {
    return {
      abort: async () => {
        const handle = this.handlesByPlaybackId.get(playbackId);
        this.cancellationByPlaybackId.set(playbackId, {
          playbackId,
          playbackCancellation: "cleared",
          synthesisCancellation: "unconfirmed",
          billingOutcome: "unresolved",
        });
        if (!handle) return;
        await handle.abort();
      },
    };
  }

  /** Distinct from `playbackCancellation` (local) and never claims a billing outcome. SD §11.4. */
  getCancellationRecord(playbackId: string): TwmTtsCancellationRecord | null {
    return this.cancellationByPlaybackId.get(playbackId) ?? null;
  }
}
