import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { S3ObjectStoreClient } from "../../../apps/voice-media-worker/src/recording/s3-object-store-client";
import { resolveVoiceRecordingS3StorageConfig } from "../../../apps/voice-media-worker/src/recording/s3-object-store-client.config";
import { ObjectStoreRecorderObjectStore } from "../../../apps/voice-media-worker/src/recording/object-store-recorder";

/**
 * This root-level `tests/unit/` file is typechecked under the repo-root
 * tsconfig, which only depends on `@drts/contracts`/`@drts/control-plane-auth`
 * -- `@aws-sdk/client-s3` is a dependency of `apps/voice-media-worker` alone,
 * so it cannot be imported directly here (TS2307 on a clean install). The
 * mocked client's type is instead derived from `S3ObjectStoreClient`'s own
 * constructor, which is typechecked as part of its own package and already
 * resolves the real `@aws-sdk/client-s3` `S3Client` type there.
 */
type MockedS3Client = NonNullable<
  NonNullable<ConstructorParameters<typeof S3ObjectStoreClient>[1]>["client"]
>;

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4 (Codex reopen round 5/6):
 * `ObjectStoreClient` (`../../../apps/voice-media-worker/src/recording/
 * object-store-client.ts`) now has a real, configured S3 backend --
 * the `@aws-sdk/client-s3` dependency gap is resolved (dependency-gates
 * owner delegated this worker's own addition to this task). Only the
 * actual network transport (`S3Client.send`) is a test double here; every
 * checksum/version/readback/tamper check in `S3ObjectStoreClient` itself
 * runs for real, and `ObjectStoreRecorderObjectStore` is run on top of it
 * unmodified to prove the full recorder-facing contract holds end to end.
 */

const config = {
  providerName: "test-s3",
  bucket: "voice-recording-test",
  region: "ap-northeast-1",
  endpoint: "https://s3.example.test/",
  forcePathStyle: true,
};

function bodyStream(bytes: Uint8Array): Readable {
  return Readable.from([Buffer.from(bytes)]);
}

describe("S3ObjectStoreClient", () => {
  it("puts an object, verifies it by immediate readback, and returns the backend-assigned version/timestamp", async () => {
    const bytes = new TextEncoder().encode("segment bytes");
    const storedAt = new Date("2026-07-24T09:00:00.000Z");
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "PutObjectCommand") {
        return { VersionId: "v1" };
      }
      return {
        VersionId: "v1",
        LastModified: storedAt,
        Metadata: { channel: "inbound" },
        Body: bodyStream(bytes),
      };
    });
    const client = new S3ObjectStoreClient(config, {
      client: { send } as unknown as MockedS3Client,
    });

    const result = await client.putObjectVersion("voice-recording/key", bytes, {
      channel: "inbound",
    });

    expect(result).toEqual({ versionId: "v1", storedAt: storedAt.toISOString() });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the backend does not return a VersionId (bucket versioning not enabled)", async () => {
    const send = vi.fn(async () => ({}));
    const client = new S3ObjectStoreClient(config, {
      client: { send } as unknown as MockedS3Client,
    });

    await expect(
      client.putObjectVersion("voice-recording/key", new Uint8Array([1]), {}),
    ).rejects.toThrow(/VersionId/);
  });

  it("fails closed when the readback bytes do not match what was just written (tamper/corruption detection)", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "PutObjectCommand") {
        return { VersionId: "v1" };
      }
      return {
        VersionId: "v1",
        LastModified: new Date(),
        Metadata: {},
        Body: bodyStream(new TextEncoder().encode("corrupted")),
      };
    });
    const client = new S3ObjectStoreClient(config, {
      client: { send } as unknown as MockedS3Client,
    });

    await expect(
      client.putObjectVersion(
        "voice-recording/key",
        new TextEncoder().encode("original"),
        {},
      ),
    ).rejects.toThrow(/did not match/);
  });

  it("fails closed when a get returns a different version than requested", async () => {
    const send = vi.fn(async () => ({
      VersionId: "v-other",
      LastModified: new Date(),
      Metadata: {},
      Body: bodyStream(new Uint8Array([1])),
    }));
    const client = new S3ObjectStoreClient(config, {
      client: { send } as unknown as MockedS3Client,
    });

    await expect(client.getObjectVersion("key", "v1")).rejects.toThrow(
      /expected 'v1'/,
    );
  });

  it("round-trips real recorder segments through ObjectStoreRecorderObjectStore on top of the S3 client, with real S3 lowercase-metadata-key transport", async () => {
    const store = new Map<
      string,
      { body: Uint8Array; metadata: Record<string, string>; storedAt: Date }
    >();
    let versionCounter = 0;
    const send = vi.fn(
      async (command: {
        constructor: { name: string };
        input: Record<string, unknown>;
      }) => {
        if (command.constructor.name === "PutObjectCommand") {
          versionCounter += 1;
          const versionId = `v${versionCounter}`;
          const bytes = command.input.Body as Buffer;
          // Real S3 lowercases user-defined metadata keys on write (see
          // https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html).
          // Reproduce that here instead of echoing the camelCase keys
          // this adapter sent, which would hide R8's defect.
          const sentMetadata =
            (command.input.Metadata as Record<string, string>) ?? {};
          const lowercasedMetadata: Record<string, string> = {};
          for (const [key, value] of Object.entries(sentMetadata)) {
            lowercasedMetadata[key.toLowerCase()] = value;
          }
          store.set(`${command.input.Key as string}#${versionId}`, {
            body: new Uint8Array(bytes),
            metadata: lowercasedMetadata,
            storedAt: new Date(),
          });
          return { VersionId: versionId };
        }
        const key = `${command.input.Key as string}#${command.input.VersionId as string}`;
        const entry = store.get(key);
        if (!entry) throw new Error("NoSuchVersion");
        return {
          VersionId: command.input.VersionId,
          LastModified: entry.storedAt,
          Metadata: entry.metadata,
          Body: bodyStream(entry.body),
        };
      },
    );
    const client = new S3ObjectStoreClient(config, {
      client: { send } as unknown as MockedS3Client,
    });
    const recorder = new ObjectStoreRecorderObjectStore(client);

    const bytes = new TextEncoder().encode("recorded-audio-bytes");
    const scope = {
      brandId: "brand-1",
      callId: "call-1",
      recordingId: "rec-1",
      legId: "leg-1",
    };
    const written = await recorder.putRecordingImmutable(
      {
        ...scope,
        channel: "inbound" as const,
        startMs: 0,
        endMs: 1000,
        utcStart: "2026-07-24T09:00:00.000Z",
        utcEnd: "2026-07-24T09:00:01.000Z",
        checksum: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.length,
        source: "recording_fork" as const,
      },
      bytes,
    );

    const read = await recorder.readVersion(
      scope,
      written.objectKey,
      written.objectVersion,
    );

    expect(Buffer.from(read.bytes)).toEqual(Buffer.from(bytes));
    // R8 regression: with real S3 lowercase-key transport, the camelCase
    // headers this adapter wrote (brandId, callId, startMs, ...) must still
    // be recognized on read -- not silently dropped into `undefined`.
    expect(read.recordingMetadata).toEqual({
      ...scope,
      channel: "inbound",
      startMs: 0,
      endMs: 1000,
      utcStart: "2026-07-24T09:00:00.000Z",
      utcEnd: "2026-07-24T09:00:01.000Z",
      checksum: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
      source: "recording_fork",
      objectKey: written.objectKey,
      objectVersion: written.objectVersion,
      durableAt: written.durableAt,
    });
  });

  it("rejects a mutable VersionId='null' write as not actually versioned (versioning-suspended bucket)", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "PutObjectCommand") {
        // A versioning-suspended (or never-enabled) bucket returns the
        // literal string "null" for every put to a given key -- truthy,
        // but not a distinct immutable version.
        return { VersionId: "null" };
      }
      return {
        VersionId: "null",
        LastModified: new Date(),
        Metadata: {},
        Body: bodyStream(new Uint8Array([1])),
      };
    });
    const client = new S3ObjectStoreClient(config, {
      client: { send } as unknown as MockedS3Client,
    });

    await expect(
      client.putObjectVersion("voice-recording/key", new Uint8Array([1]), {}),
    ).rejects.toThrow(/versioned VersionId/);
  });

  it("rejects a same-key overwrite under versioning-suspended semantics: the first write's (key, 'null') identity must not be readable as immutable evidence", async () => {
    // Simulates a bucket where versioning was suspended (or never enabled)
    // AFTER some code path already captured a 'null' version id from an
    // earlier, pre-fix build -- a stale/forged reference, not something
    // this adapter's own (now fail-closed) putObjectVersion can produce.
    const send = vi.fn(async () => ({
      VersionId: "null",
      LastModified: new Date(),
      Metadata: {},
      Body: bodyStream(new Uint8Array([1])),
    }));
    const client = new S3ObjectStoreClient(config, {
      client: { send } as unknown as MockedS3Client,
    });

    await expect(client.getObjectVersion("key", "null")).rejects.toThrow(
      /unversioned identity 'null'/,
    );
  });

  describe("resolveVoiceRecordingS3StorageConfig", () => {
    it("returns null when the provider is unset (opt-in, fail-closed-safe default)", () => {
      expect(resolveVoiceRecordingS3StorageConfig({})).toBeNull();
    });

    it("returns null when explicitly disabled", () => {
      expect(
        resolveVoiceRecordingS3StorageConfig({
          VOICE_RECORDING_OBJECT_STORE_PROVIDER: "disabled",
        }),
      ).toBeNull();
    });

    it("rejects an unknown provider value", () => {
      expect(() =>
        resolveVoiceRecordingS3StorageConfig({
          VOICE_RECORDING_OBJECT_STORE_PROVIDER: "gcs",
        }),
      ).toThrow(/must be s3, s3-compatible, or disabled/);
    });

    it("requires bucket and region when s3 is selected", () => {
      expect(() =>
        resolveVoiceRecordingS3StorageConfig({
          VOICE_RECORDING_OBJECT_STORE_PROVIDER: "s3",
        }),
      ).toThrow(/VOICE_RECORDING_S3_BUCKET/);
    });

    it("resolves a complete config including credentials when every field is present", () => {
      const config = resolveVoiceRecordingS3StorageConfig({
        VOICE_RECORDING_OBJECT_STORE_PROVIDER: "s3",
        VOICE_RECORDING_S3_BUCKET: "voice-recordings",
        VOICE_RECORDING_S3_REGION: "ap-northeast-1",
        VOICE_RECORDING_S3_ACCESS_KEY_ID: "key",
        VOICE_RECORDING_S3_SECRET_ACCESS_KEY: "secret",
      });
      expect(config).toEqual({
        providerName: "s3-compatible",
        bucket: "voice-recordings",
        region: "ap-northeast-1",
        forcePathStyle: false,
        credentials: { accessKeyId: "key", secretAccessKey: "secret" },
      });
    });

    it("rejects a lone access key without its matching secret", () => {
      expect(() =>
        resolveVoiceRecordingS3StorageConfig({
          VOICE_RECORDING_OBJECT_STORE_PROVIDER: "s3",
          VOICE_RECORDING_S3_BUCKET: "voice-recordings",
          VOICE_RECORDING_S3_REGION: "ap-northeast-1",
          VOICE_RECORDING_S3_ACCESS_KEY_ID: "key",
        }),
      ).toThrow(/configured together/);
    });
  });
});
