import { describe, it, expect, vi } from "vitest";
import {
  VoiceCallTurnCoordinator,
  type VoiceCallTurnSpeaker,
} from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import type { VoiceAsrSegmentEvent } from "../../../apps/voice-media-worker/src/media-session";
import type {
  VoiceDialogueProvider,
  VoiceDialogueRequest,
} from "../../../apps/voice-media-worker/src/dialogue/voice-dialogue-provider";
import {
  createFixtureDialoguePersistPort,
  type VoiceDialoguePersistPort,
} from "../../../apps/voice-media-worker/src/dialogue/dialogue-persist-port";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003: `VoiceDialogueEngine` and its
 * only real `VoiceDialogueProvider` implementation
 * (`OpenAiRealtimeFixtureAdapter`) existed in source but were never
 * instantiated by any production code path -- no `session.event` consumer
 * ever ran a turn. These tests exercise the real engine/state/fixture
 * machinery through `VoiceCallTurnCoordinator`, the composition this task
 * adds; `session-composer-turn-coordinator.test.ts` proves it is actually
 * wired onto a live `VoiceSessionComposer` session.
 *
 * `request_handoff` is the only tool this coordinator can honestly execute
 * (see the class doc in `call-turn-coordinator.ts`): apps/api's
 * DB-backed `VoiceToolGatewayService`/`VoiceBookingRepository` is
 * unreachable from this process (no exposed HTTP route and no capability-
 * token issuance path exist), and voice-media-worker has no database
 * dependency at all. Every other tool proposal must therefore force the
 * same honest `request_handoff` / `status: "unavailable"` outcome the
 * contract already defines for a genuinely unavailable provider.
 *
 * Codex review round 2 (reopen) R1/R2/R3: the first candidate never bound
 * turn state to the *attachment* that created it (only to a bare
 * `sessionId` string), never reacted to barge-in at all, and let a single
 * hung speaker/provider block every later turn for a session regardless of
 * `turnTimeoutMs`. The redesigned `attach()`/`handle()`/`release()` surface
 * below and its tests exercise exactly those three fixes.
 */

function finalSegment(
  text: string,
  segmentId = "seg-1",
  mediaEpoch = 1,
): VoiceAsrSegmentEvent {
  return {
    type: "asr.segment.final",
    sessionId: "sess-1",
    mediaEpoch,
    controlSequence: 1,
    occurredAt: new Date().toISOString(),
    payload: {
      segmentId,
      revision: 1,
      text,
      final: true,
      language: "cmn-TW",
    },
  };
}

function speechStartedEvent(): VoiceAsrSegmentEvent {
  return {
    type: "speech.started",
    sessionId: "sess-1",
    mediaEpoch: 1,
    controlSequence: 1,
    occurredAt: new Date().toISOString(),
  } as unknown as VoiceAsrSegmentEvent;
}

function trackingSpeaker(): VoiceCallTurnSpeaker & {
  calls: Array<{ text: string; languageCode: string }>;
} {
  const calls: Array<{ text: string; languageCode: string }> = [];
  return {
    calls,
    async speak(text, languageCode) {
      calls.push({ text, languageCode });
    },
    // Every event in this file carries `mediaEpoch: 1` (see `finalSegment`)
    // and never changes it -- epoch-advance fencing has its own coverage
    // in `session-composer-turn-coordinator.test.ts`.
    currentMediaEpoch: () => 1,
  };
}

/** Waits for a session's turn queue to drain by flushing the microtask
 * queue repeatedly -- the coordinator's public surface is fire-and-forget
 * (`handle` returns void), so tests observe completion only through the
 * speaker's side effect settling. */
