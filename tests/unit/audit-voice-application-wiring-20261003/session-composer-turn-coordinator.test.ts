import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import { VoiceCallTurnCoordinator } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import type {
  VoiceAsrSegmentResult,
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
  VoiceTtsPlaybackHandle,
  VoiceTtsSynthesizeRequest,
} from "../../../apps/voice-media-worker/src/media-provider";
import type { WebSocketServerChannel } from "../../../apps/voice-media-worker/src/server/websocket-channel";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003, Codex review round 2 (reopen)
 * R1/R2: real `VoiceSessionComposer` + `VoiceMediaWorkerSession` +
 * `VoiceCallTurnCoordinator`, wired exactly as `attach()` wires them in
 * production, with only the ASR/TTS adapters (the external speech-engine
 * boundary this worker genuinely has no vendor account for) as test
 * doubles -- no socket, no HTTP, no listening server (same restriction as
 * `../../audit-voice-runtime-20261002/session-composer.test.ts`).
 *
 * This is the file `call-turn-coordinator.test.ts`'s doc comment names
 * but that round 1's candidate never created -- the gap the reviewer
 * flagged (R5): the pre-existing composer tests never passed a
 * `turnCoordinator`, so their passing never covered this composed path.
 */

function makeChannel(): {
  channel: WebSocketServerChannel;
  sentText: string[];
  sentBinary: Buffer[];
} {
  const sentText: string[] = [];
  const sentBinary: Buffer[] = [];
  const channel = new (class extends EventEmitter {
    destroyed = false;
    sendText(payload: string): void {
      sentText.push(payload);
    }
    sendBinary(payload: Buffer): void {
      sentBinary.push(payload);
    }
  })();
  return {
    channel: channel as unknown as WebSocketServerChannel,
    sentText,
    sentBinary,
  };
}

async function flush(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Delivers finals only via the streaming `onResult` hook, exactly like a
 * provider whose transport can emit a buffered result independent of the
 * `transcribe()` call that triggered it -- which is what lets a test
 * deliver a "late" final *after* the session's channel has already
 * closed, the real scenario R1 is about. */
class StreamingAsrAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "streaming-double";
  readonly isProductionCapable = false as const;
  private listener?: (result: VoiceAsrSegmentResult) => void;
  private resolveClose?: () => void;

  async transcribe(): Promise<VoiceAsrSegmentResult> {
    throw new Error("unused: this double only delivers via onResult");
  }

  onResult(listener: (result: VoiceAsrSegmentResult) => void): void {
    this.listener = listener;
  }

  emitFinal(text: string, segmentId: string): void {
    this.listener?.({
      segmentId,
      revision: 1,
      text,
      final: true,
      language: "cmn-TW",
    });
  }

  /** Teardown stays pending until the test explicitly settles it, so a
   * close can be observed as "in flight" while a late final still
   * arrives. */
  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.resolveClose = resolve;
    });
  }

  settleClose(): void {
    this.resolveClose?.();
  }
}

class DeterministicTtsAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "test-double";
  readonly isProductionCapable = false as const;

  async synthesize(
    request: VoiceTtsSynthesizeRequest,
  ): Promise<VoiceTtsPlaybackHandle> {
    return {
      playbackId: `pb-${request.sessionId}-${request.generation}`,
      generation: request.generation,
      audioChunks: [new TextEncoder().encode(`audio:${request.text}`)],
    };
  }
}

/** TTS adapter whose `synthesize` call only resolves once the test
 * explicitly settles it -- used to hold a playback mid-flight so a
 * `speech.started` barge-in can be delivered while it is outstanding. */
class DeferredTtsAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "deferred-tts";
  readonly isProductionCapable = false as const;
  calls = 0;
  private resolveSynth?: () => void;

  synthesize(request: VoiceTtsSynthesizeRequest): Promise<VoiceTtsPlaybackHandle> {
    this.calls += 1;
    return new Promise((resolve) => {
      this.resolveSynth = () =>
        resolve({
          playbackId: `pb-${this.calls}`,
          generation: request.generation,
          audioChunks: [new TextEncoder().encode("stale-audio")],
        });
    });
  }

  settle(): void {
    this.resolveSynth?.();
  }
}

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003: VoiceSessionComposer + VoiceCallTurnCoordinator composed", () => {
  /**
   * R1: a late final delivered by an old, already-released attachment's
   * ASR adapter must never be spoken on the old (torn-down) channel, and
   * must never bleed into a replacement attachment reusing the same
   * session id -- the replacement's own first final must still produce a
   * fresh collection prompt, not an empty "handoff already happened" one.
   */
  it("never speaks a late final from a released attachment, and still gives a replacement attachment a fresh turn", async () => {
    const oldAsr = new StreamingAsrAdapter();
    const replacementAsr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    let attachCount = 0;
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const composer = new VoiceSessionComposer(
      {
        createAdapters: () => {
          attachCount += 1;
          return {
            asrAdapter: attachCount === 1 ? oldAsr : replacementAsr,
            ttsAdapter: tts,
          };
        },
      },
      coordinator,
    );

    const { channel: oldChannel, sentBinary: oldBinary } = makeChannel();
    composer.attach("sess-shared", oldChannel);
    (oldChannel as unknown as EventEmitter).emit(
      "close",
      1000,
      "Normal closure",
    );

    const { channel: newChannel, sentBinary: newBinary } = makeChannel();
    composer.attach("sess-shared", newChannel);

    // Late final from the OLD (already-released) attachment, delivered
    // while its own ASR teardown is still draining.
    oldAsr.emitFinal("救命", "seg-old");
    await flush();
    expect(oldBinary).toHaveLength(0);

    oldAsr.settleClose();
    await flush();

    replacementAsr.emitFinal("", "seg-new");
    await flush();

    expect(newBinary.length).toBeGreaterThan(0);
    expect(newBinary[0]!.toString("utf8")).toBe(
      "audio:請說明上車地點的縣市、道路與門牌或入口。",
    );
    // The replacement's channel never received the old attachment's
    // emergency prompt.
    expect(
      newBinary.some((chunk) => chunk.toString("utf8").includes("緊急救援")),
    ).toBe(false);
  });

  /**
   * R2: a playback whose `synthesize` is still in flight when
   * `speech.started` arrives has not registered into the session's
   * playback map yet, so clearing *existing* playbacks alone cannot fence
   * it -- `VoiceMediaWorkerSession.startPlayback`'s own post-await
   * generation check is what must discard it.
   */
  it("discards a turn's synthesized audio that resolves after a speech.started barge-in", async () => {
    const asr = new StreamingAsrAdapter();
    const tts = new DeferredTtsAdapter();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );

    const { channel, sentBinary } = makeChannel();
    composer.attach("sess-bargein", channel);

    // Empty transcript -> real engine proposes no tools and falls through
    // to the fresh collection prompt, which the coordinator then tries to
    // speak via `session.startPlayback` -> `tts.synthesize` (held).
    asr.emitFinal("", "seg-1");
    await flush();
    expect(tts.calls).toBe(1);
    expect(sentBinary).toHaveLength(0);

    // Caller barges in while that synthesis is still outstanding.
    (channel as unknown as EventEmitter).emit(
      "message",
      JSON.stringify({ type: "speech.started" }),
      false,
    );
    await flush();

    // The held synthesis now resolves with audio for the prompt that was
    // current *before* the barge-in.
    tts.settle();
    await flush();

    expect(sentBinary).toHaveLength(0);
    expect(
      sentBinary.some((chunk) => chunk.toString("utf8").includes("stale-audio")),
    ).toBe(false);
  });
});
