import {
  assertConfirmationCoverage,
  type ConfirmationBinding,
  type RecordedConfirmationReceipt,
} from "./confirmation-coverage";
import {
  ImmutableRecordingManifests,
  type RecordingManifest,
  type RecordingManifestRef,
} from "./immutable-manifest";
import { RecordingEvidenceError } from "./sealed-recorder";

/** Authorizes the caller and resolves pinned disclosure/corrections/playback and
 * confirmation from persisted authenticated events. Never accepts a receipt
 * supplied by the caller. Missing provider playback/order evidence returns null.
 */
export interface RecordingConfirmationLedger {
  resolve(
    credential: string,
    binding: ConfirmationBinding,
  ): Promise<RecordedConfirmationReceipt | null>;
}

/** Stores proof inside the checksummed immutable manifest. This remains below
 * the API checkpoint journal: sealing alone must never open the booking gate.
 */
export class ConfirmedRecordingManifests {
  constructor(
    private readonly manifests: ImmutableRecordingManifests,
    private readonly ledger: RecordingConfirmationLedger,
  ) {}

  async seal(
    credential: string,
    input: Omit<RecordingManifest, "confirmationReceipt">,
    binding: ConfirmationBinding,
  ): Promise<Readonly<RecordingManifestRef>> {
    binding = snapshotBinding(binding);
    const manifest: RecordingManifest = {
      schemaVersion: input.schemaVersion,
      scope: { ...input.scope },
      startMs: input.startMs,
      endMs: input.endMs,
      segments: input.segments.map((segment) => ({ ...segment })),
    };
    let receipt: RecordedConfirmationReceipt | null;
    try {
      receipt = await this.ledger.resolve(credential, binding);
    } catch {
      throw new RecordingEvidenceError(
        "Trusted confirmation ledger unavailable",
      );
    }
    assertConfirmationCoverage(manifest, receipt, binding);
    if (!receipt)
      throw new RecordingEvidenceError("Missing trusted confirmation receipt");
    return this.manifests.seal({ ...manifest, confirmationReceipt: receipt });
  }

  async read(
    binding: ConfirmationBinding,
    ref: RecordingManifestRef,
  ): Promise<Readonly<RecordingManifest>> {
    binding = snapshotBinding(binding);
    const manifest = await this.manifests.read(binding.scope, ref);
    assertConfirmationCoverage(
      manifest,
      manifest.confirmationReceipt ?? null,
      binding,
    );
    return manifest;
  }
}

function snapshotBinding(binding: ConfirmationBinding): ConfirmationBinding {
  return Object.freeze({
    ...binding,
    scope: Object.freeze({ ...binding.scope }),
  });
}
