import { EventEmitter } from "node:events";
import type { WebSocketServerChannel } from "./websocket-channel";
import {
  VoiceMediaWorkerSession,
  type VoiceMediaWorkerEvent,
} from "../media-session";
import type {
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
} from "../media-provider";
import type {
  VoiceCallAttachment,
  VoiceCallTurnCoordinator,
} from "../dialogue/call-turn-coordinator";

/** Builds the ASR/TTS adapter pair for one freshly attached session. Called
 * once per session id -- never shared across sessions, since an adapter
 * like `TwmAsrNetworkAdapter` owns exactly one WebSocket connection. */
export interface VoiceSessionProviderFactory {
  createAdapters(sessionId: string): {
    asrAdapter: VoiceSpeechToTextAdapter;
    ttsAdapter: VoiceTextToSpeechAdapter;
  };
}

interface ComposedSession {
  session: VoiceMediaWorkerSession;
  channel: WebSocketServerChannel;
  turnAttachment: VoiceCallAttachment | undefined;
  closing?: Promise<void>;
  /** Aborted exactly once, from `beginClose` (Codex reopen round 4, R1
   * finding 4): the raw `tts.synthesize` control frame has no turn/signal
   * of its own to fence it (unlike the turn-coordinator-driven `speak`
   * path below, which reuses the turn's own abort controller), so a
   * dedicated session-level signal is what lets a synthesis started before
   * close, but still outstanding when the channel closes, discard its
   * result instead of registering/publishing after the session is gone. */
  closeAbort: AbortController;
}

export type VoiceSessionControlFrame =
  | { type: "speech.started" }
  | { type: "speech.ended" }
  | { type: "dtmf"; digit: string }
  | { type: "tts.synthesize"; text: string; languageCode: string }
  | { type: "tts.complete"; playbackId: string }
  | { type: "tts.cancel"; playbackId: string; reason: string };

function isControlFrame(value: unknown): value is VoiceSessionControlFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/**
 * Bridges the transport-agnostic `VoiceMediaWorkerSession` (ASR/TTS/
 * playback-generation sequencing, SD §5.3-§5.4/§11.4-§11.5) onto this
 * worker's actual WebSocket channel. Binary frames are inbound call audio
 * for ASR; JSON text frames are control events (speech/DTMF detection, TTS
 * requests/acks) from whatever is actually driving the call turn-by-turn --
 * the CTI/IVR dialogue orchestration layer, which does not exist yet (see
 * docs/04-uat/audit-voice-runtime-20261002.md). Synthesized audio is
 * written back as outbound binary frames on the same channel. This class
 * never decides *what* to say or when a call ends; it only executes the
 * media/ASR/TTS mechanics for a session id someone else admitted and is
 * driving through the control channel.
 */
export class VoiceSessionComposer extends EventEmitter {
  private readonly sessions = new Map<string, ComposedSession>();
  /** Tracks each session's in-flight `closeAsr()` teardown from the moment
   * its channel emits "close" until that teardown actually settles (R11).
   * `attach`'s close handler deletes the session from `this.sessions`
   * synchronously -- `get()` must stop returning it immediately -- but the
   * underlying provider's bounded drain/cleanup can still be running; this
   * map is what lets `awaitPendingCloses` give a caller (ultimately
   * `MediaWorkerServer.stop`/`drain`) a real signal for "every attached
   * session's provider resource has actually been released," instead of
   * treating "removed from the session map" as proof of that. Self-prunes
   * once each entry settles so long-running normal operation (sessions
   * that close on their own, not during a drain) never accumulates. */
  private readonly pendingCloses = new Set<Promise<void>>();

  constructor(
    private readonly providerFactory: VoiceSessionProviderFactory,
    /** Drives the actual session.event -> bounded-turn -> TTS composition
     * (see `../dialogue/call-turn-coordinator.ts`) for every attached
     * session. Optional so tests/diagnostics that only need the raw
     * ASR/TTS/control-frame mechanics (no dialogue turn at all) can omit
     * it. */
    private readonly turnCoordinator?: VoiceCallTurnCoordinator,
  ) {
    super();
  }

