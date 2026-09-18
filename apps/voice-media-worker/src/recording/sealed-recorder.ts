import { createHash } from "node:crypto";

export type RecordingChannel = "inbound" | "outbound";

/** Offsets are recorder media milliseconds, never ASR callback wall time. */
export interface RecorderSegment {
  brandId: string;
  callId: string;
  recordingId: string;
  legId: string;
  channel: RecordingChannel;
  startMs: number;
  endMs: number;
  utcStart: string;
  utcEnd: string;
  objectKey: string;
  objectVersion: string;
  checksum: string;
  byteLength: number;
  durableAt: string;
}

export interface RecordingScope {
  brandId: string;
  callId: string;
  recordingId: string;
  legId: string;
}

export type RecorderObjectMetadata = Readonly<
  RecorderSegment & {
    source: "recording_fork";
  }
>;

/** Implementations must use immutable versions and enforce retention/access policy. */
export interface RecorderObjectStore {
  /** Recorder-only write capability. Atomically persist bytes and authenticated
   * ingest metadata, including the returned object identity and durability time.
   * Generic uploads/manifests/TTS writers must not have this capability. Metadata
   * is immutable per version and read from storage, never echoed from a manifest.
   */
  putRecordingImmutable(
    metadata: Omit<
      RecorderObjectMetadata,
      "objectKey" | "objectVersion" | "durableAt"
    >,
    bytes: Uint8Array,
  ): Promise<{ objectKey: string; objectVersion: string; durableAt: string }>;
  putImmutable(
    scope: RecordingScope,
    bytes: Uint8Array,
  ): Promise<{ objectKey: string; objectVersion: string; durableAt: string }>;
  readVersion(
    scope: RecordingScope,
    objectKey: string,
    objectVersion: string,
  ): Promise<{
    bytes: Uint8Array;
    objectVersion: string;
    recordingMetadata?: RecorderObjectMetadata;
  }>;
}

/** Resolved by an authenticated recording-fork adapter, not webhook body claims. */
export interface RecorderIngress {
  authorize(
    credential: string,
    scope: RecordingScope,
  ): Promise<{
    source: "recording_fork";
    channels: readonly RecordingChannel[];
  }>;
}

export class RecordingEvidenceError extends Error {
  readonly code = "VOICE_RECORDING_NOT_DURABLE";
}

export function recordingChecksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireEvidence(
  condition: boolean,
  reason: string,
): asserts condition {
  if (!condition) throw new RecordingEvidenceError(reason);
}

export function validateSegment(segment: RecorderSegment): void {
  for (const value of [
    segment.brandId,
    segment.callId,
    segment.recordingId,
    segment.legId,
    segment.objectKey,
    segment.objectVersion,
  ]) {
    requireEvidence(
      typeof value === "string" && value.trim().length > 0,
      "Missing segment identity",
    );
  }
  requireEvidence(
    segment.channel === "inbound" || segment.channel === "outbound",
    "Unknown recording channel",
  );
  requireEvidence(
    Number.isSafeInteger(segment.startMs) &&
      segment.startMs >= 0 &&
      Number.isSafeInteger(segment.endMs) &&
      segment.endMs > segment.startMs,
    "Invalid media interval",
  );
  const start = Date.parse(segment.utcStart);
  const end = Date.parse(segment.utcEnd);
  const durable = Date.parse(segment.durableAt);
  requireEvidence(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      Number.isFinite(durable) &&
      end > start &&
      durable >= end,
    "Invalid UTC/durability interval",
  );
  requireEvidence(
    end - start === segment.endMs - segment.startMs,
    "UTC/media interval mismatch",
  );
  requireEvidence(
    Number.isSafeInteger(segment.byteLength) &&
      segment.byteLength > 0 &&
      /^[a-f0-9]{64}$/.test(segment.checksum),
    "Invalid object integrity metadata",
  );
}