async function flush(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A provider whose *first* `propose` call only resolves once the test
 * explicitly releases it -- used to pin a turn mid-flight so release/
 * barge-in/timeout behavior can be observed before the turn would
 * otherwise complete. Every later call resolves immediately with an empty
 * turn, so a later, unrelated turn on the same attachment is never stuck
 * behind a probe this test has already finished observing. */
function deferredProvider(): {
  provider: VoiceDialogueProvider;
  resolve(output: unknown): void;
  lastSignal: () => AbortSignal | undefined;
  proposeCalls: () => number;
} {
  let release: ((output: unknown) => void) | undefined;
  let lastSignal: AbortSignal | undefined;
  let proposeCalls = 0;
  const provider: VoiceDialogueProvider = {
    mode: "fixture",
    profileVersion: "deferred:1",
    propose(request: VoiceDialogueRequest) {
      proposeCalls += 1;
      lastSignal = request.signal;
      if (proposeCalls > 1) return Promise.resolve(EMPTY_FINAL_OUTPUT);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  return {
    provider,
    resolve: (output: unknown) => release?.(output),
    lastSignal: () => lastSignal,
    proposeCalls: () => proposeCalls,
  };
}

const EMPTY_FINAL_OUTPUT = {
  intent: "unknown",
  text: "",
  terminal: "turn_complete",
  slots: [],
  tools: [],
  usage: { inputTokens: null, outputTokens: null },
};

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003: VoiceCallTurnCoordinator", () => {
  it("runs a real turn for a plain greeting with no tools and speaks the real collection prompt", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-1");

    // An empty transcript matches none of the fixture's intent branches, so
    // it proposes no tools (terminal: "turn_complete") and the engine falls
    // through to VoiceDialogueState's own collection prompt for a fresh,
    // slot-less session -- asking for the pickup location, not a generic
    // menu prompt (that only fires for intent "unknown", which this
    // fixture never produces).
    coordinator.handle(attachment, finalSegment(""), speaker);
    await flush();

    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe(
      "請說明上車地點的縣市、道路與門牌或入口。",
    );
    expect(speaker.calls[0]!.languageCode).toBe("cmn-TW");
  });

  it("forces an honest handoff instead of fabricating a resolve_location result", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-2");

    coordinator.handle(
      attachment,
      finalSegment("從台北車站到松山機場"),
      speaker,
    );
    await flush();

    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe("已停止叫車資料蒐集。");

    // Handoff is terminal: a second final for the same session must not
    // re-run collection or re-propose tools -- VoiceDialogueEngine.turn
    // short-circuits with an empty prompt once `state.handoff` is set, so
    // the coordinator must not speak again.
    coordinator.handle(attachment, finalSegment("再問一次"), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(1);
  });

  it("speaks the real emergency safety message and forces handoff for emergency intent", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-3");

    coordinator.handle(attachment, finalSegment("救命"), speaker);
    await flush();

    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe(
      "如有立即危險，請聯絡當地緊急救援服務。",
    );
  });

  it("fences a stale turn when a later final supersedes it before the first settles", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-4");

    // Two finals admitted back-to-back, synchronously, before either turn
    // has run: `handle` bumps the session's inputEpoch before queuing each
    // one, so the first turn must observe it is stale once it reaches the
    // engine/provider's own epoch checks instead of racing the second.
    coordinator.handle(attachment, finalSegment("", "seg-a"), speaker);
    coordinator.handle(attachment, finalSegment("救命", "seg-b"), speaker);
    await flush();

    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe(
      "如有立即危險，請聯絡當地緊急救援服務。",
    );
  });

  it("starts a fresh engine/state after release, independent of the prior call on the same session id", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();
    const firstAttachment = coordinator.attach("sess-5");

    coordinator.handle(
      firstAttachment,
      finalSegment("從台北車站到松山機場"),
      speaker,
    );
    await flush();
    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe("已停止叫車資料蒐集。");

    coordinator.release(firstAttachment);

    // A session id reused for an unrelated later call must not resume the
    // prior call's handoff -- the slot-less collection prompt path must
    // run again, not the empty "handoff already happened" prompt.
    const secondAttachment = coordinator.attach("sess-5");
    coordinator.handle(secondAttachment, finalSegment(""), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(2);
    expect(speaker.calls[1]!.text).toBe(
      "請說明上車地點的縣市、道路與門牌或入口。",
    );
  });

  /**
   * R2, Codex reopen round 2/3: `inputEpoch` alone never fences a media-
   * authority change (handoff/reconnect). Without the `currentMediaEpoch`
   * check inside `VoiceDialogueEngine.turn`, a stale proposal captured
   * under the *old* media owner -- here, one that sets `state.handoff`,
   * exactly the "stale handoff/slot proposal" case the prior review round
   * called out as untested -- would still commit via
   * `Object.assign(state, next)` and poison every later turn on this
   * attachment, since `turn()` short-circuits with an empty prompt once
   * `state.handoff` is set (see the "forces an honest handoff" test
   * above). A fresh, legitimate final captured *after* the epoch advance
   * must still get the normal collection prompt, proving the stale
   * commit never landed.
   */
  it("fences a stale handoff-setting proposal laundered across a media-epoch advance, so a fresh turn at the new epoch is not poisoned", async () => {
    const deferred = deferredProvider();
    const coordinator = new VoiceCallTurnCoordinator(() => deferred.provider);
    const speaker = trackingSpeaker();
    let mediaEpoch = 1;
    speaker.currentMediaEpoch = () => mediaEpoch;
    const attachment = coordinator.attach("sess-epoch-state");

    coordinator.handle(attachment, finalSegment("救命", "seg-1", 1), speaker);
    await flush(3);
    expect(deferred.proposeCalls()).toBe(1);

    // The media owner changes (e.g. handoff/reconnect) while this turn's
    // propose is still outstanding.
    mediaEpoch = 2;

    deferred.resolve({
      intent: "emergency",
      text: "",
      terminal: "handoff",
      slots: [],
      tools: [],
      usage: { inputTokens: null, outputTokens: null },
    });
    await flush(5);

    expect(speaker.calls).toHaveLength(0);

    // A fresh final captured at the new epoch runs normally -- the epoch
    // fence only discards the laundered turn, it doesn't wedge the
    // attachment or leave `state.handoff` set from the discarded commit.
    // `deferredProvider`'s second-and-later calls always resolve
    // `EMPTY_FINAL_OUTPUT` (intent "unknown"), which is the menu prompt,
    // not the handoff short-circuit's empty prompt -- proving the stale
    // commit never landed.
    coordinator.handle(attachment, finalSegment("", "seg-2", 2), speaker);
    await flush(5);

    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe(
      "請問您需要叫車、查詢訂單，還是聯絡客服？",
    );
  });

  it("never runs a turn for a non-final session event", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-6");

    coordinator.handle(
      attachment,
      {
        type: "speech.started",
        sessionId: "sess-6",
        mediaEpoch: 1,
        controlSequence: 1,
        occurredAt: new Date().toISOString(),
      },
      speaker,
    );
    await flush();

    expect(speaker.calls).toHaveLength(0);
  });

  it("never rejects or throws out of handle even when the turn fails unexpectedly", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const coordinator = new VoiceCallTurnCoordinator(() => ({
      mode: "fixture",
      profileVersion: "broken:1",
      async propose() {
        // Violates voiceDialogueOutputSchema -- an unexpected provider
        // failure, not an expected supersession.
        return { intent: "not-a-real-intent" };
      },
    }));
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-7");

    expect(() =>
      coordinator.handle(attachment, finalSegment("hello"), speaker),
    ).not.toThrow();
    await flush();

    expect(speaker.calls).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  /**
   * R1 (Codex reopen round 2), first probe: a late event tagged with an
   * old, already-released attachment must never resurrect turn state --
   * not even under the *same* session id a replacement attachment now
   * owns -- and the replacement's own first final must run a completely
   * fresh turn.
   */
  it("never lets a late event from a released attachment create or touch a replacement attachment's turn state", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();
    const oldAttachment = coordinator.attach("sess-8");
    coordinator.release(oldAttachment);

    const replacementAttachment = coordinator.attach("sess-8");

    // Late event still carrying the old (released) handle: must be treated
    // as observable evidence only, never as input for the replacement.
    coordinator.handle(oldAttachment, finalSegment("救命", "seg-old"), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(0);

    coordinator.handle(replacementAttachment, finalSegment(""), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe(
      "請說明上車地點的縣市、道路與門牌或入口。",
    );
  });

  /**
   * R1, second probe: `release` must actively abort a turn that is still
   * in flight (blocked on the provider), not just delete the map entry --
   * a late provider resolution after release must never reach the speaker.
   */
  it("aborts an in-flight turn's signal on release and never speaks its late result", async () => {
    const deferred = deferredProvider();
    const coordinator = new VoiceCallTurnCoordinator(() => deferred.provider);
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-9");

    coordinator.handle(attachment, finalSegment("hello"), speaker);
    await flush(3);
    expect(deferred.proposeCalls()).toBe(1);
    expect(deferred.lastSignal()!.aborted).toBe(false);

    coordinator.release(attachment);
    expect(deferred.lastSignal()!.aborted).toBe(true);

    deferred.resolve(EMPTY_FINAL_OUTPUT);
    await flush();

    expect(speaker.calls).toHaveLength(0);
  });

  /**
   * R2: a `speech.started` barge-in must invalidate the currently active
   * turn -- aborting its signal -- so a late provider resolution never
   * reaches the speaker, instead of being silently ignored by `handle`.
   */
  it("aborts an in-flight turn's signal on speech.started barge-in and never speaks its late result", async () => {
    const deferred = deferredProvider();
    const coordinator = new VoiceCallTurnCoordinator(() => deferred.provider);
    const speaker = trackingSpeaker();
    const attachment = coordinator.attach("sess-10");

    coordinator.handle(attachment, finalSegment("hello"), speaker);
    await flush(3);
    expect(deferred.proposeCalls()).toBe(1);

    coordinator.handle(attachment, speechStartedEvent(), speaker);
    expect(deferred.lastSignal()!.aborted).toBe(true);

    deferred.resolve(EMPTY_FINAL_OUTPUT);
    await flush();

    expect(speaker.calls).toHaveLength(0);

    // The attachment itself must stay usable: a final arriving after the
    // barge-in starts a brand new turn.
    coordinator.handle(attachment, finalSegment(""), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(1);
  });

  /**
   * R3: a turn whose own engine call resolves fine but whose `speaker.speak`
   * call never settles must not block every later turn for the same
   * attachment past `turnTimeoutMs`.
   */
  it("bounds the whole turn (including a hung speaker) so a later final still reaches the provider", async () => {
    let releaseSpeak: (() => void) | undefined;
    let speakCalls = 0;
    const hungSpeaker: VoiceCallTurnSpeaker = {
      speak: () => {
        speakCalls += 1;
        return new Promise<void>((resolve) => {
          releaseSpeak = resolve;
        });
      },
      currentMediaEpoch: () => 1,
    };
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      40,
    );
    const attachment = coordinator.attach("sess-11");

    coordinator.handle(attachment, finalSegment(""), hungSpeaker);
    await flush(3);
    expect(speakCalls).toBe(1);

    const secondSpeaker = trackingSpeaker();
    coordinator.handle(attachment, finalSegment("", "seg-second"), secondSpeaker);

    await new Promise((resolve) => setTimeout(resolve, 90));
    await flush();

    // The timeout released the queue: the second final's turn ran and
    // spoke, even though the first turn's speaker call is still hung.
    expect(secondSpeaker.calls).toHaveLength(1);

    releaseSpeak?.();
    await flush();
  });

  /**
   * R4, Codex reopen round 2/3: the engine's own fail-closed persist gate
   * (`VoiceDialogueTurnPorts.persist`'s doc: "Failure blocks every tool
   * and playback") had nothing to actually gate on, since the
   * coordinator's persist was a bare, always-successful no-op with no
   * type distinguishing it from a real CAS-backed port. Constructing the
   * coordinator with `production: true` now refuses to run the default
   * `"fixture"` persist port at all -- never a reachable configuration in
   * this worker's actual composition (`../server.ts` never sets
   * `production: true`), but exercised directly here to prove the fail-
   * closed guard is real, not merely documented.
   */
  it("fails closed instead of running a production engine against the fixture-only persist port", async () => {
    const speaker = trackingSpeaker();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      undefined,
      createFixtureDialoguePersistPort(),
      true,
    );
    const attachment = coordinator.attach("sess-persist-guard");

    coordinator.handle(attachment, finalSegment(""), speaker);
    await flush();

    expect(speaker.calls).toHaveLength(0);
  });

  /** A `"trusted"` persist port is accepted for a `production` engine
   * without the guard firing, and its own rejection (absent/stale CAS)
   * still blocks the turn from ever reaching the speaker -- the
   * fail-closed behavior `VoiceDialogueTurnPorts.persist`'s doc requires. */
  it("runs a production engine against a trusted persist port, and still blocks the speaker if it rejects", async () => {
    const acceptingPort: VoiceDialoguePersistPort = {
      mode: "trusted",
      persist: async () => {},
    };
    const rejectingPort: VoiceDialoguePersistPort = {
      mode: "trusted",
      persist: async () => {
        throw new Error("voice_session_cas_rejected");
      },
    };

    const liveProvider: VoiceDialogueProvider = {
      mode: "live",
      profileVersion: "live-trusted:1",
      propose: async () => EMPTY_FINAL_OUTPUT,
    };

    const acceptingSpeaker = trackingSpeaker();
    const accepting = new VoiceCallTurnCoordinator(
      () => liveProvider,
      undefined,
      acceptingPort,
      true,
    );
    const acceptingAttachment = accepting.attach("sess-trusted-accept");
    accepting.handle(acceptingAttachment, finalSegment(""), acceptingSpeaker);
    await flush();
    expect(acceptingSpeaker.calls).toHaveLength(1);

    const rejectingSpeaker = trackingSpeaker();
    const rejecting = new VoiceCallTurnCoordinator(
      () => liveProvider,
      undefined,
      rejectingPort,
      true,
    );
    const rejectingAttachment = rejecting.attach("sess-trusted-reject");
    rejecting.handle(rejectingAttachment, finalSegment(""), rejectingSpeaker);
    await flush();
    expect(rejectingSpeaker.calls).toHaveLength(0);
  });
});