  /** Call once a session's WebSocket channel is established (the only
   * `session.connected` consumer this worker has). */
  attach(sessionId: string, channel: WebSocketServerChannel): void {
    const { asrAdapter, ttsAdapter } =
      this.providerFactory.createAdapters(sessionId);
    // Created synchronously, before the channel's own "message"/"close"
    // listeners are wired below -- this attachment's handle is live before
    // any event for it can possibly be delivered (R1: a late event from a
    // *prior*, already-released attachment of the same session id must
    // never be confused with this one; see `VoiceCallTurnCoordinator`).
    const turnAttachment = this.turnCoordinator?.attach(sessionId);
    const session = new VoiceMediaWorkerSession({
      sessionId,
      asrAdapter,
      ttsAdapter,
      eventSink: (event) => {
        // A final received during peer disconnect remains observable by the
        // worker's control-plane consumer, independently of the media socket.
        this.emit("session.event", { sessionId, event });
        this.sendEvent(channel, event);
        if (turnAttachment) {
          this.turnCoordinator?.handle(turnAttachment, event, {
            speak: async (text, languageCode, signal, mediaEpoch) => {
              // Passed into `startPlayback` itself (Codex reopen round 3,
              // R1), not just re-checked here after it returns:
              // `startPlayback`'s own `synthesize` call is exactly the
              // async gap a release, barge-in, newer final, or turn
              // timeout can land in, and by the time this `await` resumes,
              // a caller-side check is already too late -- `startPlayback`
              // has already registered the playback and emitted its
              // "started" event. `signal` catches release/barge-in/newer-
              // final/timeout (they all abort the same controller);
              // `mediaEpoch` catches a handoff/reconnect epoch advance that
              // happened between this transcript's capture and now, which
              // `signal` alone would never see since none of those abort
              // the controller.
              //
              // `signal` is also passed as `cancelOn` (Codex reopen round
              // 4, R1 findings 1-3): registration and audio publication are
              // not the end of this playback's exposure -- a release,
              // newer final, or timeout that aborts `signal` *after*
              // registration (even long after, with audio already sent)
              // must still retroactively invalidate it, so a later real
              // `tts.complete` mark for it can never succeed.
              const handle = await session.startPlayback(
                text,
                languageCode,
                new Date().toISOString(),
                () => !signal.aborted && session.getMediaEpoch() === mediaEpoch,
                signal,
              );
              // Re-checked again here, immediately before publishing any
              // audio (Codex reopen round 4, R1 finding 5): registration
              // inside `startPlayback` and this outbound batch are
              // separate async boundaries, and a cancellation that lands
              // in between (e.g. a barge-in control frame reacting to the
              // "started" event this same registration just emitted) must
              // fence the audio itself, not only future completion marks --
              // `handle.audioChunks` is a local copy already captured
              // before this check, so the session's own bookkeeping being
              // cancelled does not by itself stop these bytes from being
              // sent.
              //
              // `isPlaybackActive` is also consulted here (Codex reopen
              // round 5/6, R1 residual): `signal`/`mediaEpoch` alone miss a
              // barge-in (`handleSpeechStarted`), an epoch advance, or an
              // explicit `tts.cancel` that cleared *this* registration
              // directly in the session's own playback map, with no event
              // reaching this turn's `signal` or this session's
              // `mediaEpoch` at all -- those only fire for turn-level
              // supersession (release/newer-final/timeout), not for a
              // direct clear of the registered playback itself.
              if (
                signal.aborted ||
                session.getMediaEpoch() !== mediaEpoch ||
                !session.isPlaybackActive(handle.playbackId)
              ) {
                return;
              }
              for (const chunk of handle.audioChunks) {
                channel.sendBinary(Buffer.from(chunk));
              }
            },
            currentMediaEpoch: () => session.getMediaEpoch(),
          });
        }
      },
    });
    const composed: ComposedSession = {
      session,
      channel,
      turnAttachment,
      closeAbort: new AbortController(),
    };
    this.sessions.set(sessionId, composed);

    channel.on("message", (data: string | Buffer, isBinary: boolean) => {
      void this.handleMessage(sessionId, data, isBinary);
    });
    channel.on("close", () => {
      // Guards against a duplicate "close" emission re-running cleanup for
      // an already-removed session -- defensive on top of the channel's
      // own single-emission guarantee (see `./websocket-channel`).
      if (this.sessions.get(sessionId) !== composed) return;
      this.sessions.delete(sessionId);
      // The ASR provider's connection/waiters/billing resource must not
      // outlive this session -- this fires on every close path (normal
      // close, drain, idle timeout, a frame-limit/failure-driven close),
      // since all of them route through the channel's single authoritative
      // `close()`. `closeAsr()` resolves once that teardown has actually
      // finished (R11), not merely once it was requested -- track it so a
      // caller doing an orderly shutdown can await real completion instead
      // of firing-and-forgetting it. `beginClose` itself releases the turn
      // attachment (R1, Codex reopen round 2) -- the common boundary both
      // this path and `drain()` go through, before `closeAsr` can
      // synchronously emit a drain final.
      this.beginClose(composed);
    });
  }

