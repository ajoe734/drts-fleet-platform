import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import {
  VoiceSessionService,
  type RecordControlEventCommand,
} from "../../../apps/api/src/modules/voice-booking/voice-session.service";
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
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control dedup/application
 * correlation (Codex reopen, canonical 2026-10-03T19:24:15Z).
 *
 * `voice.session_event` enforces TWO INDEPENDENT unique indexes
 * (infra/migrations/V0086__voice_persistence_domain_schema.sql:257-261):
 *   - uq_voice_session_event_source_dedup on (source, provider_account_id,
 *     source_event_id), scoped ACROSS EVERY SESSION, not just this one.
 *   - uq_voice_session_event_sequence on (voice_session_id, sequence).
 *
 * `VoiceSessionRepository.insertControlEvent`'s real `INSERT ... ON CONFLICT
 * DO NOTHING` can be defeated by EITHER index and fall back to a lookup that
 * returns whichever row actually collided -- which is not necessarily the
 * row `command` describes. This fake models exactly that dual-index
 * ON-CONFLICT-then-fallback-lookup behavior (not a trivial single-key dedup
 * map), the external DB boundary only, so these probes exercise the exact
 * same correlation decision the real repository forces onto
 * `VoiceSessionService.recordControlEvent`.
 */
const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_VOICE_SESSION_ID = "33333333-3333-4333-8333-333333333333";

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

/**
 * Models `voice.session_event`'s real dual-unique-index conflict semantics:
 * a row lands only when it violates NEITHER index; otherwise the insert is
 * skipped and the resolver returns whichever existing row the conflict
 * resolves to (source-identity lookup first, exactly like the real
 * repository's fallback order), regardless of which session it belongs to.
 */
class DualIndexFakeVoiceSessionRepository {
  session: VoiceSessionRecord;
  events: VoiceSessionEventRecord[] = [];
  casFailuresRemaining = 0;

  constructor(session: VoiceSessionRecord) {
    this.session = session;
  }

  findSessionById = vi.fn(async (voiceSessionId: string) => {
    return voiceSessionId === this.session.voiceSessionId
      ? { ...this.session }
      : null;
  });

  insertControlEvent = vi.fn(async (input: InsertControlEventInput) => {
    const sequenceConflict = this.events.find(
      (e) =>
        e.voiceSessionId === input.voiceSessionId &&
        e.sequence === input.sequence,
    );
    const sourceConflict =
      input.sourceEventId != null
        ? this.events.find(
            (e) =>
              e.source === input.source &&
              (e.providerAccountId ?? null) ===
                (input.providerAccountId ?? null) &&
              e.sourceEventId === input.sourceEventId,
          )
        : undefined;

    if (!sequenceConflict && !sourceConflict) {
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
    }

    // Real repository's fallback order: source-identity lookup first, then
    // (voiceSessionId, sequence).
    const existing = sourceConflict ?? sequenceConflict!;
    return { event: existing, deduped: true };
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
      if (this.casFailuresRemaining > 0) {
        this.casFailuresRemaining -= 1;
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

function asRepository(
  fake: DualIndexFakeVoiceSessionRepository,
): VoiceSessionRepository {
  return fake as unknown as VoiceSessionRepository;
}

function baseEventCommand(
  overrides: Partial<RecordControlEventCommand> = {},
): RecordControlEventCommand {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    source: "trusted-worker",
    providerAccountId: "provider-a",
    sourceEventId: "same-source-event",
    occurredAt: "2026-10-03T02:00:00.000Z",
    sequence: 1,
    mediaEpoch: 1,
    leaseEpoch: 1,
    eventType: "speech_start",
    ...overrides,
  };
}

async function expectConflict(action: () => unknown | Promise<unknown>) {
  try {
    await action();
    throw new Error("Expected ApiRequestError with code VOICE_ACTION_PAYLOAD_CONFLICT");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    if (error instanceof ApiRequestError) {
      expect(error.code).toBe("VOICE_ACTION_PAYLOAD_CONFLICT");
      expect(error.getStatus()).toBe(409);
    }
  }
}

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-control: dedup result correlation before application", () => {
  let fake: DualIndexFakeVoiceSessionRepository;
  let service: VoiceSessionService;

  beforeEach(() => {
    const session = makeSessionRecord({ lastAppliedControlSequence: 0 });
    fake = new DualIndexFakeVoiceSessionRepository(session);
    service = new VoiceSessionService(asRepository(fake));
  });

  it("[exact reopen repro] rejects a reused source identity claiming a NEW sequence instead of applying a watermark for a row that was never inserted", async () => {
    const applied1 = await service.recordControlEvent(
      baseEventCommand({ sequence: 1, mediaEpoch: 1 }),
    );
    expect(applied1).toMatchObject({
      deduped: false,
      applied: true,
      gap: false,
      appliedThroughSequence: 1,
    });

    // Resend the SAME (source, providerAccountId, sourceEventId) identity,
    // but this time claiming sequence 2. The real unique index conflicts on
    // source identity and resolves back to the persisted seq-1 row -- before
    // this fix, the service would have trusted `command.sequence` (2) and
    // returned a false `applied:true/watermark:2` despite no sequence-2 row
    // ever existing.
    await expectConflict(() =>
      service.recordControlEvent(
        baseEventCommand({ sequence: 2, mediaEpoch: 1 }),
      ),
    );

    // The watermark must be untouched and only sequence 1 is actually durable.
    expect(fake.session.lastAppliedControlSequence).toBe(1);
    expect(fake.events.map((e) => e.sequence)).toEqual([1]);
  });

  it("rejects a source identity already durable under a DIFFERENT session (foreign-session collision)", async () => {
    // Seed a durable event for a different session under the same identity.
    fake.events.push({
      eventId: "foreign-event",
      voiceSessionId: OTHER_VOICE_SESSION_ID,
      legId: null,
      source: "trusted-worker",
      providerAccountId: "provider-a",
      sourceEventId: "same-source-event",
      occurredAt: "2026-10-03T01:00:00.000Z",
      receivedAt: "2026-10-03T01:00:00.000Z",
      sequence: 1,
      mediaEpoch: 1,
      inputEpoch: 0,
      leaseEpoch: 1,
      eventType: "speech_start",
      payload: null,
      payloadRef: null,
    });

    await expectConflict(() =>
      service.recordControlEvent(
        baseEventCommand({ sequence: 1, mediaEpoch: 1 }),
      ),
    );
    expect(fake.session.lastAppliedControlSequence).toBe(0);
    expect(
      fake.events.filter((e) => e.voiceSessionId === VOICE_SESSION_ID),
    ).toHaveLength(0);
  });

  it("rejects a (session, sequence) slot reused with different content (sequence/different-content collision)", async () => {
    await service.recordControlEvent(
      baseEventCommand({
        sequence: 1,
        mediaEpoch: 1,
        sourceEventId: "evt-original",
        payload: { text: "original" },
      }),
    );

    // A fresh sourceEventId (so it does NOT collide on the source index)
    // targeting the SAME sequence, but with different content: the real
    // unique-sequence index conflicts and resolves back to the original row.
    await expectConflict(() =>
      service.recordControlEvent(
        baseEventCommand({
          sequence: 1,
          mediaEpoch: 1,
          sourceEventId: "evt-different-content",
          payload: { text: "different" },
        }),
      ),
    );
    expect(fake.session.lastAppliedControlSequence).toBe(1);
    expect(fake.events).toHaveLength(1);
    expect(fake.events[0].payload).toEqual({ text: "original" });
  });

  it("[positive control, preserves prior fix] an IDENTICAL retry after a CAS failure still applies using the durable row's own fields", async () => {
    // Force the next CAS to fail, simulating a prior attempt that durably
    // inserted the row but lost the race to advance the watermark.
    fake.casFailuresRemaining = 1;
    await expect(
      service.recordControlEvent(
        baseEventCommand({
          sequence: 1,
          mediaEpoch: 1,
          sourceEventId: "evt-original",
        }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });

    // Row 1 is durable despite the thrown CAS failure.
    expect(fake.events).toHaveLength(1);
    expect(fake.session.lastAppliedControlSequence).toBe(0);

    // Retry with a fresh sourceEventId (the caller never received the first
    // attempt's id back) but otherwise IDENTICAL sequence/mediaEpoch/type/
    // payload. This must dedup-and-apply, not be rejected as a collision.
    const retried = await service.recordControlEvent(
      baseEventCommand({
        sequence: 1,
        mediaEpoch: 1,
        sourceEventId: "evt-retry-after-cas-failure",
      }),
    );
    expect(retried.deduped).toBe(true);
    expect(retried.applied).toBe(true);
    expect(retried.gap).toBe(false);
    expect(retried.appliedThroughSequence).toBe(1);
    expect(fake.session.lastAppliedControlSequence).toBe(1);
    // Still only the ORIGINAL row is durable -- the retry never inserted a
    // second row.
    expect(fake.events).toHaveLength(1);
    expect(fake.events[0].sourceEventId).toBe("evt-original");
  });

  it("NULL providerAccountId: an identical retry still dedups and applies correctly", async () => {
    await service.recordControlEvent(
      baseEventCommand({
        sequence: 1,
        mediaEpoch: 1,
        providerAccountId: null,
        sourceEventId: "evt-null-account",
      }),
    );
    fake.casFailuresRemaining = 0;

    const retried = await service.recordControlEvent(
      baseEventCommand({
        sequence: 1,
        mediaEpoch: 1,
        providerAccountId: null,
        sourceEventId: "evt-null-account",
      }),
    );
    expect(retried.deduped).toBe(true);
    expect(retried.gap).toBe(false);
    expect(retried.appliedThroughSequence).toBe(1);
  });

  it("buffered replay: a rejected collision does not disturb an already-buffered legitimate gap-filler", async () => {
    await service.recordControlEvent(
      baseEventCommand({ sequence: 1, mediaEpoch: 1, sourceEventId: "evt-1" }),
    );
    // Sequence 3 buffers behind a gap at sequence 2.
    const bufferedThree = await service.recordControlEvent(
      baseEventCommand({ sequence: 3, mediaEpoch: 1, sourceEventId: "evt-3" }),
    );
    expect(bufferedThree).toMatchObject({ applied: false, gap: true });

    // A reused-identity collision claiming sequence 2 must be rejected, not
    // silently treated as the legitimate gap-filler.
    await expectConflict(() =>
      service.recordControlEvent(
        baseEventCommand({ sequence: 2, mediaEpoch: 1, sourceEventId: "evt-1" }),
      ),
    );
    expect(fake.session.lastAppliedControlSequence).toBe(1);

    // The ACTUAL legitimate gap-filler at sequence 2 still drains normally,
    // picking up the already-buffered sequence 3 too.
    const legitimateTwo = await service.recordControlEvent(
      baseEventCommand({ sequence: 2, mediaEpoch: 1, sourceEventId: "evt-2" }),
    );
    expect(legitimateTwo.applied).toBe(true);
    expect(legitimateTwo.appliedThroughSequence).toBe(3);
    expect(fake.session.lastAppliedControlSequence).toBe(3);
  });

  it("no duplicate input application: a rejected collision never opens a second pendingInput/inputEpoch for the same speech-start", async () => {
    await service.recordControlEvent(
      baseEventCommand({
        sequence: 1,
        mediaEpoch: 1,
        sourceEventId: "evt-speech-1",
        eventType: "speech_start",
      }),
    );
    expect(fake.session.pendingInput).toBe(true);
    expect(fake.session.inputEpoch).toBe(1);

    // A reused-identity collision claiming sequence 2 must never apply a
    // second speech-start/input-epoch bump for content that was never
    // actually durably inserted at that sequence.
    await expectConflict(() =>
      service.recordControlEvent(
        baseEventCommand({
          sequence: 2,
          mediaEpoch: 1,
          sourceEventId: "evt-speech-1",
          eventType: "speech_start",
        }),
      ),
    );
    expect(fake.session.inputEpoch).toBe(1);
    expect(fake.session.pendingInput).toBe(true);
  });
});
