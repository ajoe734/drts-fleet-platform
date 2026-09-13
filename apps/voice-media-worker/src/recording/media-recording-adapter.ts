import {
  ImmutableRecordingManifests,
  type RecordingManifestRef,
} from "./immutable-manifest";
import {
  FinalRecordingManifests,
  type RecordingClosureLedger,
} from "./final-manifest";
import {
  RecordingEvidenceError,
  type RecorderObjectStore,
  type RecorderSegment,
  type RecordingScope,
} from "./sealed-recorder";

export interface MediaRecordingFinalizationRequest {
  credential: string;
  scope: RecordingScope;
  segments: readonly RecorderSegment[];
  closureLedger: RecordingClosureLedger;
}

export interface MediaRecordingFinalizationResponse {
  manifestRef: RecordingManifestRef;
  scope: RecordingScope;
  endMs: number;
  closedEventId: string;
  endedAt: string;
}

/**
 * Media domain adapter coordinating FinalRecordingManifests,
 * ImmutableRecordingManifests, and trusted closure ledger resolution.
 *
 * Implements consensus-packet.md §B6:
 * - External sealing is reentrant and reference is fixed
 * - Checkpoint segments and full-call closure coverage are strictly verified
 * - Sealing failures leave earlier checkpoints and audio intact
 */
export class MediaRecordingAdapter {
  private readonly manifests: ImmutableRecordingManifests;
  private readonly finalManifests: FinalRecordingManifests;
  private readonly sealedManifestCache = new Map<
    string,
    RecordingManifestRef
  >();

  constructor(
    private readonly store: RecorderObjectStore,
    ledger: RecordingClosureLedger,
  ) {
    this.manifests = new ImmutableRecordingManifests(store);
    this.finalManifests = new FinalRecordingManifests(this.manifests, ledger);
  }

  /**
   * Seals a final recording manifest with verified closure and coverage.
   * Reentrant: duplicate calls for the same scope and closure return the same fixed manifest ref.
   */
  async sealFinalRecording(
    request: MediaRecordingFinalizationRequest,
  ): Promise<MediaRecordingFinalizationResponse> {
    const { credential, scope, segments, closureLedger } = request;

    const closure = await closureLedger.resolve(credential, scope);
    if (!closure) {
      throw new RecordingEvidenceError("Trusted call closure unavailable");
    }

    const cacheKey = `${scope.brandId}:${scope.callId}:${scope.recordingId}:${closure.closedEventId}`;
    const cachedRef = this.sealedManifestCache.get(cacheKey);
    if (cachedRef) {
      // Reentrant retrieval: verify the cached manifest is still readable and valid
      try {
        const existing = await this.finalManifests.read(scope, cachedRef);
        return {
          manifestRef: cachedRef,
          scope,
          endMs: existing.endMs,
          closedEventId: closure.closedEventId,
          endedAt: closure.endedAt,
        };
      } catch {
        this.sealedManifestCache.delete(cacheKey);
      }
    }

    // Seal final manifest via FinalRecordingManifests
    const finalManifests = new FinalRecordingManifests(
      this.manifests,
      closureLedger,
    );
    const manifestRef = await finalManifests.seal(credential, scope, segments);

    this.sealedManifestCache.set(cacheKey, manifestRef);

    return {
      manifestRef,
      scope,
      endMs: closure.endMs,
      closedEventId: closure.closedEventId,
      endedAt: closure.endedAt,
    };
  }

  /**
   * Reads and verifies an existing final recording manifest.
   */
  async readFinalRecording(scope: RecordingScope, ref: RecordingManifestRef) {
    return this.finalManifests.read(scope, ref);
  }
}