export async function verifyRecordedObject(
  store: RecorderObjectStore,
  scope: RecordingScope,
  segment: RecorderSegment,
): Promise<void> {
  // Readback must verify the version requested at entry even if the caller
  // reuses mutable metadata while the object store request is in flight.
  scope = Object.freeze({ ...scope });
  segment = Object.freeze({ ...segment });
  validateSegment(segment);
  for (const key of ["brandId", "callId", "recordingId", "legId"] as const) {
    requireEvidence(scope[key] === segment[key], "Recording scope mismatch");
  }
  try {
    const object = await store.readVersion(
      scope,
      segment.objectKey,
      segment.objectVersion,
    );
    requireEvidence(
      object.objectVersion === segment.objectVersion,
      "Object version mismatch",
    );
    requireEvidence(
      object.bytes.byteLength === segment.byteLength &&
        recordingChecksum(object.bytes) === segment.checksum,
      "Object checksum mismatch",
    );
    const recorded = object.recordingMetadata;
    requireEvidence(
      recorded?.source === "recording_fork",
      "Missing trusted recorder metadata",
    );
    for (const key of [
      "brandId",
      "callId",
      "recordingId",
      "legId",
      "channel",
      "startMs",
      "endMs",
      "utcStart",
      "utcEnd",
      "objectKey",
      "objectVersion",
      "checksum",
      "byteLength",
      "durableAt",
    ] as const) {
      requireEvidence(
        recorded[key] === segment[key],
        "Recorder metadata mismatch",
      );
    }
  } catch (error) {
    if (error instanceof RecordingEvidenceError) throw error;
    // Do not surface object URLs, credentials, or storage-provider error payloads.
    throw new RecordingEvidenceError("Recording object unreadable");
  }
}

/** A recording fork is independent of the bidirectional conversation stream.
 * There is deliberately no TTS/synthesis entry point or inferred outbound track.
 * The store owns immutable writes; this class holds no authoritative memory state.
 */
export class SealedRecorder {
  constructor(
    private readonly ingress: RecorderIngress,
    private readonly store: RecorderObjectStore,
  ) {}

  async seal(
    credential: string,
    input: RecordingScope & {
      channel: RecordingChannel;
      startMs: number;
      endMs: number;
      utcStart: string;
      utcEnd: string;
      bytes: Uint8Array;
    },
  ): Promise<Readonly<RecorderSegment>> {
    // Snapshot before awaiting authentication/storage: caller buffer reuse cannot
    // change the sealed payload or its binding while I/O is outstanding.
    const { bytes: original, ...metadata } = input;
    const bytes = Uint8Array.from(original);
    const scope: RecordingScope = Object.freeze({
      brandId: metadata.brandId,
      callId: metadata.callId,
      recordingId: metadata.recordingId,
      legId: metadata.legId,
    });
    const grant = await this.ingress.authorize(credential, scope);
    requireEvidence(
      grant.source === "recording_fork" &&
        grant.channels.includes(metadata.channel),
      "No authorized recording fork for channel",
    );
    const integrity = {
      checksum: recordingChecksum(bytes),
      byteLength: bytes.byteLength,
    };
    // Validate before PUT. Real durability metadata replaces this temporary value.
    validateSegment({
      ...metadata,
      ...integrity,
      objectKey: "pending",
      objectVersion: "pending",
      durableAt: metadata.utcEnd,
    });
    const stored = await this.store.putRecordingImmutable(
      Object.freeze({ ...metadata, ...integrity, source: "recording_fork" }),
      bytes,
    );
    const segment: RecorderSegment = { ...metadata, ...integrity, ...stored };
    await verifyRecordedObject(this.store, scope, segment);
    return Object.freeze(segment);
  }
}

/** Require exact contiguous coverage on BOTH recorded channels of the same leg.
 * Callers supply conservative windows covering disclosure, corrections, readback
 * and speech affirmation. DTMF event timing is verified separately, never tones.
 */
export function assertBidirectionalCoverage(
  scope: RecordingScope,
  segments: readonly RecorderSegment[],
  startMs: number,
  endMs: number,
): void {
  requireEvidence(
    Number.isSafeInteger(startMs) &&
      startMs >= 0 &&
      Number.isSafeInteger(endMs) &&
      endMs > startMs,
    "Invalid coverage window",
  );
  let utcOrigin: number | undefined;
  for (const segment of segments) {
    validateSegment(segment);
    for (const key of ["brandId", "callId", "recordingId", "legId"] as const) {
      requireEvidence(scope[key] === segment[key], "Recording scope mismatch");
    }
    const origin = Date.parse(segment.utcStart) - segment.startMs;
    requireEvidence(
      utcOrigin === undefined || utcOrigin === origin,
      "Discontinuous UTC mapping",
    );
    utcOrigin = origin;
  }
  for (const channel of ["inbound", "outbound"] as const) {
    const track = segments
      .filter(
        (segment) =>
          segment.channel === channel &&
          segment.endMs > startMs &&
          segment.startMs < endMs,
      )
      .sort((a, b) => a.startMs - b.startMs);
    let cursor = startMs;
    for (const segment of track) {
      requireEvidence(
        segment.startMs <= cursor && segment.endMs > cursor,
        "Recording gap or overlapping segment",
      );
      if (cursor !== startMs)
        requireEvidence(
          segment.startMs === cursor,
          "Overlapping recording segments",
        );
      cursor = segment.endMs;
    }
    requireEvidence(cursor >= endMs, `Missing ${channel} recording coverage`);
  }
}
