import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import type {
  VoiceRecordingCheckpointRecord,
  VoiceSessionEventRecord,
  VoiceSessionRecord,
} from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { VoiceSessionRepository } from "../../apps/api/src/modules/voice-booking/voice-session.repository";
import {
  VoiceEvidenceService,
  type RecordingObjectReadbackVerifier,
  type SealedRecordingSegmentInput,
} from "../../apps/api/src/modules/voice-booking/voice-evidence.service";
import {
  CallRecorderSession,
  type RecordingFrameInput,
} from "../../apps/voice-media-worker/src/recording/recorder-session";
import { InMemoryRecordingObjectStore } from "../../apps/voice-media-worker/src/recording/recording-object-store";

const CALL_ID = "call-1";
const RECORDING_ID = "recording-1";
const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------------------
// Part 1: recorder ingest / sealed segments (apps/voice-media-worker)
// ---------------------------------------------------------------------------

describe("CallRecorderSession (recorder ingest + sealed segments)", () => {
  function frame(
    overrides: Partial<RecordingFrameInput> = {},
  ): RecordingFrameInput {
    return {
      channel: "customer",
      bytes: new Uint8Array([1, 2, 3]),
      mediaOffsetMs: 0,
      occurredAtUtc: "2026-09-08T00:00:00.000Z",
      ...overrides,
    };
  }

  it("returns null and mutates nothing when sealing an empty buffer", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    const sealed = await session.sealSegment();
    expect(sealed).toBeNull();
    expect(session.getSealedSegments()).toHaveLength(0);
  });

  it("seals a bidirectional segment with an independently-verifiable checksum", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    session.ingestFrame(
      frame({ channel: "customer", mediaOffsetMs: 0, bytes: new Uint8Array([1, 2]) }),
    );
    session.ingestFrame(
      frame({ channel: "agent", mediaOffsetMs: 0, bytes: new Uint8Array([9, 9]) }),
    );
    session.ingestFrame(
      frame({ channel: "customer", mediaOffsetMs: 500, bytes: new Uint8Array([3]) }),
    );

    const sealed = await session.sealSegment();
    expect(sealed).not.toBeNull();
    expect(sealed!.channels.sort()).toEqual(["agent", "customer"]);
    expect(sealed!.segmentSequence).toBe(1);
    expect(sealed!.startOffsetMs).toBe(0);
    expect(sealed!.endOffsetMs).toBe(500);

    const readback = await store.verifyReadback(
      sealed!.objectKey,
      sealed!.objectVersion,
      sealed!.checksum,
    );
    expect(readback.readable).toBe(true);
    expect(readback.checksumMatches).toBe(true);

    // Wrong checksum must fail independent readback verification.
    const tampered = await store.verifyReadback(
      sealed!.objectKey,
      sealed!.objectVersion,
      "0".repeat(64),
    );
    expect(tampered.checksumMatches).toBe(false);
  });

  it("ignores zero-byte frames rather than sealing a hollow segment", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    session.ingestFrame(frame({ bytes: new Uint8Array([]) }));
    expect(await session.sealSegment()).toBeNull();
  });

  it("reports contiguous coverage across consecutive sealed segments", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    session.ingestFrame(frame({ mediaOffsetMs: 0 }));
    session.ingestFrame(frame({ mediaOffsetMs: 200 }));
    await session.sealSegment();

    session.ingestFrame(frame({ mediaOffsetMs: 200 }));
    session.ingestFrame(frame({ mediaOffsetMs: 400 }));
    await session.sealSegment();

    expect(session.hasContiguousCoverage()).toBe(true);
    expect(session.getLastSealedEndOffsetMs()).toBe(400);
  });

  it("honestly reports a gap instead of pretending offsets are contiguous", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    session.ingestFrame(frame({ mediaOffsetMs: 0 }));
    session.ingestFrame(frame({ mediaOffsetMs: 200 }));
    await session.sealSegment();

    // Buffered audio was lost (e.g. a restart); the next seal picks up well
    // past the previous segment's end offset instead of continuing from it.
    session.ingestFrame(frame({ mediaOffsetMs: 900 }));
    session.ingestFrame(frame({ mediaOffsetMs: 1100 }));
    await session.sealSegment();

    expect(session.hasContiguousCoverage()).toBe(false);
    // The recorder still preserves both sealed segments -- a gap does not
    // erase the evidence that does exist.
    expect(session.getSealedSegments()).toHaveLength(2);
  });

  it("never overwrites an already-sealed object key across seals", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    session.ingestFrame(frame({ mediaOffsetMs: 0 }));
    const first = await session.sealSegment();
    session.ingestFrame(frame({ mediaOffsetMs: 200 }));
    const second = await session.sealSegment();

    expect(first!.objectKey).not.toBe(second!.objectKey);
    // The first object is still independently readable/verifiable.
    const stillReadable = await store.verifyReadback(
      first!.objectKey,
      first!.objectVersion,
      first!.checksum,
    );
    expect(stillReadable.readable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Part 2: VoiceEvidenceService (apps/api) -- gate, ingestion, proof binding
// ---------------------------------------------------------------------------

class EvidenceFixture {
  checkpoints: VoiceRecordingCheckpointRecord[] = [];
  private sessionsByCallId = new Map<string, VoiceSessionRecord>();
  private sessionsById = new Map<string, VoiceSessionRecord>();
  private eventsBySession = new Map<string, VoiceSessionEventRecord[]>();

  seedSession(session: VoiceSessionRecord): void {
    this.sessionsByCallId.set(session.callId, session);
    this.sessionsById.set(session.voiceSessionId, session);
  }

  seedEvents(voiceSessionId: string, events: VoiceSessionEventRecord[]): void {
    this.eventsBySession.set(voiceSessionId, events);
  }

  getSessionById(voiceSessionId: string): VoiceSessionRecord | null {
    return this.sessionsById.get(voiceSessionId) ?? null;
  }

  findSessionByCallId(callId: string): VoiceSessionRecord | null {
    return this.sessionsByCallId.get(callId) ?? null;
  }

  listSessionEvents(voiceSessionId: string): VoiceSessionEventRecord[] {
    return this.eventsBySession.get(voiceSessionId) ?? [];
  }

  findLatest(callId: string): VoiceRecordingCheckpointRecord | null {
    // Matches the real VoiceBookingRepository.findLatestRecordingCheckpointForCall:
    // keyed by call_id alone, ordered by manifest_version DESC (see V0086).
    const rows = this.checkpoints.filter(
      (checkpoint) => checkpoint.callId === callId,
    );
    if (rows.length === 0) return null;
    return rows.reduce((a, b) => (a.manifestVersion > b.manifestVersion ? a : b));
  }

  insert(input: {
    callId: string;
    recordingId: string | null;
    manifestVersion: number;
    manifest: unknown;
    manifestHash: string;
    coverage: unknown;
    policyVersion: string;
    verifiedAt: string | null;
  }): { checkpoint: VoiceRecordingCheckpointRecord; inserted: boolean } {
    const existing = this.checkpoints.find(
      (checkpoint) =>
        checkpoint.callId === input.callId &&
        (checkpoint.recordingId ?? null) === (input.recordingId ?? null) &&
        checkpoint.manifestVersion === input.manifestVersion,
    );
    if (existing) {
      return { checkpoint: existing, inserted: false };
    }
    const checkpoint: VoiceRecordingCheckpointRecord = {
      checkpointId: `chk-${input.callId}-${input.recordingId ?? "none"}-${input.manifestVersion}`,
      callId: input.callId,
      recordingId: input.recordingId,
      manifestVersion: input.manifestVersion,
      manifest: input.manifest,
      manifestHash: input.manifestHash,
      coverage: input.coverage,
      policyVersion: input.policyVersion,
      verifiedAt: input.verifiedAt,
    };
    this.checkpoints.push(checkpoint);
    return { checkpoint, inserted: true };
  }

  casUpdate(
    voiceSessionId: string,
    expectedVersion: number,
    patch: Partial<VoiceSessionRecord>,
  ): VoiceSessionRecord | null {
    const session = this.sessionsById.get(voiceSessionId);
    if (!session || session.sessionVersion !== expectedVersion) {
      return null;
    }
    const updated: VoiceSessionRecord = {
      ...session,
      ...patch,
      sessionVersion: session.sessionVersion + 1,
    };
    this.sessionsById.set(voiceSessionId, updated);
    this.sessionsByCallId.set(updated.callId, updated);
    return updated;
  }
}

function asBookingRepository(fixture: EvidenceFixture): VoiceBookingRepository {
  const fake = {
    findSessionByCallId: vi.fn(async (callId: string) =>
      fixture.findSessionByCallId(callId),
    ),
    listSessionEvents: vi.fn(async (voiceSessionId: string) =>
      fixture.listSessionEvents(voiceSessionId),
    ),
    findLatestRecordingCheckpointForCall: vi.fn(async (callId: string) =>
      fixture.findLatest(callId),
    ),
  };
  return fake as unknown as VoiceBookingRepository;
}

function asSessionRepository(fixture: EvidenceFixture): VoiceSessionRepository {
  const fake = {
    insertRecordingCheckpoint: vi.fn(
      async (input: Parameters<EvidenceFixture["insert"]>[0]) =>
        fixture.insert(input),
    ),
    casUpdateSessionControl: vi.fn(
      async (
        voiceSessionId: string,
        expectedVersion: number,
        patch: Partial<VoiceSessionRecord>,
      ) => fixture.casUpdate(voiceSessionId, expectedVersion, patch),
    ),
  };
  return fake as unknown as VoiceSessionRepository;
}

class FakeReadbackVerifier implements RecordingObjectReadbackVerifier {
  unreadableKeys = new Set<string>();

  async verifyReadback(input: {
    objectKey: string;
    objectVersion: number;
    expectedChecksum: string;
  }): Promise<{ readable: boolean; checksumMatches: boolean }> {
    if (this.unreadableKeys.has(input.objectKey)) {
      return { readable: false, checksumMatches: false };
    }
    return { readable: true, checksumMatches: true };
  }
}

function makeSession(overrides: Partial<VoiceSessionRecord> = {}): VoiceSessionRecord {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    callId: CALL_ID,
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
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function segment(
  overrides: Partial<SealedRecordingSegmentInput> = {},
): SealedRecordingSegmentInput {
  return {
    callId: CALL_ID,
    recordingId: RECORDING_ID,
    segmentSequence: 1,
    objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000001`,
    objectVersion: 1,
    checksum: "checksum-1",
    byteSize: 100,
    channels: ["customer", "agent"],
    startOffsetMs: 0,
    endOffsetMs: 1000,
    startedAtUtc: "2026-09-08T00:00:00.000Z",
    endedAtUtc: "2026-09-08T00:00:01.000Z",
    durableAt: "2026-09-08T00:00:01.100Z",
    timingSource: "provider",
    timingPrecision: "exact",
    ...overrides,
  };
}

function sessionEvent(
  overrides: Partial<VoiceSessionEventRecord> = {},
): VoiceSessionEventRecord {
  return {
    eventId: "event-1",
    voiceSessionId: VOICE_SESSION_ID,
    legId: null,
    source: "media_worker",
    providerAccountId: null,
    sourceEventId: null,
    occurredAt: "2026-09-08T00:00:00.500Z",
    receivedAt: "2026-09-08T00:00:00.600Z",
    sequence: 1,
    mediaEpoch: 1,
    inputEpoch: 0,
    leaseEpoch: 1,
    eventType: "tts.playback.completed",
    payload: null,
    payloadRef: null,
    ...overrides,
  };
}

describe("VoiceEvidenceService", () => {
  let fixture: EvidenceFixture;
  let verifier: FakeReadbackVerifier;
  let service: VoiceEvidenceService;

  beforeEach(() => {
    fixture = new EvidenceFixture();
    fixture.seedSession(makeSession());
    verifier = new FakeReadbackVerifier();
    service = new VoiceEvidenceService(
      asBookingRepository(fixture),
      asSessionRepository(fixture),
      verifier,
    );
  });

  describe("gate (SD §8.3)", () => {
    it("denies with no_checkpoint before any segment is sealed", async () => {
      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate).toEqual({ allowed: false, reason: "no_checkpoint" });
    });

    it("allows checkpoint_ready once a verified, bidirectional, contiguous segment lands", async () => {
      await service.ingestSealedSegment(segment());
      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate.allowed).toBe(true);
      if (gate.allowed) {
        expect(gate.state).toBe("checkpoint_ready");
      }
      // Session-state mirror advances too.
      expect(fixture.getSessionById(VOICE_SESSION_ID)?.recordingState).toBe(
        "checkpoint_ready",
      );
    });

    it("denies when the object fails independent readback/checksum verification", async () => {
      verifier.unreadableKeys.add(segment().objectKey);
      await expect(service.ingestSealedSegment(segment())).rejects.toThrow(
        ApiRequestError,
      );
      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate).toEqual({ allowed: false, reason: "no_checkpoint" });
    });

    it("denies coverage_incomplete when only one channel was ever captured", async () => {
      await service.ingestSealedSegment(segment({ channels: ["customer"] }));
      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate).toEqual({ allowed: false, reason: "coverage_incomplete" });
    });

    it("denies continuity_broken after a missing-piece gap, and this is sticky", async () => {
      await service.ingestSealedSegment(segment());
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 3, // skipped sequence 2: a lost/missing piece
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000003`,
          checksum: "checksum-3",
          startOffsetMs: 2000,
          endOffsetMs: 3000,
        }),
      );
      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate).toEqual({ allowed: false, reason: "continuity_broken" });

      // A later, perfectly contiguous segment cannot heal a gap that already happened.
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 4,
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000004`,
          checksum: "checksum-4",
          startOffsetMs: 3000,
          endOffsetMs: 4000,
        }),
      );
      const gateAfter = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gateAfter).toEqual({ allowed: false, reason: "continuity_broken" });
    });

    it("reaches finalized state after finalizeRecording", async () => {
      await service.ingestSealedSegment(segment());
      await service.finalizeRecording(CALL_ID, RECORDING_ID);
      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate.allowed).toBe(true);
      if (gate.allowed) {
        expect(gate.state).toBe("finalized");
      }
      expect(fixture.getSessionById(VOICE_SESSION_ID)?.recordingState).toBe(
        "finalized",
      );
    });

    it("refuses to finalize a recording with no sealed checkpoint", async () => {
      await expect(
        service.finalizeRecording(CALL_ID, RECORDING_ID),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("out-of-order / duplicate / conflicting segment reports never rewrite established evidence", () => {
    it("treats an exact retry of the last sealed segment as a safe no-op", async () => {
      const first = await service.ingestSealedSegment(segment());
      const retry = await service.ingestSealedSegment(segment());
      expect(retry.deduped).toBe(true);
      expect(retry.checkpoint.checkpointId).toBe(first.checkpoint.checkpointId);
      expect(fixture.checkpoints).toHaveLength(1);
    });

    it("rejects a conflicting report for an already-sealed sequence without mutating it", async () => {
      await service.ingestSealedSegment(segment());
      await expect(
        service.ingestSealedSegment(
          segment({ checksum: "a-different-checksum" }),
        ),
      ).rejects.toThrow(ApiRequestError);
      expect(fixture.checkpoints).toHaveLength(1);
      expect(fixture.checkpoints[0]!.manifestHash).toBeDefined();
    });

    it("rejects a stale out-of-order report behind the latest sealed segment", async () => {
      await service.ingestSealedSegment(segment());
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 2,
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000002`,
          checksum: "checksum-2",
          startOffsetMs: 1000,
          endOffsetMs: 2000,
        }),
      );
      await expect(
        service.ingestSealedSegment(segment({ segmentSequence: 1 })),
      ).rejects.toThrow(ApiRequestError);
      expect(fixture.checkpoints).toHaveLength(2);
    });

    it("leaves a finalized checkpoint untouched by a later failed/duplicate report", async () => {
      await service.ingestSealedSegment(segment());
      const finalized = await service.finalizeRecording(CALL_ID, RECORDING_ID);

      // A late, conflicting recorder retry callback for the already-sealed
      // first segment must not resurrect or rewrite established evidence.
      await expect(
        service.ingestSealedSegment(segment({ checksum: "late-conflict" })),
      ).rejects.toThrow(ApiRequestError);

      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate.allowed).toBe(true);
      if (gate.allowed) {
        expect(gate.checkpoint.checkpointId).toBe(finalized.checkpointId);
        expect(gate.state).toBe("finalized");
      }
    });
  });

  describe("proof binding (SD §8.2: speech/DTMF proofs must reference real recorded evidence)", () => {
    async function seedVerifiedCheckpoint(): Promise<VoiceRecordingCheckpointRecord> {
      const { checkpoint } = await service.ingestSealedSegment(segment());
      return checkpoint;
    }

    function baseProofFields(checkpointId: string) {
      return {
        confirmationId: "33333333-3333-4333-8333-333333333333",
        voiceSessionId: VOICE_SESSION_ID,
        intentId: "44444444-4444-4444-8444-444444444444",
        action: "create_owned_order",
        draftVersion: 1,
        snapshotHash: "snapshot-hash",
        readbackPlaybackId: "playback-1",
        readbackCompletedEventId: "readback-event",
        inputEpoch: 0,
        controlCutoff: { mediaEpoch: 1, controlSequence: 5 },
        leaseEpoch: 1,
        recordingCheckpointId: checkpointId,
        confirmedAt: "2026-09-08T00:00:00.700Z",
        expiresAt: "2026-09-08T00:05:00.000Z",
      };
    }

    it("accepts a speech proof bound to a real finalized ASR event and a real completed playback", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        sessionEvent({
          eventId: "readback-event",
          eventType: "tts.playback.completed",
          sequence: 1,
          occurredAt: "2026-09-08T00:00:00.400Z",
        }),
        sessionEvent({
          eventId: "asr-final-event",
          eventType: "asr.segment.final",
          sequence: 2,
          occurredAt: "2026-09-08T00:00:00.600Z",
        }),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "speech" as const,
        evidence: { turnId: "55555555-5555-4555-8555-555555555555", finalEventId: "asr-final-event" },
      };

      const bound = await service.assertProofIsRecordingBacked({
        callId: CALL_ID,
        recordingId: RECORDING_ID,
        proof,
      });
      expect(bound.checkpointId).toBe(checkpoint.checkpointId);
    });

    it("rejects a speech proof whose readback event is only 'started', not 'completed' -- synthesized TTS bytes are not evidence of listening", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        sessionEvent({
          eventId: "readback-event",
          eventType: "tts.playback.started",
          sequence: 1,
        }),
        sessionEvent({
          eventId: "asr-final-event",
          eventType: "asr.segment.final",
          sequence: 2,
        }),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "speech" as const,
        evidence: { turnId: "55555555-5555-4555-8555-555555555555", finalEventId: "asr-final-event" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects a proof that references a stale (non-current) checkpoint", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        sessionEvent({ eventId: "readback-event", eventType: "tts.playback.completed", sequence: 1 }),
        sessionEvent({ eventId: "asr-final-event", eventType: "asr.segment.final", sequence: 2 }),
      ]);
      void checkpoint;

      const proof = {
        ...baseProofFields("some-other-checkpoint-id"),
        confirmationMethod: "speech" as const,
        evidence: { turnId: "55555555-5555-4555-8555-555555555555", finalEventId: "asr-final-event" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("accepts a DTMF proof bound to a real digit event ordered after playback completion, without requiring DTMF tone audio", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        sessionEvent({
          eventId: "readback-event",
          eventType: "tts.playback.completed",
          sequence: 1,
          occurredAt: "2026-09-08T00:00:00.400Z",
        }),
        sessionEvent({
          eventId: "dtmf-event",
          eventType: "dtmf.received",
          sequence: 2,
          occurredAt: "2026-09-08T00:00:00.600Z",
          payload: { digit: "1" },
        }),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "dtmf" as const,
        evidence: { eventId: "dtmf-event", digit: "1" },
      };

      const bound = await service.assertProofIsRecordingBacked({
        callId: CALL_ID,
        recordingId: RECORDING_ID,
        proof,
      });
      expect(bound.checkpointId).toBe(checkpoint.checkpointId);
    });

    it("rejects a DTMF proof whose digit event is not provably ordered after the readback completed", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        // Digit arrives (sequence 1) *before* the readback completion (sequence 2) --
        // cannot be trusted as the passenger's response to that specific readback.
        sessionEvent({
          eventId: "dtmf-event",
          eventType: "dtmf.received",
          sequence: 1,
          occurredAt: "2026-09-08T00:00:00.300Z",
          payload: { digit: "1" },
        }),
        sessionEvent({
          eventId: "readback-event",
          eventType: "tts.playback.completed",
          sequence: 2,
          occurredAt: "2026-09-08T00:00:00.400Z",
        }),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "dtmf" as const,
        evidence: { eventId: "dtmf-event", digit: "1" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects a DTMF proof whose digit does not match the durably recorded payload", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        sessionEvent({ eventId: "readback-event", eventType: "tts.playback.completed", sequence: 1 }),
        sessionEvent({
          eventId: "dtmf-event",
          eventType: "dtmf.received",
          sequence: 2,
          payload: { digit: "9" },
        }),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "dtmf" as const,
        evidence: { eventId: "dtmf-event", digit: "1" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects any proof when the recording gate itself is not durable (e.g. still capturing)", async () => {
      const proof = {
        ...baseProofFields("nonexistent-checkpoint"),
        confirmationMethod: "speech" as const,
        evidence: { turnId: "55555555-5555-4555-8555-555555555555", finalEventId: "asr-final-event" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });
  });
});
