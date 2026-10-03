import { createHash } from "node:crypto";
import type {
  RecorderObjectStore,
  RecorderObjectMetadata,
  RecordingChannel,
  RecordingScope,
} from "./sealed-recorder";
import type { ObjectStoreClient } from "./object-store-client";

type SegmentMetadataInput = Omit<
  RecorderObjectMetadata,
  "objectKey" | "objectVersion" | "durableAt"
>;

const SEGMENT_METADATA_KEYS = [
  "brandId",
  "callId",
  "recordingId",
  "legId",
  "channel",
  "startMs",
  "endMs",
  "utcStart",
  "utcEnd",
  "checksum",
  "byteLength",
  "source",
] as const;

function encodeSegmentMetadataHeaders(
  metadata: SegmentMetadataInput,
): Record<string, string> {
  return {
    brandId: metadata.brandId,
    callId: metadata.callId,
    recordingId: metadata.recordingId,
    legId: metadata.legId,
    channel: metadata.channel,
    startMs: String(metadata.startMs),
    endMs: String(metadata.endMs),
    utcStart: metadata.utcStart,
    utcEnd: metadata.utcEnd,
    checksum: metadata.checksum,
    byteLength: String(metadata.byteLength),
    source: metadata.source,
  };
}

/** Reconstructs a segment's full recorder metadata purely from the
 * backend's own stored headers plus the caller's requested/confirmed
 * object identity -- never from anything the caller merely claims about
 * the segment's content. Returns `undefined` for an object that was never
 * written by `putRecordingImmutable` (e.g. a manifest from `putImmutable`,
 * which stores no segment headers at all), matching `readVersion`'s
 * optional `recordingMetadata` contract. */
function decodeSegmentMetadataHeaders(
  headers: Readonly<Record<string, string>>,
  resolved: { objectKey: string; objectVersion: string; durableAt: string },
): RecorderObjectMetadata | undefined {
  if (!SEGMENT_METADATA_KEYS.every((key) => typeof headers[key] === "string"))
    return undefined;
  if (headers.source !== "recording_fork") return undefined;
  if (headers.channel !== "inbound" && headers.channel !== "outbound")
    return undefined;
  const startMs = Number(headers.startMs);
  const endMs = Number(headers.endMs);
  const byteLength = Number(headers.byteLength);
  if (
    !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) ||
    !Number.isSafeInteger(byteLength)
  )
    return undefined;
  return {
    brandId: headers.brandId!,
    callId: headers.callId!,
    recordingId: headers.recordingId!,
    legId: headers.legId!,
    channel: headers.channel as RecordingChannel,
    startMs,
    endMs,
    utcStart: headers.utcStart!,
    utcEnd: headers.utcEnd!,
    checksum: headers.checksum!,
    byteLength,
    source: "recording_fork",
    ...resolved,
  };
}

function assertValidKeySegment(segment: string): void {
  if (!segment || segment.includes("/") || segment === "." || segment === "..") {
    throw new Error("Recording object key segment is invalid.");
  }
}

function objectKeyFor(
  scope: RecordingScope,
  kind: "segment" | "manifest",
  discriminator: string,
): string {
  const parts = [
    scope.brandId,
    scope.callId,
    scope.recordingId,
    scope.legId,
    kind,
    discriminator,
  ];
  parts.forEach(assertValidKeySegment);
  return `voice-recording/${parts.join("/")}`;
}

/**
 * `RecorderObjectStore` implemented against the provider-neutral
 * `ObjectStoreClient` seam (see `./object-store-client.ts`'s doc for why no
 * concrete backend is constructed in this worker's production composition
 * today). Segment metadata is carried as object metadata headers alongside
 * the raw audio bytes; `objectKey`/`objectVersion`/`durableAt` are never
 * embedded in those headers -- a write cannot know its own backend-assigned
 * version id before the backend assigns it -- they are reconstructed on
 * read from the actual request parameters and the backend's own confirmed
 * response, never echoed from anything the caller supplied.
 */
export class ObjectStoreRecorderObjectStore implements RecorderObjectStore {
  constructor(private readonly client: ObjectStoreClient) {}

  async putRecordingImmutable(
    metadata: SegmentMetadataInput,
    bytes: Uint8Array,
  ): Promise<{ objectKey: string; objectVersion: string; durableAt: string }> {
    const key = objectKeyFor(
      metadata,
      "segment",
      `${metadata.channel}-${metadata.startMs}-${metadata.endMs}-${metadata.checksum.slice(0, 16)}`,
    );
    const result = await this.client.putObjectVersion(
      key,
      bytes,
      encodeSegmentMetadataHeaders(metadata),
    );
    return {
      objectKey: key,
      objectVersion: result.versionId,
      durableAt: result.storedAt,
    };
  }

  async putImmutable(
    scope: RecordingScope,
    bytes: Uint8Array,
  ): Promise<{ objectKey: string; objectVersion: string; durableAt: string }> {
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const key = objectKeyFor(scope, "manifest", checksum);
    const result = await this.client.putObjectVersion(key, bytes, {});
    return {
      objectKey: key,
      objectVersion: result.versionId,
      durableAt: result.storedAt,
    };
  }

  async readVersion(
    _scope: RecordingScope,
    objectKey: string,
    objectVersion: string,
  ): Promise<{
    bytes: Uint8Array;
    objectVersion: string;
    recordingMetadata?: RecorderObjectMetadata;
  }> {
    const result = await this.client.getObjectVersion(objectKey, objectVersion);
    const recordingMetadata = decodeSegmentMetadataHeaders(result.metadata, {
      objectKey,
      objectVersion: result.versionId,
      durableAt: result.storedAt,
    });
    return {
      bytes: result.body,
      objectVersion: result.versionId,
      ...(recordingMetadata ? { recordingMetadata } : {}),
    };
  }
}
