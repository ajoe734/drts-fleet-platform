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
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        // Restoration read at `attach()` time -- no prior snapshot for a
        // brand-new session.
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: 0,
              pendingInput: false,
              lastAppliedControlSequence: 0,
            },
            snapshot: null,
          },
        });
      }
      if (path.endsWith("/events")) {
        // Mirrors the real `VoiceSessionService.recordControlEvent`
        // bootstrap case: the first-ever `speech_start` for this session
        // (sequence 1) durably advances `sessionVersion`/`inputEpoch`
        // together (R4 residual -- `recordAuthoritativeSpeechStart`).
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: true,
            gap: false,
            appliedThroughSequence: (body as { sequence: number }).sequence,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + 1,
              inputEpoch: 1,
              pendingInput: true,
            },
          },
        });
      }
      if (path.endsWith("/input-resolutions")) {
        // Mirrors the real `VoiceSessionService.resolveInput`: it only
        // reaches a success response when the submitted `inputEpoch`
        // already matched the session's current one, so the real backend
        // always echoes it back unchanged (the client's response
        // correlation check in `createTrustedDialoguePersistPort` relies
        // on exactly this). `sessionVersion` is derived from the submitted
        // `expectedSessionVersion` (real CAS always advances by exactly
        // 1), not hardcoded, so it stays correct regardless of how many
        // prior CAS writes (e.g. the `/events` call above) already
        // advanced the binding this turn.
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion:
                (body as { expectedSessionVersion: number })
                  .expectedSessionVersion + 1,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: 6,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              mediaEpoch: (body as { mediaEpoch: number }).mediaEpoch,
              turnId: (body as { turnId: string }).turnId,
              content: (body as { content: unknown }).content,
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
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
    // The real `/events` call (R4 residual) durably opens the
    // authoritative inputEpoch watermark first, advancing sessionVersion
    // 5 -> 6, before `/input-resolutions` ever runs.
    const controlEventCall = calls.find((c) => c.path.endsWith("/events"));
    expect(controlEventCall?.body).toMatchObject({
      sequence: 1,
      eventType: "speech_start",
    });
    const inputResolutionCall = calls.find((c) => c.path.endsWith("/input-resolutions"));
    expect(inputResolutionCall?.body).toMatchObject({
      expectedSessionVersion: 6,
      inputEpoch: 1,
      resolution: "relevant",
    });
    // The binding's sessionVersion reflects both real CAS writes (/events
    // then /input-resolutions), not a locally invented value.
    expect(binding.sessionVersion).toBe(7);

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

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 residual: before
   * `recordAuthoritativeSpeechStart` existed, `resolveInput`/
   * `persistDialogueSnapshot`/`request_handoff` all submitted
   * `turnSession.inputEpoch` -- this attachment's own process-local
   * turn-sequencing counter -- directly as the authoritative epoch. That
   * counter advances on `speech.started` too (barge-in), not only on a
   * final, so a barge-in immediately before the triggering final makes it
   * diverge from the server's actual speech-start-only watermark. This
   * reproduces exactly that divergence (local counter reaches 2; the
   * authoritative watermark this session's first-ever `speech_start`
   * durably opens is 1) and proves every authoritative call now submits
   * the resolved value 1, never the locally-diverged 2 a real
   * `resolveInput`/`VoiceToolGatewayService` would reject as stale.
   */
  it("submits the authoritative, server-durable inputEpoch -- not this attachment's local turn-sequencing counter, which can diverge after an extra barge-in bump", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "88888888-8888-8888-8888-888888888888",
      resourceScopeId: "99999999-9999-9999-9999-999999999999",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 10,
    };

    const calls: Array<{ path: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ path, body });
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: 0,
              pendingInput: false,
              lastAppliedControlSequence: 0,
            },
            snapshot: null,
          },
        });
      }
      if (path.endsWith("/events")) {
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: true,
            gap: false,
            appliedThroughSequence: (body as { sequence: number }).sequence,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + 1,
              inputEpoch: 1,
              pendingInput: true,
            },
          },
        });
      }
      if (path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion:
                (body as { expectedSessionVersion: number })
                  .expectedSessionVersion + 1,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              pendingInput: false,
            },
          },
        });
      }
      if (path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "snapshot-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion:
                (body as { expectedSessionVersion: number })
                  .expectedSessionVersion + 1,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              mediaEpoch: (body as { mediaEpoch: number }).mediaEpoch,
              turnId: (body as { turnId: string }).turnId,
              content: (body as { content: unknown }).content,
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      if (path.endsWith("/handoffs")) {
        return jsonResponse(200, {
          data: { results: [{ status: "queued", handoffId: "handoff-real-2" }] },
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
    await flush(5);

    // Barge-in BEFORE the triggering final: bumps the local
    // `turnSession.inputEpoch` counter to 1 with no turn yet queued.
    (channel as unknown as EventEmitter).emit(
      "message",
      JSON.stringify({ type: "speech.started" }),
      false,
    );
    // The triggering final then bumps the local counter again, to 2 --
    // diverged from the authoritative watermark's eventual value of 1.
    asr.emitFinal("救命", "seg-1");
    await flush(10);

    const controlEventCall = calls.find((c) => c.path.endsWith("/events"));
    expect(controlEventCall?.body).toMatchObject({ sequence: 1 });
    const inputResolutionCall = calls.find((c) => c.path.endsWith("/input-resolutions"));
    expect(inputResolutionCall?.body).toMatchObject({ inputEpoch: 1 });
    const snapshotCall = calls.find(
      (c) => c.path.endsWith("/dialogue-snapshot") && (c.body as { content?: unknown })?.content,
    );
    expect(snapshotCall?.body).toMatchObject({ inputEpoch: 1 });
    const handoffCall = calls.find((c) => c.path.endsWith("/handoffs"));
    expect(handoffCall?.body).toMatchObject({ inputEpoch: 1 });

    expect(sentBinary.length).toBeGreaterThan(0);
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

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 residual, fail-closed case:
   * a `gap` (non-contiguous sequence, or a cross-media-epoch arrival, SD
   * §5.4) means the authoritative session never actually durably opened a
   * resolvable input watermark for this turn. `recordAuthoritativeSpeechStart`
   * must reject rather than let `persist()` proceed with a stale/unopened
   * epoch -- never a partial success where the engine commits state/speaks
   * without ever confirming authoritative admission.
   */
  it("fails closed and never speaks when the control-event watermark reports a gap instead of applying", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      resourceScopeId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 3,
    };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: 0,
              pendingInput: false,
              lastAppliedControlSequence: 0,
            },
            snapshot: null,
          },
        });
      }
      if (path.endsWith("/events")) {
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: false,
            gap: true,
            appliedThroughSequence: 0,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              inputEpoch: 0,
              pendingInput: false,
            },
          },
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
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
    await flush(5);

    asr.emitFinal("救命", "seg-1");
    await flush(10);

    expect(sentBinary).toHaveLength(0);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith("/input-resolutions"))).toBe(false);
    // The session's own sessionVersion is left untouched -- a gap must
    // never be silently reconciled as if it had advanced anything.
    expect(binding.sessionVersion).toBe(3);
    consoleError.mockRestore();
  });

  /**
   * Codex reopen round 5/6, R6: a turn's handoff tool execution must not
   * escape cancellation and must never submit a newer `inputEpoch` than
   * the one admitted when the triggering transcript arrived. Reproduces
   * the reviewer's exact finding -- close/speech.started/media-epoch-
   * advance, each raised while the handoff-scoped capability call is
   * still outstanding -- against the real `VoiceSessionComposer` +
   * `VoiceCallTurnCoordinator` + `VoiceDialogueEngine` +
   * `OpenAiRealtimeFixtureAdapter` + `VoiceApiClient` composition, with
   * only the channel and the real `fetch` transport doubled.
   */
  describe("R6: a turn's handoff call must be fenced by the same cancellation that supersedes it", () => {
    function setup() {
      const binding: VoiceSessionBinding = {
        voiceSessionId: "44444444-4444-4444-4444-444444444444",
        resourceScopeId: "55555555-5555-5555-5555-555555555555",
        routeProfileVersion: 1,
        leaseEpoch: 2,
        sessionVersion: 4,
      };
      const calls: Array<{ path: string; body: unknown; hasSignal: boolean }> = [];
      let releaseHandoffCapability: () => void = () => {};
      const handoffCapabilityHeld = new Promise<void>((resolve) => {
        releaseHandoffCapability = resolve;
      });
      const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        calls.push({ path, body, hasSignal: init?.signal != null });
        if (path === "/callcenter/voice/capabilities") {
          const scopes = (body as { scopes: string[] }).scopes;
          if (scopes.includes("handoff_request")) {
            await handoffCapabilityHeld;
          }
          return jsonResponse(200, {
            data: { token: `capability-for-${scopes.join(",")}`, tokenType: "Bearer", expiresIn: 120 },
          });
        }
        if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
          return jsonResponse(200, {
            data: {
              session: {
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: binding.sessionVersion,
                resourceScopeId: binding.resourceScopeId,
                routeProfileVersion: binding.routeProfileVersion,
                leaseEpoch: binding.leaseEpoch,
                inputEpoch: 0,
                pendingInput: false,
                lastAppliedControlSequence: 0,
              },
              snapshot: null,
            },
          });
        }
        if (path.endsWith("/events")) {
          return jsonResponse(200, {
            data: {
              deduped: false,
              applied: true,
              gap: false,
              appliedThroughSequence: (body as { sequence: number }).sequence,
              session: {
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: binding.sessionVersion + 1,
                inputEpoch: 1,
                pendingInput: true,
              },
            },
          });
        }
        if (path.endsWith("/input-resolutions")) {
          return jsonResponse(200, {
            data: {
              session: {
                voiceSessionId: binding.voiceSessionId,
                sessionVersion:
                  (body as { expectedSessionVersion: number })
                    .expectedSessionVersion + 1,
                resourceScopeId: binding.resourceScopeId,
                routeProfileVersion: binding.routeProfileVersion,
                leaseEpoch: binding.leaseEpoch,
                inputEpoch: (body as { inputEpoch: number }).inputEpoch,
                pendingInput: false,
              },
            },
          });
        }
        if (path.endsWith("/dialogue-snapshot")) {
          return jsonResponse(200, {
            data: {
              snapshot: {
                snapshotId: "snapshot-1",
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: 5,
                inputEpoch: (body as { inputEpoch: number }).inputEpoch,
                mediaEpoch: (body as { mediaEpoch: number }).mediaEpoch,
                turnId: (body as { turnId: string }).turnId,
                content: (body as { content: unknown }).content,
                createdAt: "2026-07-24T09:00:00.000Z",
                retentionExpiresAt: "2027-01-20T09:00:00.000Z",
              },
              deduped: false,
            },
          });
        }
        if (path.endsWith("/handoffs")) {
          return jsonResponse(200, {
            data: { results: [{ status: "queued", handoffId: "handoff-should-not-happen" }] },
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
      return { binding, calls, releaseHandoffCapability, asr, channel, composer, sentBinary };
    }

    it("sends no /handoffs request when the channel closes while the handoff capability call is still outstanding", async () => {
      const { calls, releaseHandoffCapability, asr, channel, sentBinary } =
        setup();

      asr.emitFinal("救命", "seg-1");
      await flush(10);
      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);

      (channel as unknown as EventEmitter).emit("close");
      releaseHandoffCapability();
      await flush(10);

      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);
      expect(sentBinary).toHaveLength(0);
    });

    it("sends no /handoffs request when a speech.started control frame arrives (barge-in) while the handoff capability call is still outstanding", async () => {
      const { calls, releaseHandoffCapability, asr, channel, sentBinary } =
        setup();

      asr.emitFinal("救命", "seg-1");
      await flush(10);
      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);

      (channel as unknown as EventEmitter).emit(
        "message",
        JSON.stringify({ type: "speech.started" }),
        false,
      );
      releaseHandoffCapability();
      await flush(10);

      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);
      // Zero audio for the invalidated turn -- no laundered output either.
      expect(sentBinary).toHaveLength(0);
    });

    it("sends no /handoffs request when the media-authority epoch advances (handoff/reconnect) while the handoff capability call is still outstanding", async () => {
      const { binding, calls, releaseHandoffCapability, asr, composer, sentBinary } = setup();

      asr.emitFinal("救命", "seg-1");
      await flush(10);
      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);

      expect(composer.advanceMediaEpoch(binding.voiceSessionId)).toBe(2);
      releaseHandoffCapability();
      await flush(10);

      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);
      expect(sentBinary).toHaveLength(0);
    });

    it("positive control: with no invalidation, the handoff capability call carries a signal and submits the admitted inputEpoch, and the turn completes normally", async () => {
      const { calls, releaseHandoffCapability, asr, sentBinary } = setup();

      asr.emitFinal("救命", "seg-1");
      await flush(5);
      releaseHandoffCapability();
      await flush(10);

      const handoffCapabilityCall = calls.find(
        (c) =>
          c.path === "/callcenter/voice/capabilities" &&
          (c.body as { scopes: string[] }).scopes.includes("handoff_request"),
      );
      expect(handoffCapabilityCall?.hasSignal).toBe(true);
      const handoffCall = calls.find((c) => c.path.endsWith("/handoffs"));
      expect(handoffCall).toBeDefined();
      expect(handoffCall?.hasSignal).toBe(true);
      expect(handoffCall?.body).toMatchObject({ inputEpoch: 1 });
      expect(sentBinary.length).toBeGreaterThan(0);
    });
  });
});

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: `VoiceCallTurnCoordinator.
 * attach` restores a bound attachment's dialogue state and
 * `VoiceSessionBinding.sessionVersion` from authoritative truth
 * (`VoiceApiClient.getDialogueSnapshotRestoration`) instead of always
 * starting fresh/blank -- see `restoreBoundAttachment`'s own doc.
 */
