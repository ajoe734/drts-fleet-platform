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
  | VoiceTtsPlaybackCancelledEvent
  | VoiceMediaEpochAdvancedEvent;

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

export interface VoiceTtsPlaybackCompletedEvent extends VoiceMediaWorkerEventBase {
  type: "tts.playback.completed";
  payload: { playbackId: string; generation: number };
}

export interface VoiceTtsPlaybackCancelledEvent extends VoiceMediaWorkerEventBase {
  type: "tts.playback.cancelled";
  payload: { playbackId: string; generation: number; reason: string };
}

/** Codex reopen round 5/6, R2 residual: published by `advanceMediaEpoch`
 * itself (not by a separate caller-side wrapper) so that a media-authority
 * transition has exactly one boundary that always reaches whatever is
 * consuming this session's event stream -- whether `advanceMediaEpoch` was
 * invoked through `VoiceSessionComposer`'s own composed method or directly
 * on a retained `VoiceMediaWorkerSession` reference (e.g.
 * `composer.get(id).advanceMediaEpoch()`, as unit tests driving the session
 * alone still do). `mediaEpoch` on the base event stamp is the *new* epoch. */
export interface VoiceMediaEpochAdvancedEvent extends VoiceMediaWorkerEventBase {
  type: "media.epoch.advanced";
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

  /** `true` once the ASR adapter has taken over result delivery via
   * `onResult` -- `transcribeChunk` must not also emit from its own
   * returned value in that case, or every streamed result would be
   * reported twice. */
  private readonly asrStreamsResults: boolean;

  constructor(options: VoiceMediaWorkerSessionOptions) {
    this.sessionId = options.sessionId;
    this.asrAdapter = options.asrAdapter;
    this.ttsAdapter = options.ttsAdapter;
    this.eventSink = options.eventSink;
    this.mediaEpoch = options.initialMediaEpoch ?? 1;
    this.activeGeneration = this.mediaEpoch;
    this.asrStreamsResults = typeof this.asrAdapter.onResult === "function";
    if (this.asrStreamsResults) {
      // Deliver every accepted revision as soon as the adapter decodes it,
      // not gated on another audio chunk arriving to "poll" for it (SD
      // §11.1; see docs/04-uat/audit-voice-runtime-20261002.md R10).
      this.asrAdapter.onResult!((result) => {
        this.emit({
          type: result.final ? "asr.segment.final" : "asr.segment.partial",
          ...this.eventStamp(new Date().toISOString()),
          payload: result,
        });
      });
    }
  }

  getMediaEpoch(): number {
    return this.mediaEpoch;
  }

  /**
   * Whether a registered playback is still eligible to have its audio
   * published or its completion honored (Codex reopen round 5/6, R1
   * residual): `handleSpeechStarted`, `advanceMediaEpoch`, and
   * `cancelPlayback` all clear a `TrackedPlayback` entry *directly*, with
   * no event of their own reaching whichever outbound sink is holding this
   * playback's `handle` -- only `startPlayback`'s own `cancelOn` listener
   * re-invokes `cancelPlayback` for an abort, and that is a path only the
   * turn-coordinator-driven `speak` call wires up at all (`cancelOn` is
   * never passed for the raw `tts.synthesize` control frame). A sink must
   * call this immediately before publishing audio for `handle.playbackId`
   * (atomically with any other staleness check it already does), not rely
   * solely on its own signal/epoch snapshot: that snapshot cannot see a
   * barge-in, epoch advance, or explicit `tts.cancel` that cleared this
   * specific registration through one of those direct paths instead.
   */
  isPlaybackActive(playbackId: string): boolean {
    const playback = this.playbacksById.get(playbackId);
    return playback !== undefined && !playback.cleared;
  }

  /**
   * SD §5.4 "建立唯一 media output owner／epoch": used on handoff/reconnect
   * to invalidate any in-flight playback generation before a new owner may
   * play audio. Also publishes a `media.epoch.advanced` event (Codex
   * reopen round 5/6, R2 residual) through the same `eventSink` every other
   * session event flows through -- this is the one authority-transition
   * boundary a turn coordinator downstream needs to react to, regardless of
   * which caller (composed wrapper or a directly retained session
   * reference) triggered this method. Emitted synchronously, after the
   * local epoch/generation bookkeeping above but before returning, so a
   * caller observing no cancellation immediately after this call returns
   * would be a real regression, not a timing artifact.
   */
  advanceMediaEpoch(): number {
    const previousGeneration = this.activeGeneration;
    this.mediaEpoch += 1;
    // Incremented independently of `mediaEpoch`'s own value (not assigned
    // from it): `handleSpeechStarted` also advances `activeGeneration` on
    // its own, unrelated schedule, and this must stay monotonic regardless
    // of how many barge-ins happened since the last epoch advance -- never
    // regress to a lower generation number than one already issued.
    this.activeGeneration = previousGeneration + 1;
    for (const playback of this.playbacksById.values()) {
      if (!playback.cleared && playback.generation === previousGeneration) {
        playback.cleared = true;
      }
    }
    this.emit({
      type: "media.epoch.advanced",
      ...this.eventStamp(new Date().toISOString()),
    });
    return this.mediaEpoch;
  }

