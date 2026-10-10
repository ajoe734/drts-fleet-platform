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

const waitOptions = { timeout: 1_000, interval: 10 };

/**
 * Observe the real attachment's promises without replacing coordinator logic.
 * Negative assertions must follow completed work, not initially empty output.
 * Keep the session reference to observe cancellation after release removes it.
 * Audio is detached from the turn queue; positive tests await it separately.
 */
function observeQueuedWork(
  coordinator: VoiceCallTurnCoordinator,
): () => Promise<void> {
  const { sessions } = coordinator as unknown as {
    sessions: Map<
      unknown,
      { queue: Promise<void>; controlEventQueue: Promise<void> }
    >;
  };
  const session = [...sessions.values()][0];
  if (!session) throw new Error("expected an attached test session");
  return async () => {
    let settled = false;
    void Promise.all([session.queue, session.controlEventQueue]).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(settled).toBe(true), waitOptions);
  };
}

async function waitForAudio(sentBinary: Buffer[]): Promise<void> {
  await vi.waitFor(
    () => expect(sentBinary.length).toBeGreaterThan(0),
    waitOptions,
  );
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
    this.listener?.({
      segmentId,
      revision: 1,
      text,
      final: true,
      language: "cmn-TW",
    });
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
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        calls.push({ path, body });
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: `capability-for-${(body as { scopes: string[] }).scopes.join(",")}`,
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
                // Real `VoiceSessionService.persistDialogueSnapshot` writes
                // the snapshot AT `expectedSessionVersion` -- it does not
                // itself advance the session's revision (that is
                // `resolveInput`'s own CAS, above) -- so the real backend
                // always echoes it back unchanged.
                sessionVersion: (body as { expectedSessionVersion: number })
                  .expectedSessionVersion,
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
            data: {
              results: [{ status: "queued", handoffId: "handoff-real-1" }],
            },
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );

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
    await waitForAudio(sentBinary);

    // Real persist call: issued a session_execute-only capability, then
    // called resolveInput with this turn's own inputEpoch and the
    // binding's pre-call sessionVersion.
    const persistCapabilityCall = calls.find(
      (c) =>
        c.path === "/callcenter/voice/capabilities" &&
        !(c.body as { scopes: string[] }).scopes.includes("handoff_request"),
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
    const inputResolutionCall = calls.find((c) =>
      c.path.endsWith("/input-resolutions"),
    );
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
      (c) =>
        c.path === "/callcenter/voice/capabilities" &&
        (c.body as { scopes: string[] }).scopes.includes("handoff_request"),
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
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        calls.push({ path, body });
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
                // Real `persistDialogueSnapshot` echoes `expectedSessionVersion`
                // unchanged -- it does not itself advance the session's
                // revision (see the sibling mock's own comment above).
                sessionVersion: (body as { expectedSessionVersion: number })
                  .expectedSessionVersion,
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
            data: {
              results: [{ status: "queued", handoffId: "handoff-real-2" }],
            },
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );

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
    const waitForQueuedWork = observeQueuedWork(coordinator);
    await waitForQueuedWork();

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
    await waitForAudio(sentBinary);

    const controlEventCall = calls.find((c) => c.path.endsWith("/events"));
    expect(controlEventCall?.body).toMatchObject({ sequence: 1 });
    const inputResolutionCall = calls.find((c) =>
      c.path.endsWith("/input-resolutions"),
    );
    expect(inputResolutionCall?.body).toMatchObject({ inputEpoch: 1 });
    const snapshotCall = calls.find(
      (c) =>
        c.path.endsWith("/dialogue-snapshot") &&
        (c.body as { content?: unknown })?.content,
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
    await waitForAudio(sentBinary);

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
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
      },
    );
    const apiClient = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
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
    const waitForQueuedWork = observeQueuedWork(coordinator);
    await waitForQueuedWork();

    asr.emitFinal("救命", "seg-1");
    await vi.waitFor(
      () => expect(consoleError).toHaveBeenCalled(),
      waitOptions,
    );

    expect(sentBinary).toHaveLength(0);
    expect(
      fetchImpl.mock.calls.some(([url]) =>
        String(url).endsWith("/input-resolutions"),
      ),
    ).toBe(false);
    // The session's own sessionVersion is left untouched -- a gap must
    // never be silently reconciled as if it had advanced anything.
    expect(binding.sessionVersion).toBe(3);
    // Release the deliberately unresolved turn and stop its retained retries.
    (channel as unknown as EventEmitter).emit("close");
    await waitForQueuedWork();
    consoleError.mockRestore();
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen round
   * 16/17): reproduces the reviewer's exact probe -- a real `speech.started`
   * barge-in frame must durably open the authoritative watermark
   * immediately, even when no `asr.segment.final` ever follows it. Before
   * this fix, `handle()`'s `speech.started` branch only did local
   * bookkeeping (`inputEpoch`/`activeAbort`) and never called apps/api at
   * all -- a delayed/failed/absent next final left the authoritative
   * session's watermark exactly as if nothing had happened, so a stale
   * `controlCutoff` built against it would still pass
   * `assertControlCutoffStillValid`.
   */
  it("R4-control: a real speech.started barge-in durably opens the authoritative watermark even when no final ever follows it", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      resourceScopeId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 20,
    };
    const calls: Array<{ path: string; body: unknown }> = [];
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        calls.push({ path, body });
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
        throw new Error(`unexpected path ${path}`);
      },
    );
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
    const waitForQueuedWork = observeQueuedWork(coordinator);
    await waitForQueuedWork();

    (channel as unknown as EventEmitter).emit(
      "message",
      JSON.stringify({ type: "speech.started" }),
      false,
    );
    await waitForQueuedWork();

    const controlEventCall = calls.find((c) => c.path.endsWith("/events"));
    expect(controlEventCall?.body).toMatchObject({
      sequence: 1,
      eventType: "speech_start",
    });
    // No final ever arrived, so no turn ran at all -- the authoritative
    // write is not gated behind one, and never waited for a provider/LLM
    // call that never happened.
    expect(calls.some((c) => c.path.endsWith("/input-resolutions"))).toBe(
      false,
    );
    // The watermark's own CAS write still advanced the binding's
    // sessionVersion, proving this reached the real apps/api route rather
    // than only updating local bookkeeping.
    expect(binding.sessionVersion).toBe(21);
    expect(sentBinary).toHaveLength(0);
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control, "response-loss
   * recovery is also absent" (Codex reopen round 16/17): reproduces the
   * reviewer's exact probe -- a control event that durably commits
   * server-side while its own HTTP response is lost must not permanently
   * desynchronize this attachment's local `controlSequence` counter from
   * the authoritative one. Before this fix, a retried attempt for the
   * same (locally un-advanced) sequence number with a fresh event id
   * landed on the real service's "safe no-op" response (`gap: false`,
   * `applied: false`, `deduped: false`) and was wrongly thrown as an
   * unresolvable `voice_control_event_gap`, repeating forever for every
   * later turn too.
   */
  it("R4-control: reconciles the control-sequence counter from a safe no-op response instead of permanently wedging after an ambiguous (response-lost) write, and retries the exact retained slot before a next final's own fallback write", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      resourceScopeId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 30,
    };
    let lastAppliedControlSequence = 0;
    let eventsCallCount = 0;
    const calls: Array<{ path: string; body: unknown }> = [];
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        if (path !== "/callcenter/voice/capabilities")
          calls.push({ path, body });
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
          eventsCallCount += 1;
          const sequence = body.sequence as number;
          if (eventsCallCount === 1) {
            // The real service durably commits sequence 1 here (modelled by
            // updating this closure's own state) -- but this exact HTTP
            // response never reaches the client, e.g. a network failure
            // right after the server already wrote it.
            lastAppliedControlSequence = sequence;
            throw new TypeError("simulated network failure after commit");
          }
          // A tiny, correctly-contiguous watermark server: a retry of an
          // already-applied sequence is a safe no-op (never a `gap`); the
          // actual next contiguous sequence genuinely applies and advances
          // the watermark. AUDIT-VOICE-APPLICATION-WIRING-20261003
          // R4-control (Codex reopen, canonical 2026-10-03T21:53:56Z): with
          // the unified retained backlog, the SECOND final's own enqueue
          // first retries the FIRST final's still-retained entry (same
          // sourceEventId, same sequence 1) before ever attempting its own
          // -- that retry must genuinely reconcile sequence 1 so this
          // attachment's `controlSequence` correctly advances to 2 before
          // the second final's own entry is attempted at sequence 2.
          let applied = false;
          let gap = false;
          if (sequence <= lastAppliedControlSequence) {
            // already applied -- safe no-op.
          } else if (sequence === lastAppliedControlSequence + 1) {
            lastAppliedControlSequence = sequence;
            applied = true;
          } else {
            gap = true;
          }
          return jsonResponse(200, {
            data: {
              deduped: false,
              applied,
              gap,
              appliedThroughSequence: lastAppliedControlSequence,
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
                snapshotId: "snapshot-retry",
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: (body as { expectedSessionVersion: number })
                  .expectedSessionVersion,
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
            data: {
              results: [{ status: "queued", handoffId: "handoff-retry" }],
            },
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );
    const apiClient = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
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
    const waitForQueuedWork = observeQueuedWork(coordinator);
    await waitForQueuedWork();

    // First final: its own control-event write fails from this client's
    // point of view (ambiguous -- the server already committed it, but
    // this client never learns that).
    asr.emitFinal("救命", "seg-1");
    await vi.waitFor(
      () => expect(consoleError).toHaveBeenCalled(),
      waitOptions,
    );
    expect(sentBinary).toHaveLength(0);

    // Second, independent final arrives while the first final's own
    // fallback speech-start write is still retained, unresolved.
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
    // canonical 2026-10-03T21:53:56Z, "final-only fallback bypasses
    // retained delivery"): the second final's own enqueue must retry the
    // FIRST final's exact retained entry (same sourceEventId, same
    // sequence 1) before the second final's own entry is ever attempted
    // at the next sequence -- never let the second final submit its own
    // fresh attempt at the stale sequence directly, skipping over the
    // first final's still-unresolved slot.
    asr.emitFinal("救命", "seg-2");
    await waitForAudio(sentBinary);

    const eventsCalls = calls.filter((c) => c.path.endsWith("/events"));
    expect(eventsCalls).toHaveLength(3);
    // Call 1: the first final's own entry, first attempt -- fails.
    expect(eventsCalls[0]?.body).toMatchObject({ sequence: 1 });
    // Call 2: the SAME entry (identical sourceEventId as call 1) retried
    // -- not the second final's own, different identity -- and this time
    // reconciles via the safe no-op response.
    expect(eventsCalls[1]?.body).toMatchObject({ sequence: 1 });
    expect(
      (eventsCalls[1]?.body as { sourceEventId: string }).sourceEventId,
    ).toBe((eventsCalls[0]?.body as { sourceEventId: string }).sourceEventId);
    // Call 3: only now does the second final's own, distinct entry attempt
    // its own (now correctly contiguous) sequence 2.
    expect(eventsCalls[2]?.body).toMatchObject({ sequence: 2 });
    expect(
      (eventsCalls[2]?.body as { sourceEventId: string }).sourceEventId,
    ).not.toBe(
      (eventsCalls[0]?.body as { sourceEventId: string }).sourceEventId,
    );
    // The second turn completed -- spoke normally -- instead of repeating
    // the first turn's failure or wedging behind it forever.
    expect(sentBinary.length).toBeGreaterThan(0);
    consoleError.mockRestore();
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control boundedness (Codex
   * reopen round 18): reproduces the reviewer's exact probe -- a bare
   * `speech.started`'s own `/events` write (`recordSpeechStartControlEvent`,
   * no turn of its own) previously had only `releaseAbort` cancellation,
   * which never fires on its own. A hung response therefore held
   * `controlEventQueue` open indefinitely, and every later chained write
   * -- including a subsequent final's own fallback watermark-open at
   * `executeTurn`'s `await turnSession.controlEventQueue` -- waited on it
   * forever, producing no audio for turns that arrived after the hang.
   */
  it("R4-control boundedness: a hung speech.started /events response is bounded by turnTimeoutMs instead of blocking every later chained write forever", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "99999999-9999-9999-9999-999999999999",
      resourceScopeId: "88888888-8888-8888-8888-888888888888",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 1,
    };
    let eventsCallCount = 0;
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
          eventsCallCount += 1;
          if (eventsCallCount === 1) {
            // Never settles on its own -- only the bounded signal's abort
            // can end it, modeling a real stalled/uncooperative apps/api
            // call exactly like the restoration bound/cancel test does.
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new Error("aborted"));
              });
            });
          }
          return jsonResponse(200, {
            data: {
              deduped: false,
              applied: true,
              gap: false,
              appliedThroughSequence: 1,
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
          const body = JSON.parse(init!.body as string) as {
            expectedSessionVersion: number;
            inputEpoch: number;
          };
          return jsonResponse(200, {
            data: {
              session: {
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: body.expectedSessionVersion + 1,
                resourceScopeId: binding.resourceScopeId,
                routeProfileVersion: binding.routeProfileVersion,
                leaseEpoch: binding.leaseEpoch,
                inputEpoch: body.inputEpoch,
                pendingInput: false,
              },
            },
          });
        }
        if (path.endsWith("/dialogue-snapshot")) {
          // The final's real `turnId` is a freshly generated UUID (`handle()`
          // assigns it), not known in advance -- echo back whatever this
          // exact call actually submitted, same correlation discipline
          // `createTrustedDialoguePersistPort` itself checks for.
          const body = JSON.parse(init!.body as string) as {
            expectedSessionVersion: number;
            inputEpoch: number;
            mediaEpoch: number;
            turnId: string;
          };
          return jsonResponse(200, {
            data: {
              snapshot: {
                snapshotId: "s1",
                voiceSessionId: binding.voiceSessionId,
                sessionVersion: body.expectedSessionVersion,
                inputEpoch: body.inputEpoch,
                mediaEpoch: body.mediaEpoch,
                turnId: body.turnId,
                content: {},
                createdAt: "2026-07-24T09:00:00.000Z",
                retentionExpiresAt: "2027-01-20T09:00:00.000Z",
              },
              deduped: false,
            },
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );
    const apiClient = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );
    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // `turnTimeoutMs: 150` -- the reviewer's own probe value -- bounds
    // both a turn's own stages AND (after this fix) this bare
    // speech.started's control write.
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      150,
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
    const waitForQueuedWork = observeQueuedWork(coordinator);
    await waitForQueuedWork();

    // Bare speech.started with no final -- its own /events write hangs.
    (channel as unknown as EventEmitter).emit(
      "message",
      JSON.stringify({ type: "speech.started" }),
      false,
    );
    await vi.waitFor(() => expect(eventsCallCount).toBe(1), waitOptions);

    // Observe the real 150ms control-write timeout. Without the bound this
    // never logs an error, and waitFor fails within one second.
    await vi.waitFor(
      () => expect(consoleError).toHaveBeenCalled(),
      waitOptions,
    );
    expect(consoleError).toHaveBeenCalled();
    // The retained write recovers on its own retry timer (also 150ms).
    // Sending the final before that recovery would spend its own deadline
    // waiting on the unresolved watermark, unlike the original 300ms setup.
    await vi.waitFor(
      () => expect(eventsCallCount).toBeGreaterThanOrEqual(2),
      waitOptions,
    );
    await waitForQueuedWork();

    // A later final must still complete and speak -- it was never
    // permanently blocked waiting on the first (now-aborted) write.
    asr.emitFinal("你好", "seg-1");
    await waitForAudio(sentBinary);

    expect(sentBinary.length).toBeGreaterThan(0);
    expect(eventsCallCount).toBeGreaterThanOrEqual(2);
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
      const calls: Array<{ path: string; body: unknown; hasSignal: boolean }> =
        [];
      let releaseHandoffCapability: () => void = () => {};
      const handoffCapabilityHeld = new Promise<void>((resolve) => {
        releaseHandoffCapability = resolve;
      });
      const fetchImpl = vi.fn(
        async (url: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(String(url)).pathname;
          const body = init?.body ? JSON.parse(init.body as string) : undefined;
          calls.push({ path, body, hasSignal: init?.signal != null });
          if (path === "/callcenter/voice/capabilities") {
            const scopes = (body as { scopes: string[] }).scopes;
            if (scopes.includes("handoff_request")) {
              await handoffCapabilityHeld;
            }
            return jsonResponse(200, {
              data: {
                token: `capability-for-${scopes.join(",")}`,
                tokenType: "Bearer",
                expiresIn: 120,
              },
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
                  // Real `persistDialogueSnapshot` echoes `expectedSessionVersion`
                  // unchanged -- see the sibling mocks' own comment above.
                  sessionVersion: (body as { expectedSessionVersion: number })
                    .expectedSessionVersion,
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
              data: {
                results: [
                  { status: "queued", handoffId: "handoff-should-not-happen" },
                ],
              },
            });
          }
          throw new Error(`unexpected path ${path}`);
        },
      );
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
      const waitForQueuedWork = observeQueuedWork(coordinator);
      const waitForHandoffCapability = () =>
        vi.waitFor(() => {
          expect(
            calls.some(
              (c) =>
                c.path === "/callcenter/voice/capabilities" &&
                (c.body as { scopes: string[] }).scopes.includes(
                  "handoff_request",
                ),
            ),
          ).toBe(true);
        }, waitOptions);
      return {
        binding,
        calls,
        releaseHandoffCapability,
        asr,
        channel,
        composer,
        sentBinary,
        waitForQueuedWork,
        waitForHandoffCapability,
      };
    }

    it("sends no /handoffs request when the channel closes while the handoff capability call is still outstanding", async () => {
      const {
        calls,
        releaseHandoffCapability,
        asr,
        channel,
        sentBinary,
        waitForQueuedWork,
        waitForHandoffCapability,
      } = setup();

      asr.emitFinal("救命", "seg-1");
      await waitForHandoffCapability();
      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);

      (channel as unknown as EventEmitter).emit("close");
      releaseHandoffCapability();
      await waitForQueuedWork();

      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);
      expect(sentBinary).toHaveLength(0);
    });

    it("sends no /handoffs request when a speech.started control frame arrives (barge-in) while the handoff capability call is still outstanding", async () => {
      const {
        calls,
        releaseHandoffCapability,
        asr,
        channel,
        sentBinary,
        waitForQueuedWork,
        waitForHandoffCapability,
      } = setup();

      asr.emitFinal("救命", "seg-1");
      await waitForHandoffCapability();
      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);

      (channel as unknown as EventEmitter).emit(
        "message",
        JSON.stringify({ type: "speech.started" }),
        false,
      );
      releaseHandoffCapability();
      await waitForQueuedWork();

      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);
      // Zero audio for the invalidated turn -- no laundered output either.
      expect(sentBinary).toHaveLength(0);
    });

    it("sends no /handoffs request when the media-authority epoch advances (handoff/reconnect) while the handoff capability call is still outstanding", async () => {
      const {
        binding,
        calls,
        releaseHandoffCapability,
        asr,
        composer,
        sentBinary,
        waitForQueuedWork,
        waitForHandoffCapability,
      } = setup();

      asr.emitFinal("救命", "seg-1");
      await waitForHandoffCapability();
      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);

      expect(composer.advanceMediaEpoch(binding.voiceSessionId)).toBe(2);
      releaseHandoffCapability();
      await waitForQueuedWork();

      expect(calls.some((c) => c.path.endsWith("/handoffs"))).toBe(false);
      expect(sentBinary).toHaveLength(0);
    });

    it("positive control: with no invalidation, the handoff capability call carries a signal and submits the admitted inputEpoch, and the turn completes normally", async () => {
      const {
        calls,
        releaseHandoffCapability,
        asr,
        sentBinary,
        waitForHandoffCapability,
      } = setup();

      asr.emitFinal("救命", "seg-1");
      await waitForHandoffCapability();
      releaseHandoffCapability();
      await waitForAudio(sentBinary);

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
    const waitForQueuedWork = observeQueuedWork(coordinator);
    return { asr, channel, sentBinary, waitForQueuedWork };
  }

  it("rehydrates a restored handoff into the dialogue state before any turn runs, so an admitted final is immediately terminal with no speech", async () => {
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
      },
    );
    const { asr, sentBinary, waitForQueuedWork } = buildComposer(fetchImpl);

    asr.emitFinal("你好", "seg-1");
    await waitForQueuedWork();

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
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
          });
        }
        if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
          return jsonResponse(500, {
            error: { code: "INTERNAL", message: "boom" },
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { asr, sentBinary, waitForQueuedWork } = buildComposer(fetchImpl);
    await waitForQueuedWork();

    asr.emitFinal("你好", "seg-1");
    await waitForQueuedWork();

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
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { asr, sentBinary, waitForQueuedWork } = buildComposer(fetchImpl);
    await waitForQueuedWork();

    asr.emitFinal("你好", "seg-1");
    await waitForQueuedWork();

    expect(sentBinary).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("R4-persist (Codex reopen round 18): treats a restoration for a FOREIGN voiceSessionId as a failure, even with an identical scope/route/lease", async () => {
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
          });
        }
        if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
          return jsonResponse(200, {
            data: {
              session: {
                voiceSessionId: "a-completely-different-session-id",
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
        throw new Error(`unexpected path ${path}`);
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { asr, sentBinary, waitForQueuedWork } = buildComposer(fetchImpl);
    await waitForQueuedWork();

    asr.emitFinal("你好", "seg-1");
    await waitForQueuedWork();

    expect(sentBinary).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("R4-persist (Codex reopen round 18): treats a restoration whose snapshot is foreign/from an incompatible revision/already expired as a failure -- never installs a foreign handoff", async () => {
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
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
              // Same scope/route/lease as the session above, but a foreign
              // snapshot: a different voiceSessionId, a revision/input the
              // session's own authoritative values could not have produced,
              // and an already-expired retention window -- plus a handoff
              // that must never be installed into this attachment's state.
              snapshot: {
                snapshotId: "snapshot-foreign",
                voiceSessionId: "a-completely-different-session-id",
                sessionVersion: binding.sessionVersion + 5,
                inputEpoch: 99,
                mediaEpoch: 0,
                turnId: "foreign-turn",
                content: {
                  draftVersion: 1,
                  confirmationId: null,
                  slots: {},
                  slotHistory: [],
                  addressRepairs: { pickup: 0, dropoff: 0 },
                  addressHistory: [],
                  handoff: { reason: "customer_requested", intent: "human" },
                },
                createdAt: "2020-01-01T00:00:00.000Z",
                retentionExpiresAt: "2020-02-01T00:00:00.000Z",
              },
            },
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { asr, sentBinary, waitForQueuedWork } = buildComposer(fetchImpl);
    await waitForQueuedWork();

    // The legitimate next final must become a real (non-terminal) turn --
    // never immediately "handoff" from a foreign snapshot that was never
    // actually verified as belonging to this session.
    asr.emitFinal("你好", "seg-1");
    await waitForQueuedWork();

    expect(sentBinary).toHaveLength(0);
    expect(
      fetchImpl.mock.calls.some(([url]) =>
        String(url).includes("/input-resolutions"),
      ),
    ).toBe(false);
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
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        calledPaths.push(`${init?.method ?? "GET"} ${path}`);
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
          });
        }
        if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
          // Held open: `attach()`'s own `restoreBoundAttachment` call is
          // still in flight when the final below is emitted -- this is
          // exactly the race the prior round's tests (which `await
          // flush(5)` before ever emitting a final) never exercised.
          await snapshotRead;
          return jsonResponse(500, {
            error: { code: "INTERNAL", message: "boom" },
          });
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
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { asr, sentBinary, waitForQueuedWork } = buildComposer(fetchImpl);

    // No `await flush(...)` here -- restoration is still pending. This
    // final is enqueued behind it (see `attach()`'s `turnSession.queue =
    // this.restoreBoundAttachment(...)`), at a moment `turnSession.
    // restoreFailed` is still `undefined`.
    asr.emitFinal("你好", "seg-1");
    await vi.waitFor(
      () =>
        expect(calledPaths).toContain(
          `GET /callcenter/voice/sessions/${binding.voiceSessionId}/dialogue-snapshot`,
        ),
      waitOptions,
    );
    // Only now does restoration actually settle into failure.
    releaseSnapshotRead?.();
    await waitForQueuedWork();

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

  it("R11 (Codex reopen round 18): discards a speech.started control write chained onto the restoration queue BEFORE restoration settles, once restoration then fails -- never advances the authoritative watermark for unverified state", async () => {
    let releaseSnapshotRead: (() => void) | undefined;
    const snapshotRead = new Promise<void>((resolve) => {
      releaseSnapshotRead = resolve;
    });
    const calledPaths: string[] = [];
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        calledPaths.push(`${init?.method ?? "GET"} ${path}`);
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
          });
        }
        if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
          // Held open: `attach()`'s own `restoreBoundAttachment` call (and
          // therefore `controlEventQueue`'s first link) is still pending
          // when the speech.started frame below is chained onto it.
          await snapshotRead;
          return jsonResponse(500, {
            error: { code: "INTERNAL", message: "boom" },
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { channel, sentBinary, waitForQueuedWork } = buildComposer(fetchImpl);

    // No `await flush(...)` here -- restoration is still pending.
    // `recordSpeechStartControlEvent` chains its write onto
    // `controlEventQueue`, whose first link IS the still-pending
    // restoration promise, at a moment `turnSession.restoreFailed` is
    // still `undefined`.
    (channel as unknown as EventEmitter).emit(
      "message",
      JSON.stringify({ type: "speech.started" }),
      false,
    );
    await vi.waitFor(
      () =>
        expect(calledPaths).toContain(
          `GET /callcenter/voice/sessions/${binding.voiceSessionId}/dialogue-snapshot`,
        ),
      waitOptions,
    );
    // Only now does restoration actually settle into failure.
    releaseSnapshotRead?.();
    await waitForQueuedWork();

    // The only two calls that may ever happen are restoration's own
    // capability issuance and its GET read -- never the chained
    // speech-start's own POST /events, which would durably (and wrongly)
    // advance the authoritative watermark for state that was never
    // actually verified.
    expect(calledPaths).toEqual([
      "POST /callcenter/voice/capabilities",
      `GET /callcenter/voice/sessions/${binding.voiceSessionId}/dialogue-snapshot`,
    ]);
    expect(sentBinary).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("R11 (Codex reopen round 18): release() cancels a never-settling restoration via the shared abort signal instead of leaving it dangling forever", async () => {
    const fetchImpl = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === "/callcenter/voice/capabilities") {
          return jsonResponse(200, {
            data: {
              token: "capability-token",
              tokenType: "Bearer",
              expiresIn: 120,
            },
          });
        }
        if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
          // Never settles on its own -- only an abort on the forwarded
          // signal can end it, exactly like a real stalled/uncooperative
          // apps/api call that `release()` must still be able to bound.
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          });
        }
        throw new Error(`unexpected path ${path}`);
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { channel, waitForQueuedWork } = buildComposer(fetchImpl);
    await vi.waitFor(
      () =>
        expect(
          fetchImpl.mock.calls.some(([url]) =>
            String(url).endsWith("/dialogue-snapshot"),
          ),
        ).toBe(true),
      waitOptions,
    );

    // Without R11's bound/cancel fix, this restoration would never settle
    // at all -- `release()` (triggered here by the channel closing, see
    // `VoiceSessionComposer`'s own "close" handler) must actually cancel
    // the in-flight GET via `turnSession.releaseAbort`, not merely stop
    // caring about its result. Await the restoration's real queue promise
    // within one second; without cancellation it remains pending because
    // nothing else in this test resolves the GET.
    (channel as unknown as EventEmitter).emit("close");
    await waitForQueuedWork();

    // `restoreBoundAttachment`'s own catch block only runs once the abort
    // actually rejects the GET -- observing it here is exactly what proves
    // the cancellation reached the real network call, not just the local
    // bookkeeping.
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
