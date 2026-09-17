import type { SealedRecordingSegment } from "./recorder-session";

/**
 * Authenticated reporting seam from the recorder to the evidence service
 * (SD §8.2 "Recorder 以認證介面回報", §10.1
 * `POST /api/voice/recordings/{recordingId}/checkpoints`, caller "recorder
 * service"). Per the standalone-scaffold convention already used by
 * `apps/api/src/modules/callcenter/voice-cti.adapter.ts` and
 * `media-provider.ts`, wiring this to a live HTTP route (auth token
 * issuance, the actual controller) is left to the task that wires the
 * `/api/voice/*` surface; this module only fixes the seam and ships an
 * in-memory test double.
 */

export type RecordingIngestOutcome =
  | { accepted: true; checkpointId: string; deduped: boolean }
  | { accepted: false; code: string; reason: string };

export interface RecordingIngestClient {
  reportSealedSegment(
    segment: SealedRecordingSegment,
  ): Promise<RecordingIngestOutcome>;
  reportFinalization(
    callId: string,
    recordingId: string,
  ): Promise<RecordingIngestOutcome>;
}

/**
 * Deterministic in-process test double. Does not implement any of the
 * evidence-service's verification (checksum readback, continuity, coverage)
 * -- it exists only to exercise the recorder's reporting call sites without
 * a real transport. `VoiceEvidenceService` (apps/api) owns the actual
 * verification logic that a real HTTP-backed client would ultimately call.
 */
export class InMemoryRecordingIngestClient implements RecordingIngestClient {
  readonly reportedSegments: SealedRecordingSegment[] = [];
  readonly finalizedRecordings: Array<{ callId: string; recordingId: string }> =
    [];

  async reportSealedSegment(
    segment: SealedRecordingSegment,
  ): Promise<RecordingIngestOutcome> {
    this.reportedSegments.push(segment);
    return {
      accepted: true,
      checkpointId: `${segment.callId}:${segment.recordingId}:${segment.segmentSequence}`,
      deduped: false,
    };
  }

  async reportFinalization(
    callId: string,
    recordingId: string,
  ): Promise<RecordingIngestOutcome> {
    this.finalizedRecordings.push({ callId, recordingId });
    return {
      accepted: true,
      checkpointId: `${callId}:${recordingId}:final`,
      deduped: false,
    };
  }
}
