import { beforeEach, describe, expect, it, vi } from "vitest";

import { VoiceSessionService } from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import type {
  InsertControlEventInput,
  SessionControlPatch,
  VoiceSessionRepository,
} from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import type {
  VoiceSessionEventRecord,
  VoiceSessionRecord,
} from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control (Codex reopen,
 * canonical 2026-10-03T21:09:40Z, "media transitions and speech backlog
 * do not share causal delivery/recovery", probe 4): `recordControlEvent`'s
 * `media_epoch_transition` branch (`voice-session.service.ts`, previously
 * lines ~362-372) checked `event.mediaEpoch <= appliedEpoch` BEFORE the
 * generic "already applied -- safe no-op" check (previously lines
 * ~392-401) ever ran. A worker RETRYING the exact same already-applied
 * transition (same sourceEventId/sequence/mediaEpoch/eventType, dedup hit)
 * is indistinguishable from a stale/superseded NEW transition targeting
 * that same epoch under that ordering: `event.mediaEpoch <= appliedEpoch`
 * is true in BOTH cases, since the retried transition's own prior
 * application is exactly what advanced `appliedEpoch` to its current
 * value. The old code therefore returned `gap: true` for a call that had,
 * in fact, already durably succeeded --
 * `VoiceCallTurnCoordinator.recordAuthoritativeControlEvent` then threw
 * `voice_control_event_gap` and the worker's own `controlSequence` could
 * never advance past it, repeatedly, forever.
 *
 * The fix moves the generic dedup-safe/already-applied check (`!isBootstrap
 * && event.sequence <= session.lastAppliedControlSequence`) BEFORE the
 * transition/mismatch gates, so any event (of either kind) whose own
 * sequence is already at or behind the watermark is always treated as a
 * safe no-op first -- only a genuinely new, not-yet-applied attempt (whose
 * sequence is ahead of the watermark) ever reaches the transition-specific
 * mismatch gate.
 */
const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";

function makeSessionRecord(
  overrides: Partial<VoiceSessionRecord> = {},
): VoiceSessionRecord {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    callId: "call-1",
    providerAccountId: "provider-a",
    providerCallId: "provider-call-1",
    resourceScopeId: "22222222-2222-4222-8222-222222222222",
    lineBindingId: "line-binding-1",
    routeProfileId: "route-profile-1",
    routeProfileVersion: 1,
    dialogState: "confirming",
    mediaState: "active",
    controlOwner: "ai",
    leaseEpoch: 1,
    sessionVersion: 1,
    commitStatus: "none",
    recordingState: "capturing",
    confirmationState: "awaiting_answer",
    outcome: null,
    inputEpoch: 0,
    pendingInput: false,
    lastResolvedInputEpoch: 0,
    lastAppliedControlSequence: 0,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

/** A single-index-per-identity fake, sufficient for this probe: a
 * dedup hit resolves purely on `sourceEventId` (this probe's retries
 * always resend the EXACT same identity), real ON-CONFLICT-then-lookup
 * shape, not a trivial overwrite. */
class FakeVoiceSessionRepository {
  session: VoiceSessionRecord;
  events: VoiceSessionEventRecord[] = [];

  constructor(session: VoiceSessionRecord) {
    this.session = session;
  }

  findSessionById = vi.fn(async (voiceSessionId: string) => {
    return voiceSessionId === this.session.voiceSessionId
      ? { ...this.session }
      : null;
  });

  insertControlEvent = vi.fn(async (input: InsertControlEventInput) => {
    const existing = this.events.find(
      (e) =>
        input.sourceEventId != null && e.sourceEventId === input.sourceEventId,
    );
    if (existing) {
      return { event: existing, deduped: true };
    }
    const event: VoiceSessionEventRecord = {
      eventId: `event-${this.events.length + 1}`,
      voiceSessionId: input.voiceSessionId,
      legId: input.legId ?? null,
      source: input.source,
      providerAccountId: input.providerAccountId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      occurredAt: input.occurredAt,
      receivedAt: input.occurredAt,
      sequence: input.sequence,
      mediaEpoch: input.mediaEpoch,
      inputEpoch: input.inputEpoch,
      leaseEpoch: input.leaseEpoch,
      eventType: input.eventType,
      payload: input.payload ?? null,
      payloadRef: input.payloadRef ?? null,
    };
    this.events.push(event);
    return { event, deduped: false };
  });

  findControlEventsAfter = vi.fn(
    async (voiceSessionId: string, mediaEpoch: number, afterSequence: number) => {
      return this.events
        .filter(
          (e) =>
            e.voiceSessionId === voiceSessionId &&
            e.mediaEpoch === mediaEpoch &&
            e.sequence > afterSequence,
        )
        .sort((a, b) => a.sequence - b.sequence);
    },
  );

  findAppliedMediaEpoch = vi.fn(async (voiceSessionId: string) => {
    if (voiceSessionId !== this.session.voiceSessionId) return null;
    if (this.session.lastAppliedControlSequence <= 0) return null;
    const applied = this.events.find(
      (e) =>
        e.voiceSessionId === voiceSessionId &&
        e.sequence === this.session.lastAppliedControlSequence,
    );
    return applied ? applied.mediaEpoch : null;
  });

  casUpdateSessionControl = vi.fn(
    async (
      voiceSessionId: string,
      expectedSessionVersion: number,
      patch: SessionControlPatch,
    ) => {
      if (
        voiceSessionId !== this.session.voiceSessionId ||
        this.session.sessionVersion !== expectedSessionVersion
      ) {
        return null;
      }
      this.session = {
        ...this.session,
        ...(patch.lastAppliedControlSequence !== undefined && {
          lastAppliedControlSequence: patch.lastAppliedControlSequence,
        }),
        ...(patch.pendingInput !== undefined && {
          pendingInput: patch.pendingInput,
        }),
        ...(patch.inputEpoch !== undefined && {
          inputEpoch: patch.inputEpoch,
        }),
        sessionVersion: this.session.sessionVersion + 1,
      };
      return { ...this.session };
    },
  );

  invalidateActiveConfirmationForSession = vi.fn(async () => null);
  findPendingReceiptsForSession = vi.fn(async () => []);
}

function asRepository(fake: FakeVoiceSessionRepository): VoiceSessionRepository {
  return fake as unknown as VoiceSessionRepository;
}

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control: media_epoch_transition retry is a safe no-op, not a gap", () => {
  let fake: FakeVoiceSessionRepository;
  let service: VoiceSessionService;

  beforeEach(() => {
    fake = new FakeVoiceSessionRepository(
      makeSessionRecord({ lastAppliedControlSequence: 0 }),
    );
    service = new VoiceSessionService(asRepository(fake));
  });

  it("[exact reopen repro] a dedup-retry of an ALREADY-APPLIED media_epoch_transition returns gap:false, appliedThroughSequence unchanged -- not gap:true", async () => {
    const bootstrap = await service.recordControlEvent({
      voiceSessionId: VOICE_SESSION_ID,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "speech-1",
      occurredAt: "2026-10-03T02:00:00.000Z",
      sequence: 1,
      mediaEpoch: 1,
      leaseEpoch: 1,
      eventType: "speech_start",
    });
    expect(bootstrap).toMatchObject({ applied: true, gap: false, appliedThroughSequence: 1 });

    const transitionCommand = {
      voiceSessionId: VOICE_SESSION_ID,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "transition-1",
      occurredAt: "2026-10-03T02:00:01.000Z",
      sequence: 2,
      mediaEpoch: 2,
      leaseEpoch: 1,
      eventType: "media_epoch_transition",
    };

    const firstAttempt = await service.recordControlEvent(transitionCommand);
    expect(firstAttempt).toMatchObject({
      deduped: false,
      applied: true,
      gap: false,
      appliedThroughSequence: 2,
    });
    expect(fake.session.lastAppliedControlSequence).toBe(2);

    // The worker never received this acknowledgement (HTTP response lost)
    // and retries the IDENTICAL command -- same sourceEventId, sequence,
    // mediaEpoch, eventType. The insert dedupes (hits the existing row);
    // before this fix, `event.mediaEpoch(2) <= appliedEpoch(2)` was
    // checked BEFORE the "already applied" shortcut and returned
    // `gap: true`, even though this exact write already succeeded.
    const retry = await service.recordControlEvent(transitionCommand);
    expect(retry).toMatchObject({
      deduped: true,
      applied: false,
      gap: false,
      appliedThroughSequence: 2,
    });
    expect(fake.session.lastAppliedControlSequence).toBe(2);
    expect(fake.events).toHaveLength(2);
  });

  it("a genuinely NEW same-or-backward transition attempt (different identity, not yet applied) is still rejected as gap:true", async () => {
    await service.recordControlEvent({
      voiceSessionId: VOICE_SESSION_ID,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "speech-1",
      occurredAt: "2026-10-03T02:00:00.000Z",
      sequence: 1,
      mediaEpoch: 1,
      leaseEpoch: 1,
      eventType: "speech_start",
    });
    await service.recordControlEvent({
      voiceSessionId: VOICE_SESSION_ID,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "transition-1",
      occurredAt: "2026-10-03T02:00:01.000Z",
      sequence: 2,
      mediaEpoch: 2,
      leaseEpoch: 1,
      eventType: "media_epoch_transition",
    });

    // A DIFFERENT (fresh identity, next sequence slot, never durably
    // applied before) transition attempt claiming the SAME current epoch
    // (2) is a stale/superseded claim, not a retry of something already
    // applied -- the fix's reordering must not loosen this rejection.
    const staleAttempt = await service.recordControlEvent({
      voiceSessionId: VOICE_SESSION_ID,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "transition-2-stale",
      occurredAt: "2026-10-03T02:00:02.000Z",
      sequence: 3,
      mediaEpoch: 2,
      leaseEpoch: 1,
      eventType: "media_epoch_transition",
    });
    expect(staleAttempt).toMatchObject({
      applied: false,
      gap: true,
      appliedThroughSequence: 2,
    });
    expect(fake.session.lastAppliedControlSequence).toBe(2);
  });

  it("a dedup-retry of an already-applied NON-transition event is also a safe no-op even after a LATER transition moved the pinned epoch forward", async () => {
    const speechStartCommand = {
      voiceSessionId: VOICE_SESSION_ID,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "speech-1",
      occurredAt: "2026-10-03T02:00:00.000Z",
      sequence: 1,
      mediaEpoch: 1,
      leaseEpoch: 1,
      eventType: "speech_start",
    };
    await service.recordControlEvent(speechStartCommand);
    await service.recordControlEvent({
      voiceSessionId: VOICE_SESSION_ID,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "transition-1",
      occurredAt: "2026-10-03T02:00:01.000Z",
      sequence: 2,
      mediaEpoch: 2,
      leaseEpoch: 1,
      eventType: "media_epoch_transition",
    });
    expect(fake.session.lastAppliedControlSequence).toBe(2);

    // Retry the FIRST (now historically-applied, OLD-epoch) speech-start.
    // Its own `event.mediaEpoch` (1) no longer matches the CURRENT
    // `appliedEpoch` (2, pinned by the transition above) -- without the
    // reordering fix this would incorrectly hit the generic cross-epoch
    // mismatch gate and return `gap: true` for a call that was, in fact,
    // already durably applied.
    const retry = await service.recordControlEvent(speechStartCommand);
    expect(retry).toMatchObject({
      deduped: true,
      applied: false,
      gap: false,
      appliedThroughSequence: 2,
    });
    expect(fake.session.lastAppliedControlSequence).toBe(2);
  });
});
