import { describe, it, expect, vi } from "vitest";

import { VoiceCallTurnCoordinator } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import type { VoiceSessionBinding } from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";
import type { VoiceMediaWorkerEvent } from "../../../apps/voice-media-worker/src/media-session";
import type { VoiceCallTurnSpeaker } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control, the two findings
 * Codex's canonical 2026-10-03T19:24:15Z/20:13:00Z reopens left
 * unaddressed after Round-20/21/22 (media-epoch continuation, and the
 * companion bounded-retained-delivery backlog for `speech.started`).
 *
 * Only `fetch` (via `VoiceApiClient`) is doubled; `VoiceCallTurnCoordinator`
 * itself runs unmodified, driven directly through `attach()`/`handle()`
 * (no `VoiceSessionComposer`/channel needed for these control-event-only
 * probes -- see the sibling `trusted-turn-composition.test.ts` for the
 * full engine/persist/handoff composition, which these probes
 * deliberately stay out of).
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

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control: media-epoch continuation", () => {
  it("a real media.epoch.advanced event durably submits an authoritative media_epoch_transition, and a later observation on the new epoch still applies", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "e0000000-0000-4000-8000-000000000001",
      resourceScopeId: "e0000000-0000-4000-8000-000000000002",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 10,
    };
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
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
        calls.push({ path, body });
        const sequence = body.sequence as number;
        const isSpeechStart = body.eventType === "speech_start";
        return jsonResponse(200, {
          data: {
            deduped: false,
            applied: true,
            gap: false,
            appliedThroughSequence: sequence,
            session: {
              voiceSessionId: binding.voiceSessionId,
              sessionVersion: binding.sessionVersion + calls.length,
              inputEpoch: isSpeechStart ? 1 : 0,
              pendingInput: isSpeechStart,
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      undefined,
      undefined,
      false,
      apiClient,
    );
    const attachment = coordinator.attach(binding.voiceSessionId, binding);
    await flush(10);

    coordinator.handle(
      attachment,
      mediaEpochAdvancedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:00.000Z"),
      dumbSpeaker(),
    );
    await flush(10);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      sequence: 1,
      mediaEpoch: 2,
      eventType: "media_epoch_transition",
    });

    // A later real observation on the NEW epoch still applies -- this
    // worker's own authority was never permanently pinned to the old one.
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:01.000Z"),
      dumbSpeaker(),
    );
    await flush(10);

    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toMatchObject({
      sequence: 2,
      mediaEpoch: 2,
      eventType: "speech_start",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control: bounded retained delivery for speech.started", () => {
  function setup(firstCallFails: boolean) {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "e0000000-0000-4000-8000-000000000011",
      resourceScopeId: "e0000000-0000-4000-8000-000000000012",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 20,
    };
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
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
        if (firstCallFails && eventsCallCount === 1) {
          throw new Error("simulated transient network failure");
        }
        calls.push({ path, body });
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
    // Small `turnTimeoutMs` so the self-armed backlog retry timer fires
    // quickly in this test.
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      40,
      undefined,
      false,
      apiClient,
    );
    const attachment = coordinator.attach(binding.voiceSessionId, binding);
    return { binding, calls, coordinator, attachment };
  }

  it('"no-final outage recovery": a failed write self-heals via the backlog retry timer with no new triggering event', async () => {
    const { binding, calls, coordinator, attachment } = setup(true);
    await flush(10);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 1, "2026-01-01T00:00:00.000Z"),
      dumbSpeaker(),
    );
    await flush(10);
    // The first (failed) attempt never reached a durable response.
    expect(calls).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();

    // No second speech.started, no final -- wait past turnTimeoutMs for
    // the backlog's own self-armed retry, with nothing else triggering it.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flush(10);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      sequence: 1,
      occurredAt: "2026-01-01T00:00:00.000Z",
      eventType: "speech_start",
    });
    consoleError.mockRestore();
  });

  it("retains an earlier failed observation's own identity/occurredAt instead of overwriting it with a later distinct observation, and drains both in order", async () => {
    const { binding, calls, coordinator, attachment } = setup(true);
    await flush(10);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 1, "2026-01-01T00:00:00.000Z"),
      dumbSpeaker(),
    );
    await flush(10);
    expect(calls).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();

    // A second, genuinely distinct observation arrives before the first's
    // retry has fired.
    coordinator.handle(
      attachment,
      speechStartedEvent(binding.voiceSessionId, 1, "2026-01-01T00:00:01.000Z"),
      dumbSpeaker(),
    );
    await flush(10);

    // Both must have been delivered, strictly in arrival order, each with
    // its OWN occurredAt -- the second call must never have silently
    // replaced the first's still-outstanding identity/timestamp.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body).toMatchObject({
      sequence: 1,
      occurredAt: "2026-01-01T00:00:00.000Z",
      eventType: "speech_start",
    });
    expect(calls[1]!.body).toMatchObject({
      sequence: 2,
      occurredAt: "2026-01-01T00:00:01.000Z",
      eventType: "speech_start",
    });
    expect(calls[0]!.body.sourceEventId).not.toBe(calls[1]!.body.sourceEventId);
    consoleError.mockRestore();
  });

  it("bounds the backlog at MAX_CONTROL_EVENT_BACKLOG (8) entries, dropping the OLDEST under sustained outage", async () => {
    const binding: VoiceSessionBinding = {
      voiceSessionId: "e0000000-0000-4000-8000-000000000021",
      resourceScopeId: "e0000000-0000-4000-8000-000000000022",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      sessionVersion: 30,
    };
    let failing = true;
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
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
        if (failing) {
          throw new Error("simulated sustained outage");
        }
        calls.push({ path, body });
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
    const coordinator = new VoiceCallTurnCoordinator(
      () => new OpenAiRealtimeFixtureAdapter(),
      40,
      undefined,
      false,
      apiClient,
    );
    const attachment = coordinator.attach(binding.voiceSessionId, binding);
    await flush(10);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // 10 distinct observations, all pushed while delivery is failing --
    // well past the 8-entry cap.
    for (let i = 0; i < 10; i++) {
      coordinator.handle(
        attachment,
        speechStartedEvent(
          binding.voiceSessionId,
          1,
          `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        ),
        dumbSpeaker(),
      );
    }
    await flush(10);
    expect(calls).toHaveLength(0);

    // Outage ends; let the backlog drain.
    failing = false;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flush(10);

    // Exactly the 8 MOST RECENT observations (indices 2..9) were
    // retained and delivered, each at its own distinct, correctly
    // ordered sequence number -- the two oldest (indices 0, 1) were
    // dropped by the bounded-backlog policy, not retained forever and
    // not silently corrupting the ones that WERE kept.
    expect(calls).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(calls[i]!.body).toMatchObject({
        sequence: i + 1,
        occurredAt: `2026-01-01T00:00:${String(i + 2).padStart(2, "0")}.000Z`,
        eventType: "speech_start",
      });
    }
    consoleError.mockRestore();
  });
});
