import { Injectable } from "@nestjs/common";
import type { VoiceProof } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { computePayloadHash } from "../../common/idempotency/canonical-json";
import {
  VoiceBookingRepository,
  type VoiceRecordingCheckpointRecord,
  type VoiceSessionEventRecord,
} from "./voice-booking.repository";
import { VoiceSessionRepository } from "./voice-session.repository";

/**
 * SD §8 "錄音證據與通話中派車" / §9.1 `recording_checkpoint`. This is the
 * "evidence service" the design repeatedly refers to: it is the only writer
 * of `voice.recording_checkpoint`, the only place that turns a recorder's
 * sealed-segment reports into a gate decision, and the only place that
 * decides whether a `speech`/`dtmf` confirmation proof is actually backed by
 * durable, verified, in-coverage recording evidence.
 *
 * Non-negotiables carried over from SD §8.1/§8.2:
 * - never call the legacy recording callback, fabricate a `recordingId`, or
 *   treat a confirmation segment's `endTime` as the whole call's `endedAt`
 *   just to flip this gate to clear;
 * - a checkpoint is a *verification result*, not a non-empty field -- an
 *   unverifiable or discontinuous segment report never mints one;
 * - already-sealed manifest versions are immutable (SD §8.2 "後續片段不修改
 *   已封閉片段"); this service is append-only against
 *   `voice.recording_checkpoint` (`VoiceSessionRepository.
 *   insertRecordingCheckpoint`) and must never special-case a retry/failure
 *   callback into rewriting established evidence.
 *
 * Companion recorder-side code lives in
 * `apps/voice-media-worker/src/recording/` (separate app/deploy unit per
 * SD §3.2/§3.4); the two sides share the sealed-segment *shape* by
 * convention, not by import.
 */

// ---------------------------------------------------------------------------
// Sealed-segment ingestion types
// ---------------------------------------------------------------------------

/** Mirrors `apps/voice-media-worker/src/recording/recorder-session.ts`'s `RecordingChannelRole`. */
export type RecordingSegmentChannel = "customer" | "agent";

export type RecordingTimingSource =
  | "provider"
  | "local_utterance"
  | "local_send"
  | "unknown";

export type RecordingTimingPrecision =
  | "exact"
  | "bounded"
  | "estimated"
  | "unknown";

export interface SealedRecordingSegmentInput {
  callId: string;
  recordingId: string;
  segmentSequence: number;
  objectKey: string;
  objectVersion: number;
  checksum: string;
  byteSize: number;
  channels: RecordingSegmentChannel[];
  startOffsetMs: number;
  endOffsetMs: number;
  startedAtUtc: string;
  endedAtUtc: string;
  durableAt: string;
  timingSource: RecordingTimingSource;
  timingPrecision: RecordingTimingPrecision;
  readbackPlaybackId?: string | null;
  snapshotHash?: string | null;
}

/**
 * The evidence service never trusts a recorder-supplied checksum on its own
 * (SD §8.2 "驗證 object 版本、可讀性、雜湊"): it asks this port to
 * independently re-read the object and recompute the digest.
 */
export interface RecordingObjectReadbackVerifier {
  verifyReadback(input: {
    objectKey: string;
    objectVersion: number;
    expectedChecksum: string;
  }): Promise<{ readable: boolean; checksumMatches: boolean }>;
}

export type RecordingManifestSegment = SealedRecordingSegmentInput;

export interface RecordingManifest {
  policyVersion: string;
  final: boolean;
  segments: RecordingManifestSegment[];
  readbackPlaybackId?: string | null;
  snapshotHash?: string | null;
}

export interface RecordingCoverage {
  channelsCovered: RecordingSegmentChannel[];
  /** Sticky once set: a lost gap can never be un-lost by a later good segment. */
  continuityBroken: boolean;
  coverageStartUtc: string | null;
  coverageEndUtc: string | null;
  segmentCount: number;
}

export interface RecordingManifestView {
  checkpointId: string;
  callId: string;
  recordingId: string | null;
  manifestVersion: number;
  manifestHash: string;
  policyVersion: string;
  final: boolean;
  segments: readonly SealedRecordingSegmentInput[];
  coverage: RecordingCoverage;
  verifiedAt: string | null;
  readbackPlaybackId?: string | null;
  snapshotHash?: string | null;
}