  /** The production entry point for a media-authority transition
   * (handoff/reconnect, SD §5.4) on an attached session -- Codex reopen
   * round 5/6, R2: `VoiceMediaWorkerSession.advanceMediaEpoch` on its own
   * only updates local epoch/playback bookkeeping and has no reference to
   * this attachment's turn coordinator, so calling it directly (as a unit
   * test driving the session alone still may, for the lower-level
   * epoch/generation fencing that already covers) never cancels a turn
   * that is currently blocked on persist/execute/provider work under the
   * *old* epoch. This composed call does both, in order, synchronously: a
   * pending provider/persist call for this attachment is cancelled before
   * this method returns, not merely fenced the next time that turn
   * happens to re-check its own staleness. Returns the new epoch, or
   * `undefined` if no session is attached under this id. The actual
   * handoff/reconnect driver that will call this in production does not
   * exist yet (see `../dialogue/call-turn-coordinator.ts`'s class doc) --
   * this is the composition seam it must call through once it does. */
  advanceMediaEpoch(sessionId: string): number | undefined {
    const composed = this.sessions.get(sessionId);
    if (!composed) return undefined;
    const newEpoch = composed.session.advanceMediaEpoch();
    if (composed.turnAttachment) {
      this.turnCoordinator?.invalidateCurrentTurn(composed.turnAttachment);
    }
    return newEpoch;
  }

  /** The composed session harness for a currently attached session id, if
   * any -- exposed for tests/diagnostics; production control flow goes
   * only through `attach` and the channel's own message/close events. */
  get(sessionId: string): VoiceMediaWorkerSession | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  /** Resolves once every session's `closeAsr()` teardown that is currently
   * in flight has settled (R11). A session whose channel closes *after*
   * this is called is not included -- callers doing an orderly shutdown
   * (`MediaWorkerServer.stop`/`drain`) close every channel first, which is
   * what populates this map, then await this. Never rejects: `closeAsr()`
   * itself never throws. */
  async awaitPendingCloses(): Promise<void> {
    await Promise.all(Array.from(this.pendingCloses));
  }

  /** The one boundary every close/drain path goes through (channel "close"
   * above, and `drain` below). Releases the turn attachment -- which also
   * aborts any turn still active/queued for it -- *before* calling
   * `closeAsr` (R1, Codex reopen round 2): `closeAsr`'s own
   * `endAudio`/`close` can synchronously trigger a drain final through the
   * ASR adapter's `onResult` callback, and that final must never be
   * admitted as new conversational input. Releasing first means
   * `VoiceCallTurnCoordinator.handle` sees an already-released (missing)
   * attachment for it and is a no-op; the event still reaches
   * `this.emit("session.event", ...)`/`sendEvent` as observable evidence
   * via the normal event-sink path, which forwards every event regardless
   * of attachment state. A turn that was still mid-flight when this runs is
   * aborted, so its `speak` call (if already past the coordinator's own
   * pre-check) is fenced by the same `signal` re-check `speak` always
   * does. */
  private beginClose(composed: ComposedSession): Promise<void> {
    if (composed.closing) return composed.closing;
    // Fences the raw `tts.synthesize` control-frame path (Codex reopen
    // round 4, R1 finding 4), which has no turn/signal of its own: a
    // synthesis started before close but still outstanding when this runs
    // must never register/publish once it resolves.
    composed.closeAbort.abort();
    if (composed.turnAttachment) {
      this.turnCoordinator?.release(composed.turnAttachment);
    }
    const closing = composed.session.closeAsr();
    composed.closing = closing;
    this.pendingCloses.add(closing);
    void closing.then(() => this.pendingCloses.delete(closing));
    return closing;
  }

