import { describe, expect, it, vi } from "vitest";

import {
  VoiceMediaOutputFence,
  VoiceVadEchoGate,
  muLawToPcm16,
  pcm16ToMuLaw,
} from "../../apps/voice-media-worker/src";

function buildFence() {
  const sink = { clear: vi.fn(), write: vi.fn() };
  const fence = new VoiceMediaOutputFence({
    sessionId: "session-009",
    scopeId: "call:session-009",
    sink,
    maxBufferedAudioMs: 50,
    initialOwner: "ai",
    initialPrincipalId: "ai-1",
  });
  const ai = fence.issueAccess("ai-1");
  if (!ai) throw new Error("fixture did not issue AI access");
  return { fence, sink, ai };
}

describe("UV-EXEC-009 local media control", () => {
  it("converts telephone μ-law into PCM and keeps silent frames available to the pipeline", () => {
    const samples = muLawToPcm16(new Uint8Array([0xff, 0x7f, 0x00]));
    expect(samples[0]).toBe(0);
    expect(samples[1]).toBe(0);
    expect(pcm16ToMuLaw(new Int16Array([0]))[0]).toBe(0xff);

    const vad = new VoiceVadEchoGate({ speechRmsThreshold: 100 });
    expect(vad.assessPcm16(new Int16Array([0, 0]))).toMatchObject({
      speechCandidate: false,
      likelyEcho: false,
    });
  });

  it("uses VAD and the output-reference echo result as turn signals, not identity proof", () => {
    const vad = new VoiceVadEchoGate({
      speechRmsThreshold: 100,
      isLikelyEcho: () => true,
    });
    expect(vad.assessPcm16(new Int16Array([1_000, -1_000]))).toMatchObject({
      speechCandidate: true,
      likelyEcho: true,
    });
  });

  it("clears locally before any API work, aborts old generation marks, and reports CTI loss as unknown", () => {
    const { fence, sink, ai } = buildFence();
    expect(
      fence.writePcm16(ai, "p-1", new Int16Array(160), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(true);
    const abort = vi.fn(() => new Promise<void>(() => undefined));
    expect(fence.registerSynthesisAborter(ai, "p-1", { abort })).toBe(true);
    const stopped = fence.localClear();
    expect(sink.clear).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(stopped).toEqual({ clearedPlaybackIds: ["p-1"], result: "cleared" });
    expect(fence.markCompleted("p-1")).toBe(false);
    expect(fence.getPlaybackTiming("p-1")).toMatchObject({
      outcome: "cleared",
      timingPrecision: "unknown",
    });
    // The old synthesis access cannot create a fresh playback after clear;
    // a newly issued access is required for the next reply.
    expect(
      fence.writePcm16(ai, "stale", new Int16Array(80), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(false);
    const resumedAi = fence.issueAccess("ai-1");
    expect(
      fence.writePcm16(resumedAi!, "next", new Int16Array(80), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(true);

    sink.clear.mockImplementationOnce(() => {
      throw new Error("CTI disconnected");
    });
    expect(fence.localClear().result).toBe("unknown");
  });

  it("fences every sink chunk, bounds the buffer, and transfers only after old output clears", () => {
    const { fence, sink, ai } = buildFence();
    expect(
      fence.writePcm16(ai, "p-1", new Int16Array(320), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(true);
    expect(
      fence.writePcm16(ai, "p-1", new Int16Array(160), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(false);
    expect(sink.write).toHaveBeenCalledTimes(1);

    expect(fence.transfer(ai, "handoff", "coordinator-1")).toBe(true);
    const coordinator = fence.issueAccess("coordinator-1");
    expect(coordinator?.outputEpoch).toBe(2);
    expect(fence.issueAccess("ai-1")).toBeNull();
    expect(
      fence.writePcm16(ai, "old-ai", new Int16Array(1), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(false);
    expect(
      fence.writePcm16(coordinator!, "hold", new Int16Array(80), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(true);
  });

  it("does not invent a precise playback cutoff without a CTI cursor", () => {
    const { fence, ai } = buildFence();
    fence.writePcm16(ai, "p-1", new Int16Array(160), {
      sampleRateHz: 8_000,
      channels: 1,
    });
    expect(fence.markCompleted("p-1")).toBe(true);
    expect(fence.getPlaybackTiming("p-1")).toMatchObject({
      outcome: "completed",
      confirmedAudioMs: null,
      timingPrecision: "unknown",
    });
  });

  it("marks a failed outbound write as unknown instead of buffering it forever", () => {
    const { fence, sink, ai } = buildFence();
    sink.write.mockImplementationOnce(() => {
      throw new Error("CTI disconnected");
    });
    expect(
      fence.writePcm16(ai, "p-1", new Int16Array(160), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(false);
    expect(fence.getPlaybackTiming("p-1")).toMatchObject({
      outcome: "unknown",
      timingPrecision: "unknown",
    });
    // No failed audio remains in the bounded buffer.
    expect(
      fence.writePcm16(ai, "p-2", new Int16Array(320), {
        sampleRateHz: 8_000,
        channels: 1,
      }),
    ).toBe(true);
  });
});
