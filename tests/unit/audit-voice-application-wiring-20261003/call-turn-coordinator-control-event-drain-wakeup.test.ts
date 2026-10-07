import { describe, it, expect, vi } from "vitest";

import { VoiceCallTurnCoordinator } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import type { VoiceSessionBinding } from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";
import type { VoiceMediaWorkerEvent } from "../../../apps/voice-media-worker/src/media-session";
import type { VoiceCallTurnSpeaker } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control lost wakeup after
 * successful drain (Codex reopen, canonical 2026-10-04T00:26:49Z):
 * `flushControlEventBacklog`'s own chained drain task's `while` loop
 * (`call-turn-coordinator.ts`) keeps consuming `pendingControlEvents` from
 * the front until it observes the array empty, then exits; its OWN success
 * continuation (`.then(() => { controlEventDrainInFlight = false; })`) only
 * cleared the in-flight flag, with no recheck of the backlog. An arrival
 * landing in the Promise microtask-settlement window BETWEEN the `while`
 * loop exiting and that continuation actually running finds
 * `controlEventDrainInFlight` still `true` (so `flushControlEventBacklog`
 * short-circuits to a no-op for it) and is left in `pendingControlEvents`
 * with no owner: no drain running, no retry timer armed (the PRIOR drain
 * succeeded, so the error path that arms one never ran either). Without a
 * THIRD, unrelated control event or final ever arriving later to
 * accidentally re-trigger a fresh drain, that arrival is stranded
 * indefinitely despite a fully healthy transport.
 *
 * This probe uses the REAL, UNMODIFIED `VoiceCallTurnCoordinator.attach`/
 * `handle` (never a reimplementation of its drain/backlog logic) and the
 * real `VoiceApiClient`. `recordAuthoritativeControlEvent` itself is
 * doubled with a manually-resolved `Promise` (not `fetch`): the race this
 * finding describes is a PURE Promise-microtask-scheduling race internal to
 * `chainControlEvent`/`flushControlEventBacklog`, independent of any real
 * network timing, and doubling at this exact seam gives deterministic,
 * single-microtask-step control over when the in-flight drain settles --
 * the same class of technique `reconcileUnresolvedCommit`'s own held-
 * promise probes elsewhere in this suite already use for the analogous
 * dialogue-persist race. The exact tick counts below (2 and 3) were found
 * by stepping this real code one `await Promise.resolve()` at a time and
 * confirming each one reproduces the stranded arrival against the
 * pre-fix code (reverting just the backlog-recheck block makes both of
 * these tests fail: `recordAuthoritativeControlEvent` is never called a
 * second time), and that the fix below makes both pass.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

function buildHarness() {
  const binding: VoiceSessionBinding = {
    voiceSessionId: "e0000000-0000-4000-8000-000000000001",
    resourceScopeId: "e0000000-0000-4000-8000-000000000002",
    routeProfileVersion: 1,
    leaseEpoch: 1,
    sessionVersion: 10,
  };
  const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
    const path = new URL(String(url)).pathname;
    if (path === "/callcenter/voice/capabilities") {
      return jsonResponse(200, {
        data: { token: "capability-token", tokenType: "Bearer", expiresIn: 120 },
      });
    }
    if (path.endsWith("/dialogue-snapshot")) {
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
  const calls: string[] = [];
  let resolveCall: ((epoch: number) => void) | undefined;
  const recordSpy = vi
    .spyOn(
      coordinator as unknown as {
        recordAuthoritativeControlEvent: (...a: unknown[]) => Promise<number>;
      },
      "recordAuthoritativeControlEvent",
    )
    .mockImplementation(async (...args: unknown[]) => {
      const opts = args[2] as { eventType: string };
      calls.push(opts.eventType);
      return new Promise<number>((resolve) => {
        resolveCall = resolve;
      });
    });
  return { binding, coordinator, calls, recordSpy, getResolveCall: () => resolveCall! };
}

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control: lost wakeup after a successful control-event drain", () => {
  it.each([2, 3])(
    "a speech.started arriving %i microtask ticks after the prior drain's own write resolves is still drained, with no third event or retry timer ever needed",
    async (ticks) => {
      const { binding, coordinator, calls, recordSpy, getResolveCall } = buildHarness();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const attachment = coordinator.attach(binding.voiceSessionId, binding);
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      coordinator.handle(
        attachment,
        mediaEpochAdvancedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:00.000Z"),
        dumbSpeaker(),
      );
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(calls).toEqual(["media_epoch_transition"]);

      // Resolve the in-flight drain's only write -- its `while` loop is
      // about to observe the backlog empty and exit.
      getResolveCall()(1);
      // Land the second arrival exactly `ticks` pure-microtask steps later
      // -- see this file's own doc for how these counts were established
      // against this exact (real, unmodified) drain/backlog logic.
      for (let i = 0; i < ticks; i++) await Promise.resolve();
      coordinator.handle(
        attachment,
        speechStartedEvent(binding.voiceSessionId, 2, "2026-01-01T00:00:01.000Z"),
        dumbSpeaker(),
      );
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // The fix: this attachment's own backlog-recheck-after-success
      // reacquires drain ownership for the stranded arrival with no third
      // event, no retry timer, and no sleep ever needed.
      expect(calls).toEqual(["media_epoch_transition", "speech_start"]);
      consoleError.mockRestore();
      recordSpy.mockRestore();
    },
  );
});
