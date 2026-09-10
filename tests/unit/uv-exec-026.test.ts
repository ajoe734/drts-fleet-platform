import { describe, expect, it, vi } from "vitest";
import {
  OpenAiRealtimeFixtureAdapter,
  DEFAULT_OPENAI_REALTIME_PROFILE,
  OPENAI_REALTIME_DOCS_REF,
  OPENAI_REALTIME_SIP_REF,
  OPENAI_REALTIME_COSTS_REF,
  OPENAI_REALTIME_MODEL_ID,
  OPENAI_REALTIME_PROTOCOL_VERSION,
  DRTS_REALTIME_TOOLS,
  parseRealtimeFunctionCall,
  RealtimeSharedGateBridge,
  VoiceMediaOutputFence,
  VoiceConfirmationController,
  VoiceMediaProviderError,
  runVoiceDialogue,
  type ControlledReadback,
  type NativeVoiceProfile,
} from "../../apps/voice-media-worker/src";
import {
  voiceToolProposalSchema,
  voiceDialogueOutputSchema,
} from "@drts/contracts";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const FIXTURES_PATH = path.resolve(
  __dirname,
  "..",
  "fixtures",
  "unattended-voice",
  "native-voice-fixtures.json",
);

describe("UV-EXEC-026: OpenAI Realtime Single Candidate Selection & Protocol Fixture", () => {
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf-8"));

  it("verifies single candidate selection record and explicit documentation references", () => {
    const adapter = new OpenAiRealtimeFixtureAdapter();
    const profile = adapter.profile;

    // 1. Single candidate selection per SD §14
    expect(profile.candidateId).toBe("openai_realtime");
    expect(profile.provider).toBe("openai");
    expect(profile.modelId).toBe(OPENAI_REALTIME_MODEL_ID);
    expect(profile.modelId).toBe("gpt-4o-realtime-preview-2024-12-17");
    expect(profile.protocolVersion).toBe(OPENAI_REALTIME_PROTOCOL_VERSION);
    expect(profile.protocolVersion).toBe("v1");

    // 2. Direct telephony audio format alignment (G.711u / 8 kHz)
    expect(profile.inputAudioFormat).toBe("g711_ulaw");
    expect(profile.outputAudioFormat).toBe("g711_ulaw");
    expect(profile.sampleRateHz).toBe(8000);
    expect(profile.turnDetection).toMatchObject({
      type: "server_vad",
      threshold: 0.5,
      silence_duration_ms: 300,
    });

    // 3. Official documentation citations
    expect(OPENAI_REALTIME_DOCS_REF).toBe("https://developers.openai.com/api/docs/guides/realtime");
    expect(OPENAI_REALTIME_SIP_REF).toBe("https://developers.openai.com/api/docs/guides/realtime-sip");
    expect(OPENAI_REALTIME_COSTS_REF).toBe("https://developers.openai.com/api/docs/guides/realtime-costs");
  });

  it("fails closed in production mode: rejects unverified account credentials with voice_fixture_forbidden", () => {
    const adapter = new OpenAiRealtimeFixtureAdapter();

    expect(adapter.mode).toBe("fixture");
    expect(adapter.isProductionCapable).toBe(false);

    // Attempting to run with production: true must fail closed
    expect(() => adapter.connect("test-token", { production: true })).toThrow(
      VoiceMediaProviderError,
    );

    try {
      adapter.connect("test-token", { production: true });
    } catch (err: any) {
      expect(err.code).toBe("voice_fixture_forbidden");
      expect(err.message).toContain("UV-EXEC-027 and UV-EXEC-028");
    }
  });

  it("executes wire protocol session handshake and handles client events trace", () => {
    const adapter = new OpenAiRealtimeFixtureAdapter();
    const created = adapter.connect("valid-fixture-token");

    expect(created.type).toBe("session.created");
    expect(created.session.modalities).toEqual(["text", "audio"]);
    expect(created.session.voice).toBe("shimmer");
    expect(created.session.tools).toHaveLength(5);

    // Client event: session.update
    adapter.sendClientEvent({
      type: "session.update",
      session: {
        temperature: 0.2,
      },
    });

    const serverEvents = adapter.getServerEvents();
    const lastEvent = serverEvents[serverEvents.length - 1];
    expect(lastEvent.type).toBe("session.updated");

    // Client event: input_audio_buffer.append & clear
    adapter.sendClientEvent({
      type: "input_audio_buffer.append",
      audio: fixtures.wire_events_trace[0].audio,
    });
    adapter.sendClientEvent({
      type: "input_audio_buffer.clear",
    });

    expect(adapter.getClientEvents()).toHaveLength(3);
  });
});

