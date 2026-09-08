/**
 * TWM ASR (Streaming V3.22) and TTS (V2.07) protocol types (SD §11.1, §11.2,
 * §11.5). These model the documented shapes only; no base URL, account
 * quota, model or credential is baked in here -- those are deployment
 * config (SD §11.1 preamble). Nothing in this module is production-capable:
 * verifying it against a real account is UV-EXEC-027/028's job.
 */

/** SD §11.1 step 4: `180` means "send media now"; `100` is preparing only. */
export type TwmAsrReadyStatus = "100" | "180";

/** SD §11.1 step 7: timeout/resource-full codes that force a reconnect with a fresh ticket. */
export const TWM_ASR_RECONNECT_ERROR_CODES = ["408", "440", "486"] as const;
export type TwmAsrReconnectErrorCode =
  (typeof TWM_ASR_RECONNECT_ERROR_CODES)[number];

export function isTwmAsrReconnectErrorCode(
  code: string,
): code is TwmAsrReconnectErrorCode {
  return (TWM_ASR_RECONNECT_ERROR_CODES as readonly string[]).includes(code);
}

/** SD §11.1 step 4: adapter must never accumulate seconds of audio before sending. */
export const TWM_ASR_MAX_FRAME_BYTES = 384 * 1024;

/**
 * SD §11.5 row-by-row: these are deliberately separate knobs, not one
 * "silence timeout". Confusing end-of-utterance segmentation with a no-voice
 * hangup timer, or a packet-loss timer with idle/maxDuration, is the exact
 * mistake §11.5 calls out.
 */
export interface TwmAsrTimingConfig {
  /** ASR end-of-utterance segmentation; separate from passenger wait-time UX. */
  minSilenceDurMs: number;
  /** Timeout for missing audio packets; VAD dropping silent frames must not trigger this. */
  maxPacketLossDurSec: number;
  /** No recognized content / no voice timeout; sending silence must not clear it. */
  noSpeechTimeoutSec: number;
  /** Idle wait ceiling independent of noSpeechTimeout (e.g. holding for a dispatch lookup). */
  idleTimeoutSec: number;
  /** Absolute cap on one ASR stream/session lifetime. */
  maxDurationSec: number;
}

/** SD §11.1 step 3: connect params; `enableTransient`/`saveResult` fixed per SD unless the contract says otherwise. */
export interface TwmAsrConnectParams {
  modelName: string;
  type: string;
  rate: number;
  /** SD §11.1 step 3: always 1 here -- this adapter never asks TWM to persist transcripts. */
  enableTransient: 1;
  /**
   * SD §11.1 step 3: only a caller who has confirmed the contract allows
   * provider-side retention may pass `1`; it can never replace this
   * system's own recording.
   */
  saveResult: 0 | 1;
}

/** SD §11.1 step 2: ticket is fetched just-in-time and is short-lived (commonly ~30s per FAQ; not a verified SLA). */
export interface TwmAsrAccessInfo {
  wsUrl: string;
  ticket: string;
  issuedAtMs: number;
  ttlMs: number;
}

export interface TwmAsrSegmentMessage {
  type: "segment";
  segmentId: string;
  /** SD §11.1 step 5: `final=0` may still be revised; a higher revision replaces a lower one for the same segment. */
  revision: number;
  text: string;
  final: boolean;
  language: string;
}

export interface TwmAsrStatusMessage {
  type: "status";
  code: TwmAsrReadyStatus;
}

export interface TwmAsrErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type TwmAsrServerMessage =
  | TwmAsrSegmentMessage
  | TwmAsrStatusMessage
  | TwmAsrErrorMessage;

/** SD §11.1 step 6/§11.4: distinguishes a normal end-of-audio drain from a disconnect-forced one. */
export type TwmAsrDrainReason = "audio_end" | "disconnect";

// ---------------------------------------------------------------------------
// TTS (V2.07, SD §11.2)
// ---------------------------------------------------------------------------

/** SD §11.2: `voice.model` must come from `/api/v1/tts/models`, never an ASR model id like `myVoca`. */
export interface TwmTtsModelCatalogEntry {
  model: string;
  languageCode: string;
  name: string;
  textTypes: readonly string[];
  /**
   * SD §11.2 acceptance: "每個部署的模型、語者與 textType 支援矩陣必須驗證" --
   * a catalog entry the current deployment has not run through verification
   * must not be selectable even if TWM's `/tts/models` lists it.
   */
   verified: boolean;
}

export interface TwmTtsVoiceSelection {
  model: string;
  languageCode: string;
  name: string;
}

export interface TwmTtsSynthesizeParams {
  text: string;
  textType: string;
  voice: TwmTtsVoiceSelection;
  speakingRate: number;
  /** SD §11.2: `streamMode: 1` is S16LE PCM 16 kHz mono; file mode carries a WAV header instead. */
  streamMode: 0 | 1;
}

/**
 * SD §11.4: a local stop is not a provider cancellation ACK. These are
 * tracked as two separate, honestly-unresolved facts rather than folded
 * into one boolean.
 */
export interface TwmTtsCancellationRecord {
  playbackId: string;
  /** Did the local media-output fence stop emitting audio for this playback? */
  playbackCancellation: "cleared" | "not_requested";
  /**
   * Did TWM acknowledge the HTTP chunked response was aborted server-side?
   * TWM's TTS docs do not define an independent cancel API or a billing
   * guarantee, so this can only ever be `unconfirmed` from this adapter.
   */
  synthesisCancellation: "unconfirmed";
  /** Never claim zero billing; unplayed audio is not proof of unbilled usage. */
  billingOutcome: "unresolved";
}
