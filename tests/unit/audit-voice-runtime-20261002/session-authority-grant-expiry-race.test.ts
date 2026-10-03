import { describe, it, expect, vi, afterEach } from "vitest";
import { VoiceMediaSessionAuthority } from "../../../apps/voice-media-worker/src/server/session-authority";

/**
 * Codex review round 4 (reopen, AUDIT-VOICE-RUNTIME-20261002) R5: the same
 * expired-attach capacity defect persisted across two consecutive rounds.
 * `consumeGrant`'s own expired-grant branch cleared the pending record and
 * threw, but never emitted `grant.expired` -- only the TTL timer callback
 * (`handleGrantExpiry`) did. If an expired upgrade attempt reached
 * `consumeGrant` before the timer callback ran (normal event-loop delay, or
 * a slow/busy turn), the pending record was gone by the time the timer
 * fired, so `handleGrantExpiry` found nothing and the reaper that frees
 * `MediaWorkerServer`'s reserved capacity never ran -- permanently.
 *
 * These tests exercise `VoiceMediaSessionAuthority` directly with fake
 * timers so the race is deterministic: `vi.setSystemTime` moves wall-clock
 * time read by `Date.now()` past the grant's `expiresAt` without running
 * the scheduled `setTimeout` callback, exactly reproducing "expiry observed
 * by the upgrade path before the timer fires" without depending on a real
 * busy-loop or network race.
 */
describe("AUDIT-VOICE-RUNTIME-20261002: VoiceMediaSessionAuthority grant-expiry emits exactly once regardless of which path observes it", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits grant.expired when consumeGrant observes an already-expired grant before the TTL timer fires", () => {
    vi.useFakeTimers();
    const authority = new VoiceMediaSessionAuthority(50);
    const expiredEvents: Array<{ sessionId: string; epoch: number }> = [];
    authority.on("grant.expired", (evt: { sessionId: string; epoch: number }) =>
      expiredEvents.push(evt),
    );

    const grant = authority.issueGrant(
      "sess-race",
      "principal-1",
      undefined,
      1,
    );

    // Advance wall-clock time past the grant's TTL WITHOUT running the
    // scheduled timer callback -- this is exactly the race the task brief
    // describes: the expiry is observed first by `consumeGrant` (the
    // upgrade path), not by the timer.
    vi.setSystemTime(Date.now() + 100);

    expect(() => authority.consumeGrant("sess-race", grant.token)).toThrow(
      /expired/i,
    );
    expect(expiredEvents).toEqual([{ sessionId: "sess-race", epoch: 1 }]);

    // The timer callback firing afterward (now a stale no-op since the
    // pending record is already gone) must not emit a second time.
    vi.runOnlyPendingTimers();
    expect(expiredEvents).toHaveLength(1);
  });

  it("still emits exactly once when the TTL timer fires first (normal, unraced path)", () => {
    vi.useFakeTimers();
    const authority = new VoiceMediaSessionAuthority(50);
    const expiredEvents: Array<{ sessionId: string; epoch: number }> = [];
    authority.on("grant.expired", (evt: { sessionId: string; epoch: number }) =>
      expiredEvents.push(evt),
    );

    authority.issueGrant("sess-normal", "principal-1", undefined, 1);
    vi.advanceTimersByTime(60);

    expect(expiredEvents).toEqual([{ sessionId: "sess-normal", epoch: 1 }]);
  });

  it("does not evict a newer epoch's pending grant when an older, superseded epoch's token is replayed", () => {
    vi.useFakeTimers();
    const authority = new VoiceMediaSessionAuthority(50);
    const expiredEvents: Array<{ sessionId: string; epoch: number }> = [];
    authority.on("grant.expired", (evt: { sessionId: string; epoch: number }) =>
      expiredEvents.push(evt),
    );

    const first = authority.issueGrant(
      "sess-reused",
      "principal-1",
      undefined,
      1,
    );
    // A strictly higher epoch for the same session id supersedes the first
    // grant immediately (existing fencing behavior) and schedules its own
    // TTL timer in its place.
    const second = authority.issueGrant(
      "sess-reused",
      "principal-1",
      undefined,
      2,
    );

    // Replaying the first (already-superseded) grant's token must fail on
    // its own terms (token mismatch against the now-pending epoch-2
    // record), never by tearing down epoch 2's still-live grant or
    // emitting `grant.expired` for it.
    expect(() => authority.consumeGrant("sess-reused", first.token)).toThrow(
      /invalid/i,
    );
    expect(expiredEvents).toEqual([]);

    // Epoch 2's own token still attaches normally afterward.
    expect(() =>
      authority.consumeGrant("sess-reused", second.token),
    ).not.toThrow();
  });
});
