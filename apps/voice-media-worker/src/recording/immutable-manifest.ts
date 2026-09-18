import {
  assertBidirectionalCoverage,
  recordingChecksum,
  RecordingEvidenceError,
  verifyRecordedObject,
  type RecorderObjectStore,
  type RecorderSegment,
  type RecordingScope,
} from "./sealed-recorder";
import {
  assertConfirmationCoverage,
  type RecordedConfirmationReceipt,
} from "./confirmation-coverage";

export interface RecordingManifest {
  schemaVersion: 1;
  scope: RecordingScope;
  startMs: number;
  endMs: number;
  segments: readonly RecorderSegment[];
  /** Present only after resolving the receipt through a trusted event ledger. */
  confirmationReceipt?: RecordedConfirmationReceipt;
  finalization?: {
    closedEventId: string;
    endedAt: string;
    checkpointRefs: readonly RecordingManifestRef[];
  };
}

export interface RecordingManifestRef {
  objectKey: string;
  objectVersion: string;
  checksum: string;
  byteLength: number;
  durableAt: string;
}

/** This is an object-storage primitive, not a checkpoint authorization gate.
 * The evidence service must separately bind trusted playback/confirmation
 * receipts and atomically append the reference to its checkpoint journal.
 * Storing a manifest never changes call endedAt or order recording state.
 */
export class ImmutableRecordingManifests {
  constructor(private readonly store: RecorderObjectStore) {}

  async seal(
    input: RecordingManifest,
  ): Promise<Readonly<RecordingManifestRef>> {
    const manifest = snapshot(input);
    await this.verify(manifest);
    const bytes = Buffer.from(JSON.stringify(manifest), "utf8");
    const integrity = {
      checksum: recordingChecksum(bytes),
      byteLength: bytes.byteLength,
    };
    const stored = await this.store.putImmutable(manifest.scope, bytes);
    if (
      !stored.objectKey?.trim() ||
      !stored.objectVersion?.trim() ||
      !Number.isFinite(Date.parse(stored.durableAt)) ||
      manifest.segments.some(
        (segment) =>
          Date.parse(segment.durableAt) > Date.parse(stored.durableAt),
      )
    ) {
      throw new RecordingEvidenceError("Invalid manifest durability metadata");
    }
    const ref = Object.freeze({ ...stored, ...integrity });
    await this.read(manifest.scope, ref);
    return ref;
  }

  /** Every retrieval checks both the manifest and its referenced audio objects.
   * A formerly readable manifest cannot make missing/corrupt audio pass a gate.
   */
  async read(
    scope: RecordingScope,
    ref: RecordingManifestRef,
  ): Promise<Readonly<RecordingManifest>> {
    scope = Object.freeze({ ...scope });
    ref = Object.freeze({ ...ref });
    try {
      if (
        !ref.objectKey?.trim() ||
        !ref.objectVersion?.trim() ||
        !Number.isSafeInteger(ref.byteLength) ||
        ref.byteLength <= 0 ||
        !/^[a-f0-9]{64}$/.test(ref.checksum) ||
        !Number.isFinite(Date.parse(ref.durableAt))
      )
        throw new RecordingEvidenceError("Invalid manifest reference");
      const object = await this.store.readVersion(
        scope,
        ref.objectKey,
        ref.objectVersion,
      );
      if (
        object.objectVersion !== ref.objectVersion ||
        object.bytes.byteLength !== ref.byteLength ||
        recordingChecksum(object.bytes) !== ref.checksum
      )
        throw new RecordingEvidenceError("Manifest integrity mismatch");
      const manifest = snapshot(
        JSON.parse(Buffer.from(object.bytes).toString("utf8")),
      );
      for (const key of [
        "brandId",
        "callId",
        "recordingId",
        "legId",
      ] as const) {
        if (manifest.scope[key] !== scope[key])
          throw new RecordingEvidenceError("Manifest scope mismatch");
      }
      if (
        manifest.segments.some(
          (segment) =>
            Date.parse(segment.durableAt) > Date.parse(ref.durableAt),
        )
      )
        throw new RecordingEvidenceError(
          "Invalid manifest durability metadata",
        );
      await this.verify(manifest);
      return manifest;
    } catch (error) {
      if (error instanceof RecordingEvidenceError) throw error;
      throw new RecordingEvidenceError("Recording manifest unreadable");
    }
  }

  private async verify(manifest: RecordingManifest): Promise<void> {
    if (manifest.schemaVersion !== 1)
      throw new RecordingEvidenceError("Unsupported manifest schema");
    assertBidirectionalCoverage(
      manifest.scope,
      manifest.segments,
      manifest.startMs,
      manifest.endMs,
    );
    for (const segment of manifest.segments)
      await verifyRecordedObject(this.store, manifest.scope, segment);
    if (manifest.confirmationReceipt) {
      assertConfirmationCoverage(
        manifest,
        manifest.confirmationReceipt,
        manifest.confirmationReceipt,
      );
    }
  }
}

function snapshot(input: RecordingManifest): Readonly<RecordingManifest> {
  return Object.freeze({
    schemaVersion: input.schemaVersion,
    scope: Object.freeze({ ...input.scope }),
    startMs: input.startMs,
    endMs: input.endMs,
    segments: Object.freeze(
      input.segments.map((segment) => Object.freeze({ ...segment })),
    ),
    ...(input.finalization
      ? {
          finalization: Object.freeze({
            ...input.finalization,
            checkpointRefs: Object.freeze(
              input.finalization.checkpointRefs.map((ref) =>
                Object.freeze({ ...ref }),
              ),
            ),
          }),
        }
      : {}),
    ...(input.confirmationReceipt
      ? {
          confirmationReceipt: freezeReceipt(input.confirmationReceipt),
        }
      : {}),
  });
}

function freezeReceipt(
  input: RecordedConfirmationReceipt,
): RecordedConfirmationReceipt {
  return Object.freeze({
    ...input,
    scope: Object.freeze({ ...input.scope }),
    disclosure: Object.freeze({ ...input.disclosure }),
    corrections: Object.freeze(
      input.corrections.map((window) => Object.freeze({ ...window })),
    ),
    readback: Object.freeze({ ...input.readback }),
    confirmation: Object.freeze(
      input.confirmation.method === "speech"
        ? {
            ...input.confirmation,
            affirmation: Object.freeze({ ...input.confirmation.affirmation }),
          }
        : { ...input.confirmation },
    ),
  });
}
