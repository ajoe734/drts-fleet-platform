import { DTMF_DIGIT_REGEX } from "@drts/contracts";

import {
  VoiceMediaProviderError,
  type VoiceAsrSegmentResult,
  type VoiceSpeechToTextAdapter,
  type VoiceTextToSpeechAdapter,
  type VoiceTtsPlaybackHandle,
} from "./media-provider";

/**
 * Per-call media session harness (SD §3.2 row "Media worker", §5.3-§5.4,
 * §11.4). This is the "media 介面" the acceptance criterion asks for:
 * 009 (local playback stop / audio timing / control fencing) and the
 * dialogue orchestrator built in later tasks consume the event stream this
 * emits and drive playback/ASR through the methods below. It does not talk
 * to a CTI provider, a database, or an HTTP transport -- those integrations
 * belong to UV-EXEC-009/010/023.
 */

export type VoiceMediaWorkerEvent =
  | VoiceSpeechStartedEvent
  | VoiceSpeechEndedEvent
  | VoiceAsrSegmentEvent
  | VoiceDtmfReceivedMediaEvent
  | VoiceTtsPlaybackStartedEvent
  | VoiceTtsPlaybackCompletedEvent
  | VoiceTtsPlaybackCancelledEvent;

interface VoiceMediaWorkerEventBase {
  sessionId: string;
  mediaEpoch: number;
  controlSequence: number;
  occurredAt: string;
}

export interface VoiceSpeechStartedEvent extends VoiceMediaWorkerEventBase {
  type: "speech.started";
}

export interface VoiceSpeechEndedEvent extends VoiceMediaWorkerEventBase {
  type: "speech.ended";
}

export interface VoiceAsrSegmentEvent extends VoiceMediaWorkerEventBase {
  type: "asr.segment.partial" | "asr.segment.final";
  payload: VoiceAsrSegmentResult;
}

export interface VoiceDtmfReceivedMediaEvent extends VoiceMediaWorkerEventBase {
  type: "dtmf.received";
  payload: { digit: string };
}

export interface VoiceTtsPlaybackStartedEvent extends VoiceMediaWorkerEventBase {
  type: "tts.playback.started";
  payload: { playbackId: string; generation: number };
}

export interface VoiceTtsPlaybackCompletedEvent
  extends VoiceMediaWorkerEventBase {
  type: "tts.playback.completed";
  payload: { playbackId: string; generation: number };
}

export interface VoiceTtsPlaybackCancelledEvent
  extends VoiceMediaWorkerEventBase {
  type: "tts.playback.cancelled";
  payload: { playbackId: string; generation: number; reason: string };
}

export type VoiceMediaWorkerEventSink = (event: VoiceMediaWorkerEvent) => void;

interface TrackedPlayback {
  playbackId: string;
  generation: number;
  /** SD §11.5: once cleared, a late completion mark must never "revive". */
  cleared: boolean;
}

export interface VoiceMediaWorkerSessionOptions {
  sessionId: string;
  asrAdapter: VoiceSpeechToTextAdapter;
  ttsAdapter: VoiceTextToSpeechAdapter;
  eventSink: VoiceMediaWorkerEventSink;
  initialMediaEpoch?: number;
}

export class VoiceMediaWorkerSession {
  readonly sessionId: string;
  private readonly asrAdapter: VoiceSpeechToTextAdapter;
  private readonly ttsAdapter: VoiceTextToSpeechAdapter;
  private readonly eventSink: VoiceMediaWorkerEventSink;

  private mediaEpoch: number;
  private controlSequence = 0;
  /** SD §5.3/§5.4: only the active generation's playback may complete/cancel meaningfully. */
  private activeGeneration = 0;
  private readonly playbacksById = new Map<string, TrackedPlayback>();

  constructor(options: VoiceMediaWorkerSessionOptions) {
    this.sessionId = options.sessionId;
    this.asrAdapter = options.asrAdapter;
    this.ttsAdapter = options.ttsAdapter;
    this.eventSink = options.eventSink;
    this.mediaEpoch = options.initialMediaEpoch ?? 1;
    this.activeGeneration = this.mediaEpoch;
  }

  getMediaEpoch(): number {
    return this.mediaEpoch;
  }

