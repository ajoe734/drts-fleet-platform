import { describe, it, expect } from "vitest";
import { ObjectStoreRecorderObjectStore } from "../../../apps/voice-media-worker/src/recording/object-store-recorder";
import type {
  ObjectStoreClient,
  ObjectStoreGetResult,
  ObjectStorePutResult,
} from "../../../apps/voice-media-worker/src/recording/object-store-client";
import {
  SealedRecorder,
  verifyRecordedObject,
  RecordingEvidenceError,
  type RecorderIngress,
  type RecorderSegment,
  type RecordingScope,
} from "../../../apps/voice-media-worker/src/recording/sealed-recorder";
import { ImmutableRecordingManifests } from "../../../apps/voice-media-worker/src/recording/immutable-manifest";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: `RecorderObjectStore` has no
 * production implementation in this worker -- no `@aws-sdk/client-s3` (or
 * any storage SDK) dependency exists in `apps/voice-media-worker/package.json`
 * today, and adding one is a dependency-manifest/lockfile change outside
 * this task's `write_scopes` (see docs/04-uat/audit-voice-application-wiring-20261003.md).
 * That dependency gap is a reason this worker cannot yet construct a *real*
 * backend-connected `ObjectStoreClient` -- it is not a reason the
 * `RecorderObjectStore` adapter sitting on top of that seam has to stay
 * unimplemented. This file proves `ObjectStoreRecorderObjectStore` is a
 * real, correct implementation of that contract by running it through the
 * actual, already-shipped `SealedRecorder`/`verifyRecordedObject`/
 * `ImmutableRecordingManifests` production functions -- only the backend
 * client itself (the genuinely external boundary) is a test double.
 */

class InMemoryObjectStoreClient implements ObjectStoreClient {
  private readonly objects = new Map<
    string,
    { body: Uint8Array; metadata: Record<string, string>; storedAt: string }
  >();
  private versionCounter = 0;

  async putObjectVersion(
    key: string,
    bytes: Uint8Array,
    metadata: Readonly<Record<string, string>>,
  ): Promise<ObjectStorePutResult> {
    this.versionCounter += 1;
    const versionId = `v${this.versionCounter}`;
    const storedAt = new Date(2026, 0, 1, 0, 0, this.versionCounter).toISOString();
    this.objects.set(`${key}#${versionId}`, {
      body: Uint8Array.from(bytes),
      metadata: { ...metadata },
      storedAt,
    });
    return { versionId, storedAt };
  }

  async getObjectVersion(
    key: string,
    versionId: string,
  ): Promise<ObjectStoreGetResult> {
    const stored = this.objects.get(`${key}#${versionId}`);
    if (!stored) throw new Error("object version not found");
    return {
      body: Uint8Array.from(stored.body),
      versionId,
      storedAt: stored.storedAt,
      metadata: stored.metadata,
    };
  }

  /** Test-only: simulates the stored bytes being corrupted/tampered with
   * after the original write, independent of this adapter's own code. */
  corrupt(key: string, versionId: string): void {
    const stored = this.objects.get(`${key}#${versionId}`);
    if (!stored) throw new Error("object version not found");
    stored.body = new TextEncoder().encode("tampered-bytes-not-the-original-audio");
  }
}

class FixedChannelIngress implements RecorderIngress {
  async authorize(): Promise<{
    source: "recording_fork";
    channels: readonly ("inbound" | "outbound")[];
  }> {
    return { source: "recording_fork", channels: ["inbound", "outbound"] };
  }
}

const SCOPE: RecordingScope = {
  brandId: "brand-1",
  callId: "call-1",
  recordingId: "rec-1",
  legId: "leg-1",
};

function audioBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`audio-bytes:${label}`);
}

describe("AUDIT-VOICE-APPLICATION-WIRING-20261003: ObjectStoreRecorderObjectStore", () => {
  it("round-trips a sealed recording segment through the real SealedRecorder/verifyRecordedObject path", async () => {
    const client = new InMemoryObjectStoreClient();
    const store = new ObjectStoreRecorderObjectStore(client);
    const recorder = new SealedRecorder(new FixedChannelIngress(), store);

    const segment = await recorder.seal("cred", {
      ...SCOPE,
      channel: "inbound",
      startMs: 0,
      endMs: 1_000,
      utcStart: "2026-01-01T00:00:00.000Z",
      utcEnd: "2026-01-01T00:00:01.000Z",
      bytes: audioBytes("inbound-1"),
    });

    expect(segment.objectKey).toContain("brand-1/call-1/rec-1/leg-1/segment/");
    expect(segment.objectVersion).toBe("v1");
    expect(segment.byteLength).toBe(audioBytes("inbound-1").byteLength);

    // Independently re-verify through the real production function -- not
    // just trusting that `seal()` internally called it once.
    await expect(
      verifyRecordedObject(store, SCOPE, segment),
    ).resolves.toBeUndefined();
  });

  it("rejects a segment whose stored bytes were tampered with after the original write", async () => {
    const client = new InMemoryObjectStoreClient();
    const store = new ObjectStoreRecorderObjectStore(client);
    const recorder = new SealedRecorder(new FixedChannelIngress(), store);

    const segment = await recorder.seal("cred", {
      ...SCOPE,
      channel: "outbound",
      startMs: 0,
      endMs: 500,
      utcStart: "2026-01-01T00:00:00.000Z",
      utcEnd: "2026-01-01T00:00:00.500Z",
      bytes: audioBytes("outbound-1"),
    });

    client.corrupt(segment.objectKey, segment.objectVersion);

    await expect(
      verifyRecordedObject(store, SCOPE, segment),
    ).rejects.toBeInstanceOf(RecordingEvidenceError);
  });

  it("round-trips a full-call manifest via the real ImmutableRecordingManifests, with no recorder-segment metadata on the manifest object itself", async () => {
    const client = new InMemoryObjectStoreClient();
    const store = new ObjectStoreRecorderObjectStore(client);
    const recorder = new SealedRecorder(new FixedChannelIngress(), store);

    const inbound = await recorder.seal("cred", {
      ...SCOPE,
      channel: "inbound",
      startMs: 0,
      endMs: 1_000,
      utcStart: "2026-01-01T00:00:00.000Z",
      utcEnd: "2026-01-01T00:00:01.000Z",
      bytes: audioBytes("inbound-full"),
    });
    const outbound = await recorder.seal("cred", {
      ...SCOPE,
      channel: "outbound",
      startMs: 0,
      endMs: 1_000,
      utcStart: "2026-01-01T00:00:00.000Z",
      utcEnd: "2026-01-01T00:00:01.000Z",
      bytes: audioBytes("outbound-full"),
    });

    const manifests = new ImmutableRecordingManifests(store);
    const segments: readonly RecorderSegment[] = [inbound, outbound];
    const ref = await manifests.seal({
      schemaVersion: 1,
      scope: SCOPE,
      startMs: 0,
      endMs: 1_000,
      segments,
    });

    const read = await manifests.read(SCOPE, ref);
    expect(read.segments).toHaveLength(2);
    expect(read.scope).toEqual(SCOPE);

    // The manifest JSON object itself was written via `putImmutable`, which
    // carries no segment-shaped metadata headers -- `readVersion` must
    // honestly report that as "no recorder metadata" rather than
    // fabricating one, exactly like a non-segment object would.
    const rawManifestRead = await store.readVersion(SCOPE, ref.objectKey, ref.objectVersion);
    expect(rawManifestRead.recordingMetadata).toBeUndefined();
  });
});