describe("UV-EXEC-026: Shared Gate Fencing, Cancellation & Truncation", () => {
  it("coordinates caller barge-in: emits conversation.item.truncate and clears OutputFence", async () => {
    const sinkClear = vi.fn();
    const sinkWrite = vi.fn();

    const fence = new VoiceMediaOutputFence({
      sessionId: "sess-uv026",
      scopeId: "scope-001",
      maxBufferedAudioMs: 5000,
      initialOwner: "ai",
      initialPrincipalId: "ai-worker-1",
      sink: {
        clear: sinkClear,
        write: sinkWrite,
      },
    });

    const adapter = new OpenAiRealtimeFixtureAdapter(DEFAULT_OPENAI_REALTIME_PROFILE, {
      fence,
    });
    adapter.connect("fixture-token");

    // Assistant is speaking readback audio
    adapter.simulateAssistantSpeaking("resp-001", "item-readback-001", 1150);

    const initialGeneration = fence.getGeneration();

    // Caller interrupts at 1150ms
    const { truncation, truncateEvent } = await adapter.handleBargeIn(1150);

    // 1. Check truncation record
    expect(truncation).toMatchObject({
      itemId: "item-readback-001",
      audioEndMs: 1150,
      reason: "caller_barge_in",
    });

    // 2. Check Realtime truncate wire event
    expect(truncateEvent).toEqual({
      type: "conversation.item.truncate",
      item_id: "item-readback-001",
      content_index: 0,
      audio_end_ms: 1150,
    });

    // 3. Check that fence synchronously cleared audio sink and bumped generation
    expect(sinkClear).toHaveBeenCalledTimes(1);
    expect(fence.getGeneration()).toBeGreaterThan(initialGeneration);
  });

  it("invalidates VoiceConfirmationController readback on caller barge-in", async () => {
    const playFn = vi.fn(async () => {});
    const clearFn = vi.fn();
    const invalidateFn = vi.fn(async () => {});

    const controller = new VoiceConfirmationController({
      play: playFn,
      clear: clearFn,
      invalidate: invalidateFn,
    });

    const script = "您好，從台北車站到市府轉運站，確認請說對或按1。";
    const scriptHash = createHash("sha256").update(script).digest("hex");
    const readbackPlan: ControlledReadback = {
      confirmationId: "conf-123",
      readbackPlaybackId: "play-readback-123",
      snapshotHash: "hash-snap-456",
      script,
      readbackScriptHash: scriptHash,
      templateVersion: "zh-TW-booking-v1",
      expectedDigit: "1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    // Start readback
    await controller.readback(readbackPlan);

    const adapter = new OpenAiRealtimeFixtureAdapter(DEFAULT_OPENAI_REALTIME_PROFILE, {
      confirmationController: controller,
    });
    adapter.connect("fixture-token");
    adapter.simulateAssistantSpeaking("resp-readback", "item-readback-001", 850);

    // Barge-in occurs while readback is active
    await adapter.handleBargeIn(850);

    // Invalidate must have been called with "unknown_input"
    expect(invalidateFn).toHaveBeenCalledWith("unknown_input");

    // Attempting to request confirmation proof must be rejected
    await expect(
      controller.requestConfirmation("play-readback-123", false, async () => ({})),
    ).rejects.toThrow("voice_confirmation_reask");
  });
});

describe("UV-EXEC-026: Tool Gateway, In-Flight Correction & Transaction Proof", () => {
  it("maps native function call events to canonical VoiceToolProposal schemas", () => {
    const rawEvent = {
      event_id: "evt_call_001",
      type: "response.function_call_arguments.done" as const,
      response_id: "resp-001",
      item_id: "item-001",
      output_index: 0,
      call_id: "call_geo_123",
      name: "resolve_location",
      arguments: JSON.stringify({ query: "台北市信義區市府路1號" }),
    };

    const proposal = parseRealtimeFunctionCall(rawEvent);
    expect(proposal.name).toBe("resolve_location");
    expect(proposal.args).toEqual({ query: "台北市信義區市府路1號" });

    // Validate that the proposal conforms to @drts/contracts schema
    expect(voiceToolProposalSchema.safeParse(proposal).success).toBe(true);
  });

  it("fails closed on unrecognized tools or schema violations", () => {
    // 1. Unknown tool
    expect(() =>
      parseRealtimeFunctionCall({
        event_id: "evt_err_1",
        type: "response.function_call_arguments.done",
        response_id: "resp-1",
        item_id: "item-1",
        output_index: 0,
        call_id: "call-1",
        name: "unauthorized_admin_tool",
        arguments: "{}",
      }),
    ).toThrow("violates tool proposal schema");

    // 2. Missing required parameters
    expect(() =>
      parseRealtimeFunctionCall({
        event_id: "evt_err_2",
        type: "response.function_call_arguments.done",
        response_id: "resp-2",
        item_id: "item-2",
        output_index: 0,
        call_id: "call-2",
        name: "resolve_location",
        arguments: "{}",
      }),
    ).toThrow("violates tool proposal schema");
  });

  it("prevents direct database mutation: forbids model proposal from creating orders without confirmation gate", () => {
    const bridge = new RealtimeSharedGateBridge();

    const invalidOutput: any = {
      intent: "book",
      text: "已直接幫您建單成功",
      slots: [],
      tools: [
        {
          name: "create_booking_receipt",
          args: {},
        },
      ],
      usage: { inputTokens: 50, outputTokens: 20 },
      terminal: "turn_complete",
    };

    expect(() => bridge.validateNoBypassedMutations(invalidOutput)).toThrow(
      "Direct booking mutation tool forbidden",
    );
  });

  it("processes in-flight correction: updates slots and retains clean evidence", async () => {
    const adapter = new OpenAiRealtimeFixtureAdapter();

    const request = {
      sessionId: "sess-corr-001",
      turnId: "turn-1",
      inputEpoch: 1,
      segmentIds: ["seg-1"],
      transcript: "到中正紀念堂... 啊不對，改去西門町",
      verifiedContext: {},
      deadline: Date.now() + 5000,
      signal: new AbortController().signal,
    };

    const output = await runVoiceDialogue(
      adapter,
      request,
      () => 1,
      false, // non-production fixture mode
    );

    expect(output.intent).toBe("book");
    expect(output.slots).toHaveLength(1);
    expect(output.slots[0]).toMatchObject({
      field: "dropoff",
      candidate: "西門町",
      rawText: "改去西門町",
      sourceSegmentIds: ["seg-1"],
    });
    expect(output.tools).toHaveLength(1);
    expect(output.tools[0].name).toBe("resolve_location");
    expect((output.tools[0] as any).args.query).toBe("西門町");
  });

  it("handles emergency safety intent and triggers handoff with urgent_safety reason", async () => {
    const adapter = new OpenAiRealtimeFixtureAdapter();

    const request = {
      sessionId: "sess-emg-001",
      turnId: "turn-1",
      inputEpoch: 1,
      segmentIds: ["seg-emg"],
      transcript: "救命啊！現場車禍有人受傷，快轉客服或報警！",
      verifiedContext: {},
      deadline: Date.now() + 5000,
      signal: new AbortController().signal,
    };

    const output = await runVoiceDialogue(
      adapter,
      request,
      () => 1,
      false,
    );

    expect(output.intent).toBe("emergency");
    expect(output.terminal).toBe("handoff");
    expect(output.tools[0]).toMatchObject({
      name: "request_handoff",
      args: { reason: "urgent_safety" },
    });
  });

  it("formally declares retained unknowns for Taiwanese dialects, PSTN packet loss and live telephony costs", () => {
    const adapter = new OpenAiRealtimeFixtureAdapter();
    const unknowns = adapter.getUnknowns();

    expect(unknowns.nanTwSupport).toBe("unknown_pending_live");
    expect(unknowns.hakTwSupport).toBe("unknown_pending_live");
    expect(unknowns.carrierPstnPacketLoss).toBe("unknown_pending_live");
    expect(unknowns.exactLiveCostTwd).toBe("unknown_pending_live");
    expect(unknowns.rationale).toContain("UV-EXEC-028");
  });
});