export const RECORDING_EVIDENCE_POLICY_VERSION = "voice-recording-evidence-v1";

export type RecordingIngestResult = {
  checkpoint: VoiceRecordingCheckpointRecord;
  deduped: boolean;
};

export type RecordingGateResult =
  | {
      allowed: true;
      state: "checkpoint_ready" | "finalized";
      checkpoint: VoiceRecordingCheckpointRecord;
    }
  | {
      allowed: false;
      reason:
        | "no_checkpoint"
        | "continuity_broken"
        | "not_verified"
        | "coverage_incomplete";
    };

// ---------------------------------------------------------------------------
// Session-event type vocabulary this service reads as recording evidence.
// These literal strings mirror the `type` field emitted by
// `apps/voice-media-worker/src/media-session.ts`'s `VoiceMediaWorkerEvent`
// union; whichever task wires the real `/sessions/{id}/events` ingestion
// controller must persist `eventType` using these exact strings (or update
// both sides together).
// ---------------------------------------------------------------------------

const ASR_FINAL_EVENT_TYPE = "asr.segment.final";
const DTMF_RECEIVED_EVENT_TYPE = "dtmf.received";
/** SD §8.2/§9.2: only a *confirmed* playback counts -- never `tts.playback.started`. */
const PLAYBACK_COMPLETED_EVENT_TYPE = "tts.playback.completed";

@Injectable()
export class VoiceEvidenceService {
  constructor(
    private readonly bookingRepository: VoiceBookingRepository,
    private readonly sessionRepository: VoiceSessionRepository,
    private readonly readbackVerifier: RecordingObjectReadbackVerifier,
  ) {}

  /**
   * SD §8.2 ingestion path: verify readability/checksum, verify continuity
   * against the previously sealed segment, then append a new immutable
   * manifest version. A conflicting or stale report is rejected *without*
   * mutating the latest good checkpoint (SD §8.3 "callback 重送只更新相同
   * manifest 的可驗證結果"; the acceptance note "callback 亂序／部分失敗不改写
   * 已確立 evidence").
   */
  async ingestSealedSegment(
    input: SealedRecordingSegmentInput,
  ): Promise<RecordingIngestResult> {
    // SD §9.1: `findLatestRecordingCheckpointForCall` (UV-EXEC-002) is keyed
    // by `call_id` alone -- a call has one recording lifecycle at a time.
    // Only treat the latest row as *this* recording's chain when its
    // `recordingId` still matches; a rotated/replaced `recordingId` starts a
    // fresh chain rather than inheriting a stranger's coverage/continuity.
    const latestForCall =
      await this.bookingRepository.findLatestRecordingCheckpointForCall(
        input.callId,
      );
    const previous =
      latestForCall && latestForCall.recordingId === input.recordingId
        ? latestForCall
        : null;
    const previousManifest = previous
      ? (previous.manifest as RecordingManifest)
      : null;
    const previousCoverage = previous
      ? (previous.coverage as RecordingCoverage)
      : null;
    const previousSegments = previousManifest?.segments ?? [];
    const lastSegment = previousSegments[previousSegments.length - 1] ?? null;

    if (lastSegment && input.segmentSequence === lastSegment.segmentSequence) {
      if (
        lastSegment.checksum === input.checksum &&
        lastSegment.objectKey === input.objectKey &&
        lastSegment.objectVersion === input.objectVersion
      ) {
        // Exact retry of the most recently sealed segment: safe no-op.
        return { checkpoint: previous!, deduped: true };
      }
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        "Sealed segment sequence was already recorded with different content; refusing to overwrite immutable evidence.",
        { callId: input.callId, recordingId: input.recordingId, segmentSequence: input.segmentSequence },
      );
    }

