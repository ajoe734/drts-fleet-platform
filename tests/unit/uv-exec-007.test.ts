import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  VoiceSessionService,
  type RecordControlEventCommand,
} from "../../apps/api/src/modules/voice-booking/voice-session.service";
import type {
  InsertControlEventInput,
  SessionControlPatch,
  VoiceSessionRepository,
} from "../../apps/api/src/modules/voice-booking/voice-session.repository";
import type {
  VoiceCommandReceiptRecord,
  VoiceSessionEventRecord,
  VoiceSessionRecord,
} from "../../apps/api/src/modules/voice-booking/voice-booking.repository";

const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";

function makeSessionRecord(
  overrides: Partial<VoiceSessionRecord> = {},
): VoiceSessionRecord {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    callId: "call-1",
    providerAccountId: "provider-1",
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

function makeReceiptRecord(
  overrides: Partial<VoiceCommandReceiptRecord> = {},
): VoiceCommandReceiptRecord {
  return {
    commandId: "55555555-5555-4555-8555-555555555555",
    intentId: "44444444-4444-4444-8444-444444444444",
    brandId: "brand-a",
    callId: "call-1",
    action: "create_owned_order",
    payloadHash: "sha256-fake",
    status: "pending",
    orderId: null,
    resultVersion: 1,
    errorCode: null,
    errorReason: null,
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * A small, stateful in-memory stand-in for VoiceSessionRepository. The
 * acceptance criteria here are about ordering/CAS *behavior* across a
 * sequence of calls (gap buffering, stale-version rejection, recovery after
 * "restart"), which a table of canned single-shot return values cannot
 * exercise -- so this fake actually implements the CAS/dedup/gap semantics a
 * real Postgres-backed repository would enforce.
 */
class FakeVoiceSessionRepository {
  session: VoiceSessionRecord;
  events = new Map<string, VoiceSessionEventRecord>();
  pendingReceipts: VoiceCommandReceiptRecord[];
  invalidateConfirmationCalls = 0;
  casUpdateOverride:
    | ((patch: SessionControlPatch) => VoiceSessionRecord | null)
    | null = null;

  constructor(
    session: VoiceSessionRecord,
    seedEvents: VoiceSessionEventRecord[] = [],
    pendingReceipts: VoiceCommandReceiptRecord[] = [],
  ) {
    this.session = session;
    for (const event of seedEvents) {
      this.events.set(`${event.voiceSessionId}:${event.sequence}`, event);
    }
    this.pendingReceipts = pendingReceipts;
  }

  findSessionById = vi.fn(async (voiceSessionId: string) => {
    return voiceSessionId === this.session.voiceSessionId
      ? { ...this.session }
      : null;
  });

  insertControlEvent = vi.fn(async (input: InsertControlEventInput) => {
    const key = `${input.voiceSessionId}:${input.sequence}`;
    const existing = this.events.get(key);
    if (existing) {
      return { event: existing, deduped: true };
    }
    const event: VoiceSessionEventRecord = {
      eventId: `event-${input.sequence}`,
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
    this.events.set(key, event);
    return { event, deduped: false };
  });

  findControlEventsAfter = vi.fn(
    async (
      voiceSessionId: string,
      mediaEpoch: number,
      afterSequence: number,
    ) => {
      return [...this.events.values()]
        .filter(
          (event) =>
            event.voiceSessionId === voiceSessionId &&
            event.mediaEpoch === mediaEpoch &&
            event.sequence > afterSequence,
        )
        .sort((a, b) => a.sequence - b.sequence);
    },
  );

  findAppliedMediaEpoch = vi.fn(async (voiceSessionId: string) => {
    if (voiceSessionId !== this.session.voiceSessionId) return null;
    if (this.session.lastAppliedControlSequence <= 0) return null;
    const applied = [...this.events.values()].find(
      (event) => event.sequence === this.session.lastAppliedControlSequence,
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
      if (this.casUpdateOverride) {
        const overridden = this.casUpdateOverride(patch);
        if (overridden) this.session = overridden;
        return overridden;
      }
      this.session = {
        ...this.session,
        ...(patch.dialogState !== undefined && {
          dialogState: patch.dialogState,
        }),
        ...(patch.mediaState !== undefined && { mediaState: patch.mediaState }),
        ...(patch.controlOwner !== undefined && {
          controlOwner: patch.controlOwner,
        }),
        ...(patch.leaseEpoch !== undefined && { leaseEpoch: patch.leaseEpoch }),
        ...(patch.commitStatus !== undefined && {
          commitStatus: patch.commitStatus,
        }),
        ...(patch.recordingState !== undefined && {
          recordingState: patch.recordingState,
        }),
        ...(patch.confirmationState !== undefined && {
          confirmationState: patch.confirmationState,
        }),
        ...(patch.outcome !== undefined && { outcome: patch.outcome }),
        ...(patch.inputEpoch !== undefined && { inputEpoch: patch.inputEpoch }),
        ...(patch.pendingInput !== undefined && {
          pendingInput: patch.pendingInput,
        }),
        ...(patch.lastResolvedInputEpoch !== undefined && {
          lastResolvedInputEpoch: patch.lastResolvedInputEpoch,
        }),
        ...(patch.lastAppliedControlSequence !== undefined && {
          lastAppliedControlSequence: patch.lastAppliedControlSequence,
        }),
        sessionVersion: this.session.sessionVersion + 1,
      };
      return { ...this.session };
    },
  );

  invalidateActiveConfirmationForSession = vi.fn(async () => {
    this.invalidateConfirmationCalls += 1;
    return null;
  });

  findPendingReceiptsForSession = vi.fn(async (voiceSessionId: string) => {
    return voiceSessionId === this.session.voiceSessionId
      ? this.pendingReceipts
      : [];
  });
}

function asRepository(
  fake: FakeVoiceSessionRepository,
): VoiceSessionRepository {
  return fake as unknown as VoiceSessionRepository;
}

function baseEventCommand(
  overrides: Partial<RecordControlEventCommand> = {},
): RecordControlEventCommand {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    source: "media_worker",
    providerAccountId: "provider-1",
    sourceEventId: undefined,
    occurredAt: "2026-09-06T02:00:00.000Z",
    sequence: 1,
    mediaEpoch: 2,
    leaseEpoch: 1,
    eventType: "clear",
    ...overrides,
  };
}

async function expectApiRequestError(
  action: () => unknown | Promise<unknown>,
  code: string,
) {
  try {
    await action();
    throw new Error(`Expected ApiRequestError with code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    if (error instanceof ApiRequestError) {
      expect(error.code).toBe(code);
    }
  }
}

describe("UV-EXEC-007: voice session state machine, ordered events, persistent control", () => {
  describe("ordered control events and gap buffering (SD §5.4)", () => {
    let fake: FakeVoiceSessionRepository;
    let service: VoiceSessionService;

    beforeEach(() => {
      // Bootstrap: sequence 3 already applied at mediaEpoch 2.
      const session = makeSessionRecord({ lastAppliedControlSequence: 3 });
      fake = new FakeVoiceSessionRepository(session, [
        {
          eventId: "seed",
          voiceSessionId: VOICE_SESSION_ID,
          legId: null,
          source: "media_worker",
          providerAccountId: "provider-1",
          sourceEventId: "seed-event",
          occurredAt: "2026-09-06T01:59:00.000Z",
          receivedAt: "2026-09-06T01:59:00.000Z",
          sequence: 3,
          mediaEpoch: 2,
          inputEpoch: 0,
          leaseEpoch: 1,
          eventType: "greeting_ack",
          payload: null,
          payloadRef: null,
        },
      ]);
      service = new VoiceSessionService(asRepository(fake));
    });

    it("buffers out-of-order arrivals without skipping the gap, then drains once the gap-filler lands", async () => {
      // A confirmation-related marker (seq 6) and an intervening clear (seq
      // 5) both arrive over HTTP before the actual next frame (seq 4, a
      // correction's speech-start) does.
      const resultSix = await service.recordControlEvent(
        baseEventCommand({
          sequence: 6,
          eventType: "confirmation_readback_ack",
        }),
      );
      expect(resultSix).toMatchObject({
        applied: false,
        gap: true,
        appliedThroughSequence: 3,
      });

      const resultFive = await service.recordControlEvent(
        baseEventCommand({ sequence: 5, eventType: "clear" }),
      );
      expect(resultFive).toMatchObject({
        applied: false,
        gap: true,
        appliedThroughSequence: 3,
      });

      // The session must not have advanced past the gap despite two later
      // frames already being durably stored.
      expect(fake.session.lastAppliedControlSequence).toBe(3);

      // Now the missing correction frame (the actual next sequence) arrives.
      const resultFour = await service.recordControlEvent(
        baseEventCommand({ sequence: 4, eventType: "speech_start" }),
      );

      expect(resultFour.applied).toBe(true);
      expect(resultFour.gap).toBe(false);
      // Draining applies 4, then the already-buffered 5 and 6 contiguously.
      expect(resultFour.appliedThroughSequence).toBe(6);
      expect(fake.session.lastAppliedControlSequence).toBe(6);
      // The speech-start along the way opened a fresh input epoch.
      expect(fake.session.pendingInput).toBe(true);
      expect(fake.session.inputEpoch).toBe(1);
    });

    it("treats a resend of the same control event as a safe dedup no-op", async () => {
      await service.recordControlEvent(
        baseEventCommand({ sequence: 4, eventType: "clear" }),
      );
      const versionAfterFirst = fake.session.sessionVersion;

      const resend = await service.recordControlEvent(
        baseEventCommand({ sequence: 4, eventType: "clear" }),
      );
      expect(resend.deduped).toBe(true);
      expect(fake.session.sessionVersion).toBe(versionAfterFirst);
    });

    it("never lets a mismatched media epoch reorder across streams", async () => {
      const result = await service.recordControlEvent(
        baseEventCommand({ sequence: 4, mediaEpoch: 3, eventType: "clear" }),
      );
      expect(result).toMatchObject({ applied: false, gap: true });
      expect(fake.session.lastAppliedControlSequence).toBe(3);
    });
  });

  describe("controlCutoff validation (SD §5.4, acceptance: correction-before-confirmation under HTTP reordering)", () => {
    let fake: FakeVoiceSessionRepository;
    let service: VoiceSessionService;

    beforeEach(async () => {
      const session = makeSessionRecord({ lastAppliedControlSequence: 3 });
      fake = new FakeVoiceSessionRepository(session, [
        {
          eventId: "seed",
          voiceSessionId: VOICE_SESSION_ID,
          legId: null,
          source: "media_worker",
          providerAccountId: "provider-1",
          sourceEventId: "seed-event",
          occurredAt: "2026-09-06T01:59:00.000Z",
          receivedAt: "2026-09-06T01:59:00.000Z",
          sequence: 3,
          mediaEpoch: 2,
          inputEpoch: 0,
          leaseEpoch: 1,
          eventType: "greeting_ack",
          payload: null,
          payloadRef: null,
        },
      ]);
      service = new VoiceSessionService(asRepository(fake));
      // Drive applied watermark to 6, with a speech-start at 4 opening
      // inputEpoch 1 (mirrors the gap-buffering scenario above).
      await service.recordControlEvent(
        baseEventCommand({ sequence: 6, eventType: "noop" }),
      );
      await service.recordControlEvent(
        baseEventCommand({ sequence: 5, eventType: "noop" }),
      );
      await service.recordControlEvent(
        baseEventCommand({ sequence: 4, eventType: "speech_start" }),
      );
      expect(fake.session.lastAppliedControlSequence).toBe(6);
      expect(fake.session.inputEpoch).toBe(1);
    });

    it("rejects a cutoff that reaches past the last contiguously applied sequence", async () => {
      await expectApiRequestError(
        () =>
          service.assertControlCutoffStillValid(
            VOICE_SESSION_ID,
            { mediaEpoch: 2, controlSequence: 7 },
            0,
          ),
        "VOICE_CONTROL_CUTOFF_NOT_REACHED",
      );
    });

    it("rejects a stale media epoch", async () => {
      await expectApiRequestError(
        () =>
          service.assertControlCutoffStillValid(
            VOICE_SESSION_ID,
            { mediaEpoch: 1, controlSequence: 6 },
            0,
          ),
        "VOICE_DRAFT_STALE",
      );
    });

    it("blocks reuse of a proof built before an unresolved newer input arrived", async () => {
      // The proof/confirmation was computed against inputEpoch 0, but a new
      // speech-start has since opened inputEpoch 1 and it has not been
      // resolved as irrelevant yet -- commit must stay blocked.
      await expectApiRequestError(
        () =>
          service.assertControlCutoffStillValid(
            VOICE_SESSION_ID,
            { mediaEpoch: 2, controlSequence: 6 },
            0,
          ),
        "VOICE_UNRESOLVED_INPUT",
      );
    });

    it("allows proof reuse once the newer input is explicitly resolved as unrelated", async () => {
      await service.resolveInput(
        VOICE_SESSION_ID,
        fake.session.sessionVersion,
        1,
        "irrelevant",
      );

      const session = await service.assertControlCutoffStillValid(
        VOICE_SESSION_ID,
        { mediaEpoch: 2, controlSequence: 6 },
        0,
      );
      expect(session.lastResolvedInputEpoch).toBe(1);
      // Resolving as irrelevant must not touch confirmation state.
      expect(fake.invalidateConfirmationCalls).toBe(0);
    });

    it("invalidates the active confirmation when the newer input is a substantive correction", async () => {
      await service.resolveInput(
        VOICE_SESSION_ID,
        fake.session.sessionVersion,
        1,
        "relevant",
      );
      expect(fake.invalidateConfirmationCalls).toBe(1);
      expect(fake.session.pendingInput).toBe(false);
    });

    it("rejects resolving an input epoch that is not the session's current outstanding one", async () => {
      await expectApiRequestError(
        () =>
          service.resolveInput(
            VOICE_SESSION_ID,
            fake.session.sessionVersion,
            99,
            "irrelevant",
          ),
        "VOICE_DRAFT_STALE",
      );
    });
  });

  describe("owner/lease/version fencing (acceptance: same owner/lease writes only; stale revision never overwrites a newer draft)", () => {
    it("claims control ownership under the correct version and lease, advancing both", async () => {
      const session = makeSessionRecord({
        leaseEpoch: 2,
        sessionVersion: 5,
        controlOwner: "ai",
      });
      const fake = new FakeVoiceSessionRepository(session);
      const service = new VoiceSessionService(asRepository(fake));

      const updated = await service.claimControlOwner(
        VOICE_SESSION_ID,
        5,
        2,
        "human",
      );
      expect(updated.controlOwner).toBe("human");
      expect(updated.leaseEpoch).toBe(3);
      expect(updated.sessionVersion).toBe(6);
    });

    it("rejects a claim from a stale lease epoch (old worker no longer owns the session)", async () => {
      const session = makeSessionRecord({ leaseEpoch: 2, sessionVersion: 5 });
      const fake = new FakeVoiceSessionRepository(session);
      const service = new VoiceSessionService(asRepository(fake));

      await expectApiRequestError(
        () => service.claimControlOwner(VOICE_SESSION_ID, 5, 1, "human"),
        "VOICE_SESSION_NOT_OWNER",
      );
      // No write was attempted against the stored session.
      expect(fake.casUpdateSessionControl).not.toHaveBeenCalled();
    });

    it("rejects a write against a stale session revision (older revision must never overwrite a newer draft)", async () => {
      const session = makeSessionRecord({ leaseEpoch: 2, sessionVersion: 5 });
      const fake = new FakeVoiceSessionRepository(session);
      const service = new VoiceSessionService(asRepository(fake));

      // Simulate another writer having already advanced the session.
      fake.session = { ...fake.session, sessionVersion: 6 };

      await expectApiRequestError(
        () => service.claimControlOwner(VOICE_SESSION_ID, 5, 2, "human"),
        "VOICE_DRAFT_STALE",
      );
    });

    it("surfaces a concurrent CAS miss as ownership contention rather than silently overwriting", async () => {
      const session = makeSessionRecord({ leaseEpoch: 2, sessionVersion: 5 });
      const fake = new FakeVoiceSessionRepository(session);
      fake.casUpdateOverride = () => null;
      const service = new VoiceSessionService(asRepository(fake));

      await expectApiRequestError(
        () => service.claimControlOwner(VOICE_SESSION_ID, 5, 2, "human"),
        "VOICE_SESSION_NOT_OWNER",
      );
    });

    it("only allows a dialog-state transition that is in the SD §5.1 table", async () => {
      const session = makeSessionRecord({
        dialogState: "collecting",
        sessionVersion: 1,
      });
      const fake = new FakeVoiceSessionRepository(session);
      const service = new VoiceSessionService(asRepository(fake));

      await expectApiRequestError(
        () =>
          service.transitionDialogState(
            VOICE_SESSION_ID,
            1,
            "awaiting_dispatch",
          ),
        "VOICE_ACTION_PAYLOAD_CONFLICT",
      );

      const updated = await service.transitionDialogState(
        VOICE_SESSION_ID,
        1,
        "resolving",
      );
      expect(updated.dialogState).toBe("resolving");
    });
  });

  describe("commitStatus/closed orthogonality and restart recovery (SD §5.1/§7.3)", () => {
    it("closing a session never erases an already-accepted pending command", async () => {
      const session = makeSessionRecord({
        dialogState: "awaiting_dispatch",
        commitStatus: "pending",
        sessionVersion: 4,
      });
      const receipt = makeReceiptRecord({ status: "pending" });
      const fake = new FakeVoiceSessionRepository(session, [], [receipt]);
      const service = new VoiceSessionService(asRepository(fake));

      const closed = await service.closeSession(VOICE_SESSION_ID, 4);
      expect(closed.dialogState).toBe("closed");
      expect(closed.mediaState).toBe("ended");
      // commitStatus is orthogonal to dialogState and must survive closing.
      expect(closed.commitStatus).toBe("pending");

      const recovered =
        await service.recoverPendingCommandsAfterRestart(VOICE_SESSION_ID);
      expect(recovered).toEqual([receipt]);
    });

    it("is idempotent when the session is already closed", async () => {
      const session = makeSessionRecord({
        dialogState: "closed",
        sessionVersion: 7,
      });
      const fake = new FakeVoiceSessionRepository(session);
      const service = new VoiceSessionService(asRepository(fake));

      const result = await service.closeSession(
        VOICE_SESSION_ID,
        1 /* mismatched on purpose */,
      );
      expect(result.dialogState).toBe("closed");
      expect(fake.casUpdateSessionControl).not.toHaveBeenCalled();
    });

    it("recovers pending commands regardless of dialog state, distinguishing none/pending/succeeded from call-closed", async () => {
      const session = makeSessionRecord({
        dialogState: "closed",
        commitStatus: "succeeded",
      });
      const stillPending = makeReceiptRecord({
        commandId: "66666666-6666-4666-8666-666666666666",
        status: "pending",
      });
      const fake = new FakeVoiceSessionRepository(session, [], [stillPending]);
      const service = new VoiceSessionService(asRepository(fake));

      const recovered =
        await service.recoverPendingCommandsAfterRestart(VOICE_SESSION_ID);
      expect(recovered).toHaveLength(1);
      expect(recovered[0]?.status).toBe("pending");
      // The session-level commitStatus (a separate orthogonal field, already
      // succeeded here) is not conflated with a still-pending receipt.
      expect(fake.session.commitStatus).toBe("succeeded");
    });
  });
});
