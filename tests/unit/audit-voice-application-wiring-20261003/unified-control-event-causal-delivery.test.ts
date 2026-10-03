import { describe, it, expect, vi } from "vitest";

import { VoiceCallTurnCoordinator } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import type { VoiceSessionBinding } from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";
import type { VoiceMediaWorkerEvent } from "../../../apps/voice-media-worker/src/media-session";
import type { VoiceCallTurnSpeaker } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
 * canonical 2026-10-03T21:09:40Z, "media transitions and speech backlog
 * do not share causal delivery/recovery"): `pendingSpeechStarts` (a
 * `speech.started`-only backlog) and `pendingMediaEpochTransitionId` (a
 * separate single-slot mechanism with no retry of its own on failure) were
 * two independent mechanisms sharing only the same `controlEventQueue`
 * serialization -- not a single ordered delivery unit. A
 * `media.epoch.advanced` event arriving between two `speech.started`
 * events could be "overtaken": the speech-start backlog's own drain loop
 * kept consuming newly-arrived speech-starts before the separately-chained
 * transition call ever got its turn on the queue, submitting both
 * speech-starts at consecutive sequence numbers and leaving the
 * transition to collide with an already-consumed sequence slot
 * afterward. A lost transition acknowledgement also had no retry at all
 * (just a `console.error`), unlike a lost speech-start.
 *
 * These probes drive the real `VoiceCallTurnCoordinator` (unmodified)
 * through `attach()`/`handle()` directly; only `fetch` (via
 * `VoiceApiClient`) is doubled -- same harness shape as the sibling
 * `media-epoch-continuation-and-bounded-delivery.test.ts`.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function flush(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function dumbSpeaker(): VoiceCallTurnSpeaker {
  return {
    async speak() {},
    currentMediaEpoch: () => 1,
  };
}

function mediaEpochAdvancedEvent(
  sessionId: string,
  mediaEpoch: number,
  occurredAt: string,
): VoiceMediaWorkerEvent {
  return {
    type: "media.epoch.advanced",
    sessionId,
    mediaEpoch,
    controlSequence: 1,
    occurredAt,
  };
}

function speechStartedEvent(
  sessionId: string,
  mediaEpoch: number,
  occurredAt: string,
): VoiceMediaWorkerEvent {
  return {
    type: "speech.started",
    sessionId,
    mediaEpoch,
    controlSequence: 1,
    occurredAt,
  };
}

function restorationGetHandler(binding: VoiceSessionBinding) {
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

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control: unified causal control-event delivery", () => {
  it("[exact reopen repro, probe 1] a media.epoch.advanced arriving between two speech.started events is never overtaken -- POST order matches arrival order", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "f0000000-0000-4000-8000-000000000001",
      resourceScopeId: "f0000000-0000-4000-8000-000000000002",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 10,
    };
    const calls: Array<{ body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return restorationGetHandler(binding);
      }
      if (path.endsWith("/events")) {
        calls.push({ body });
        const sequence = body.sequence as number;
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: true,
            gap: false,
            appliedThroughSequence: sequence,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + calls.length,
              inputEpoch: body.eventType === "speech_start" ? 1 : 0,
              pendingInput: body.eventType === "speech_start",
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
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      undefined,
      undefined,
      false,
      apiClient,
    );
    const attachment = coordinator.attach(binding.voiceSessionId, binding);
    await flush(10);

    // All three arrive synchronously, back to back -- exactly the
    // reopened probe's "while queue awaits" framing: no event waits for
    // the previous one's HTTP round trip to even begin.
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 1, "2026-01-01T00:00:00.000Z"),
      dumbSpeaker(),
    );
    coordinator.handle(
      attachment,
      mediaEpochAdvancedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:01.000Z"),
      dumbSpeaker(),
    );
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:02.000Z"),
      dumbSpeaker(),
    );
    await flush(10);

    // Strict arrival order, regardless of kind: speech-start(epoch1) ->
    // transition(epoch2) -> speech-start(epoch2). The old per-kind
    // mechanisms could submit both speech-starts back to back FIRST,
    // consuming sequence 2 for the second speech-start and only then
    // attempting the transition at the next (conflicting) slot.
    expect(calls.map((c) => c.body.eventType)).toEqual([
      "speech_start",
      "media_epoch_transition",
      "speech_start",
    ]);
    expect(calls.map((c) => c.body.sequence)).toEqual([1, 2, 3]);
    expect(calls[1]!.body).toMatchObject({ mediaEpoch: 2 });
    expect(calls[2]!.body).toMatchObject({ mediaEpoch: 2 });
  });

  it("[probes 2+3] a transient transition failure retries in place (no-final outage recovery) instead of letting a later speech-start jump ahead onto the same sequence slot", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "f0000000-0000-4000-8000-000000000011",
      resourceScopeId: "f0000000-0000-4000-8000-000000000012",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 20,
    };
    const calls: Array<{ body: Record<string, unknown> }> = [];
    let eventsCallCount = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return restorationGetHandler(binding);
      }
      if (path.endsWith("/events")) {
        eventsCallCount += 1;
        // The SECOND /events call ever made is this attachment's first
        // attempt at the media_epoch_transition -- fail it once,
        // transiently (lost transport ack), before any speech-start past
        // it is ever attempted.
        if (eventsCallCount === 2) {
          throw new Error("simulated transient transport failure");
        }
        calls.push({ body });
        const sequence = body.sequence as number;
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: true,
            gap: false,
            appliedThroughSequence: sequence,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + calls.length,
              inputEpoch: body.eventType === "speech_start" ? 1 : 0,
              pendingInput: body.eventType === "speech_start",
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
    // `turnTimeoutMs` large enough that the handful of real `flush()`
    // ticks this test awaits before deliberately waiting past it can
    // never themselves spuriously trip the bounded signal (which would
    // abort the in-flight write for exceeding its own deadline, not
    // because of the simulated transport failure this test actually
    // means to exercise).
    const TURN_TIMEOUT_MS = 300;
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      TURN_TIMEOUT_MS,
      undefined,
      false,
      apiClient,
    );
    const attachment = coordinator.attach(binding.voiceSessionId, binding);
    await flush(10);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // speech-start(epoch1) applies normally at sequence 1.
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 1, "2026-01-01T00:00:00.000Z"),
      dumbSpeaker(),
    );
    await flush(10);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ sequence: 1, eventType: "speech_start" });

    // media.epoch.advanced(epoch2) -- its first attempt (the 2nd /events
    // call overall) transiently fails.
    coordinator.handle(
      attachment,
      mediaEpochAdvancedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:01.000Z"),
      dumbSpeaker(),
    );
    await flush(10);
    expect(calls).toHaveLength(1); // still just the speech-start -- transition not yet durable.
    expect(consoleError).toHaveBeenCalled();

    // A later speech-start on the new epoch arrives BEFORE the transition's
    // own self-armed retry timer has fired -- which itself immediately
    // retriggers a fresh flush attempt (same as any new event arriving,
    // see `flushControlEventBacklog`'s own doc), draining strictly from
    // the front: the still-unresolved transition (now succeeding, since
    // the simulated failure was one-shot) BEFORE this new speech-start is
    // ever attempted. Per the unified, strictly-ordered backlog, this new
    // speech-start must never jump ahead and consume sequence 2 for
    // itself while the transition is still unresolved.
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:02.000Z"),
      dumbSpeaker(),
    );
    await flush(10);

    expect(calls).toHaveLength(3);
    expect(calls[1]!.body).toMatchObject({
      sequence: 2,
      mediaEpoch: 2,
      eventType: "media_epoch_transition",
    });
    expect(calls[2]!.body).toMatchObject({
      sequence: 3,
      mediaEpoch: 2,
      eventType: "speech_start",
    });
    consoleError.mockRestore();
  });

  it("[finding 3 repro] overflow eviction never targets the in-flight entry, and its own later acknowledgement never deletes a different retained entry", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "f0000000-0000-4000-8000-000000000021",
      resourceScopeId: "f0000000-0000-4000-8000-000000000022",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 30,
    };
    const calls: Array<{ body: Record<string, unknown> }> = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let eventsCallCount = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const body = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : {};
      if (path === "/callcenter/voice/capabilities") {
        return jsonResponse(200, {
          data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
        });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return restorationGetHandler(binding);
      }
      if (path.endsWith("/events")) {
        eventsCallCount += 1;
        if (eventsCallCount === 1) {
          // Hold observation 00's own acknowledgement open -- its write
          // genuinely applies, server-side, only once `releaseFirst` is
          // called below, modelling a slow (not failed) in-flight write.
          await firstGate;
        }
        calls.push({ body });
        const sequence = body.sequence as number;
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: true,
            gap: false,
            appliedThroughSequence: sequence,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + calls.length,
              inputEpoch: 1,
              pendingInput: true,
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
    // Large `turnTimeoutMs`: this test deliberately holds observation 00's
    // own acknowledgement open across many real `flush()` ticks, and must
    // never let the bounded signal's OWN deadline abort that in-flight
    // write as a side effect of the test harness's timing, independent of
    // the overflow/eviction behavior actually under test here.
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      5_000,
      undefined,
      false,
      apiClient,
    );
    const attachment = coordinator.attach(binding.voiceSessionId, binding);
    await flush(10);

    // Observation 00: its flush starts and genuinely goes in flight
    // (awaiting `firstGate`) -- confirmed by letting enough microtask
    // ticks pass before pushing the rest.
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 1, "2026-01-01T00:00:00.000Z"),
      dumbSpeaker(),
    );
    await flush(10);
    expect(eventsCallCount).toBe(1); // in flight, held on `firstGate`.
    expect(calls).toHaveLength(0);

    // Observations 01..09 (9 more, 10 total) pushed while 00 remains
    // in flight -- well past the 8-entry cap.
    for (let i = 1; i <= 9; i++) {
      coordinator.handle(
        attachment,
        speechStartedEvent(
          binding.voiceSessionId,
          1,
          `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        ),
        dumbSpeaker(),
      );
      await flush(2);
    }
    await flush(10);
    expect(eventsCallCount).toBe(1); // still only observation 00 attempted.

    // Release observation 00's acknowledgement.
    releaseFirst();
    await flush(10);

    // Observation 00 itself must have been delivered (never silently
    // evicted from the array while in flight), and every one of the 8
    // MOST RECENT queued observations (02..09) must ALSO have been
    // delivered afterward, each with its own distinct occurredAt --
    // observation 01 is the one deliberately dropped by the bounded
    // overflow policy. Before this fix, observation 00 itself was
    // silently evicted from the array mid-flight, and releasing its
    // acknowledgement then deleted observation 02 instead of ever
    // submitting it.
    expect(calls.map((c) => c.body.occurredAt)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.000Z",
      "2026-01-01T00:00:03.000Z",
      "2026-01-01T00:00:04.000Z",
      "2026-01-01T00:00:05.000Z",
      "2026-01-01T00:00:06.000Z",
      "2026-01-01T00:00:07.000Z",
      "2026-01-01T00:00:08.000Z",
      "2026-01-01T00:00:09.000Z",
    ]);
    expect(calls.map((c) => c.body.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
