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
import type { VoiceCallTurnCoordinator } from "../dialogue/call-turn-coordinator";

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
  closing?: Promise<void>;
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
            speak: async (text, languageCode) => {
              const handle = await session.startPlayback(
                text,
                languageCode,
                new Date().toISOString(),
              );
              for (const chunk of handle.audioChunks) {
                channel.sendBinary(Buffer.from(chunk));
              }
            },
          });
        }
      },
    });
    const composed: ComposedSession = { session, channel };
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
      // A session id may be reused by an unrelated later call; its turn
      // state (collected slots, handoff) must never bleed into that call.
      if (turnAttachment) this.turnCoordinator?.release(turnAttachment);
      // The ASR provider's connection/waiters/billing resource must not
      // outlive this session -- this fires on every close path (normal
      // close, drain, idle timeout, a frame-limit/failure-driven close),
      // since all of them route through the channel's single authoritative
      // `close()`. `closeAsr()` resolves once that teardown has actually
      // finished (R11), not merely once it was requested -- track it so a
      // caller doing an orderly shutdown can await real completion instead
      // of firing-and-forgetting it.
      this.beginClose(composed);
    });
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

  private beginClose(composed: ComposedSession): Promise<void> {
    if (composed.closing) return composed.closing;
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
        const handle = await composed.session.startPlayback(
          frame.text,
          frame.languageCode,
          occurredAt,
        );
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
