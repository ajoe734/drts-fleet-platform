import { describe, expect, it, vi } from "vitest";

import {
  VOICE_SPOKEN_REPLY_RULES,
  type VoiceDialogueOutput,
} from "@drts/contracts";

import {
  toolResultPrompt,
  VoiceDialogueEngine,
} from "../../../apps/voice-media-worker/src/dialogue/dialogue-engine";
import { VoiceDialogueState } from "../../../apps/voice-media-worker/src/dialogue/dialogue-state";
import {
  guardSpokenReply,
  heardFromSlots,
  MAX_SPOKEN_REPLY_CHARS,
} from "../../../apps/voice-media-worker/src/dialogue/reply-guard";
import type { VoiceDialogueRequest } from "../../../apps/voice-media-worker/src/dialogue/voice-dialogue-provider";

const evidence = (
  transcript: string,
  heard: string[] = [],
  toolFacts: string[] = [],
) => ({ transcript, heard, toolFacts });

describe("guardSpokenReply", () => {
  it.each([
    ["好的，請問您要去哪裡？", "我在台北車站"],
    [
      "了解，從中山北路二段45巷3號出發，請問目的地是？",
      "我在中山北路二段45巷3號",
    ],
    ["好的，兩位乘客。請問聯絡電話是？", "我們兩個人"],
    ["不好意思，我沒聽清楚，可以再說一次嗎？", "嗯…"],
    ["好的，我幫您查一下。", "我要去台大醫院"],
  ])("speaks a natural reply: %s", (reply, transcript) => {
    expect(guardSpokenReply(reply, evidence(transcript))).toEqual({
      ok: true,
      text: reply,
    });
  });

  it.each([
    ["已經幫您叫到車了，請稍候。", "commitment"],
    ["司機大約5分鐘會到。", "commitment"],
    ["車資大約是250元。", "commitment"],
    ["這趟大概300元喔。", "commitment"],
    ["我們保證準時。", "commitment"],
    ["訂單已成立。", "commitment"],
    ["請上 https://example.com 查詢。", "link"],
  ])("refuses commitments and links: %s", (reply, reason) => {
    expect(guardSpokenReply(reply, evidence("我要叫車"))).toEqual({
      ok: false,
      reason,
    });
  });

  it("refuses numbers and addresses the caller never said", () => {
    expect(
      guardSpokenReply("請問是中山北路二段100號嗎？", evidence("我在中山北路")),
    ).toEqual({ ok: false, reason: "unverified_number" });
    expect(
      guardSpokenReply("請問是忠孝東路嗎？", evidence("我在中山北路")),
    ).toEqual({ ok: false, reason: "unverified_address" });
    // …but accepts them once the caller said them earlier in the call.
    expect(
      guardSpokenReply(
        "請問是中山北路二段100號嗎？",
        evidence("對", ["中山北路二段100號"]),
      ).ok,
    ).toBe(true);
    // Spoken digits count as said: 零九一二三四五六七八 → 0912345678.
    expect(
      guardSpokenReply(
        "好的，電話是0912345678，對嗎？",
        evidence("零九一二三四五六七八"),
      ).ok,
    ).toBe(true);
  });

  it("accepts tool facts as evidence", () => {
    expect(
      guardSpokenReply(
        "請問是台北車站東三門嗎？",
        evidence("台北車站", [], ["台北車站東三門"]),
      ).ok,
    ).toBe(true);
  });

  it("refuses empty and over-long replies", () => {
    expect(guardSpokenReply("  ", evidence("x"))).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(
      guardSpokenReply("好".repeat(MAX_SPOKEN_REPLY_CHARS + 1), evidence("x")),
    ).toEqual({ ok: false, reason: "too_long" });
  });

  it("collects what the caller said from slots", () => {
    expect(
      heardFromSlots({
        pickup: { rawText: "台北車站", candidate: "台北車站" },
        dropoff: undefined,
      }),
    ).toEqual(["台北車站", "台北車站"]);
  });
});

