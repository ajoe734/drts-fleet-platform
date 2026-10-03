import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

import { VoiceSessionComposer } from "../../../apps/voice-media-worker/src/server/session-composer";
import { VoiceCallTurnCoordinator } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import type { VoiceSessionBinding } from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";
import type {
  VoiceAsrSegmentResult,
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
  VoiceTtsPlaybackHandle,
  VoiceTtsSynthesizeRequest,
} from "../../../apps/voice-media-worker/src/media-provider";
import type { WebSocketServerChannel } from "../../../apps/voice-media-worker/src/server/websocket-channel";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 (Codex reopen round 5/6):
 * proves the real, composed `VoiceSessionComposer` + `VoiceCallTurnCoordinator`
 * + `VoiceApiClient` path end to end for an attachment that *was* given a
 * `VoiceSessionBinding` -- the production-usable composition seam that
 * does not exist in this worker's actual `server.ts` yet because no
 * call-admission flow supplies one (see
 * ../../../apps/voice-media-worker/src/dialogue/voice-session-binding.ts).
 * Only the real `fetch` transport to "apps/api" is a double; the
 * coordinator, engine, dialogue state, persist port, and tool port all
 * run unmodified.
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

class StreamingAsrAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "streaming-double";
  readonly isProductionCapable = false as const;
  private listener?: (result: VoiceAsrSegmentResult) => void;
  async transcribe(): Promise<VoiceAsrSegmentResult> {
    throw new Error("unused");
  }
  onResult(listener: (result: VoiceAsrSegmentResult) => void): void {
    this.listener = listener;
  }
  emitFinal(text: string, segmentId: string): void {
    this.listener?.({ segmentId, revision: 1, text, final: true, language: "cmn-TW" });
  }
}

class DeterministicTtsAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "test-double";
  readonly isProductionCapable = false as const;
  async synthesize(request: VoiceTtsSynthesizeRequest): Promise<VoiceTtsPlaybackHandle> {
    return {
      playbackId: `pb-${request.sessionId}-${request.generation}`,
      generation: request.generation,
      audioChunks: [new TextEncoder().encode(`audio:${request.text}`)],
    };
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Trusted composition: real VoiceSessionComposer + VoiceCallTurnCoordinator + VoiceApiClient", () => {
  it("persists the turn's input resolution and executes request_handoff through the real apps/api-backed routes for a bound attachment", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "22222222-2222-2222-2222-222222222222",
      resourceScopeId: "33333333-3333-3333-3333-333333333333",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };

    const calls: Array<{ path: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ path, body });
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: `capability-for-${(body as { scopes: string[] }).scopes.join(",")}`, tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (path.endsWith("/input-resolutions")) {
        // Mirrors the real `VoiceSessionService.resolveInput`: it only
        // reaches a success response when the submitted `inputEpoch`
        // already matched the session's current one, so the real backend
        // always echoes it back unchanged (the client's response
        // correlation check in `createTrustedDialoguePersistPort` relies
        // on exactly this).
        return jsonResponse(200, {
          data: {
            session: {
              sessionVersion: 6,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (path.endsWith("/handoffs")) {
        return jsonResponse(200, {
          data: { results: [{ status: "queued", handoffId: "handoff-real-1" }] },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });

    const apiClient = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );

    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      undefined,
      undefined,
      false,
      apiClient,
    );
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );
    const { channel, sentBinary } = makeChannel();
    composer.attach(binding.voiceSessionId, channel, binding);

    asr.emitFinal("救命", "seg-1");
    await flush(10);

    // Real persist call: issued a session_execute-only capability, then
    // called resolveInput with this turn's own inputEpoch and the
    // binding's pre-call sessionVersion.
    const persistCapabilityCall = calls.find(
      (c) => c.path === "/callcenter/voice/capabilities" && !(c.body as { scopes: string[] }).scopes.includes("handoff_request"),
    );
    expect(persistCapabilityCall).toBeDefined();
    const inputResolutionCall = calls.find((c) => c.path.endsWith("/input-resolutions"));
    expect(inputResolutionCall?.body).toMatchObject({
      expectedSessionVersion: 5,
      resolution: "relevant",
    });
    // The binding's sessionVersion is now the real CAS response's value,
    // not a locally invented one.
    expect(binding.sessionVersion).toBe(6);

    // Real tool execution: a handoff_request-scoped capability was issued,
    // and the actual request_handoff result (not a local "unavailable"
    // stub) reached the speaker's prompt selection.
    const handoffCapabilityCall = calls.find(
      (c) => c.path === "/callcenter/voice/capabilities" && (c.body as { scopes: string[] }).scopes.includes("handoff_request"),
    );
    expect(handoffCapabilityCall).toBeDefined();
    const handoffCall = calls.find((c) => c.path.endsWith("/handoffs"));
    expect(handoffCall?.body).toMatchObject({ inputEpoch: 1 });

    // The engine still spoke its own emergency prompt (the real
    // `request_handoff` result does not change *that* -- see
    // `VoiceDialogueEngine.turn`'s prompt selection), proving the turn
    // completed successfully end to end rather than throwing.
    expect(sentBinary.length).toBeGreaterThan(0);
    expect(sentBinary[0]!.toString("utf8")).toContain("緊急救援");
  });

  it("never calls apps/api for an attachment with no binding, even with a configured VoiceApiClient -- the existing fixture/local-stub behavior is unchanged by default", async () => {
    const fetchImpl = vi.fn();
    const apiClient = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn() },
    );
    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      undefined,
      undefined,
      false,
      apiClient,
    );
    const composer = new VoiceSessionComposer(
      { createAdapters: () => ({ asrAdapter: asr, ttsAdapter: tts }) },
      coordinator,
    );
    const { channel, sentBinary } = makeChannel();
    composer.attach("sess-unbound", channel);

    asr.emitFinal("救命", "seg-1");
    await flush(10);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sentBinary.length).toBeGreaterThan(0);
  });
});
