import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import { VoiceCallTurnCoordinator } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import type { VoiceDialogueProvider } from "../../../apps/voice-media-worker/src/dialogue/voice-dialogue-provider";
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

/** Whether a captured `session.event` stream contains a
 * `tts.playback.started`/`tts.playback.completed` event for a specific
 * playback id -- used to prove a discarded/superseded playback never
 * produced *any* valid started/completed evidence (Codex reopen round 3,
 * R1), not merely that its audio chunks never reached the channel. */
function hasPlaybackEvent(
  events: readonly unknown[],
  type: "tts.playback.started" | "tts.playback.completed",
  playbackId: string,
): boolean {
  return events.some((entry) => {
    const event = (
      entry as {
        event?: { type?: string; payload?: { playbackId?: string } };
      }
    ).event;
    return event?.type === type && event.payload?.playbackId === playbackId;
  });
}

/** Delivers a real `tts.complete` control frame on `channel`, exactly as a
 * provider's playback-mark callback would -- the production path
 * `VoiceSessionComposer.handleControlFrame` routes to
 * `VoiceMediaWorkerSession.completePlayback`. */
function sendTtsComplete(
  channel: WebSocketServerChannel,
  playbackId: string,
): void {
  (channel as unknown as EventEmitter).emit(
    "message",
    JSON.stringify({ type: "tts.complete", playbackId }),
    false,
  );
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
 * `speech.started` barge-in, newer final, or timeout can be delivered
 * while it is outstanding. Tracks every outstanding call, not just the
 * latest one (Codex reopen round 3, R3): once a hung TTS call no longer
 * blocks a later turn's own synthesis call, two calls can be genuinely
 * concurrent (the superseded one and the current one), and a test needs
 * to settle each independently, in the order they were made. */
class DeferredTtsAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "deferred-tts";
  readonly isProductionCapable = false as const;
  calls = 0;
  private readonly pending: Array<() => void> = [];

  synthesize(request: VoiceTtsSynthesizeRequest): Promise<VoiceTtsPlaybackHandle> {
    this.calls += 1;
    const callIndex = this.calls;
    return new Promise((resolve) => {
      this.pending.push(() =>
        resolve({
          playbackId: `pb-${callIndex}`,
          generation: request.generation,
          audioChunks: [new TextEncoder().encode("stale-audio")],
        }),
      );
    });
  }

  /** Settles the oldest still-outstanding call (FIFO), matching the order
   * calls were made in. */
  settle(): void {
    this.pending.shift()?.();
  }
}

const EMPTY_FINAL_OUTPUT = {
  intent: "unknown",
  text: "",
  terminal: "turn_complete",
  slots: [],
  tools: [],
  usage: { inputTokens: null, outputTokens: null },
};

/** A dialogue provider whose *first* `propose` call only resolves once the
 * test explicitly releases it -- used to hold a turn inside the engine's
 * own propose stage, *before* `startPlayback`/`synthesize` is even reached,
 * which is what lets a media-epoch advance land somewhere `startPlayback`'s
 * own post-synthesize generation check cannot see it (Codex reopen round
 * 2, R2's second sub-case). Every later call resolves immediately with the
 * same empty-collection-prompt output, so a later, legitimate turn on the
 * same attachment is never stuck behind a probe this test has already
 * observed. */
