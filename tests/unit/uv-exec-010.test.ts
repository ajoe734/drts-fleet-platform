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
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import type { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
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
      durationMs: 20,
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
    // Exclusive end boundary: frame at 500ms with duration 20ms ends at 520ms
    expect(sealed!.endOffsetMs).toBe(520);
    expect(sealed!.channelCoverage).toHaveLength(2);

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

  it("reports contiguous coverage across consecutive sealed segments with nonduplicated frames", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    // Segment 1: frames [0, 20) and [20, 40)
    session.ingestFrame(frame({ mediaOffsetMs: 0, durationMs: 20 }));
    session.ingestFrame(frame({ mediaOffsetMs: 20, durationMs: 20 }));
    const seg1 = await session.sealSegment();
    expect(seg1!.startOffsetMs).toBe(0);
    expect(seg1!.endOffsetMs).toBe(40);

    // Segment 2: consecutive nonduplicated frames [40, 60) and [60, 80)
    session.ingestFrame(frame({ mediaOffsetMs: 40, durationMs: 20 }));
    session.ingestFrame(frame({ mediaOffsetMs: 60, durationMs: 20 }));
    const seg2 = await session.sealSegment();
    expect(seg2!.startOffsetMs).toBe(40);
    expect(seg2!.endOffsetMs).toBe(80);

    expect(session.hasContiguousCoverage()).toBe(true);
    expect(session.getLastSealedEndOffsetMs()).toBe(80);
  });

  it("honestly reports a gap instead of pretending offsets are contiguous", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });
    // Segment 1: [0, 20) and [20, 40) -> endOffsetMs = 40
    session.ingestFrame(frame({ mediaOffsetMs: 0, durationMs: 20 }));
    session.ingestFrame(frame({ mediaOffsetMs: 20, durationMs: 20 }));
    await session.sealSegment();

    // Buffered audio was lost (e.g. restart); frame [40, 900) missing.
    // Segment 2: [900, 920) and [920, 940) -> startOffsetMs = 900
    session.ingestFrame(frame({ mediaOffsetMs: 900, durationMs: 20 }));
    session.ingestFrame(frame({ mediaOffsetMs: 920, durationMs: 20 }));
    await session.sealSegment();

    expect(session.hasContiguousCoverage()).toBe(false);
    // The recorder still preserves both sealed segments -- a gap does not
    // erase the evidence that does exist.
    expect(session.getSealedSegments()).toHaveLength(2);
  });

  it("tracks per-channel coverage and gaps when channels have asymmetric frame ranges (SD §8.2)", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });

    // Customer frames span 0 to 1000ms (frames at 0, 200, 400, 600, 800, duration 200ms each)
    for (let offset = 0; offset < 1000; offset += 200) {
      session.ingestFrame(
        frame({
          channel: "customer",
          mediaOffsetMs: offset,
          durationMs: 200,
          occurredAtUtc: new Date(new Date("2026-09-08T00:00:00.000Z").getTime() + offset).toISOString(),
        }),
      );
    }
    // Agent has only one frame at 0ms (0 to 20ms)
    session.ingestFrame(
      frame({
        channel: "agent",
        mediaOffsetMs: 0,
        durationMs: 20,
        occurredAtUtc: "2026-09-08T00:00:00.000Z",
      }),
    );

    const sealed = await session.sealSegment();
    expect(sealed).not.toBeNull();
    expect(sealed!.channels.sort()).toEqual(["agent", "customer"]);
    expect(sealed!.startOffsetMs).toBe(0);
    expect(sealed!.endOffsetMs).toBe(1000);

    const custCov = sealed!.channelCoverage.find((c) => c.channel === "customer");
    const agentCov = sealed!.channelCoverage.find((c) => c.channel === "agent");

    expect(custCov).toBeDefined();
    expect(custCov!.startOffsetMs).toBe(0);
    expect(custCov!.endOffsetMs).toBe(1000);
    expect(custCov!.hasGaps).toBe(false);

    expect(agentCov).toBeDefined();
    expect(agentCov!.startOffsetMs).toBe(0);
    expect(agentCov!.endOffsetMs).toBe(20);
    expect(agentCov!.hasGaps).toBe(false);
  });

  it("detects internal gaps in a channel when frames are non-contiguous within a sealed segment (SD §8.2)", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });

    // Agent has a frame at 0..20ms and another frame at 800..820ms (gap from 20ms to 800ms)
    session.ingestFrame(
      frame({
        channel: "agent",
        mediaOffsetMs: 0,
        durationMs: 20,
        occurredAtUtc: "2026-09-08T00:00:00.000Z",
      }),
    );
    session.ingestFrame(
      frame({
        channel: "agent",
        mediaOffsetMs: 800,
        durationMs: 20,
        occurredAtUtc: "2026-09-08T00:00:00.800Z",
      }),
    );

    const sealed = await session.sealSegment();
    expect(sealed).not.toBeNull();
    const agentCov = sealed!.channelCoverage.find((c) => c.channel === "agent");
    expect(agentCov).toBeDefined();
    expect(agentCov!.hasGaps).toBe(true);
    expect(agentCov!.intervals).toHaveLength(2);
    expect(agentCov!.intervals[0]!.startOffsetMs).toBe(0);
    expect(agentCov!.intervals[0]!.endOffsetMs).toBe(20);
    expect(agentCov!.intervals[1]!.startOffsetMs).toBe(800);
    expect(agentCov!.intervals[1]!.endOffsetMs).toBe(820);
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

  it("preserves newly arrived frames when ingest occurs while putSealedObject is awaiting (delayed-PUT regression test)", async () => {
    let resolvePut: ((value: unknown) => void) | null = null;
    let isDelayed = true;
    const delayedStore = {
      async putSealedObject(objectKey: string, payload: Uint8Array) {
        if (isDelayed) {
          return new Promise((resolve) => {
            resolvePut = () => {
              resolve({
                objectKey,
                objectVersion: 1,
                checksum: "deferred-checksum",
                byteSize: payload.byteLength,
              });
            };
          });
        }
        return {
          objectKey,
          objectVersion: 1,
          checksum: "deferred-checksum-2",
          byteSize: payload.byteLength,
        };
      },
    };

    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: delayedStore as any,
    });

    session.ingestFrame(frame({ bytes: new Uint8Array([1]), mediaOffsetMs: 0 }));
    const seal1Promise = session.sealSegment();

    // Yield to let the serialized sealQueue microtask start and invoke putSealedObject
    await Promise.resolve();

    // While PUT is pending, a new frame arrives
    session.ingestFrame(frame({ bytes: new Uint8Array([2]), mediaOffsetMs: 100 }));

    // Resolve deferred PUT for seal 1 and switch store to normal for seal 2
    isDelayed = false;
    resolvePut!({});
    const seal1 = await seal1Promise;
    expect(seal1).not.toBeNull();
    expect(seal1!.byteSize).toBe(1);

    // Second seal must NOT have lost the frame that arrived during the await
    const seal2 = await session.sealSegment();
    expect(seal2).not.toBeNull();
    expect(seal2!.byteSize).toBe(1);
    expect(seal2!.segmentSequence).toBe(2);
    expect(seal2!.startOffsetMs).toBe(100);
  });

  it("restores the detached batch to the buffer if putSealedObject throws, preserving all frames (failure regression test)", async () => {
    let shouldFail = true;
    const flakyStore = {
      async putSealedObject(objectKey: string, payload: Uint8Array) {
        if (shouldFail) {
          throw new Error("S3/GCS transient connection error");
        }
        return {
          objectKey,
          objectVersion: 1,
          checksum: "checksum-flaky",
          byteSize: payload.byteLength,
        };
      },
    };

    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: flakyStore as any,
    });

    session.ingestFrame(frame({ bytes: new Uint8Array([1]), mediaOffsetMs: 0 }));
    await expect(session.sealSegment()).rejects.toThrow("S3/GCS transient connection error");

    // Frame 2 arrives after failure
    session.ingestFrame(frame({ bytes: new Uint8Array([2]), mediaOffsetMs: 100 }));

    // Retry seal with repaired store
    shouldFail = false;
    const retrySeal = await session.sealSegment();
    expect(retrySeal).not.toBeNull();
    // Both frame 1 and frame 2 are preserved and sealed together
    expect(retrySeal!.byteSize).toBe(2);
    expect(retrySeal!.segmentSequence).toBe(1);
  });

  it("serializes concurrent sealSegment calls without racing sequence numbers or losing frames (concurrency regression test)", async () => {
    const store = new InMemoryRecordingObjectStore();
    const session = new CallRecorderSession({
      callId: CALL_ID,
      recordingId: RECORDING_ID,
      objectStore: store,
    });

    session.ingestFrame(frame({ bytes: new Uint8Array([1, 2]), mediaOffsetMs: 0 }));

    const [res1, res2] = await Promise.all([
      session.sealSegment(),
      session.sealSegment(),
    ]);

    expect(res1).not.toBeNull();
    expect(res2).toBeNull();
    expect(session.getSealedSegments()).toHaveLength(1);
    expect(session.getSealedSegments()[0]!.segmentSequence).toBe(1);
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
  const channels = overrides.channels ?? ["customer", "agent"];
  const startOffsetMs = overrides.startOffsetMs ?? 0;
  const endOffsetMs = overrides.endOffsetMs ?? 1000;
  const startedAtUtc = overrides.startedAtUtc ?? "2026-09-08T00:00:00.000Z";
  const endedAtUtc = overrides.endedAtUtc ?? "2026-09-08T00:00:01.000Z";

  const defaultChannelCoverage = channels.map((ch) => ({
    channel: ch,
    startOffsetMs,
    endOffsetMs,
    startedAtUtc,
    endedAtUtc,
    hasGaps: false,
    intervals: [
      {
        startOffsetMs,
        endOffsetMs,
        startedAtUtc,
        endedAtUtc,
      },
    ],
  }));

  return {
    callId: CALL_ID,
    recordingId: RECORDING_ID,
    segmentSequence: 1,
    objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000001`,
    objectVersion: 1,
    checksum: "checksum-1",
    byteSize: 100,
    channels,
    startOffsetMs,
    endOffsetMs,
    startedAtUtc,
    endedAtUtc,
    durableAt: "2026-09-08T00:00:01.100Z",
    timingSource: "provider",
    timingPrecision: "exact",
    channelCoverage: defaultChannelCoverage,
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

    it("denies not_verified when a checkpoint exists but verifiedAt is null", async () => {
      fixture.insert({
        callId: CALL_ID,
        recordingId: RECORDING_ID,
        manifestVersion: 1,
        manifest: { policyVersion: "v1", final: false, segments: [] },
        manifestHash: "hash-unverified",
        coverage: {
          channelsCovered: ["customer", "agent"],
          continuityBroken: false,
          coverageStartUtc: "2026-09-08T00:00:00.000Z",
          coverageEndUtc: "2026-09-08T00:00:01.000Z",
          segmentCount: 1,
        },
        policyVersion: "voice-recording-evidence-v1",
        verifiedAt: null,
      });
      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate).toEqual({ allowed: false, reason: "not_verified" });
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
    async function seedVerifiedCheckpoint(
      overrides: Partial<SealedRecordingSegmentInput> = {},
    ): Promise<VoiceRecordingCheckpointRecord> {
      const { checkpoint } = await service.ingestSealedSegment(
        segment({
          readbackPlaybackId: "playback-1",
          snapshotHash: "snapshot-hash",
          ...overrides,
        }),
      );
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

    function validReadbackEvent(
      overrides: Partial<VoiceSessionEventRecord> = {},
    ): VoiceSessionEventRecord {
      return sessionEvent({
        eventId: "readback-event",
        eventType: "tts.playback.completed",
        sequence: 1,
        legId: "leg-customer-1",
        occurredAt: "2026-09-08T00:00:00.400Z",
        payload: {
          playbackId: "playback-1",
          snapshotHash: "snapshot-hash",
          callId: CALL_ID,
          callLegId: "leg-customer-1",
          promptPlaybackId: "playback-1",
          promptId: "prompt-confirm-1",
          audioRegion: {
            startUtc: "2026-09-08T00:00:00.100Z",
            endUtc: "2026-09-08T00:00:00.400Z",
            startOffsetMs: 100,
            endOffsetMs: 400,
          },
        },
        ...overrides,
      });
    }

    function validAsrFinalEvent(
      overrides: Partial<VoiceSessionEventRecord> = {},
    ): VoiceSessionEventRecord {
      return sessionEvent({
        eventId: "asr-final-event",
        eventType: "asr.segment.final",
        sequence: 2,
        legId: "leg-customer-1",
        occurredAt: "2026-09-08T00:00:00.700Z",
        payload: {
          turnId: "55555555-5555-4555-8555-555555555555",
          callId: CALL_ID,
          callLegId: "leg-customer-1",
          audioRegion: {
            startUtc: "2026-09-08T00:00:00.500Z",
            endUtc: "2026-09-08T00:00:00.700Z",
            startOffsetMs: 500,
            endOffsetMs: 700,
          },
        },
        ...overrides,
      });
    }

    function validDtmfEvent(
      overrides: Partial<VoiceSessionEventRecord> = {},
    ): VoiceSessionEventRecord {
      return sessionEvent({
        eventId: "dtmf-event",
        eventType: "dtmf.received",
        sequence: 2,
        legId: "leg-customer-1",
        occurredAt: "2026-09-08T00:00:00.600Z",
        payload: {
          digit: "1",
          callId: CALL_ID,
          callLegId: "leg-customer-1",
          promptPlaybackId: "playback-1",
          snapshotHash: "snapshot-hash",
        },
        ...overrides,
      });
    }

    it("accepts a speech proof bound to a real finalized ASR event and a real completed playback", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent(),
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
        validReadbackEvent({
          eventId: "readback-event",
          eventType: "tts.playback.started",
          sequence: 1,
        }),
        validAsrFinalEvent(),
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
        validReadbackEvent(),
        validAsrFinalEvent(),
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
        validReadbackEvent(),
        validDtmfEvent(),
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
        validDtmfEvent({
          sequence: 1,
          occurredAt: "2026-09-08T00:00:00.300Z",
        }),
        validReadbackEvent({
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
        validReadbackEvent(),
        validDtmfEvent({
          payload: {
            digit: "9",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            promptPlaybackId: "playback-1",
            snapshotHash: "snapshot-hash",
          },
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

    it("rejects a speech proof whose ASR final event occurred outside the coverage window", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent({
          occurredAt: "2026-09-08T00:00:05.000Z",
          payload: {
            turnId: "55555555-5555-4555-8555-555555555555",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:04.500Z",
              endUtc: "2026-09-08T00:00:05.000Z",
              startOffsetMs: 4500,
              endOffsetMs: 5000,
            },
          },
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

    it("rejects a speech proof whose readback completed event occurred outside the coverage window", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          occurredAt: "2026-09-07T23:59:59.000Z",
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-07T23:59:58.000Z",
              endUtc: "2026-09-07T23:59:59.000Z",
              startOffsetMs: 0,
              endOffsetMs: 1000,
            },
          },
        }),
        validAsrFinalEvent(),
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

    it("rejects a DTMF proof whose digit event occurred outside the coverage window", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validDtmfEvent({
          occurredAt: "2026-09-08T00:00:02.500Z",
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

    it("rejects a speech proof when the ASR final event is not found in session events", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "speech" as const,
        evidence: { turnId: "55555555-5555-4555-8555-555555555555", finalEventId: "nonexistent-asr-event" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects a DTMF proof when the digit event is not found in session events", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "dtmf" as const,
        evidence: { eventId: "nonexistent-dtmf-event", digit: "1" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects a proof when proof.voiceSessionId belongs to a different call (cross-call negative test)", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      const callBSessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      fixture.seedSession(
        makeSession({
          callId: "call-B",
          voiceSessionId: callBSessionId,
        }),
      );
      fixture.seedEvents(callBSessionId, [
        validReadbackEvent({
          voiceSessionId: callBSessionId,
          eventId: "readback-event-b",
        }),
        validAsrFinalEvent({
          voiceSessionId: callBSessionId,
          eventId: "asr-event-b",
        }),
      ]);

      const crossCallProof = {
        ...baseProofFields(checkpoint.checkpointId),
        voiceSessionId: callBSessionId,
        readbackCompletedEventId: "readback-event-b",
        confirmationMethod: "speech" as const,
        evidence: { turnId: "55555555-5555-4555-8555-555555555555", finalEventId: "asr-event-b" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof: crossCallProof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects a proof when session events have payload callId belonging to a different call", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: "different-call-id",
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.100Z",
              endUtc: "2026-09-08T00:00:00.400Z",
            },
          },
        }),
        validAsrFinalEvent(),
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

    it("rejects a proof when readback event payload playbackId does not match proof readbackPlaybackId", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          payload: {
            playbackId: "playback-actual",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.100Z",
              endUtc: "2026-09-08T00:00:00.400Z",
            },
          },
        }),
        validAsrFinalEvent(),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        readbackPlaybackId: "playback-different",
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

    it("rejects a proof when manifest readbackPlaybackId does not match proof readbackPlaybackId", async () => {
      const { checkpoint } = await service.ingestSealedSegment(
        segment({
          readbackPlaybackId: "manifest-playback-123",
          snapshotHash: "snapshot-hash",
        }),
      );
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent(),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        readbackPlaybackId: "different-playback-id",
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

    it("rejects a proof when manifest snapshotHash does not match proof snapshotHash", async () => {
      const { checkpoint } = await service.ingestSealedSegment(
        segment({
          readbackPlaybackId: "playback-1",
          snapshotHash: "manifest-snapshot-hash",
        }),
      );
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent(),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        snapshotHash: "different-snapshot-hash",
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

    it("rejects a DTMF proof when digit event promptPlaybackId does not match proof readbackPlaybackId", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validDtmfEvent({
          payload: {
            digit: "1",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            promptPlaybackId: "mismatched-prompt-playback",
          },
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

    it("rejects a DTMF proof when digit event leg does not match readback playback leg", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({ legId: "leg-customer-1" }),
        validDtmfEvent({
          legId: "leg-agent-2",
          payload: {
            digit: "1",
            callId: CALL_ID,
            callLegId: "leg-agent-2",
            promptPlaybackId: "playback-1",
          },
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

    it("rejects a speech proof when finalEvent payload turnId does not match proof evidence turnId", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent({
          payload: {
            turnId: "turn-original",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.500Z",
              endUtc: "2026-09-08T00:00:00.700Z",
            },
          },
        }),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "speech" as const,
        evidence: { turnId: "turn-different-from-payload", finalEventId: "asr-final-event" },
      };

      await expect(
        service.assertProofIsRecordingBacked({
          callId: CALL_ID,
          recordingId: RECORDING_ID,
          proof,
        }),
      ).rejects.toThrow(ApiRequestError);
    });

    it("rejects speech affirmation when customer audio channel was not recorded during that window (missing-channel-window negative test)", async () => {
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 1,
          channels: ["agent"],
          startOffsetMs: 0,
          endOffsetMs: 1000,
          startedAtUtc: "2026-09-08T00:00:00.000Z",
          endedAtUtc: "2026-09-08T00:00:01.000Z",
        }),
      );
      const { checkpoint } = await service.ingestSealedSegment(
        segment({
          segmentSequence: 2,
          channels: ["customer"],
          startOffsetMs: 1000,
          endOffsetMs: 2000,
          startedAtUtc: "2026-09-08T00:00:01.000Z",
          endedAtUtc: "2026-09-08T00:00:02.000Z",
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000002`,
          checksum: "checksum-2",
          readbackPlaybackId: "playback-1",
          snapshotHash: "snapshot-hash",
        }),
      );

      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent(),
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

    it("rejects readback verification when agent audio channel was not recorded during that window (missing-channel-window negative test)", async () => {
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 1,
          channels: ["customer"],
          startOffsetMs: 0,
          endOffsetMs: 1000,
          startedAtUtc: "2026-09-08T00:00:00.000Z",
          endedAtUtc: "2026-09-08T00:00:01.000Z",
        }),
      );
      const { checkpoint } = await service.ingestSealedSegment(
        segment({
          segmentSequence: 2,
          channels: ["agent"],
          startOffsetMs: 1000,
          endOffsetMs: 2000,
          startedAtUtc: "2026-09-08T00:00:01.000Z",
          endedAtUtc: "2026-09-08T00:00:02.000Z",
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000002`,
          checksum: "checksum-2",
          readbackPlaybackId: "playback-1",
          snapshotHash: "snapshot-hash",
        }),
      );

      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.100Z",
              endUtc: "2026-09-08T00:00:00.400Z",
              startOffsetMs: 100,
              endOffsetMs: 400,
            },
          },
        }),
        validAsrFinalEvent({
          occurredAt: "2026-09-08T00:00:01.500Z",
          payload: {
            turnId: "55555555-5555-4555-8555-555555555555",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:01.200Z",
              endUtc: "2026-09-08T00:00:01.500Z",
              startOffsetMs: 1200,
              endOffsetMs: 1500,
            },
          },
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

    // -------------------------------------------------------------------------
    // Dedicated review findings regression test suite (Codex2 negative probes)
    // -------------------------------------------------------------------------

    it("rejects when checkpoint manifest completely lacks readbackPlaybackId (review probe 1 negative test)", async () => {
      const { checkpoint } = await service.ingestSealedSegment(
        segment({ readbackPlaybackId: null, snapshotHash: "snapshot-hash" }),
      );
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent(),
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

    it("rejects when checkpoint manifest completely lacks snapshotHash (review probe 1 negative test)", async () => {
      const { checkpoint } = await service.ingestSealedSegment(
        segment({ readbackPlaybackId: "playback-1", snapshotHash: null }),
      );
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validAsrFinalEvent(),
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

    it("rejects when readback playback completed event has empty payload {} (review probe 1 negative test)", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        sessionEvent({
          eventId: "readback-event",
          eventType: "tts.playback.completed",
          sequence: 1,
          occurredAt: "2026-09-08T00:00:00.400Z",
          payload: {},
        }),
        validAsrFinalEvent(),
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

    it("rejects when readback playback completed event lacks conservative audio region or timing (review probe 2 negative test)", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        sessionEvent({
          eventId: "readback-event",
          eventType: "tts.playback.completed",
          sequence: 1,
          legId: "leg-customer-1",
          occurredAt: "2026-09-08T00:00:00.400Z",
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            // Missing audioRegion, startedAtUtc, and endedAtUtc
          },
        }),
        validAsrFinalEvent(),
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

    it("rejects speech proof when ASR final event has empty payload {} and arbitrary turnId (review probe 2 negative test)", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        sessionEvent({
          eventId: "asr-final-event",
          eventType: "asr.segment.final",
          sequence: 2,
          occurredAt: "2026-09-08T00:00:00.600Z",
          payload: {},
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

    it("rejects speech proof when ASR final event lacks conservative recorded audio region or utterance timing (review probe 2 negative test)", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        sessionEvent({
          eventId: "asr-final-event",
          eventType: "asr.segment.final",
          sequence: 2,
          legId: "leg-customer-1",
          occurredAt: "2026-09-08T00:00:00.600Z",
          payload: {
            turnId: "55555555-5555-4555-8555-555555555555",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            // Missing audioRegion, startedAtUtc, and endedAtUtc
          },
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

    it("rejects speech proof when affirmation event is on a different leg than readback playback", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({ legId: "leg-customer-1" }),
        validAsrFinalEvent({ legId: "leg-agent-2" }),
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

    it("rejects DTMF proof when digit payload is merely { digit: '1' } with null legs and no prompt binding (review probe 1 negative test)", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({ legId: null }),
        sessionEvent({
          eventId: "dtmf-event",
          eventType: "dtmf.received",
          sequence: 2,
          legId: null,
          occurredAt: "2026-09-08T00:00:00.600Z",
          payload: { digit: "1" },
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

    it("rejects DTMF proof when digit event lacks positive leg association (null legId on readback or digit)", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          legId: null,
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: undefined,
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.100Z",
              endUtc: "2026-09-08T00:00:00.400Z",
            },
          },
        }),
        validDtmfEvent({ legId: "leg-customer-1" }),
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

    it("rejects DTMF proof when digit prompt binding does not match readback playback or promptId", async () => {
      const checkpoint = await seedVerifiedCheckpoint();
      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent(),
        validDtmfEvent({
          payload: {
            digit: "1",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            promptPlaybackId: "unrelated-playback-999",
          },
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

    it("rejects readback proof when agent audio is missing within a sealed segment despite customer frames (Codex2 review probe negative test, SD §8.2)", async () => {
      // Customer frames span 0-1000ms, but agent only has 1 frame at 0ms (0-20ms).
      // Segment lists both channels, but agent audio is absent at 500-900ms.
      const checkpoint = await seedVerifiedCheckpoint({
        channels: ["customer", "agent"],
        startOffsetMs: 0,
        endOffsetMs: 1000,
        startedAtUtc: "2026-09-08T00:00:00.000Z",
        endedAtUtc: "2026-09-08T00:00:01.000Z",
        channelCoverage: [
          {
            channel: "customer",
            startOffsetMs: 0,
            endOffsetMs: 1000,
            startedAtUtc: "2026-09-08T00:00:00.000Z",
            endedAtUtc: "2026-09-08T00:00:01.000Z",
            hasGaps: false,
            intervals: [
              {
                startOffsetMs: 0,
                endOffsetMs: 1000,
                startedAtUtc: "2026-09-08T00:00:00.000Z",
                endedAtUtc: "2026-09-08T00:00:01.000Z",
              },
            ],
          },
          {
            channel: "agent",
            startOffsetMs: 0,
            endOffsetMs: 20,
            startedAtUtc: "2026-09-08T00:00:00.000Z",
            endedAtUtc: "2026-09-08T00:00:00.020Z",
            hasGaps: false,
            intervals: [
              {
                startOffsetMs: 0,
                endOffsetMs: 20,
                startedAtUtc: "2026-09-08T00:00:00.000Z",
                endedAtUtc: "2026-09-08T00:00:00.020Z",
              },
            ],
          },
        ],
      });

      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          occurredAt: "2026-09-08T00:00:00.900Z",
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            promptPlaybackId: "playback-1",
            promptId: "prompt-confirm-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.500Z",
              endUtc: "2026-09-08T00:00:00.900Z",
              startOffsetMs: 500,
              endOffsetMs: 900,
            },
          },
        }),
        validAsrFinalEvent(),
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

    it("rejects readback proof when agent audio has an internal gap within a sealed segment (SD §8.2)", async () => {
      // Agent has frames at 0-20ms and 950-970ms, but has an internal gap at 20-950ms.
      const checkpoint = await seedVerifiedCheckpoint({
        channels: ["customer", "agent"],
        startOffsetMs: 0,
        endOffsetMs: 1000,
        startedAtUtc: "2026-09-08T00:00:00.000Z",
        endedAtUtc: "2026-09-08T00:00:01.000Z",
        channelCoverage: [
          {
            channel: "customer",
            startOffsetMs: 0,
            endOffsetMs: 1000,
            startedAtUtc: "2026-09-08T00:00:00.000Z",
            endedAtUtc: "2026-09-08T00:00:01.000Z",
            hasGaps: false,
            intervals: [
              {
                startOffsetMs: 0,
                endOffsetMs: 1000,
                startedAtUtc: "2026-09-08T00:00:00.000Z",
                endedAtUtc: "2026-09-08T00:00:01.000Z",
              },
            ],
          },
          {
            channel: "agent",
            startOffsetMs: 0,
            endOffsetMs: 970,
            startedAtUtc: "2026-09-08T00:00:00.000Z",
            endedAtUtc: "2026-09-08T00:00:00.970Z",
            hasGaps: true,
            intervals: [
              {
                startOffsetMs: 0,
                endOffsetMs: 20,
                startedAtUtc: "2026-09-08T00:00:00.000Z",
                endedAtUtc: "2026-09-08T00:00:00.020Z",
              },
              {
                startOffsetMs: 950,
                endOffsetMs: 970,
                startedAtUtc: "2026-09-08T00:00:00.950Z",
                endedAtUtc: "2026-09-08T00:00:00.970Z",
              },
            ],
          },
        ],
      });

      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          occurredAt: "2026-09-08T00:00:00.400Z",
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            promptPlaybackId: "playback-1",
            promptId: "prompt-confirm-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.100Z",
              endUtc: "2026-09-08T00:00:00.400Z",
              startOffsetMs: 100,
              endOffsetMs: 400,
            },
          },
        }),
        validAsrFinalEvent(),
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

    it("rejects speech affirmation when customer audio is missing within a sealed segment (SD §8.2)", async () => {
      // Agent frames span 0-1000ms, but customer only has 1 frame at 0ms (0-20ms).
      // ASR final event requires customer audio at 500-700ms.
      const checkpoint = await seedVerifiedCheckpoint({
        channels: ["customer", "agent"],
        startOffsetMs: 0,
        endOffsetMs: 1000,
        startedAtUtc: "2026-09-08T00:00:00.000Z",
        endedAtUtc: "2026-09-08T00:00:01.000Z",
        channelCoverage: [
          {
            channel: "agent",
            startOffsetMs: 0,
            endOffsetMs: 1000,
            startedAtUtc: "2026-09-08T00:00:00.000Z",
            endedAtUtc: "2026-09-08T00:00:01.000Z",
            hasGaps: false,
            intervals: [
              {
                startOffsetMs: 0,
                endOffsetMs: 1000,
                startedAtUtc: "2026-09-08T00:00:00.000Z",
                endedAtUtc: "2026-09-08T00:00:01.000Z",
              },
            ],
          },
          {
            channel: "customer",
            startOffsetMs: 0,
            endOffsetMs: 20,
            startedAtUtc: "2026-09-08T00:00:00.000Z",
            endedAtUtc: "2026-09-08T00:00:00.020Z",
            hasGaps: false,
            intervals: [
              {
                startOffsetMs: 0,
                endOffsetMs: 20,
                startedAtUtc: "2026-09-08T00:00:00.000Z",
                endedAtUtc: "2026-09-08T00:00:00.020Z",
              },
            ],
          },
        ],
      });

      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          occurredAt: "2026-09-08T00:00:00.400Z",
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            promptPlaybackId: "playback-1",
            promptId: "prompt-confirm-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.100Z",
              endUtc: "2026-09-08T00:00:00.400Z",
              startOffsetMs: 100,
              endOffsetMs: 400,
            },
          },
        }),
        validAsrFinalEvent({
          occurredAt: "2026-09-08T00:00:00.700Z",
          payload: {
            turnId: "55555555-5555-4555-8555-555555555555",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.500Z",
              endUtc: "2026-09-08T00:00:00.700Z",
              startOffsetMs: 500,
              endOffsetMs: 700,
            },
          },
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

    it("rejects proof when nonduplicated 20ms frames had an omitted frame causing segment boundary discontinuity", async () => {
      // Segment 1 covers [0, 40ms)
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 1,
          startOffsetMs: 0,
          endOffsetMs: 40,
          startedAtUtc: "2026-09-08T00:00:00.000Z",
          endedAtUtc: "2026-09-08T00:00:00.040Z",
        }),
      );

      // Frame [40, 60ms) was omitted; Segment 2 starts at 60ms instead of 40ms
      const { checkpoint: brokenCheckpoint } = await service.ingestSealedSegment(
        segment({
          segmentSequence: 2,
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000002`,
          checksum: "checksum-seg-2",
          startOffsetMs: 60,
          endOffsetMs: 100,
          startedAtUtc: "2026-09-08T00:00:00.060Z",
          endedAtUtc: "2026-09-08T00:00:00.100Z",
        }),
      );

      const gate = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gate.allowed).toBe(false);
      expect(gate).toEqual({ allowed: false, reason: "continuity_broken" });

      const proof = {
        ...baseProofFields(brokenCheckpoint.checkpointId),
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

    it("accepts speech proof when consecutive nonduplicated frames across segments fully cover both channels", async () => {
      // Segment 1 covers [0, 500ms) for both channels
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 1,
          startOffsetMs: 0,
          endOffsetMs: 500,
          startedAtUtc: "2026-09-08T00:00:00.000Z",
          endedAtUtc: "2026-09-08T00:00:00.500Z",
        }),
      );

      // Segment 2 starts at exactly 500ms and covers [500, 1000ms) for both channels
      const { checkpoint } = await service.ingestSealedSegment(
        segment({
          segmentSequence: 2,
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000002`,
          checksum: "checksum-seg-2-good",
          startOffsetMs: 500,
          endOffsetMs: 1000,
          startedAtUtc: "2026-09-08T00:00:00.500Z",
          endedAtUtc: "2026-09-08T00:00:01.000Z",
          readbackPlaybackId: "playback-1",
          snapshotHash: "snapshot-hash",
        }),
      );

      fixture.seedEvents(VOICE_SESSION_ID, [
        validReadbackEvent({
          occurredAt: "2026-09-08T00:00:00.400Z",
          payload: {
            playbackId: "playback-1",
            snapshotHash: "snapshot-hash",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            promptPlaybackId: "playback-1",
            promptId: "prompt-confirm-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.100Z",
              endUtc: "2026-09-08T00:00:00.400Z",
              startOffsetMs: 100,
              endOffsetMs: 400,
            },
          },
        }),
        validAsrFinalEvent({
          occurredAt: "2026-09-08T00:00:00.700Z",
          payload: {
            turnId: "55555555-5555-4555-8555-555555555555",
            callId: CALL_ID,
            callLegId: "leg-customer-1",
            audioRegion: {
              startUtc: "2026-09-08T00:00:00.550Z",
              endUtc: "2026-09-08T00:00:00.750Z",
              startOffsetMs: 550,
              endOffsetMs: 750,
            },
          },
        }),
      ]);

      const proof = {
        ...baseProofFields(checkpoint.checkpointId),
        confirmationMethod: "speech" as const,
        evidence: { turnId: "55555555-5555-4555-8555-555555555555", finalEventId: "asr-final-event" },
      };

      const result = await service.assertProofIsRecordingBacked({
        callId: CALL_ID,
        recordingId: RECORDING_ID,
        proof,
      });

      expect(result).toBeDefined();
      expect(result.checkpointId).toBe(checkpoint.checkpointId);
    });
  });

  describe("recording manifest retrieval (recording_manifest_retrieval_evidence)", () => {
    it("returns null when no checkpoint exists for the call", async () => {
      const checkpoint = await service.getLatestRecordingCheckpoint("call-nonexistent");
      expect(checkpoint).toBeNull();
      const manifest = await service.getRecordingManifest("call-nonexistent");
      expect(manifest).toBeNull();
    });

    it("returns null when the checkpoint belongs to a different recordingId chain", async () => {
      await service.ingestSealedSegment(segment());
      const checkpoint = await service.getLatestRecordingCheckpoint(CALL_ID, "other-recording");
      expect(checkpoint).toBeNull();
      const manifest = await service.getRecordingManifest(CALL_ID, "other-recording");
      expect(manifest).toBeNull();
    });

    it("retrieves the active recording manifest with all sealed segments and verified metadata", async () => {
      await service.ingestSealedSegment(segment());
      await service.ingestSealedSegment(
        segment({
          segmentSequence: 2,
          objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000002`,
          checksum: "checksum-2",
          startOffsetMs: 1000,
          endOffsetMs: 2000,
          startedAtUtc: "2026-09-08T00:00:01.000Z",
          endedAtUtc: "2026-09-08T00:00:02.000Z",
          durableAt: "2026-09-08T00:00:02.100Z",
        }),
      );

      const manifestView = await service.getRecordingManifest(CALL_ID, RECORDING_ID);
      expect(manifestView).not.toBeNull();
      expect(manifestView!.final).toBe(false);
      expect(manifestView!.manifestVersion).toBe(2);
      expect(manifestView!.segments).toHaveLength(2);
      expect(manifestView!.segments[0]!.segmentSequence).toBe(1);
      expect(manifestView!.segments[1]!.segmentSequence).toBe(2);
      expect(manifestView!.manifestHash).toBeDefined();
      expect(manifestView!.coverage.segmentCount).toBe(2);
      expect(manifestView!.coverage.continuityBroken).toBe(false);
      expect(manifestView!.verifiedAt).toBeDefined();
    });

    it("retrieves the final manifest marked final: true after full-call finalization", async () => {
      await service.ingestSealedSegment(segment());
      await service.finalizeRecording(CALL_ID, RECORDING_ID);

      const manifestView = await service.getRecordingManifest(CALL_ID, RECORDING_ID);
      expect(manifestView).not.toBeNull();
      expect(manifestView!.final).toBe(true);
      expect(manifestView!.manifestVersion).toBe(2);
      expect(manifestView!.segments).toHaveLength(1);
    });
  });

  describe("callback compatibility & legacy isolation (callback_compatibility_evidence)", () => {
    function createMockCallcenterService(): CallcenterService {
      const mockAuditService: Partial<AuditNotificationService> = {
        recordAuditLog: vi.fn(),
      };
      return new CallcenterService(mockAuditService as AuditNotificationService);
    }

    it("legacy callcenter recording callback cannot flip the voice recording gate without durable evidence", async () => {
      const callcenter = createMockCallcenterService();
      const legacySession = callcenter.openCallSession({
        callerPhone: "0912345678",
        callType: "booking",
        agentId: "agent-test",
      });

      // Callcenter attaches an arbitrary recordingId via legacy callback.
      callcenter.attachRecordingCallback(legacySession.callId, {
        recordingId: "arbitrary-rec-id-999",
        recordingUrl: "https://example.com/recording.wav",
      });

      // SD §8.1: 不得呼叫既有 recording callback，填任意 recordingId 把 gate 翻成 clear.
      const gate = await service.evaluateRecordingGate(legacySession.callId, "arbitrary-rec-id-999");
      expect(gate.allowed).toBe(false);
      expect(gate).toEqual({ allowed: false, reason: "no_checkpoint" });
    });

    it("legacy callcenter markRecordingFailed does not erase or mutate established immutable voice checkpoints", async () => {
      const callcenter = createMockCallcenterService();
      const legacySession = callcenter.openCallSession({
        callerPhone: "0912345678",
        callType: "booking",
        agentId: "agent-test",
      });

      // A voice session creates a durable, verified checkpoint for this call.
      const { checkpoint } = await service.ingestSealedSegment(
        segment({ callId: legacySession.callId }),
      );

      // Legacy callcenter receives a failure callback later (e.g. timeout on post-call processing).
      callcenter.markRecordingFailed(legacySession.callId, {
        endedAt: "2026-09-08T00:05:00.000Z",
      });

      // SD §8.4: 已驗證 checkpoint refs 不因後半段失敗或舊 pending callback 被清除。
      const gate = await service.evaluateRecordingGate(legacySession.callId, RECORDING_ID);
      expect(gate.allowed).toBe(true);
      if (gate.allowed) {
        expect(gate.checkpoint.checkpointId).toBe(checkpoint.checkpointId);
        expect(gate.state).toBe("checkpoint_ready");
      }
      expect(fixture.checkpoints).toHaveLength(1);
    });

    it("legacy callcenter markRecordingPending does not mutate existing voice checkpoints", async () => {
      const callcenter = createMockCallcenterService();
      const legacySession = callcenter.openCallSession({
        callerPhone: "0912345678",
        callType: "booking",
        agentId: "agent-test",
      });

      await service.ingestSealedSegment(
        segment({ callId: legacySession.callId }),
      );

      // Legacy callcenter receives a recording.pending event.
      callcenter.markRecordingPending(legacySession.callId);

      const manifestView = await service.getRecordingManifest(legacySession.callId, RECORDING_ID);
      expect(manifestView).not.toBeNull();
      expect(manifestView!.segments).toHaveLength(1);
    });

    it("post-commit mid-trip recording failure preserves existing sealed checkpoints and manifests (SD §8.3)", async () => {
      // Phase 1: Confirmation checkpoint established and verified.
      await service.ingestSealedSegment(segment());
      const gateBefore = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gateBefore.allowed).toBe(true);

      // Phase 2: Mid-trip audio stream is interrupted or fails object store put.
      // SD §8.3: commit 後後半段錄音失敗...保存已封閉證據、阻止尚未執行的額外 mutation.
      verifier.unreadableKeys.add(`${CALL_ID}/${RECORDING_ID}/segments/000002`);
      await expect(
        service.ingestSealedSegment(
          segment({
            segmentSequence: 2,
            objectKey: `${CALL_ID}/${RECORDING_ID}/segments/000002`,
            checksum: "checksum-corrupted",
            startOffsetMs: 1000,
            endOffsetMs: 2000,
          }),
        ),
      ).rejects.toThrow(ApiRequestError);

      // The prior confirmed evidence remains fully intact and verifiable.
      const manifestView = await service.getRecordingManifest(CALL_ID, RECORDING_ID);
      expect(manifestView).not.toBeNull();
      expect(manifestView!.manifestVersion).toBe(1);
      expect(manifestView!.segments).toHaveLength(1);

      const gateAfter = await service.evaluateRecordingGate(CALL_ID, RECORDING_ID);
      expect(gateAfter.allowed).toBe(true);
    });
  });
});