    if (lastSegment && input.segmentSequence < lastSegment.segmentSequence) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        "Stale/out-of-order sealed segment report arrived after a later segment was already sealed; established evidence is left unchanged.",
        { callId: input.callId, recordingId: input.recordingId, segmentSequence: input.segmentSequence },
      );
    }

    const readback = await this.readbackVerifier.verifyReadback({
      objectKey: input.objectKey,
      objectVersion: input.objectVersion,
      expectedChecksum: input.checksum,
    });
    if (!readback.readable || !readback.checksumMatches) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        "Sealed recording object failed independent readback/checksum verification.",
        { callId: input.callId, recordingId: input.recordingId, segmentSequence: input.segmentSequence },
      );
    }

    const expectedNextSequence = lastSegment
      ? lastSegment.segmentSequence + 1
      : 1;
    const gapThisSegment =
      input.segmentSequence !== expectedNextSequence ||
      (lastSegment !== null && input.startOffsetMs !== lastSegment.endOffsetMs);
    const continuityBroken =
      gapThisSegment || Boolean(previousCoverage?.continuityBroken);

    const segments: RecordingManifestSegment[] = [...previousSegments, input];
    const channelsCovered = Array.from(
      new Set(segments.flatMap((segment) => segment.channels)),
    );
    const coverage: RecordingCoverage = {
      channelsCovered,
      continuityBroken,
      coverageStartUtc: segments[0]?.startedAtUtc ?? null,
      coverageEndUtc: segments[segments.length - 1]?.endedAtUtc ?? null,
      segmentCount: segments.length,
    };
    const readbackPlaybackId =
      input.readbackPlaybackId ?? previousManifest?.readbackPlaybackId ?? null;
    const snapshotHash =
      input.snapshotHash ?? previousManifest?.snapshotHash ?? null;
    const manifest: RecordingManifest = {
      policyVersion: RECORDING_EVIDENCE_POLICY_VERSION,
      final: false,
      segments,
      readbackPlaybackId,
      snapshotHash,
    };

    // Versioned off the call's globally latest row (not just this
    // recordingId's chain) so a recordingId rotation can never collide with
    // `uq_voice_recording_checkpoint_manifest`'s per-call ordering.
    const nextManifestVersion = (latestForCall?.manifestVersion ?? 0) + 1;
    const { checkpoint } = await this.sessionRepository.insertRecordingCheckpoint({
      callId: input.callId,
      recordingId: input.recordingId,
      manifestVersion: nextManifestVersion,
      manifest,
      manifestHash: computePayloadHash(manifest),
      coverage,
      policyVersion: RECORDING_EVIDENCE_POLICY_VERSION,
      verifiedAt: new Date().toISOString(),
    });

    await this.advanceSessionRecordingState(input.callId, coverage, false);

    return { checkpoint, deduped: false };
  }

  /**
   * SD §8.2 "整通電話結束後產生 final manifest". Requires at least one sealed
   * checkpoint; finalizing an evidence-less recording is refused rather than
   * inventing a manifest.
   */
  async finalizeRecording(
    callId: string,
    recordingId: string,
  ): Promise<VoiceRecordingCheckpointRecord> {
    const latestForCall =
      await this.bookingRepository.findLatestRecordingCheckpointForCall(callId);
    const latest =
      latestForCall && latestForCall.recordingId === recordingId
        ? latestForCall
        : null;
    if (!latest) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        "No sealed recording checkpoint exists to finalize.",
        { callId, recordingId },
      );
    }

    const manifest: RecordingManifest = {
      ...(latest.manifest as RecordingManifest),
      final: true,
    };
    const coverage = latest.coverage as RecordingCoverage;

    const { checkpoint } = await this.sessionRepository.insertRecordingCheckpoint({
      callId,
      recordingId,
      manifestVersion: latest.manifestVersion + 1,
      manifest,
      manifestHash: computePayloadHash(manifest),
      coverage,
      policyVersion: latest.policyVersion,
      verifiedAt: latest.verifiedAt,
    });

    await this.advanceSessionRecordingState(callId, coverage, true);

    return checkpoint;
  }

  /**
   * SD §8.3 gate table. Coverage/verification state decides the outcome, not
   * whether some field happens to be non-empty.
   */
  async evaluateRecordingGate(
    callId: string,
    recordingId: string | null,
  ): Promise<RecordingGateResult> {
    const latestForCall =
      await this.bookingRepository.findLatestRecordingCheckpointForCall(callId);
    const checkpoint =
      latestForCall && latestForCall.recordingId === recordingId
        ? latestForCall
        : null;
    if (!checkpoint) {
      return { allowed: false, reason: "no_checkpoint" };
    }
    if (!checkpoint.verifiedAt) {
      return { allowed: false, reason: "not_verified" };
    }
    const coverage = checkpoint.coverage as RecordingCoverage;
    if (coverage.continuityBroken) {
      return { allowed: false, reason: "continuity_broken" };
    }
    if (
      !coverage.channelsCovered.includes("customer") ||
      !coverage.channelsCovered.includes("agent")
    ) {
      return { allowed: false, reason: "coverage_incomplete" };
    }
    const manifest = checkpoint.manifest as RecordingManifest;
    return {
      allowed: true,
      state: manifest.final ? "finalized" : "checkpoint_ready",
      checkpoint,
    };
  }

  /**
   * SD §8.2 last two paragraphs: a `speech` proof must bind to a real
   * finalized ASR event and a real *completed* (not merely synthesized)
   * playback; a `dtmf` proof must bind to a real digit event and a
   * trustworthy, durably-ordered occurrence after that playback -- without
   * requiring DTMF tone audio the provider never recorded. Both proof kinds
   * are additionally required to fall inside the checkpoint's verified
   * coverage window, and the proof must reference the *current* checkpoint.
   */
  async assertProofIsRecordingBacked(input: {
    callId: string;
    recordingId: string | null;
    proof: VoiceProof;
  }): Promise<VoiceRecordingCheckpointRecord> {
    const proof = input.proof;
    const gate = await this.evaluateRecordingGate(
      input.callId,
      input.recordingId,
    );
    if (!gate.allowed) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        `Recording checkpoint gate rejected the confirmation: ${gate.reason}.`,
        { callId: input.callId, recordingId: input.recordingId, reason: gate.reason },
      );
    }
    if (gate.checkpoint.checkpointId !== proof.recordingCheckpointId) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "Proof does not reference the current durable recording checkpoint.",
        {
          expected: gate.checkpoint.checkpointId,
          actual: proof.recordingCheckpointId,
        },
      );
    }

    // 1. Verify call and session association (SD §8.2)
    const session = await this.bookingRepository.findSessionByCallId(input.callId);
    if (session && session.voiceSessionId !== proof.voiceSessionId) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        `Proof voiceSessionId does not belong to call ${input.callId}.`,
        {
          callId: input.callId,
          expectedSessionId: session.voiceSessionId,
          actualSessionId: proof.voiceSessionId,
        },
      );
    }
    if (!session && typeof (this.bookingRepository as any).findSessionById === "function") {
      const sessionById = await (this.bookingRepository as any).findSessionById(proof.voiceSessionId);
      if (sessionById && sessionById.callId !== input.callId) {
        throw new ApiRequestError(
          409,
          "VOICE_INVALID_PROOF",
          `Proof voiceSessionId belongs to call ${sessionById.callId}, not requested call ${input.callId}.`,
          {
            callId: input.callId,
            sessionCallId: sessionById.callId,
            voiceSessionId: proof.voiceSessionId,
          },
        );
      }
    }

    // 2. Checkpoint manifest binding for readbackPlaybackId and snapshotHash
    const manifest = gate.checkpoint.manifest as RecordingManifest;
    if (
      manifest.readbackPlaybackId &&
      manifest.readbackPlaybackId !== proof.readbackPlaybackId
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "Proof readbackPlaybackId does not match checkpoint manifest readbackPlaybackId.",
        {
          expected: manifest.readbackPlaybackId,
          actual: proof.readbackPlaybackId,
        },
      );
    }
    if (
      manifest.snapshotHash &&
      manifest.snapshotHash !== proof.snapshotHash
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "Proof snapshotHash does not match checkpoint manifest snapshotHash.",
        {
          expected: manifest.snapshotHash,
          actual: proof.snapshotHash,
        },
      );
    }

    const sessionEvents = await this.bookingRepository.listSessionEvents(
      proof.voiceSessionId,
    );

    const readbackEvent = sessionEvents.find(
      (event) => event.eventId === proof.readbackCompletedEventId,
    );
    if (!readbackEvent || readbackEvent.eventType !== PLAYBACK_COMPLETED_EVENT_TYPE) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "readbackCompletedEventId does not reference an actual completed playback event; synthesized TTS bytes are not evidence the passenger heard it.",
      );
    }
    if (readbackEvent.voiceSessionId !== proof.voiceSessionId) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "Readback completed event does not belong to the proof voiceSessionId.",
      );
    }

    const readbackPayload = readbackEvent.payload as {
      playbackId?: string;
      readbackPlaybackId?: string;
      snapshotHash?: string;
      promptId?: string;
      promptPlaybackId?: string;
      callId?: string;
      callLegId?: string;
      audioRegion?: { startUtc?: string; endUtc?: string; startOffsetMs?: number; endOffsetMs?: number };
      startedAtUtc?: string;
      endedAtUtc?: string;
      startOffsetMs?: number;
      endOffsetMs?: number;
    } | null;

    if (readbackPayload?.callId && readbackPayload.callId !== input.callId) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "Readback completed event belongs to a different callId.",
      );
    }

    const eventPlaybackId =
      readbackPayload?.playbackId ??
      readbackPayload?.readbackPlaybackId ??
      readbackPayload?.promptPlaybackId;
    if (eventPlaybackId && eventPlaybackId !== proof.readbackPlaybackId) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "Readback completed event playbackId does not match proof readbackPlaybackId.",
        {
          expected: proof.readbackPlaybackId,
          actual: eventPlaybackId,
        },
      );
    }

    if (
      readbackPayload?.snapshotHash &&
      readbackPayload.snapshotHash !== proof.snapshotHash
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "Readback completed event snapshotHash does not match proof snapshotHash.",
        {
          expected: proof.snapshotHash,
          actual: readbackPayload.snapshotHash,
        },
      );
    }

    this.assertWithinCoverage(readbackEvent, gate.checkpoint, "readback");
    const readbackStartUtc =
      readbackPayload?.audioRegion?.startUtc ??
      readbackPayload?.startedAtUtc ??
      readbackEvent.occurredAt;
    const readbackEndUtc =
      readbackPayload?.audioRegion?.endUtc ??
      readbackPayload?.endedAtUtc ??
      readbackEvent.occurredAt;
    const readbackOffsets =
      readbackPayload?.audioRegion?.startOffsetMs !== undefined &&
      readbackPayload?.audioRegion?.endOffsetMs !== undefined
        ? {
            startOffsetMs: readbackPayload.audioRegion.startOffsetMs,
            endOffsetMs: readbackPayload.audioRegion.endOffsetMs,
          }
        : readbackPayload?.startOffsetMs !== undefined &&
            readbackPayload?.endOffsetMs !== undefined
          ? {
              startOffsetMs: readbackPayload.startOffsetMs,
              endOffsetMs: readbackPayload.endOffsetMs,
            }
          : undefined;

    this.assertChannelCoverage(
      gate.checkpoint,
      "agent",
      { startUtc: readbackStartUtc, endUtc: readbackEndUtc },
      "readback",
      readbackOffsets,
    );

    if (proof.confirmationMethod === "speech") {
      const finalEvent = sessionEvents.find(
        (event) => event.eventId === proof.evidence.finalEventId,
      );
      if (!finalEvent || finalEvent.eventType !== ASR_FINAL_EVENT_TYPE) {
        throw new ApiRequestError(
          409,
          "VOICE_INVALID_PROOF",
          "Speech proof finalEventId does not reference a real finalized ASR segment.",
        );
      }
      if (finalEvent.voiceSessionId !== proof.voiceSessionId) {
        throw new ApiRequestError(
          409,
          "VOICE_INVALID_PROOF",
          "Speech proof finalEvent does not belong to the proof voiceSessionId.",
        );
      }

      const finalPayload = finalEvent.payload as {
        turnId?: string;
        callId?: string;
        callLegId?: string;
        audioRegion?: { startUtc?: string; endUtc?: string; startOffsetMs?: number; endOffsetMs?: number };
        audioStartUtc?: string;
        audioEndUtc?: string;
        startedAtUtc?: string;
        endedAtUtc?: string;
        startOffsetMs?: number;
        endOffsetMs?: number;
      } | null;

      if (finalPayload?.callId && finalPayload.callId !== input.callId) {
        throw new ApiRequestError(
          409,
          "VOICE_INVALID_PROOF",
          "Speech finalEvent belongs to a different callId.",
        );
      }

      if (finalPayload?.turnId && finalPayload.turnId !== proof.evidence.turnId) {
        throw new ApiRequestError(
          409,
          "VOICE_INVALID_PROOF",
          "Speech proof turnId does not match finalEvent payload turnId.",
          {
            expected: proof.evidence.turnId,
            actual: finalPayload.turnId,
          },
        );
      }

      if (finalEvent.sequence <= readbackEvent.sequence) {
        throw new ApiRequestError(
          409,
          "VOICE_INVALID_PROOF",
          "Speech affirmation event is not provably ordered after the readback playback completed.",
        );
      }

      const speechStartUtc =
        finalPayload?.audioRegion?.startUtc ??
        finalPayload?.audioStartUtc ??
        finalPayload?.startedAtUtc ??
        finalEvent.occurredAt;
      const speechEndUtc =
        finalPayload?.audioRegion?.endUtc ??
        finalPayload?.audioEndUtc ??
        finalPayload?.endedAtUtc ??
        finalEvent.occurredAt;
      const speechOffsets =
        finalPayload?.audioRegion?.startOffsetMs !== undefined &&
        finalPayload?.audioRegion?.endOffsetMs !== undefined
          ? {
              startOffsetMs: finalPayload.audioRegion.startOffsetMs,
              endOffsetMs: finalPayload.audioRegion.endOffsetMs,
            }
          : finalPayload?.startOffsetMs !== undefined &&
              finalPayload?.endOffsetMs !== undefined
            ? {
                startOffsetMs: finalPayload.startOffsetMs,
                endOffsetMs: finalPayload.endOffsetMs,
              }
            : undefined;

      this.assertWithinCoverage(finalEvent, gate.checkpoint, "speech affirmation");
      this.assertChannelCoverage(
        gate.checkpoint,
        "customer",
        { startUtc: speechStartUtc, endUtc: speechEndUtc },
        "speech affirmation",
        speechOffsets,
      );
      return gate.checkpoint;
    }

    const digitEvent = sessionEvents.find(
      (event) => event.eventId === proof.evidence.eventId,
    );
    if (!digitEvent || digitEvent.eventType !== DTMF_RECEIVED_EVENT_TYPE) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF proof eventId does not reference a real digit event.",
      );
    }
    if (digitEvent.voiceSessionId !== proof.voiceSessionId) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit event does not belong to the proof voiceSessionId.",
      );
    }

    const digitPayload = digitEvent.payload as {
      digit?: string;
      callId?: string;
      callLegId?: string;
      promptId?: string;
      promptPlaybackId?: string;
      playbackId?: string;
      readbackPlaybackId?: string;
      snapshotHash?: string;
      audioRegion?: { startUtc?: string; endUtc?: string; startOffsetMs?: number; endOffsetMs?: number };
      startOffsetMs?: number;
      endOffsetMs?: number;
    } | null;

    if (digitPayload?.callId && digitPayload.callId !== input.callId) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit event belongs to a different callId.",
      );
    }

    if (
      digitEvent.legId !== null &&
      readbackEvent.legId !== null &&
      digitEvent.legId !== readbackEvent.legId
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit event is on a different leg than the readback playback.",
        {
          readbackLegId: readbackEvent.legId,
          digitLegId: digitEvent.legId,
        },
      );
    }
    if (
      digitPayload?.callLegId &&
      readbackPayload?.callLegId &&
      digitPayload.callLegId !== readbackPayload.callLegId
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit event payload callLegId does not match readback payload callLegId.",
      );
    }

    const digitPromptPlaybackId =
      digitPayload?.promptPlaybackId ??
      digitPayload?.playbackId ??
      digitPayload?.readbackPlaybackId;
    if (
      digitPromptPlaybackId &&
      digitPromptPlaybackId !== proof.readbackPlaybackId
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit prompt binding does not match proof readbackPlaybackId.",
        {
          expected: proof.readbackPlaybackId,
          actual: digitPromptPlaybackId,
        },
      );
    }
    if (
      digitPayload?.promptId &&
      readbackPayload?.promptId &&
      digitPayload.promptId !== readbackPayload.promptId
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit prompt binding does not match readback promptId.",
        {
          readbackPromptId: readbackPayload.promptId,
          digitPromptId: digitPayload.promptId,
        },
      );
    }
    if (
      digitPayload?.snapshotHash &&
      digitPayload.snapshotHash !== proof.snapshotHash
    ) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit snapshotHash does not match proof snapshotHash.",
      );
    }

    const recordedDigit = digitPayload?.digit;
    if (recordedDigit !== proof.evidence.digit) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF proof digit does not match the durably recorded digit event.",
      );
    }

    // Trusted occurrence order via the durable session_event sequence
    // watermark, not raw timestamps (SD §8.2: providers without a sample
    // offset must not have one faked; "採 event order 證據並標精度"). No DTMF
    // tone audio is required -- SD §8.2 "不要求不存在的 DTMF tone 錄音".
    if (digitEvent.sequence <= readbackEvent.sequence) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        "DTMF digit event is not provably ordered after the readback playback completed.",
      );
    }

    this.assertWithinCoverage(digitEvent, gate.checkpoint, "DTMF digit");
    this.assertChannelCoverage(
      gate.checkpoint,
      "customer",
      {
        startUtc: digitPayload?.audioRegion?.startUtc ?? digitEvent.occurredAt,
        endUtc: digitPayload?.audioRegion?.endUtc ?? digitEvent.occurredAt,
      },
      "DTMF digit",
      digitPayload?.audioRegion?.startOffsetMs !== undefined &&
      digitPayload?.audioRegion?.endOffsetMs !== undefined
        ? {
            startOffsetMs: digitPayload.audioRegion.startOffsetMs,
            endOffsetMs: digitPayload.audioRegion.endOffsetMs,
          }
        : undefined,
    );

    return gate.checkpoint;
  }

  private assertChannelCoverage(
    checkpoint: VoiceRecordingCheckpointRecord,
    channel: RecordingSegmentChannel,
    timeRange: { startUtc: string; endUtc: string },
    label: string,
    offsetRange?: { startOffsetMs?: number; endOffsetMs?: number },
  ): void {
    const manifest = checkpoint.manifest as RecordingManifest;
    const segments = manifest.segments ?? [];
    const channelSegments = segments.filter((s) => s.channels.includes(channel));
    if (channelSegments.length === 0) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        `Recording checkpoint has no segments covering required channel '${channel}' for ${label}.`,
      );
    }

    const reqStartMs = new Date(timeRange.startUtc).getTime();
    const reqEndMs = new Date(timeRange.endUtc).getTime();

    if (Number.isNaN(reqStartMs) || Number.isNaN(reqEndMs) || reqStartMs > reqEndMs) {
      throw new ApiRequestError(
        409,
        "VOICE_INVALID_PROOF",
        `Invalid time range for ${label} verification.`,
      );
    }

    const startSegmentIndex = segments.findIndex(
      (s) =>
        new Date(s.startedAtUtc).getTime() <= reqStartMs &&
        reqStartMs <= new Date(s.endedAtUtc).getTime(),
    );
    const endSegmentIndex = segments.findIndex(
      (s) =>
        new Date(s.startedAtUtc).getTime() <= reqEndMs &&
        reqEndMs <= new Date(s.endedAtUtc).getTime(),
    );

    if (startSegmentIndex === -1 || endSegmentIndex === -1) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        `The ${label} event window falls outside durable recording coverage for channel '${channel}'.`,
      );
    }

    for (let i = startSegmentIndex; i <= endSegmentIndex; i++) {
      const seg = segments[i]!;
      if (!seg.channels.includes(channel)) {
        throw new ApiRequestError(
          409,
          "VOICE_RECORDING_NOT_DURABLE",
          `Segment ${seg.segmentSequence} in the ${label} window is missing required channel '${channel}'.`,
        );
      }
    }

    if (
      offsetRange &&
      offsetRange.startOffsetMs !== undefined &&
      offsetRange.endOffsetMs !== undefined
    ) {
      const segStart = segments[startSegmentIndex]!;
      const segEnd = segments[endSegmentIndex]!;
      if (
        offsetRange.startOffsetMs < segStart.startOffsetMs ||
        offsetRange.endOffsetMs > segEnd.endOffsetMs
      ) {
        throw new ApiRequestError(
          409,
          "VOICE_RECORDING_NOT_DURABLE",
          `The ${label} offset window falls outside recorded offsets for channel '${channel}'.`,
        );
      }
    }
  }

  private assertWithinCoverage(
    event: VoiceSessionEventRecord,
    checkpoint: VoiceRecordingCheckpointRecord,
    label: string,
  ): void {
    const coverage = checkpoint.coverage as RecordingCoverage;
    if (!coverage.coverageStartUtc || !coverage.coverageEndUtc) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        `No recorded coverage window is available to bind the ${label} event to.`,
      );
    }
    const occurredAtMs = new Date(event.occurredAt).getTime();
    const startMs = new Date(coverage.coverageStartUtc).getTime();
    const endMs = new Date(coverage.coverageEndUtc).getTime();
    if (occurredAtMs < startMs || occurredAtMs > endMs) {
      throw new ApiRequestError(
        409,
        "VOICE_RECORDING_NOT_DURABLE",
        `The ${label} event falls outside the durable recording coverage window.`,
      );
    }
  }

  /**
   * SD §8.2 / SD §9.1: Retrieves the latest recording checkpoint record for the call.
   * If a specific `recordingId` is requested, confirms the latest checkpoint
   * belongs to that active recording chain.
   */
  async getLatestRecordingCheckpoint(
    callId: string,
    recordingId?: string | null,
  ): Promise<VoiceRecordingCheckpointRecord | null> {
    const latestForCall =
      await this.bookingRepository.findLatestRecordingCheckpointForCall(callId);
    if (!latestForCall) {
      return null;
    }
    if (
      recordingId !== undefined &&
      recordingId !== null &&
      latestForCall.recordingId !== recordingId
    ) {
      return null;
    }
    return latestForCall;
  }

  /**
   * Retrieves the immutable recording manifest and verification metadata for audit,
   * inspection, or evidentiary readback (SD §8.2 / §9.1).
   */
  async getRecordingManifest(
    callId: string,
    recordingId?: string | null,
  ): Promise<RecordingManifestView | null> {
    const checkpoint = await this.getLatestRecordingCheckpoint(
      callId,
      recordingId,
    );
    if (!checkpoint) {
      return null;
    }
    const manifest = checkpoint.manifest as RecordingManifest;
    const coverage = checkpoint.coverage as RecordingCoverage;
    return {
      checkpointId: checkpoint.checkpointId,
      callId: checkpoint.callId,
      recordingId: checkpoint.recordingId,
      manifestVersion: checkpoint.manifestVersion,
      manifestHash: checkpoint.manifestHash,
      policyVersion: checkpoint.policyVersion,
      final: Boolean(manifest.final),
      segments: manifest.segments,
      coverage,
      verifiedAt: checkpoint.verifiedAt,
      readbackPlaybackId: manifest.readbackPlaybackId ?? null,
      snapshotHash: manifest.snapshotHash ?? null,
    };
  }

  /**
   * Best-effort session-state sync: `voice.session.recording_state` (CAS)
   * mirrors the checkpoint gate so other flows can read it cheaply, but the
   * gate itself (`evaluateRecordingGate`) is always the authority -- a CAS
   * miss here (concurrent session write) is not retried, since the next
   * ingested segment or an explicit re-evaluation will reconcile it.
   */
  private async advanceSessionRecordingState(
    callId: string,
    coverage: RecordingCoverage,
    final: boolean,
  ): Promise<void> {
    const session = await this.bookingRepository.findSessionByCallId(callId);
    if (!session) {
      return;
    }
    const hasBothChannels =
      coverage.channelsCovered.includes("customer") &&
      coverage.channelsCovered.includes("agent");
    if (coverage.continuityBroken || !hasBothChannels) {
      return;
    }
    const nextState = final ? "finalized" : "checkpoint_ready";
    if (session.recordingState === nextState) {
      return;
    }
    await this.sessionRepository.casUpdateSessionControl(
      session.voiceSessionId,
      session.sessionVersion,
      { recordingState: nextState },
    );
  }
}