describe("toolResultPrompt", () => {
  const resolve = (query: string): VoiceDialogueOutput => ({
    intent: "book",
    text: "",
    slots: [],
    tools: [{ name: "resolve_location", args: { query } }],
    usage: { inputTokens: null, outputTokens: null },
    terminal: "tool_required",
  });

  it("asks the caller to choose among the provider's candidates", () => {
    expect(
      toolResultPrompt(resolve("台北車站"), [
        {
          candidates: [
            { label: "台北車站東三門" },
            { label: "台北車站北一門" },
            { label: "台北轉運站" },
          ],
        },
      ]),
    ).toBe(
      "請問是「台北車站東三門」、「台北車站北一門」，還是「台北轉運站」？如果都不是，請再說一次。",
    );
    expect(
      toolResultPrompt(resolve("台大醫院"), [
        { candidates: [{ label: "台大醫院" }] },
      ]),
    ).toBe("請問是「台大醫院」嗎？");
    expect(toolResultPrompt(resolve("某地"), [{ candidates: [] }])).toContain(
      "找不到這個地點",
    );
  });

  it("reads the verified order status and stays silent for read-back plans", () => {
    const status: VoiceDialogueOutput = {
      ...resolve("x"),
      intent: "status",
      tools: [{ name: "get_bound_booking_status", args: {} }],
    };
    expect(
      toolResultPrompt(status, [{ orderId: "o", status: "司機已出發。" }]),
    ).toBe("司機已出發。");
    const readback: VoiceDialogueOutput = {
      ...resolve("x"),
      tools: [{ name: "prepare_booking_readback", args: {} }],
    };
    expect(toolResultPrompt(readback, [{}])).toBeNull();
  });
});

describe("VoiceDialogueEngine speaks guarded model replies", () => {
  const request = (transcript: string): VoiceDialogueRequest => ({
    sessionId: "s",
    turnId: `t-${Math.random()}`,
    inputEpoch: 1,
    segmentIds: ["seg-1"],
    transcript,
    verifiedContext: {},
    deadline: Date.now() + 5_000,
    signal: new AbortController().signal,
  });
  const ports = () => ({
    persist: vi.fn(async () => undefined),
    execute: vi.fn(async () => [] as unknown[]),
  });
  const engineSaying = (text: string) =>
    new VoiceDialogueEngine(
      {
        mode: "fixture",
        profileVersion: "p1",
        propose: async () => ({
          intent: "book",
          text,
          slots: [],
          tools: [],
          usage: { inputTokens: null, outputTokens: null },
          terminal: "turn_complete",
        }),
      },
      false,
    );

  it("speaks the model's reply when it passes the guard", async () => {
    const result = await engineSaying("好的，請問您在哪裡上車呢？").turn(
      request("我要叫車"),
      new VoiceDialogueState(),
      () => 1,
      ports(),
    );
    expect(result.prompt).toBe("好的，請問您在哪裡上車呢？");
  });

  it("falls back to the fixed prompt when the reply makes a commitment", async () => {
    const result = await engineSaying("已經幫您叫到車了！").turn(
      request("我要叫車"),
      new VoiceDialogueState(),
      () => 1,
      ports(),
    );
    expect(result.prompt).toBe("請說明上車地點的縣市、道路與門牌或入口。");
  });
});

describe("the model knows the call's progress and the reply rules", () => {
  it("gives the model only this call's values and what is missing", () => {
    const state = new VoiceDialogueState();
    state.apply(
      {
        intent: "book",
        text: "",
        slots: [
          {
            field: "pickup",
            rawText: "台北車站",
            candidate: "台北車站",
            sourceSegmentIds: ["seg-1"],
            providerConfidence: 0.9,
          },
        ],
        tools: [],
        usage: { inputTokens: null, outputTokens: null },
        terminal: "turn_complete",
      },
      "t1",
    );
    expect(state.promptContext()).toEqual({
      collected: { pickup: "台北車站" },
      missing: ["dropoff", "passengerContact"],
      unclearTurns: 0,
    });
  });

  it("states the spoken-reply rules once for every voice model", () => {
    const rules = VOICE_SPOKEN_REPLY_RULES.join("\n");
    expect(rules).toContain("spoken to the caller");
    expect(rules).toContain("Never state a fare or price");
    expect(rules).toContain("Do not mention stored or previous trips");
  });
});
