import { isDeepStrictEqual } from "node:util";
import {
  ImmutableRecordingManifests,
  type RecordingManifest,
  type RecordingManifestRef,
} from "./immutable-manifest";
import {
  RecordingEvidenceError,
  type RecordingScope,
  type RecorderSegment,
} from "./sealed-recorder";

/** Trusted persisted call-close event plus the complete checkpoint index for
 * this recording. Arrival time of a callback is never the call end offset. */
export interface RecordingClosureLedger {
  resolve(
    credential: string,
    scope: RecordingScope,
  ): Promise<{
    closedEventId: string;
    endedAt: string;
    endMs: number;
    checkpointRefs: readonly RecordingManifestRef[];
  } | null>;
}

/** Creates a new full-call object. Failure leaves every earlier checkpoint
 * intact; no call/order lifecycle or legacy recording callback is invoked. */
export class FinalRecordingManifests {
  constructor(
    private readonly manifests: ImmutableRecordingManifests,
    private readonly ledger: RecordingClosureLedger,
  ) {}

  async seal(
    credential: string,
    scope: RecordingScope,
    segments: readonly RecorderSegment[],
  ) {
    scope = Object.freeze({ ...scope });
    segments = segments.map((segment) => Object.freeze({ ...segment }));
    let closure;
    try {
      closure = structuredClone(await this.ledger.resolve(credential, scope));
    } catch {
      throw new RecordingEvidenceError("Recording closure ledger unavailable");
    }
    if (!closure)
      throw new RecordingEvidenceError("Trusted call closure unavailable");
    const manifest: RecordingManifest = {
      schemaVersion: 1,
      scope,
      segments,
      startMs: 0,
      endMs: closure.endMs,
      finalization: {
        closedEventId: closure.closedEventId,
        endedAt: closure.endedAt,
        checkpointRefs: closure.checkpointRefs,
      },
    };
    await this.verify(manifest);
    return this.manifests.seal(manifest);
  }

  async read(scope: RecordingScope, ref: RecordingManifestRef) {
    const manifest = await this.manifests.read(scope, ref);
    await this.verify(manifest);
    return manifest;
  }

  private async verify(manifest: RecordingManifest) {
    const closure = manifest.finalization;
    if (
      !closure?.closedEventId?.trim() ||
      !Number.isFinite(Date.parse(closure.endedAt)) ||
      manifest.startMs !== 0 ||
      !Number.isSafeInteger(manifest.endMs) ||
      manifest.endMs <= 0 ||
      !manifest.segments.some(
        (segment) =>
          segment.endMs === manifest.endMs &&
          Date.parse(segment.utcEnd) === Date.parse(closure.endedAt),
      )
    ) {
      throw new RecordingEvidenceError("Invalid full-call closure coverage");
    }
    for (const ref of closure.checkpointRefs) {
      const checkpoint = await this.manifests.read(manifest.scope, ref);
      if (
        checkpoint.finalization ||
        checkpoint.endMs > manifest.endMs ||
        !checkpoint.segments.every((segment) =>
          manifest.segments.some((candidate) =>
            isDeepStrictEqual(segment, candidate),
          ),
        )
      ) {
        throw new RecordingEvidenceError(
          "Final recording changed checkpoint segments",
        );
      }
    }
  }
}
