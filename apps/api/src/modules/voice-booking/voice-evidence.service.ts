import { Inject, Injectable, Optional } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";
import { VoiceBookingRepository } from "./voice-booking.repository";
import {
  CheckpointJournalError,
  VoiceCheckpointRepository,
} from "./voice-checkpoint.repository";

export interface EvidenceBinding {
  scope: {
    brandId: string;
    callId: string;
    recordingId: string;
    legId: string;
  };
  snapshotHash: string;
  readbackPlaybackId: string;
  mediaEpoch: number;
}

export interface EvidenceManifestRef {
  objectKey: string;
  objectVersion: string;
  checksum: string;
  byteLength: number;
  durableAt: string;
}

export const VOICE_EVIDENCE_ACCESS = Symbol("VOICE_EVIDENCE_ACCESS");
export const VOICE_EVIDENCE_READER = Symbol("VOICE_EVIDENCE_READER");

/** Deployment adapter authenticates the recorder principal and resolves pinned
 * call/brand/leg, confirmation and retention/access policy from server state.
 * No request body binding or policy is accepted as authority. */
export interface VoiceEvidenceAccess {
  resolve(
    credential: string,
    callId: string,
    recordingId: string,
  ): Promise<{
    binding: EvidenceBinding;
    policyVersion: string;
  } | null>;
}

/** Implemented by ConfirmedRecordingManifests in the recording worker (or its
 * authenticated RPC adapter). readTrusted checks immutable object/audio bytes,
 * bidirectional coverage and the independently persisted confirmation ledger.
 * This is a trusted injected capability, never a boolean from a callback DTO. */
export interface VoiceEvidenceReader {
  readTrusted(
    credential: string,
    binding: EvidenceBinding,
    ref: EvidenceManifestRef,
  ): Promise<{
    startMs: number;
    endMs: number;
    confirmationReceipt?: unknown;
  }>;
}

@Injectable()
export class VoiceEvidenceService {
  constructor(
    private readonly checkpoints: VoiceCheckpointRepository,
    private readonly repository: VoiceBookingRepository,
    @Optional()
    @Inject(VOICE_EVIDENCE_ACCESS)
    private readonly access?: VoiceEvidenceAccess,
    @Optional()
    @Inject(VOICE_EVIDENCE_READER)
    private readonly reader?: VoiceEvidenceReader,
  ) {}

  async checkpoint(
    credential: string,
    request: {
      callId: string;
      recordingId: string;
      manifestVersion: number;
      manifest: EvidenceManifestRef;
    },
  ) {
    const input = structuredClone(request);
    const verified = await this.verify(
      credential,
      input.callId,
      input.recordingId,
      input.manifest,
    );
    return this.checkpoints.appendVerified({
      callId: input.callId,
      recordingId: input.recordingId,
      manifestVersion: input.manifestVersion,
      manifest: { ...input.manifest },
      manifestHash: input.manifest.checksum,
      ...verified,
    });
  }

  /** A non-empty checkpointId or previous success is insufficient: retrieval
   * rechecks storage and current authorization before a new mutation gate. */
  async requireCheckpoint(
    credential: string,
    callId: string,
    checkpointId: string,
  ) {
    const row = await this.repository.findRecordingCheckpointById(checkpointId);
    if (!row || row.callId !== callId || !row.recordingId || !row.verifiedAt) {
      throw new CheckpointJournalError("Verified checkpoint unavailable");
    }
    const ref = row.manifest as EvidenceManifestRef;
    const verified = await this.verify(
      credential,
      callId,
      row.recordingId,
      ref,
    );
    if (
      row.manifestHash !== ref.checksum ||
      row.policyVersion !== verified.policyVersion ||
      !isDeepStrictEqual(row.coverage, verified.coverage)
    ) {
      throw new CheckpointJournalError("Checkpoint binding changed");
    }
    return row;
  }

  private async verify(
    credential: string,
    callId: string,
    recordingId: string,
    ref: EvidenceManifestRef,
  ) {
    try {
      if (!this.access || !this.reader || !credential.trim()) throw new Error();
      const resolved = await this.access.resolve(
        credential,
        callId,
        recordingId,
      );
      if (!resolved) throw new Error();
      const { binding, policyVersion } = structuredClone(resolved);
      if (
        binding.scope.callId !== callId ||
        binding.scope.recordingId !== recordingId ||
        !policyVersion.trim()
      ) {
        throw new Error();
      }
      const manifest = await this.reader.readTrusted(credential, binding, ref);
      if (!manifest.confirmationReceipt) throw new Error();
      return {
        policyVersion,
        coverage: {
          ...binding,
          startMs: manifest.startMs,
          endMs: manifest.endMs,
          confirmationReceipt: structuredClone(manifest.confirmationReceipt),
        },
      };
    } catch {
      throw new CheckpointJournalError(
        "Recording evidence verification failed",
      );
    }
  }
}
