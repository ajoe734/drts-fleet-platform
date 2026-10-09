import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceCallTurnCoordinator } from "../../../apps/voice-media-worker/src/dialogue/call-turn-coordinator";
import { OpenAiRealtimeFixtureAdapter } from "../../../apps/voice-media-worker/src/providers/native-voice/native-voice-adapter";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import type { VoiceSessionBinding } from "../../../apps/voice-media-worker/src/dialogue/voice-session-binding";

// Actual coordinator/HTTP client, with only HTTP/identity/provider boundaries
// doubled. Inspect the real scheduler without replacing its implementation.
// Fake time makes every retained retry measurable; no sockets or DB are used.
interface SessionObservation {
  queue: Promise<void>;
  controlEventQueue: Promise<void>;
  pendingControlEvents: unknown[];
  restoreFailed?: boolean;
  controlEventDrainInFlight?: boolean;
}
interface SchedulerObservation {
  sessions: Map<object, SessionObservation>;
  chainControlEvent(session: SessionObservation, work: () => Promise<unknown>): Promise<unknown>;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function json(body: unknown) {
  return new Response(JSON.stringify({ data: body }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

async function setup(mixed: boolean, options: { burstSize?: number; firstTransition?: boolean } = {}) {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const binding: VoiceSessionBinding = {
    voiceSessionId: "f0000000-0000-4000-8000-000000000071",
    resourceScopeId: "f0000000-0000-4000-8000-000000000072",
    routeProfileVersion: 1, leaseEpoch: 1, sessionVersion: 5,
  };
  const entered = deferred();
  const held = deferred();
  let attempts = 0;
  let healthy = false;
  const bodies: Array<Record<string, unknown>> = [];
  const client = new VoiceApiClient({
    baseUrl: "https://api.example.test",
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/capabilities")) {
        return json({ token: "fixture-capability", tokenType: "Bearer", expiresIn: 120 });
      }
      if (init?.method === "GET" && path.endsWith("/dialogue-snapshot")) {
        return json({ session: {
          ...binding, inputEpoch: 0, pendingInput: false, lastAppliedControlSequence: 0,
        }, snapshot: null });
      }
      if (path.endsWith("/events")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        attempts++;
        if (attempts === 1) { entered.resolve(); await held.promise; }
        if (!healthy) throw new Error("fixture control transport outage");
        return json({ deduped: false, applied: true, gap: false,
          appliedThroughSequence: body.sequence,
          session: { voiceSessionId: binding.voiceSessionId,
            sessionVersion: 5 + Number(body.sequence),
            inputEpoch: Number(body.sequence), pendingInput: true },
        });
      }
      throw new Error(`Unexpected HTTP boundary: ${path}`);
    },
  }, { getToken: async () => "fixture-workload" });
  const coordinator = new VoiceCallTurnCoordinator(
    () => new OpenAiRealtimeFixtureAdapter(), 1000, undefined, false, client,
  );
  const attachment = coordinator.attach(binding.voiceSessionId, binding);
  const observed = coordinator as unknown as SchedulerObservation;
  const session = observed.sessions.get(attachment)!;
  await session.queue;
  expect(session.restoreFailed).not.toBe(true);
  const scheduled = vi.spyOn(observed, "chainControlEvent");
  let mediaEpoch = 1;
  const speaker = { speak: async () => {}, currentMediaEpoch: () => mediaEpoch };
  function send(i: number) {
    const transition = (options.firstTransition === true && i === 0) || (mixed && i > 0 && i % 32 === 0);
    if (transition) mediaEpoch++;
    coordinator.handle(attachment, {
      type: transition ? "media.epoch.advanced" : "speech.started",
      sessionId: binding.voiceSessionId, mediaEpoch, controlSequence: i + 1,
      occurredAt: new Date(Date.UTC(2026, 9, 3) + i).toISOString(),
    }, speaker);
  }
  send(0);
  await entered.promise;
  for (let i = 1; i < (options.burstSize ?? 256); i++) send(i);
  return {
    coordinator, attachment, session, scheduled, bodies,
    emit: send,
    releaseHeld: () => held.resolve(),
    attempts: () => attempts,
    recover: () => { healthy = true; },
    failHeld: async () => { held.resolve(); await session.controlEventQueue; },
    cleanup: async () => {
      coordinator.release(attachment);
      held.resolve();
      await session.controlEventQueue;
      // Also finish leaked timers on the rejected baseline. Cleanup is not
      // an assertion of correctness; the tests inspect them BEFORE this.
      await vi.runAllTimersAsync();
    },
  };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe.each([false, true])("R4-control total scheduler boundedness (mixed=%s)", (mixed) => {
  it("coalesces a 256-event burst behind one held drain, not 256 promise-chain jobs", async () => {
    const h = await setup(mixed);
    try {
      expect(h.session.restoreFailed).not.toBe(true);
      expect(h.session.pendingControlEvents.length).toBeLessThanOrEqual(32);
      expect(h.attempts()).toBe(1);
      expect(h.scheduled).toHaveBeenCalledTimes(1);
    } finally { await h.cleanup(); }
  });

  it("owns one retry after failure and retries without another final/event", async () => {
    const h = await setup(mixed);
    try {
      await h.failHeld();
      expect(h.attempts()).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
      const original = h.bodies[0];
      h.recover();
      await vi.advanceTimersByTimeAsync(1000);
      await h.session.controlEventQueue;
      expect(h.bodies[1]).toEqual(original);
      expect(h.session.pendingControlEvents).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      const delivered = h.attempts();
      h.coordinator.release(h.attachment);
      await vi.advanceTimersByTimeAsync(2000);
      expect(h.attempts()).toBe(delivered);
    } finally { await h.cleanup(); }
  });

  it("hands ownership to an arrival between successful loop completion and promise settlement, without another event", async () => {
    const h = await setup(mixed, { burstSize: 1, firstTransition: mixed });
    try {
      h.recover();
      h.releaseHeld();
      let observedSettlementWindow = false;
      for (let i = 0; i < 200; i++) {
        await Promise.resolve();
        if (h.session.pendingControlEvents.length === 0 && h.session.controlEventDrainInFlight) {
          observedSettlementWindow = true;
          break;
        }
      }
      // No sleeps, timer advance or replaced business method creates this
      // window: observe the real drain and deliver a real public event.
      expect(observedSettlementWindow).toBe(true);
      h.emit(1);
      for (let i = 0; i < 200; i++) await Promise.resolve();
      expect(h.attempts()).toBe(2);
      expect(h.bodies.map((body) => body.sequence)).toEqual([1, 2]);
      expect(h.session.pendingControlEvents).toHaveLength(0);
      expect(h.session.controlEventDrainInFlight).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally { await h.cleanup(); }
  });

  it("release cancels EVERY retry after a failed burst, not only the last handle", async () => {
    const h = await setup(mixed);
    try {
      await h.failHeld();
      const beforeRelease = h.attempts();
      h.coordinator.release(h.attachment);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(2000);
      expect(h.attempts()).toBe(beforeRelease);
    } finally { await h.cleanup(); }
  });
});