  /**
   * SD §5.3 barge-in: local, immediate playback-generation invalidation on
   * detected speech start, independent of any API/DB round trip. Returns the
   * ids of playbacks that were cleared by this call (if any), so the caller
   * (e.g. the CTI/media bridge) knows which outbound buffers to clear.
   *
   * Bumps `activeGeneration` (not just clearing already-registered
   * playbacks): a `startPlayback` call whose `synthesize` is still in
   * flight when speech starts has not registered into `playbacksById` yet,
   * so scanning the map alone could never see it. Once bumped, that call's
   * captured (now-stale) generation will mismatch `activeGeneration` the
   * moment its `synthesize` resolves, and `startPlayback` discards it
   * instead of registering/emitting late audio over the caller's barge-in.
   */
  handleSpeechStarted(occurredAt: string): { clearedPlaybackIds: string[] } {
    const clearedPlaybackIds: string[] = [];
    const previousGeneration = this.activeGeneration;
    this.activeGeneration += 1;
    for (const playback of this.playbacksById.values()) {
      if (!playback.cleared && playback.generation === previousGeneration) {
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
    // A streaming-capable adapter already delivered this (and possibly
    // other, later) result(s) via `onResult` as soon as they were decoded
    // -- emitting it again here from the request/response return value
    // would report the same revision twice.
    if (!this.asrStreamsResults) {
      this.emit({
        type: result.final ? "asr.segment.final" : "asr.segment.partial",
        ...this.eventStamp(occurredAt),
        payload: result,
      });
    }
    return result;
  }

  /** Ends the ASR provider's audio stream and releases its underlying
   * connection, if the adapter supports it. Idempotent and safe to call on
   * every session-close path (normal close, drain, idle timeout, provider
   * failure, attach failure) -- a provider stream, its waiters, and any
   * billing/session resource it holds must not outlive this session. Each
   * call is isolated: an adapter whose `endAudio`/`close` throws (e.g. a
   * native WebSocket boundary rejecting a send attempted outside the OPEN
   * state) must never prevent the other from running, nor escape to the
   * composer's own close handler and block its session-map cleanup.
   *
   * Returns a `Promise` that settles once the adapter's own teardown has
   * actually finished (e.g. `TwmAsrNetworkAdapter`'s bounded EOS drain),
   * not merely once it was *requested* -- a caller that discards this
   * return value (as `close(): void { void this.terminate(...); }`-style
   * call sites used to) can never observe when cleanup genuinely
   * completes, which is exactly what left `MediaWorkerServer.stop`/`drain`
   * unable to await it (R11). Never throws/rejects. */
  async closeAsr(): Promise<void> {
    try {
      this.asrAdapter.endAudio?.();
    } catch {
      // Best effort -- teardown continues regardless (SD §11.4).
    }
    try {
      await this.asrAdapter.close?.();
    } catch {
      // Best effort -- teardown continues regardless (SD §11.4).
    }
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

  /** SD §11.2/§5.4: playback is tagged with the generation active at creation time.
   *
   * Barge-in (`handleSpeechStarted`) may bump `activeGeneration` while
   * `synthesize` is still in flight -- before this playback has registered
   * into `playbacksById` at all, so a plain map scan at barge-in time could
   * never have cleared it. Checking the captured `generation` against the
   * (possibly now-newer) `activeGeneration` here, after the await, is what
   * actually fences that case: a stale result is discarded (never
   * registered, never emitted, empty audio returned) instead of being
   * played back over the caller's barge-in.
   *
   * `isStillValid`, when supplied, is re-checked at the exact same point as
   * the generation comparison -- atomically, before this playback is ever
   * registered or its "started" event emitted (Codex reopen round 3, R1):
   * a caller-level re-check performed only *after* `startPlayback` already
   * returned is too late, since registration/emission has already
   * happened by then. This is what lets a turn-level staleness source that
   * `activeGeneration` alone cannot see (a newer final, a turn timeout, or
   * a media-epoch advance that happened while this call's own `propose`/
   * `synthesize` was still in flight) discard the result before it can
   * ever be marked started, let alone later accepted as completed.
   *
   * `cancelOn`, when supplied, is re-checked for the entire remaining
   * *lifetime* of this registered playback, not only once before
   * registration (Codex reopen round 4, R1): a newer final, a turn
   * timeout, or a release/drain can all abort it well *after* this
   * playback has already registered and even after its audio has already
   * been published -- `isStillValid` alone cannot see that, since it is
   * only ever consulted at this one point in time. Registering an abort
   * listener here means any such later abort immediately cancels this
   * specific playback (SD §11.5: once cancelled, a late completion mark
   * must never "revive" it), instead of leaving it `cleared: false`
   * forever until an unrelated barge-in/epoch-advance happens to touch the
   * same generation.
   */
  async startPlayback(
    text: string,
    languageCode: string,
    occurredAt: string,
    isStillValid?: () => boolean,
    cancelOn?: AbortSignal,
  ): Promise<VoiceTtsPlaybackHandle> {
    const generation = this.activeGeneration;
    const handle = await this.ttsAdapter.synthesize({
      sessionId: this.sessionId,
      text,
      languageCode,
      generation,
    });
    if (
      generation !== this.activeGeneration ||
      (isStillValid && !isStillValid())
    ) {
      return { ...handle, audioChunks: [] };
    }
    this.playbacksById.set(handle.playbackId, {
      playbackId: handle.playbackId,
      generation,
      cleared: false,
    });
    if (cancelOn) {
      cancelOn.addEventListener(
        "abort",
        () => {
          this.cancelPlayback(
            handle.playbackId,
            "turn_superseded",
            new Date().toISOString(),
          );
        },
        { once: true },
      );
    }
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

  cancelPlayback(
    playbackId: string,
    reason: string,
    occurredAt: string,
  ): boolean {
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
