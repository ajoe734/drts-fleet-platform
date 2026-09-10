import { Injectable, Optional } from "@nestjs/common";
import { DatabaseService } from "../../common/db";
import type {
  VoiceQueryExecutor,
  VoiceRecordingCheckpointRecord,
} from "./voice-booking.repository";

/** Internal evidence-owner input, never a controller DTO. The evidence service
 * must authenticate the recorder and read back the manifest/audio before append.
 * This repository provides persistence, not recording verification or a gate.
 */
export type VerifiedCheckpointAppend = {
  callId: string;
  recordingId: string;
  manifestVersion: number;
  manifest: Record<string, unknown>;
  manifestHash: string;
  coverage: Record<string, unknown>;
  policyVersion: string;
};

export class CheckpointJournalError extends Error {
  readonly code = "VOICE_RECORDING_NOT_DURABLE";
}

type CheckpointRow = {
  checkpoint_id: string;
  call_id: string;
  recording_id: string;
  manifest_version: number;
  manifest: unknown;
  manifest_hash: string;
  coverage: unknown;
  policy_version: string;
  verified_at: Date | string;
};

/** V0086 enforces append-only rows and uniqueness by call/recording/version.
 * No UPDATE, DELETE, call endedAt, order state, or session state writes occur.
 * A caller may provide its transaction executor to compose with a fenced UoW.
 */
@Injectable()
export class VoiceCheckpointRepository {
  constructor(@Optional() private readonly database?: DatabaseService) {}

  async appendVerified(
    input: VerifiedCheckpointAppend,
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceRecordingCheckpointRecord> {
    // Serialize before the first await, including nested caller-owned objects.
    const values = serialize(input);
    const exec = executor ?? this.database;
    if (!exec || (!executor && !this.database?.isEnabled())) {
      throw new CheckpointJournalError("Checkpoint database unavailable");
    }
    const inserted = await exec.query<CheckpointRow>(
      `INSERT INTO voice.recording_checkpoint
        (call_id, recording_id, manifest_version, manifest, manifest_hash,
         coverage, policy_version, verified_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, clock_timestamp())
       ON CONFLICT DO NOTHING
       RETURNING *`,
      values,
    );
    let row = inserted.rows[0];
    if (!row) {
      // Separate statement gives READ COMMITTED retries a fresh snapshot after
      // a concurrent insert wins. JSONB equality ignores object key ordering.
      // Never rewrite verified_at or accept different evidence for this version.
      const existing = await exec.query<CheckpointRow>(
        `SELECT * FROM voice.recording_checkpoint
         WHERE call_id = $1 AND recording_id = $2 AND manifest_version = $3
           AND manifest = $4::jsonb AND manifest_hash = $5
           AND coverage = $6::jsonb AND policy_version = $7
           AND verified_at IS NOT NULL`,
        values,
      );
      row = existing.rows[0];
    }
    if (!row) {
      throw new CheckpointJournalError("Checkpoint version conflict");
    }
    return {
      checkpointId: row.checkpoint_id,
      callId: row.call_id,
      recordingId: row.recording_id,
      manifestVersion: row.manifest_version,
      manifest: row.manifest,
      manifestHash: row.manifest_hash,
      coverage: row.coverage,
      policyVersion: row.policy_version,
      verifiedAt: new Date(row.verified_at).toISOString(),
    };
  }
}

function serialize(input: VerifiedCheckpointAppend): readonly unknown[] {
  if (
    !input.callId?.trim() ||
    !input.recordingId?.trim() ||
    !input.policyVersion?.trim() ||
    input.callId.length > 100 ||
    input.recordingId.length > 100 ||
    input.policyVersion.length > 60 ||
    !Number.isSafeInteger(input.manifestVersion) ||
    input.manifestVersion < 1 ||
    input.manifestVersion > 2147483647 ||
    !/^[a-f0-9]{64}$/.test(input.manifestHash)
  ) {
    throw new CheckpointJournalError("Invalid checkpoint identity");
  }
  try {
    const objectJson = (value: Record<string, unknown>): string => {
      const json = JSON.stringify(value);
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected evidence object");
      }
      return json;
    };
    return Object.freeze([
      input.callId,
      input.recordingId,
      input.manifestVersion,
      objectJson(input.manifest),
      input.manifestHash,
      objectJson(input.coverage),
      input.policyVersion,
    ]);
  } catch {
    throw new CheckpointJournalError("Invalid checkpoint evidence JSON");
  }
}