  /**
   * SD §5.4 "建立唯一 media output owner／epoch": used on handoff/reconnect
   * to invalidate any in-flight playback generation before a new owner may
   * play audio.
   */
  advanceMediaEpoch(): number {
    const previousGeneration = this.activeGeneration;
    this.mediaEpoch += 1;
    this.activeGeneration = this.mediaEpoch;
    for (const playback of this.playbacksById.values()) {
      if (!playback.cleared && playback.generation === previousGeneration) {
        playback.cleared = true;
      }
    }
    return this.mediaEpoch;
  }

  /**
   * SD §5.3 barge-in: local, immediate playback-generation invalidation on
   * detected speech start, independent of any API/DB round trip. Returns the
   * ids of playbacks that were cleared by this call (if any), so the caller
   * (e.g. the CTI/media bridge) knows which outbound buffers to clear.
   */
  handleSpeechStarted(occurredAt: string): { clearedPlaybackIds: string[] } {
    const clearedPlaybackIds: string[] = [];
    for (const playback of this.playbacksById.values()) {
      if (!playback.cleared && playback.generation === this.activeGeneration) {
        playback.cleared = true;
        clearedPlaybackIds.push(playback.playbackId);
      }
    }
    this.emit({
      type: "speech.started",
      ...this.eventStamp(occurredAt),
    });
    return { clearedPlaybackIds };
  }

  handleSpeechEnded(occurredAt: string): void {
    this.emit({
      type: "speech.ended",
      ...this.eventStamp(occurredAt),
    });
  }

  async transcribeChunk(
    audioChunk: Uint8Array,
    occurredAt: string,
  ): Promise<VoiceAsrSegmentResult> {
    const result = await this.asrAdapter.transcribe({
      sessionId: this.sessionId,
      audioChunk,
      sequence: this.controlSequence + 1,
    });
    this.emit({
      type: result.final ? "asr.segment.final" : "asr.segment.partial",
      ...this.eventStamp(occurredAt),
      payload: result,
    });
    return result;
  }

  handleDtmf(digit: string, occurredAt: string): void {
    if (!DTMF_DIGIT_REGEX.test(digit)) {
      throw new VoiceMediaProviderError(
        "VOICE_MEDIA_DTMF_INVALID",
        `'${digit}' is not a valid single DTMF digit.`,
        { digit },
      );
    }
    this.emit({
      type: "dtmf.received",
      ...this.eventStamp(occurredAt),
      payload: { digit },
    });
  }

  /** SD §11.2/§5.4: playback is tagged with the generation active at creation time. */
  async startPlayback(
    text: string,
    languageCode: string,
    occurredAt: string,
  ): Promise<VoiceTtsPlaybackHandle> {
    const generation = this.activeGeneration;
    const handle = await this.ttsAdapter.synthesize({
      sessionId: this.sessionId,
      text,
      languageCode,
      generation,
    });
    this.playbacksById.set(handle.playbackId, {
      playbackId: handle.playbackId,
      generation,
      cleared: false,
    });
    this.emit({
      type: "tts.playback.started",
      ...this.eventStamp(occurredAt),
      payload: { playbackId: handle.playbackId, generation },
    });
    return handle;
  }

  /**
   * SD §11.5 (Twilio mark/clear reference): a completion mark for a
   * playback that was already cleared/cancelled must not "revive" it. This
   * returns `false` (and emits nothing) in that case rather than throwing,
   * since a late/duplicate mark from the provider is an expected race, not
   * an error.
   */
  completePlayback(playbackId: string, occurredAt: string): boolean {
    const playback = this.playbacksById.get(playbackId);
    if (!playback || playback.cleared) {
      return false;
    }
    playback.cleared = true;
    this.emit({
      type: "tts.playback.completed",
      ...this.eventStamp(occurredAt),
      payload: { playbackId, generation: playback.generation },
    });
    return true;
  }

  cancelPlayback(playbackId: string, reason: string, occurredAt: string): boolean {
    const playback = this.playbacksById.get(playbackId);
    if (!playback || playback.cleared) {
      return false;
    }
    playback.cleared = true;
    this.emit({
      type: "tts.playback.cancelled",
      ...this.eventStamp(occurredAt),
      payload: { playbackId, generation: playback.generation, reason },
    });
    return true;
  }

  private eventStamp(occurredAt: string): {
    sessionId: string;
    mediaEpoch: number;
    controlSequence: number;
    occurredAt: string;
  } {
    this.controlSequence += 1;
    return {
      sessionId: this.sessionId,
      mediaEpoch: this.mediaEpoch,
      controlSequence: this.controlSequence,
      occurredAt,
    };
  }

  private emit(event: VoiceMediaWorkerEvent): void {
    this.eventSink(event);
  }
}