  /** Stop accepting audio, but keep connected clients able to receive the
   * bounded provider final drain before the server closes their transport. */
  async drain(): Promise<void> {
    for (const composed of this.sessions.values()) this.beginClose(composed);
    await this.awaitPendingCloses();
  }

  private async handleMessage(
    sessionId: string,
    data: string | Buffer,
    isBinary: boolean,
  ): Promise<void> {
    const composed = this.sessions.get(sessionId);
    if (!composed || composed.closing) return;
    const occurredAt = new Date().toISOString();

    if (isBinary) {
      const chunk =
        data instanceof Buffer
          ? new Uint8Array(data)
          : new Uint8Array(Buffer.from(data));
      try {
        await composed.session.transcribeChunk(chunk, occurredAt);
      } catch (err) {
        this.sendError(composed.channel, err);
      }
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(
        typeof data === "string" ? data : data.toString("utf8"),
      );
    } catch {
      return;
    }
    if (!isControlFrame(parsed)) return;

    try {
      await this.handleControlFrame(composed, parsed, occurredAt);
    } catch (err) {
      this.sendError(composed.channel, err);
    }
  }

  private async handleControlFrame(
    composed: ComposedSession,
    frame: VoiceSessionControlFrame,
    occurredAt: string,
  ): Promise<void> {
    switch (frame.type) {
      case "speech.started":
        composed.session.handleSpeechStarted(occurredAt);
        return;
      case "speech.ended":
        composed.session.handleSpeechEnded(occurredAt);
        return;
      case "dtmf":
        composed.session.handleDtmf(frame.digit, occurredAt);
        return;
      case "tts.synthesize": {
        // Codex reopen round 4, R1 finding 4: this raw entry bypasses the
        // turn coordinator entirely, so it has no per-turn abort signal --
        // `composed.closeAbort` (aborted once from `beginClose`, see
        // above) is what fences it against the session closing while its
        // synthesis is still outstanding.
        const handle = await composed.session.startPlayback(
          frame.text,
          frame.languageCode,
          occurredAt,
          () => !composed.closeAbort.signal.aborted,
          composed.closeAbort.signal,
        );
        // `isPlaybackActive` is also consulted here (Codex reopen round
        // 5/6, R1 residual): this raw entry has no turn/signal of its own
        // and `cancelOn` above only fences session-close -- a barge-in
        // (`speech.started`), an epoch advance, or an explicit
        // `tts.cancel` for this exact playback id all clear it directly in
        // the session's own map, with no event reaching `closeAbort` at
        // all, so `closeAbort.signal.aborted` alone cannot see any of
        // them.
        if (
          composed.closeAbort.signal.aborted ||
          !composed.session.isPlaybackActive(handle.playbackId)
        ) {
          return;
        }
        for (const chunk of handle.audioChunks) {
          composed.channel.sendBinary(Buffer.from(chunk));
        }
        return;
      }
      case "tts.complete":
        composed.session.completePlayback(frame.playbackId, occurredAt);
        return;
      case "tts.cancel":
        composed.session.cancelPlayback(
          frame.playbackId,
          frame.reason,
          occurredAt,
        );
        return;
    }
  }

  private sendEvent(
    channel: WebSocketServerChannel,
    event: VoiceMediaWorkerEvent,
  ): void {
    if (channel.destroyed) return;
    channel.sendText(JSON.stringify(event));
  }

  private sendError(channel: WebSocketServerChannel, err: unknown): void {
    if (channel.destroyed) return;
    channel.sendText(
      JSON.stringify({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