function deferredProvider(): {
  provider: VoiceDialogueProvider;
  resolve(output: unknown): void;
  proposeCalls: () => number;
} {
  let release: ((output: unknown) => void) | undefined;
  let proposeCalls = 0;
  const provider: VoiceDialogueProvider = {
    mode: "fixture",
    profileVersion: "deferred-composer:1",
    propose() {
      proposeCalls += 1;
      if (proposeCalls > 1) return Promise.resolve(EMPTY_FINAL_OUTPUT);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  return {
    provider,
    resolve: (output: unknown) => release?.(output),
    proposeCalls: () => proposeCalls,
  };
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
    const events: unknown[] = [];
    composer.on("session.event", (payload) => events.push(payload));

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
    // The discarded playback never produced valid started/completed
    // evidence, and a real `tts.complete` mark for it is a no-op.
    expect(hasPlaybackEvent(events, "tts.playback.started", "pb-1")).toBe(
      false,
    );
    sendTtsComplete(channel, "pb-1");
    await flush();
    expect(hasPlaybackEvent(events, "tts.playback.completed", "pb-1")).toBe(
      false,
    );
  });

  /**
   * R1, Codex reopen round 2 (second reopen, `codex-20261003T065856Z-cf25c3e3`):
   * `drain()` -> `beginClose()` -> `closeAsr()` can synchronously trigger a
   * drain final through the ASR adapter's `onResult` callback, *before* the
   * channel itself ever emits "close". That final must still be observable
   * (forwarded to `session.event`), but must never be admitted as new
   * conversational input or produce TTS output -- `beginClose` must release
   * the turn attachment before calling `closeAsr`, not only on the
   * channel's own "close" event.
   */
  it("retains a drain final as observable evidence only, never admitting it as a new turn", async () => {
    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );
    const events: unknown[] = [];
    composer.on("session.event", (payload) => events.push(payload));

    const { channel, sentBinary } = makeChannel();
    composer.attach("sess-drain", channel);

    // Drain begins teardown (closeAsr -> asr.close(), held) without the
    // channel itself closing.
    const draining = composer.drain();

    // A final delivered while that teardown is still in flight -- the real
    // "drain final" scenario.
    asr.emitFinal("救命", "seg-drain-final");
    await flush();

    expect(sentBinary).toHaveLength(0);
    expect(
      events.some(
        (event) =>
          (event as { event: { payload?: { segmentId?: string } } }).event
            .payload?.segmentId === "seg-drain-final",
      ),
    ).toBe(true);

    asr.settleClose();
    await draining;
  });

  /**
   * R1, same reopen: a turn already blocked inside a held TTS synthesis
   * when the channel closes must never publish once it resolves -- closing
   * must abort it the same way release always has, through the common
   * `beginClose` boundary.
   */
  it("discards output from a turn whose synthesis is still outstanding when the channel closes", async () => {
    const asr = new StreamingAsrAdapter();
    const tts = new DeferredTtsAdapter();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );
    const events: unknown[] = [];
    composer.on("session.event", (payload) => events.push(payload));
    const { channel, sentBinary } = makeChannel();
    composer.attach("sess-close-pending", channel);
    // Captured before close removes the attachment from the composer's own
    // map -- `get()` would no longer return it afterwards -- so the test
    // can still probe the underlying session's own completion defense
    // directly, not just the (already-torn-down) control-frame route.
    const session = composer.get("sess-close-pending")!;

    asr.emitFinal("", "seg-1");
    await flush(3);
    expect(tts.calls).toBe(1);

    (channel as unknown as EventEmitter).emit("close", 1000, "Normal closure");

    tts.settle();
    await flush();

    expect(sentBinary).toHaveLength(0);
    expect(hasPlaybackEvent(events, "tts.playback.started", "pb-1")).toBe(
      false,
    );
    // Neither the real control-frame route (now a no-op channel lookup
    // miss, since close already removed the attachment) nor the session
    // itself can be made to report a completion for a playback that was
    // never validly registered.
    sendTtsComplete(channel, "pb-1");
    await flush();
    expect(hasPlaybackEvent(events, "tts.playback.completed", "pb-1")).toBe(
      false,
    );
    expect(session.completePlayback("pb-1", new Date().toISOString())).toBe(
      false,
    );

    // A duplicate close emission (defensive guard) must not throw or
    // double-release.
    expect(() =>
      (channel as unknown as EventEmitter).emit("close", 1000, "Normal closure"),
    ).not.toThrow();
  });

  /**
   * R2, same reopen: a *newer final* (no barge-in control frame at all)
   * must fence a turn whose synthesis is still outstanding, exactly like
   * barge-in does -- `VoiceCallTurnSpeaker.speak`'s `signal` parameter is
   * what carries that, since neither `startPlayback`'s nor the session's
   * own generation bookkeeping changes for a plain newer-final
   * supersession.
   *
   * R3, Codex reopen round 3: the superseded turn's own still-outstanding
   * synthesis must never keep *blocking* the new turn's synthesis call --
   * the engine stage (which needs per-attachment serialization) has
   * already resolved for the first turn by the time its synthesis is
   * reached, so the second, current turn reaches its own `tts.synthesize`
   * promptly, well before the first turn's held call is ever settled.
   */
  it("discards synthesized audio for a turn superseded by a newer final, with no barge-in involved", async () => {
    const asr = new StreamingAsrAdapter();
    const tts = new DeferredTtsAdapter();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );
    const events: unknown[] = [];
    composer.on("session.event", (payload) => events.push(payload));
    const { channel, sentBinary } = makeChannel();
    composer.attach("sess-newer-final", channel);

    asr.emitFinal("", "seg-1");
    await flush(3);
    expect(tts.calls).toBe(1);

    // A second final while the first turn's synthesis is still held. The
    // first turn's own engine stage has already resolved (reaching
    // `startPlayback` at all proves that), so this does not have to wait
    // for the held synthesis to settle before reaching its own.
    asr.emitFinal("救命", "seg-2");
    await flush(5);
    expect(tts.calls).toBe(2);
    expect(sentBinary).toHaveLength(0);

    // Resolve the first (now-superseded) turn's synthesis (FIFO: the
    // oldest pending call first): must never publish, and must never
    // produce valid started/completed evidence either.
    tts.settle();
    await flush(5);
    expect(sentBinary).toHaveLength(0);
    expect(hasPlaybackEvent(events, "tts.playback.started", "pb-1")).toBe(
      false,
    );
    sendTtsComplete(channel, "pb-1");
    await flush();
    expect(hasPlaybackEvent(events, "tts.playback.completed", "pb-1")).toBe(
      false,
    );

    // The second, current turn's own synthesis resolving does publish.
    tts.settle();
    await flush();

    expect(sentBinary.length).toBeGreaterThan(0);
    expect(hasPlaybackEvent(events, "tts.playback.started", "pb-2")).toBe(
      true,
    );
  });

  /**
   * R2, same reopen, second sub-case: a media-epoch advance (handoff/
   * reconnect) that happens *before* `startPlayback` is even called --
   * while the engine's own `propose` stage is still outstanding -- must
   * not let that turn's eventual output be laundered under the new epoch.
   * `startPlayback`'s own post-synthesize generation check cannot catch
   * this: it only captures `activeGeneration` at the moment it is called,
   * which by then is already the *new* value. Only comparing against the
   * epoch captured when the triggering transcript actually arrived (R2's
   * `mediaEpoch` parameter) catches it.
   */
  it("discards synthesized audio laundered across a media-epoch advance that happened during the engine's propose stage", async () => {
    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    const deferred = deferredProvider();
    const coordinator = new VoiceCallTurnCoordinator(() => deferred.provider);
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );
    const events: unknown[] = [];
    composer.on("session.event", (payload) => events.push(payload));
    const { channel, sentBinary } = makeChannel();
    composer.attach("sess-epoch-launder", channel);
    const session = composer.get("sess-epoch-launder")!;

    asr.emitFinal("", "seg-1");
    await flush(3);
    expect(deferred.proposeCalls()).toBe(1);

    // The media owner changes (e.g. handoff/reconnect) while this turn's
    // propose is still outstanding -- before it has even reached
    // `startPlayback`.
    expect(session.advanceMediaEpoch()).toBe(2);

    deferred.resolve(EMPTY_FINAL_OUTPUT);
    await flush(5);

    expect(sentBinary).toHaveLength(0);
    // The laundered turn never produced valid started/completed evidence
    // either, even though its own (post-advance) generation matches the
    // new epoch -- only the pre-advance `mediaEpoch` captured at final
    // time catches this, which is exactly what distinguishes R2 from the
    // plain generation check `startPlayback` already had. The legitimate
    // later turn below computes the same generation-derived playback id
    // (nothing else has changed `activeGeneration` since), so this id is
    // not unique to the discarded attempt -- only its *ordering* relative
    // to the two assertions below is.
    const playbackId = `pb-sess-epoch-launder-2`;
    expect(hasPlaybackEvent(events, "tts.playback.started", playbackId)).toBe(
      false,
    );
    sendTtsComplete(channel, playbackId);
    await flush();
    expect(
      hasPlaybackEvent(events, "tts.playback.completed", playbackId),
    ).toBe(false);

    // A legitimate later turn, captured at the new epoch, still produces
    // output normally -- the epoch fence only discards the laundered
    // turn, it doesn't wedge the attachment.
    asr.emitFinal("救命", "seg-2");
    await flush(5);

    expect(sentBinary.length).toBeGreaterThan(0);
    expect(hasPlaybackEvent(events, "tts.playback.started", playbackId)).toBe(
      true,
    );
  });

  /**
   * R3, same reopen: a turn whose own queue-stage timeout has already
   * fired must never publish once its still-outstanding synthesis
   * eventually resolves -- the timeout must fence *this* turn's own
   * output, not just stop blocking later turns.
   */
  it("fences output from a turn whose synthesis is still outstanding when its own timeout fires", async () => {
    const asr = new StreamingAsrAdapter();
    const tts = new DeferredTtsAdapter();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      40,
    );
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );
    const events: unknown[] = [];
    composer.on("session.event", (payload) => events.push(payload));
    const { channel, sentBinary } = makeChannel();
    composer.attach("sess-timeout-fence", channel);

    asr.emitFinal("", "seg-1");
    await flush(3);
    expect(tts.calls).toBe(1);

    // Past the 40ms deadline, with the synthesis still held.
    await new Promise((resolve) => setTimeout(resolve, 90));
    await flush();

    tts.settle();
    await flush(5);

    expect(sentBinary).toHaveLength(0);
    expect(hasPlaybackEvent(events, "tts.playback.started", "pb-1")).toBe(
      false,
    );
    sendTtsComplete(channel, "pb-1");
    await flush();
    expect(hasPlaybackEvent(events, "tts.playback.completed", "pb-1")).toBe(
      false,
    );

    // A later final on the same attachment still reaches its own
    // synthesis and speaks normally -- the timeout only fences output, it
    // does not wedge the attachment.
    asr.emitFinal("", "seg-2");
    await flush(3);
    expect(tts.calls).toBe(2);
    tts.settle();
    await flush();

    expect(sentBinary.length).toBeGreaterThan(0);
    expect(hasPlaybackEvent(events, "tts.playback.started", "pb-2")).toBe(
      true,
    );
  });
});
