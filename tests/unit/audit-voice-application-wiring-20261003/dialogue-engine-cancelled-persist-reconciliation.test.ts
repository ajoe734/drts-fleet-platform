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
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
 * canonical 2026-10-03T19:24:15Z): the SAME cancelled-commit/content-loss
 * trigger reopened across 0ef23d738 -> b4771a0da. `VoiceDialogueEngine.
 * turn`'s `boundedStage` races `ports.persist(next, bounded)` against this
 * turn's own abort/deadline; when cancellation wins, `turn()` throws before
 * ever reaching `Object.assign(state, next)` -- but the actual network
 * operation keeps running in the background. If that operation's own
 * ambiguous-commit reconciliation later proves the content DID durably
 * land, that proof was, before this fix, written only onto `next` (an
 * already-abandoned clone), never onto the real per-attachment
 * `VoiceDialogueState` (`TurnSession.state`) -- so the NEXT turn silently
 * started from stale/blank content and overwrote the durably-accepted
 * commit.
 *
 * This probe runs the REAL `VoiceSessionComposer` + `VoiceCallTurnCoordinator`
 * + `VoiceDialogueEngine` + `VoiceDialogueState` + `createTrustedDialoguePersistPort`
 * + `VoiceApiClient` path end to end; only `fetch` (the apps/api transport
 * boundary) is a double, and it never claims PostgreSQL durability itself --
 * only that a POST's OWN HTTP acknowledgement was lost while the write
 * genuinely landed, which is exactly the scenario `reconcileAmbiguousCommit`
 * exists for.
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

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist: a cancelled turn's durably-reconciled content lands on the real attachment state, not an abandoned clone", () => {
  it("[exact reopen repro] an emergency turn's content commit, cancelled mid-write but later proven durable by reconciliation, survives the NEXT turn instead of being silently overwritten", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "44444444-4444-4444-8444-444444444444",
      resourceScopeId: "55555555-5555-4555-8555-555555555555",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };

    let getDialogueSnapshotCalls = 0;
    let contentPostCount = 0;
    type Turn1SnapshotBody = {
      expectedSessionVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
      content: unknown;
    };
    // Boxed in an object (rather than a bare `let`) so TypeScript doesn't
    // narrow this captured variable to its initial `null` literal at every
    // read site outside the closure that reassigns it.
    const turn1Snapshot: { body: Turn1SnapshotBody | null } = { body: null };
    const laterSnapshotBodies: unknown[] = [];

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;

      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: {
            token: `capability-for-${(body as { scopes: string[] }).scopes.join(",")}`,
            tokenType: "Bearer",
            expiresIn: 120,
          },
        });
      }

      if (method === "GET" && path.endsWith("/dialogue-snapshot")) {
        getDialogueSnapshotCalls += 1;
        if (getDialogueSnapshotCalls === 1) {
          // attach()-time restoration read: brand-new session, nothing yet.
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
        // Ambiguous-commit reconciliation read, triggered once turn 1's own
        // content POST below is aborted by its deadline. `turn1Snapshot.body`
        // was captured synchronously from that POST's own request body --
        // modeling a write that genuinely landed server-side with only its
        // HTTP acknowledgement lost, never a PostgreSQL behavior claim.
        if (!turn1Snapshot.body) {
          throw new Error("test setup error: reconciliation GET before turn 1's own POST body was captured");
        }
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: turn1Snapshot.body.expectedSessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: turn1Snapshot.body.inputEpoch,
              pendingInput: false,
              lastAppliedControlSequence: 1,
            },
            snapshot: {
              snapshotId: "snapshot-turn-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: turn1Snapshot.body.expectedSessionVersion,
              inputEpoch: turn1Snapshot.body.inputEpoch,
              mediaEpoch: turn1Snapshot.body.mediaEpoch,
              turnId: turn1Snapshot.body.turnId,
              content: turn1Snapshot.body.content,
              createdAt: "2026-10-03T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
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
                (body as { expectedSessionVersion: number }).expectedSessionVersion + 1,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              pendingInput: false,
            },
          },
        });
      }

      if (method !== "GET" && path.endsWith("/dialogue-snapshot")) {
        contentPostCount += 1;
        if (contentPostCount === 1) {
          turn1Snapshot.body = body as Turn1SnapshotBody;
          // Never settles on its own -- only this stage's own bounded
          // signal (turnTimeoutMs below) can end it, modeling a write
          // whose own HTTP acknowledgement never comes back, exactly like
          // the existing R4-control boundedness probe in this same suite.
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
              },
              { once: true },
            );
          });
        }
        laterSnapshotBodies.push(body);
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: `snapshot-${contentPostCount}`,
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: (body as { expectedSessionVersion: number }).expectedSessionVersion,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              mediaEpoch: (body as { mediaEpoch: number }).mediaEpoch,
              turnId: (body as { turnId: string }).turnId,
              content: (body as { content: unknown }).content,
              createdAt: "2026-10-03T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }

      throw new Error(`unexpected path ${method} ${path}`);
    });

    const apiClient = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );

    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
    // `turnTimeoutMs: 150` -- same probe value the existing R4-control
    // boundedness test in this suite uses -- bounds the content-commit
    // stage so its hung POST above is cancelled quickly.
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
    await flush(5);

    // Turn 1: an emergency final opens handoff with reason "urgent_safety".
    // Its content POST hangs until the 150ms deadline cancels this turn.
    asr.emitFinal("救命", "seg-1");
    await flush(5);
    // Longer than turnTimeoutMs (150ms): the hung POST above is aborted,
    // `createTrustedDialoguePersistPort`'s catch block runs, and the
    // (immediately-resolving, in this test) reconciliation GET settles.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await flush(10);

    expect(turn1Snapshot.body).not.toBeNull();
    expect((turn1Snapshot.body as Turn1SnapshotBody).content).toMatchObject({
      handoff: { reason: "urgent_safety", intent: "emergency" },
    });
    // Turn 1 itself never got to speak -- it was cancelled before its
    // engine stage could resolve a prompt.
    expect(sentBinary).toHaveLength(0);

    // Turn 2: an unrelated, non-emergency final arrives well after turn 1's
    // reconciliation above has already settled.
    asr.emitFinal("我要訂車", "seg-2");
    await flush(30);

    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist fix: the real
    // attachment state already carries turn 1's reconciled handoff forward
    // (`VoiceDialogueEngine.turn`'s very first line, `if (state.handoff)
    // return ...`), so turn 2 short-circuits before ever calling persist
    // again. Before this fix, `state.handoff` was never set (the
    // reconciliation only ever reached the abandoned clone `next`), so
    // turn 2 ran normally, persisted a SECOND snapshot with
    // `content.handoff: null` -- silently erasing the durably-accepted
    // "urgent_safety" commit -- and then (via its `resolve_location` tool
    // forcing a local `provider_unavailable` handoff) still spoke a
    // "已停止叫車資料蒐集" prompt, one call-turn-coordinator.executeTurn
    // speak() dispatch later than this fixed path ever reaches.
    expect(contentPostCount).toBe(1);
    expect(laterSnapshotBodies).toHaveLength(0);
    expect(sentBinary).toHaveLength(0);
  });

  it("[barge-in regression, Codex reopen canonical 2026-10-03T20:13:00Z] the SAME barge-in that cancels a turn's content commit also durably advances the session's generic revision for an unrelated (control-only) reason -- that must not suppress recovery of the cancelled commit", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "66666666-6666-4666-8666-666666666666",
      resourceScopeId: "77777777-7777-4777-8777-777777777777",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 5,
    };

    let getDialogueSnapshotCalls = 0;
    let contentPostCount = 0;
    type Turn1SnapshotBody = {
      expectedSessionVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
      content: unknown;
    };
    const turn1Snapshot: { body: Turn1SnapshotBody | null } = { body: null };
    const laterSnapshotBodies: unknown[] = [];
    // Deliberately held open: lets this test first confirm the barge-in's
    // OWN control-event POST below has resolved and advanced
    // `binding.sessionVersion` PAST this turn's own
    // `expectedSnapshotSessionVersion`, reproducing the exact ordering
    // Codex's probe demonstrated, before the reconciliation read (which
    // must still recover this turn's content despite that) is allowed to
    // settle.
    let releaseReconciliationGet: () => void = () => {};
    const reconciliationGetGate = new Promise<void>((resolve) => {
      releaseReconciliationGet = resolve;
    });

    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;

      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: {
            token: `capability-for-${(body as { scopes: string[] }).scopes.join(",")}`,
            tokenType: "Bearer",
            expiresIn: 120,
          },
        });
      }

      if (method === "GET" && path.endsWith("/dialogue-snapshot")) {
        getDialogueSnapshotCalls += 1;
        if (getDialogueSnapshotCalls === 1) {
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
        await reconciliationGetGate;
        if (!turn1Snapshot.body) {
          throw new Error("test setup error: reconciliation GET before turn 1's own POST body was captured");
        }
        return jsonResponse(200, {
          data: {
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: turn1Snapshot.body.expectedSessionVersion,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: turn1Snapshot.body.inputEpoch,
              pendingInput: false,
              lastAppliedControlSequence: 1,
            },
            snapshot: {
              snapshotId: "snapshot-turn-1",
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: turn1Snapshot.body.expectedSessionVersion,
              inputEpoch: turn1Snapshot.body.inputEpoch,
              mediaEpoch: turn1Snapshot.body.mediaEpoch,
              turnId: turn1Snapshot.body.turnId,
              content: turn1Snapshot.body.content,
              createdAt: "2026-10-03T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
          },
        });
      }

      // The barge-in's own durable `speech_start` control event -- advances
      // `binding.sessionVersion` by exactly 1, same as the real
      // `VoiceSessionService.recordControlEvent` CAS does, with NO dialogue
      // content involved at all.
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
                (body as { expectedSessionVersion: number }).expectedSessionVersion + 1,
              resourceScopeId: binding.resourceScopeId,
              routeProfileVersion: binding.routeProfileVersion,
              leaseEpoch: binding.leaseEpoch,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              pendingInput: false,
            },
          },
        });
      }

      if (method !== "GET" && path.endsWith("/dialogue-snapshot")) {
        contentPostCount += 1;
        if (contentPostCount === 1) {
          turn1Snapshot.body = body as Turn1SnapshotBody;
          // Never settles on its own -- only this turn's own cancellation
          // (the barge-in below, via `turnSession.activeAbort`) ends it.
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
              },
              { once: true },
            );
          });
        }
        laterSnapshotBodies.push(body);
        return jsonResponse(200, {
          data: {
            snapshot: {
              snapshotId: `snapshot-${contentPostCount}`,
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: (body as { expectedSessionVersion: number }).expectedSessionVersion,
              inputEpoch: (body as { inputEpoch: number }).inputEpoch,
              mediaEpoch: (body as { mediaEpoch: number }).mediaEpoch,
              turnId: (body as { turnId: string }).turnId,
              content: (body as { content: unknown }).content,
              createdAt: "2026-10-03T09:00:00.000Z",
              retentionExpiresAt: "2027-01-20T09:00:00.000Z",
            },
            deduped: false,
          },
        });
      }

      throw new Error(`unexpected path ${method} ${path}`);
    });

    const apiClient = new VoiceApiClient(
      { baseUrl: "https://api.example.test", fetchImpl },
      { getToken: vi.fn(async () => "workload-token") },
    );

    const asr = new StreamingAsrAdapter();
    const tts = new DeterministicTtsAdapter();
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
    await flush(5);

    // Turn 1: an emergency final opens handoff with reason "urgent_safety".
    // Its content POST hangs until the barge-in below cancels it.
    asr.emitFinal("救命", "seg-1");
    await flush(5);
    expect(contentPostCount).toBe(1);
    expect(turn1Snapshot.body).not.toBeNull();

    // The barge-in: cancels turn 1 (aborting its pending content POST,
    // triggering `createTrustedDialoguePersistPort`'s reconciliation catch
    // block) AND, independently, durably records its own speech-start
    // control event over the real `VoiceSessionService.recordControlEvent`
    // seam -- exactly like a real caller interrupting mid-response.
    (channel as unknown as EventEmitter).emit(
      "message",
      JSON.stringify({ type: "speech.started" }),
      false,
    );
    await flush(10);

    // The barge-in's own control event has now durably advanced the
    // session's generic revision counter for a reason that has nothing to
    // do with dialogue CONTENT ever landing anywhere -- this is the exact
    // state the previous ("current.sessionVersion === expected...") fence
    // mistook for "a newer turn already installed content". By the time
    // turn 1's content POST started, two authoritative writes had already
    // advanced `binding.sessionVersion` from 5 to 7: `executeTurn`'s own
    // final-only fallback speech-start (no explicit `speech.started` frame
    // preceded this turn's final) and `resolveInput`'s admission CAS. The
    // explicit barge-in's own control event now advances it once more, to
    // 8 -- past (not equal to) turn 1's own `expectedSnapshotSessionVersion`
    // (7), which is exactly the mismatch the old fence misread.
    expect(turn1Snapshot.body?.expectedSessionVersion).toBe(7);
    expect(binding.sessionVersion).toBe(8);
    expect(sentBinary).toHaveLength(0);

    // Only now let the reconciliation read (gated above) settle.
    releaseReconciliationGet();
    await flush(10);

    // Turn 2: an unrelated, non-emergency final, well after both the
    // barge-in's control event and turn 1's reconciliation have settled.
    asr.emitFinal("我要訂車", "seg-2");
    await flush(30);

    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist fix (Codex
    // reopen, canonical 2026-10-03T20:13:00Z): despite
    // `binding.sessionVersion` having advanced past this turn's own
    // `expectedSnapshotSessionVersion` for a control-only reason, turn 1's
    // durably-reconciled "urgent_safety" handoff still lands on the real
    // attachment state, so turn 2 short-circuits at
    // `VoiceDialogueEngine.turn`'s very first line instead of silently
    // starting a second, unrelated commit. Before this fix, the stale
    // `current.sessionVersion === expectedSnapshotSessionVersion` fence
    // (8 !== 7, since the barge-in's own control event already advanced
    // it) skipped writing the reconciled content onto the real attachment
    // state entirely -- turn 2 then ran normally, persisting a SECOND
    // snapshot with `content.handoff: null`, silently erasing the
    // durably-accepted commit.
    expect(contentPostCount).toBe(1);
    expect(laterSnapshotBodies).toHaveLength(0);
    expect(sentBinary).toHaveLength(0);
  });
});