describe("Restoration on attach: real VoiceSessionComposer + VoiceCallTurnCoordinator + VoiceApiClient", () => {
  const binding: VoiceSessionBinding = {
    voiceSessionId: "66666666-6666-6666-6666-666666666666",
    resourceScopeId: "77777777-7777-7777-7777-777777777777",
    routeProfileVersion: 1,
    leaseEpoch: 1,
    sessionVersion: 9,
  };

  function buildComposer(fetchImpl: typeof fetch) {
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
    return { asr, channel, sentBinary };
  }

  it("rehydrates a restored handoff into the dialogue state before any turn runs, so an admitted final is immediately terminal with no speech", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: 0,
              pendingInput: false,
              lastAppliedControlSequence: 0,
            },
            snapshot: {
              snapshotId: "snapshot-restored",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              inputEpoch: 0,
              mediaEpoch: 0,
              turnId: "turn-prior",
              content: {
                draftVersion: 2,
                confirmationId: null,
                slots: {},
                slotHistory: [],
                addressRepairs: { pickup: 0, dropoff: 0 },
                addressHistory: [],
                handoff: { reason: "customer_requested", intent: "human" },
              },
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });
    const { asr, sentBinary } = buildComposer(fetchImpl);

    asr.emitFinal("你好", "seg-1");
    await flush(10);

    // `VoiceDialogueEngine.turn` short-circuits to a silent handoff result
    // the moment `state.handoff` is already set -- the restored handoff
    // reason took effect before this turn's provider was ever consulted,
    // and no new capability/resolveInput/dialogue-snapshot call for a turn
    // was made (only the restoration's own GET + capability calls ran).
    expect(sentBinary).toHaveLength(0);
    expect(
      fetchImpl.mock.calls.some(([url]) =>
        String(url).includes("/input-resolutions"),
      ),
    ).toBe(false);
  });

  it("treats restoration failure (read error) the same as a released attachment -- never runs a turn against unverified state", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(500, {
          error: { code: "INTERNAL", message: "boom" },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { asr, sentBinary } = buildComposer(fetchImpl);
    await flush(5);

    asr.emitFinal("你好", "seg-1");
    await flush(10);

    expect(sentBinary).toHaveLength(0);
    expect(
      fetchImpl.mock.calls.some(([url]) =>
        String(url).includes("/input-resolutions"),
      ),
    ).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("treats a restoration whose authoritative session no longer matches this attachment's binding as a failure -- never trusts a mismatched scope/route/lease", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              resourceScopeId: "a-different-scope-entirely",
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: 0,
              pendingInput: false,
              lastAppliedControlSequence: 0,
            },
            snapshot: null,
          },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { asr, sentBinary } = buildComposer(fetchImpl);
    await flush(5);

    asr.emitFinal("你好", "seg-1");
    await flush(10);

    expect(sentBinary).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("R11 (Codex reopen round 15/16): discards a final that arrived BEFORE restoration settled, once restoration then fails -- never runs a turn against unverified state just because it was already queued", async () => {
    let releaseSnapshotRead: (() => void) | undefined;
    const snapshotRead = new Promise<void>((resolve) => {
      releaseSnapshotRead = resolve;
    });
    // Every path a real turn could reach, so that -- without R11's fix --
    // a turn that wrongly runs against unverified state would complete
    // successfully (real side effects: a durable speech-start watermark
    // call, a real TTS synthesis, a sent playback) instead of merely
    // throwing on an unhandled path, which would otherwise mask the exact
    // defect this test exists to catch.
    const calledPaths: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      calledPaths.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        // Held open: `attach()`'s own `restoreBoundAttachment` call is
        // still in flight when the final below is emitted -- this is
        // exactly the race the prior round's tests (which `await
        // flush(5)` before ever emitting a final) never exercised.
        await snapshotRead;
        return jsonResponse(500, { error: { code: "INTERNAL", message: "boom" } });
      }
      if (path.endsWith("/events")) {
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: true,
            gap: false,
            appliedThroughSequence: 1,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion,
              inputEpoch: 1,
              pendingInput: true,
            },
          },
        });
      }
      if (path.endsWith("/input-resolutions")) {
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + 1,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: 1,
              pendingInput: false,
            },
          },
        });
      }
      if (path.endsWith("/dialogue-snapshot")) {
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: "s1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + 1,
              inputEpoch: 1,
              mediaEpoch: 1,
              turnId: "turn-1",
              content: {},
              createdAt: "2026-07-24T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { asr, sentBinary } = buildComposer(fetchImpl);

    // No `await flush(...)` here -- restoration is still pending. This
    // final is enqueued behind it (see `attach()`'s `turnSession.queue =
    // this.restoreBoundAttachment(...)`), at a moment `turnSession.
    // restoreFailed` is still `undefined`.
    asr.emitFinal("你好", "seg-1");
    await flush(3);
    // Only now does restoration actually settle into failure.
    releaseSnapshotRead?.();
    await flush(10);

    // The only two calls that may ever happen are restoration's own
    // capability issuance and its GET read -- never anything a real turn
    // would reach (speech-start watermark, input-resolutions CAS,
    // dialogue-snapshot persist), and never any synthesized/sent audio.
    expect(calledPaths).toEqual([
      "POST /callcenter/voice/capabilities",
      `GET /callcenter/voice/sessions/${binding.voiceSessionId}/dialogue-snapshot`,
    ]);
    expect(sentBinary).toHaveLength(0);
    consoleError.mockRestore();
  });
});
