import { describe, expect, it, vi } from "vitest";

import {
  AgentAssistTranscriptForwarder,
  createAgentAssistTranscriptForwarder,
} from "../../../apps/voice-media-worker/src/assist/agent-assist-transcript-forwarder";
import type { AssistTranscriptSegmentInput } from "../../../apps/voice-media-worker/src/server/voice-api-client";

/** Timers run only when the test says so. */
function manualTimers() {
  const queue: Array<{ callback: () => void; ms: number }> = [];
  return {
    setTimer: (callback: () => void, ms: number) => {
      const entry = { callback, ms };
      queue.push(entry);
      return entry;
    },
    clearTimer: (handle: unknown) => {
      const index = queue.indexOf(handle as (typeof queue)[number]);
      if (index !== -1) queue.splice(index, 1);
    },
    runAll: async () => {
      while (queue.length) {
        queue.shift()!.callback();
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    pending: () => queue.length,
  };
}

const result = (
  segmentId: string,
  text: string,
  isFinal = true,
  speaker: "caller" | "agent" = "caller",
) => ({ segmentId, speaker, text, isFinal });

describe("AgentAssistTranscriptForwarder", () => {
  it("batches final results and skips partial or empty ones", async () => {
    const timers = manualTimers();
    const sent: AssistTranscriptSegmentInput[][] = [];
    const forwarder = new AgentAssistTranscriptForwarder({
      ...timers,
      send: async (segments) => {
        sent.push(segments);
      },
    });
    forwarder.push(result("1", "我要去台", false));
    forwarder.push(result("1", "我要去台北車站"));
    forwarder.push(result("2", "   "));
    forwarder.push(result("3", "好的", true, "agent"));
    expect(sent).toEqual([]);
    await timers.runAll();
    await forwarder.flush();
    expect(sent).toEqual([
      [
        {
          segmentId: "1",
          speaker: "caller",
          text: "我要去台北車站",
          startedAt: null,
        },
        { segmentId: "3", speaker: "agent", text: "好的", startedAt: null },
      ],
    ]);
  });

  it("sends immediately when a batch is full and keeps order", async () => {
    const timers = manualTimers();
    const sent: string[][] = [];
    const forwarder = new AgentAssistTranscriptForwarder({
      ...timers,
      maxBatchSize: 2,
      send: async (segments) => {
        sent.push(segments.map((segment) => segment.segmentId));
      },
    });
    for (const id of ["a", "b", "c", "d", "e"]) {
      forwarder.push(result(id, `第${id}句`));
    }
    await forwarder.close();
    expect(sent).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    forwarder.push(result("f", "掛斷後"));
    await forwarder.flush();
    expect(sent.flat()).not.toContain("f");
  });

  it("retries transient failures, then drops the batch", async () => {
    const timers = manualTimers();
    const dropped = vi.fn();
    let attempts = 0;
    const forwarder = new AgentAssistTranscriptForwarder({
      ...timers,
      retryDelaysMs: [10, 20],
      onDropped: dropped,
      send: async () => {
        attempts += 1;
        throw Object.assign(new Error("unreachable"), {
          code: "VOICE_API_UNREACHABLE",
        });
      },
    });
    forwarder.push(result("x", "我要去台北車站"));
    const done = forwarder.flush();
    let settled = false;
    void done.then(() => {
      settled = true;
    });
    // Retry timers are scheduled only after each failed send settles.
    for (let round = 0; round < 50 && !settled; round += 1) {
      await timers.runAll();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await done;
    expect(attempts).toBe(3);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it("does not retry a batch apps/api rejected as invalid", async () => {
    const timers = manualTimers();
    const send = vi.fn(async () => {
      throw Object.assign(new Error("bad"), {
        code: "CALLCENTER_ASSIST_TRANSCRIPT_INVALID",
      });
    });
    const dropped = vi.fn();
    const forwarder = new AgentAssistTranscriptForwarder({
      ...timers,
      send,
      onDropped: dropped,
    });
    forwarder.push(result("x", "我要去台北車站"));
    await forwarder.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it("binds to one call through the apps/api client", async () => {
    const client = { postAssistTranscript: vi.fn(async () => ({})) };
    const forwarder = createAgentAssistTranscriptForwarder(client, "call-9");
    forwarder.push(result("1", "我在中山路100號"));
    await forwarder.close();
    expect(client.postAssistTranscript).toHaveBeenCalledWith(
      "call-9",
      [
        {
          segmentId: "1",
          speaker: "caller",
          text: "我在中山路100號",
          startedAt: null,
        },
      ],
      expect.any(AbortSignal),
    );
  });
});
