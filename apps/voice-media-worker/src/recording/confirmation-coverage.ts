import { type RecordingManifest } from "./immutable-manifest";
import {
  assertBidirectionalCoverage,
  RecordingEvidenceError,
  type RecordingScope,
} from "./sealed-recorder";

export interface EvidenceWindow {
  startMs: number;
  endMs: number;
  timingSource: "provider" | "local_utterance";
  timingPrecision: "exact" | "bounded";
}

/** Read from the authenticated, append-only event ledger. These are not request
 * body claims. Sequence is trusted occurrence order on one call/leg/media epoch,
 * not callback arrival order. Adapters without that evidence must return null.
 */
export interface RecordedConfirmationReceipt {
  scope: RecordingScope;
  snapshotHash: string;
  readbackPlaybackId: string;
  mediaEpoch: number;
  disclosure: EvidenceWindow;
  corrections: readonly EvidenceWindow[];
  readback: EvidenceWindow & {
    completedEventId: string;
    outcome: "completed" | "cleared" | "unknown";
    completionSource: "provider_playback" | "local_send";
    sequence: number;
  };
  confirmation: {
    eventId: string;
    readbackPlaybackId: string;
    snapshotHash: string;
    mediaEpoch: number;
    sequence: number;
  } & (
    | { method: "speech"; affirmation: EvidenceWindow }
    | {
        method: "dtmf";
        digit: string;
        expectedDigit: string;
        timingSource: "provider";
        timingPrecision: "event_order";
      }
  );
}

export interface ConfirmationBinding {
  scope: RecordingScope;
  snapshotHash: string;
  readbackPlaybackId: string;
  mediaEpoch: number;
}

/** Pure coverage validation only. A caller must first retrieve the manifest via
 * ImmutableRecordingManifests.read (including object readback), and obtain the
 * receipt from its trusted ledger. This function does not mint a checkpoint.
 */
export function assertConfirmationCoverage(
  manifest: RecordingManifest,
  receipt: RecordedConfirmationReceipt | null,
  binding: ConfirmationBinding,
): void {
  const require = (condition: boolean, message: string): void => {
    if (!condition) throw new RecordingEvidenceError(message);
  };
  require(receipt !== null, "Missing trusted confirmation receipt");
  if (!receipt) return;
  for (const key of ["brandId", "callId", "recordingId", "legId"] as const) {
    require(Boolean(binding.scope[key]?.trim()) &&
      binding.scope[key] === receipt.scope[key] &&
      binding.scope[key] ===
        manifest.scope[key], "Confirmation scope mismatch");
  }
  const { readback, confirmation } = receipt;
  require(/^[a-f0-9]{64}$/.test(binding.snapshotHash) &&
    receipt.snapshotHash === binding.snapshotHash &&
    confirmation.snapshotHash ===
      binding.snapshotHash, "Confirmation snapshot mismatch");
  require(Boolean(binding.readbackPlaybackId?.trim()) &&
    receipt.readbackPlaybackId === binding.readbackPlaybackId &&
    confirmation.readbackPlaybackId ===
      binding.readbackPlaybackId, "Confirmation playback mismatch");
  require(Number.isSafeInteger(binding.mediaEpoch) &&
    binding.mediaEpoch >= 0 &&
    receipt.mediaEpoch === binding.mediaEpoch &&
    confirmation.mediaEpoch ===
      binding.mediaEpoch, "Confirmation media epoch mismatch");
  require(Boolean(readback.completedEventId?.trim()) &&
    Boolean(confirmation.eventId?.trim()) &&
    readback.completedEventId !== confirmation.eventId &&
    readback.outcome === "completed" &&
    readback.completionSource ===
      "provider_playback", "Readback playback not proven");
  require(Number.isSafeInteger(readback.sequence) &&
    readback.sequence >= 0 &&
    Number.isSafeInteger(confirmation.sequence) &&
    confirmation.sequence > readback.sequence, "Confirmation order not proven");

  const cover = (window: EvidenceWindow): void => {
    require((window.timingSource === "provider" ||
      window.timingSource === "local_utterance") &&
      (window.timingPrecision === "exact" ||
        window.timingPrecision === "bounded") &&
      !(
        window.timingSource === "local_utterance" &&
        window.timingPrecision === "exact"
      ), "Untrusted audio timing precision");
    require(window.startMs >= manifest.startMs &&
      window.endMs <= manifest.endMs, "Audio outside manifest coverage");
    assertBidirectionalCoverage(
      binding.scope,
      manifest.segments,
      window.startMs,
      window.endMs,
    );
  };
  cover(receipt.disclosure);
  cover(readback);
  require(receipt.disclosure.endMs <=
    readback.startMs, "Disclosure after readback");
  for (const correction of receipt.corrections) {
    cover(correction);
    require(correction.endMs <=
      readback.startMs, "Correction invalidated readback");
  }
  if (confirmation.method === "speech") {
    cover(confirmation.affirmation);
    require(confirmation.affirmation.startMs >=
      readback.endMs, "Affirmation before playback completion");
  } else if (confirmation.method === "dtmf") {
    require(/^[0-9*#]$/.test(confirmation.digit) &&
      confirmation.digit === confirmation.expectedDigit &&
      confirmation.timingSource === "provider" &&
      confirmation.timingPrecision ===
        "event_order", "Untrusted DTMF confirmation");
    // No tone offsets are invented: authenticated event order binds this digit
    // to the completed recorded prompt even if the provider does not record tones.
  } else {
    throw new RecordingEvidenceError("Unknown confirmation method");
  }
}
