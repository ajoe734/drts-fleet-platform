import { describe, it, expect, vi } from "vitest";
import {
  VoiceCallTurnCoordinator,
  type VoiceCallTurnSpeaker,
} from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import type { VoiceAsrSegmentEvent } from "../../../apps/voice-media-worker/src/media-session";

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
 * unreachable from this process (no `apps/api/src/modules/cti-ivr` driver
 * exists, and voice-media-worker has no database dependency at all). Every
 * other tool proposal must therefore force the same honest
 * `request_handoff` / `status: "unavailable"` outcome the contract already
 * defines for a genuinely unavailable provider.
 */

function finalSegment(
  text: string,
  segmentId = "seg-1",
): VoiceAsrSegmentEvent {
  return {
    type: "asr.segment.final",
    sessionId: "sess-1",
    mediaEpoch: 1,
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

function trackingSpeaker(): VoiceCallTurnSpeaker & {
  calls: Array<{ text: string; languageCode: string }>;
} {
  const calls: Array<{ text: string; languageCode: string }> = [];
  return {
    calls,
    async speak(text, languageCode) {
      calls.push({ text, languageCode });
    },
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

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003: VoiceCallTurnCoordinator", () => {
  it("runs a real turn for a plain greeting with no tools and speaks the real collection prompt", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();

    // An empty transcript matches none of the fixture's intent branches, so
    // it proposes no tools (terminal: "turn_complete") and the engine falls
    // through to VoiceDialogueState's own collection prompt for a fresh,
    // slot-less session -- asking for the pickup location, not a generic
    // menu prompt (that only fires for intent "unknown", which this
    // fixture never produces).
    coordinator.handle("sess-1", finalSegment(""), speaker);
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

    coordinator.handle(
      "sess-2",
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
    coordinator.handle("sess-2", finalSegment("再問一次"), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(1);
  });

  it("speaks the real emergency safety message and forces handoff for emergency intent", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();

    coordinator.handle("sess-3", finalSegment("救命"), speaker);
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

    // Two finals admitted back-to-back, synchronously, before either turn
    // has run: `handle` bumps the session's inputEpoch before queuing each
    // one, so the first turn must observe it is stale once it reaches the
    // engine/provider's own epoch checks instead of racing the second.
    coordinator.handle("sess-4", finalSegment("", "seg-a"), speaker);
    coordinator.handle("sess-4", finalSegment("救命", "seg-b"), speaker);
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

    coordinator.handle("sess-5", finalSegment("從台北車站到松山機場"), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(1);
    expect(speaker.calls[0]!.text).toBe("已停止叫車資料蒐集。");

    coordinator.release("sess-5");

    // A session id reused for an unrelated later call must not resume the
    // prior call's handoff -- the slot-less collection prompt path must
    // run again, not the empty "handoff already happened" prompt.
    coordinator.handle("sess-5", finalSegment(""), speaker);
    await flush();
    expect(speaker.calls).toHaveLength(2);
    expect(speaker.calls[1]!.text).toBe(
      "請說明上車地點的縣市、道路與門牌或入口。",
    );
  });

  it("never runs a turn for a non-final session event", async () => {
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
    );
    const speaker = trackingSpeaker();

    coordinator.handle(
      "sess-6",
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

    expect(() =>
      coordinator.handle("sess-7", finalSegment("hello"), speaker),
    ).not.toThrow();
    await flush();

    expect(speaker.calls).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
