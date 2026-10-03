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
  /** Ignored for trust decisions. `sealFinalRecording` always resolves
   * closure through the ledger injected at construction time, using a fixed
   * internal credential -- never a caller-supplied one. Kept optional only
   * for structural compatibility with existing callers. */
  credential?: string | undefined;
  scope: RecordingScope;
  segments: readonly RecorderSegment[];
  /** Ignored for trust decisions; see `credential`. A caller that supplies
   * its own ledger here cannot substitute a forged closure for the trusted
   * one this adapter was constructed with. */
  closureLedger?: RecordingClosureLedger | undefined;
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
  /** Fixed internal identity used to resolve the trusted ledger. Never
   * derived from a caller-supplied request -- see `sealFinalRecording`. */
  private static readonly TRUSTED_CREDENTIAL =
    "voice-media-worker:trusted-closure-ledger";

  private readonly manifests: ImmutableRecordingManifests;
  private readonly finalManifests: FinalRecordingManifests;
  private readonly sealedManifestCache = new Map<
    string,
    RecordingManifestRef
  >();

  constructor(
    private readonly store: RecorderObjectStore,
    private readonly ledger: RecordingClosureLedger,
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
    const { scope, segments } = request;
    const credential = MediaRecordingAdapter.TRUSTED_CREDENTIAL;

    const closure = await this.ledger.resolve(credential, scope);
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

    // Seal via the trusted ledger bound at construction time -- never a
    // request-supplied one (that was the forgeable seam this closes).
    const manifestRef = await this.finalManifests.seal(
      credential,
      scope,
      segments,
    );

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
