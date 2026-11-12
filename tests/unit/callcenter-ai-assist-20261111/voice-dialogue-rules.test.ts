import { describe, expect, it, vi } from "vitest";

import {
  voiceDialogueOutputSchema,
  voiceDialogueSnapshotContentSchema,
  type VoiceDialogueOutput,
} from "@drts/contracts";

import {
  VoiceDialogueEngine,
  withHandoffRequest,
} from "../../../apps/voice-media-worker/src/dialogue/dialogue-engine";
import {
  MAX_UNCLEAR_TURNS,
  VoiceDialogueState,
} from "../../../apps/voice-media-worker/src/dialogue/dialogue-state";
import type { VoiceDialogueRequest } from "../../../apps/voice-media-worker/src/dialogue/voice-dialogue-provider";
import {
  replyLanguagesFromEnv,
  resolveReplyLanguage,
  VoiceLanguageRouter,
} from "../../../apps/voice-media-worker/src/language/language-router";

const unclear: VoiceDialogueOutput = {
  intent: "unknown",
  text: "",
  slots: [],
  tools: [],
  usage: { inputTokens: null, outputTokens: null },
  terminal: "turn_complete",
};

const booking: VoiceDialogueOutput = {
  ...unclear,
  intent: "book",
  slots: [
    {
      field: "pickup",
      rawText: "台北車站",
      candidate: "台北車站",
      sourceSegmentIds: ["seg-1"],
      providerConfidence: 0.9,
    },
  ],
};

describe("two turns not understood hand the caller to a human", () => {
  it("counts consecutive unclear turns and resets on progress", () => {
    const state = new VoiceDialogueState();
    state.apply(unclear, "t1");
    expect(state.unclearTurns).toBe(1);
    expect(state.handoff).toBeNull();
    state.apply(booking, "t2");
    expect(state.unclearTurns).toBe(0);
    for (let turn = 0; turn < MAX_UNCLEAR_TURNS; turn += 1) {
      state.apply(unclear, `t${turn + 3}`);
    }
    expect(state.handoff).toEqual({
      reason: "speech_not_understood",
      intent: "unknown",
    });
  });

  it("keeps the count across a worker restart via the snapshot", () => {
    const state = new VoiceDialogueState();
    expect(state.toSnapshotContent()).not.toHaveProperty("unclearTurns");
    state.apply(unclear, "t1");
    const content = state.toSnapshotContent();
    expect(voiceDialogueSnapshotContentSchema.parse(content).unclearTurns).toBe(
      1,
    );
    const restored = new VoiceDialogueState();
    restored.restoreFromSnapshotContent(content);
    restored.apply(unclear, "t2");
    expect(restored.handoff?.reason).toBe("speech_not_understood");
  });

  it("restores older snapshots without the counter as zero", () => {
    const state = new VoiceDialogueState();
    const legacy = new VoiceDialogueState().toSnapshotContent();
    delete (legacy as { unclearTurns?: number }).unclearTurns;
    state.restoreFromSnapshotContent(legacy);
    expect(state.unclearTurns).toBe(0);
  });
});

describe("withHandoffRequest", () => {
  it("turns a handoff the state decided into a gateway handoff request", () => {
    const sent = withHandoffRequest(unclear, {
      reason: "speech_not_understood",
    });
    expect(voiceDialogueOutputSchema.parse(sent)).toMatchObject({
      terminal: "handoff",
      tools: [
        { name: "request_handoff", args: { reason: "speech_not_understood" } },
      ],
    });
  });

  it("leaves outputs alone when nothing new was decided or a request exists", () => {
    expect(withHandoffRequest(booking, null)).toBe(booking);
    const requested: VoiceDialogueOutput = {
      ...unclear,
      intent: "human",
      tools: [
        { name: "request_handoff", args: { reason: "customer_requested" } },
      ],
    };
    expect(
      withHandoffRequest(requested, { reason: "customer_requested" }),
    ).toBe(requested);
  });

  it("falls back to customer_requested for reasons the gateway does not know", () => {
    expect(withHandoffRequest(unclear, { reason: "made_up" }).tools[0]).toEqual(
      { name: "request_handoff", args: { reason: "customer_requested" } },
    );
  });
});

describe("VoiceDialogueEngine sends the decided handoff", () => {
  function request(turnId: string): VoiceDialogueRequest {
    return {
      sessionId: "s",
      turnId,
      inputEpoch: 1,
      segmentIds: ["seg-1"],
      transcript: "嗯…那個…",
      verifiedContext: {},
      deadline: Date.now() + 5_000,
      signal: new AbortController().signal,
    };
  }

  it("calls the gateway with request_handoff on the second unclear turn", async () => {
    const engine = new VoiceDialogueEngine(
      { mode: "fixture", profileVersion: "p1", propose: async () => unclear },
      false,
    );
    const state = new VoiceDialogueState();
    const execute = vi.fn(async (output: VoiceDialogueOutput) =>
      output.tools.map(() => ({ status: "queued", handoffId: "h1" })),
    );
    const ports = { persist: vi.fn(async () => undefined), execute };

    const first = await engine.turn(request("t1"), state, () => 1, ports);
    expect(first.terminal).toBe("turn_complete");
    expect(execute).toHaveBeenLastCalledWith(unclear, expect.anything());

    const second = await engine.turn(request("t2"), state, () => 1, ports);
    expect(second.terminal).toBe("handoff");
    expect(second.prompt).toContain("轉接客服人員");
    expect(execute.mock.calls[1]![0]).toMatchObject({
      terminal: "handoff",
      tools: [
        { name: "request_handoff", args: { reason: "speech_not_understood" } },
      ],
    });
  });
});

describe("reply language", () => {
  it("answers in Mandarin unless the caller's language scripts were verified", () => {
    const mandarinOnly = replyLanguagesFromEnv({});
    expect(resolveReplyLanguage("nan-TW", mandarinOnly)).toBe("cmn-TW");
    expect(resolveReplyLanguage("hak-TW", mandarinOnly)).toBe("cmn-TW");
    expect(resolveReplyLanguage("cmn-TW", mandarinOnly)).toBe("cmn-TW");
    expect(resolveReplyLanguage(undefined, mandarinOnly)).toBe("cmn-TW");

    const verified = replyLanguagesFromEnv({
      VOICE_REPLY_VERIFIED_LANGUAGES: "nan-TW, xx-YY",
    });
    expect([...verified].sort()).toEqual(["cmn-TW", "nan-TW"]);
    expect(resolveReplyLanguage("nan-TW", verified)).toBe("nan-TW");
    expect(resolveReplyLanguage("hak-TW", verified)).toBe("cmn-TW");
  });

  it("tells callers they can press 0 for a person", () => {
    const router = new VoiceLanguageRouter(
      new Map([
        [
          "cmn-TW",
          {
            language: "cmn-TW",
            asrModelName: "myVoca",
            ttsVoiceEnabled: true,
            asrCapabilityVerified: true,
            selectionPrompt: { assetId: "a", verified: true },
          },
        ],
      ]),
      "cmn-TW",
    );
    expect(router.shortPrompt()).toContain("請按0");
  });
});
