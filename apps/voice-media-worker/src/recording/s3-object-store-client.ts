import { createHash } from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type {
  ObjectStoreClient,
  ObjectStoreGetResult,
  ObjectStorePutResult,
} from "./object-store-client";

export interface S3ObjectStoreClientConfig {
  providerName: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

interface S3ObjectStoreClientDependencies {
  client?: S3Client;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.asyncIterator in value &&
      typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
        "function",
  );
}

async function collectBody(body: unknown): Promise<Uint8Array> {
  if (!isAsyncIterable(body)) {
    throw new Error("S3 object store response body is not readable.");
  }
  const chunks: Buffer[] = [];
  for await (const rawChunk of body) {
    chunks.push(
      typeof rawChunk === "string"
        ? Buffer.from(rawChunk)
        : Buffer.from(rawChunk as Uint8Array),
    );
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * `ObjectStoreClient` (`./object-store-client.ts`) backed by a real,
 * versioned S3 bucket -- the dependency-manifest/lockfile gap that blocked
 * this is resolved (AUDIT-DEPENDENCY-GATES-20261002 #2287 delegated the
 * worker's own `@aws-sdk/client-s3` addition to this task; see
 * docs/04-uat/audit-voice-application-wiring-20261003.md). Modeled on
 * `S3DriverSosAttachmentStorageAdapter`'s convention
 * (../../../api/src/modules/driver-sos/s3-driver-sos-attachment-storage.adapter.ts),
 * adapted for this seam's direct put/get-by-version contract instead of a
 * presigned-upload-intent one.
 *
 * The target bucket MUST have S3 object versioning enabled -- `putObjectVersion`
 * fails closed if S3 does not return a `VersionId`, since an unversioned
 * bucket cannot honor `RecorderObjectStore`'s immutable-version contract at
 * all (a same-key overwrite would silently replace prior evidence).
 *
 * Every write is verified by an immediate readback: a successful
 * `PutObjectCommand` response is not, by itself, proof the object stored at
 * `(key, VersionId)` is actually retrievable with the exact bytes just sent
 * (replication lag, a misconfigured endpoint silently truncating the body).
 * `putObjectVersion` only returns once a `GetObjectCommand` for that exact
 * version has round-tripped and its sha256 matches what was sent.
 */
export class S3ObjectStoreClient implements ObjectStoreClient {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3ObjectStoreClientConfig,
    dependencies: S3ObjectStoreClientDependencies = {},
  ) {
    this.client =
      dependencies.client ??
      new S3Client({
        region: config.region,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
  }

  async putObjectVersion(
    key: string,
    bytes: Uint8Array,
    metadata: Readonly<Record<string, string>>,
  ): Promise<ObjectStorePutResult> {
    const checksumSha256 = createHash("sha256").update(bytes).digest("base64");
    const response = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: Buffer.from(bytes),
        Metadata: { ...metadata },
        ChecksumSHA256: checksumSha256,
        ChecksumAlgorithm: "SHA256",
      }),
    );
    const versionId = response.VersionId;
    if (!versionId) {
      throw new Error(
        "S3 object store put did not return a VersionId -- the target bucket must have versioning enabled.",
      );
    }

    // Immediate readback verification (see class doc): confirms the exact
    // version is retrievable and byte-identical before this write is
    // reported durable to the caller.
    const readback = await this.getObjectVersion(key, versionId);
    if (
      readback.body.length !== bytes.length ||
      Buffer.compare(Buffer.from(readback.body), Buffer.from(bytes)) !== 0
    ) {
      throw new Error(
        `S3 object store readback for '${key}' version '${versionId}' did not match the bytes just written.`,
      );
    }

    return { versionId, storedAt: readback.storedAt };
  }

  async getObjectVersion(
    key: string,
    versionId: string,
  ): Promise<ObjectStoreGetResult> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        VersionId: versionId,
      }),
    );
    // S3 honors an exact `VersionId` request or fails the call outright
    // (e.g. `NoSuchVersion`) -- this re-check guards against a double or
    // test-double transport that silently substitutes the bucket's current
    // (possibly newer) version instead of the one actually requested.
    if (response.VersionId !== versionId) {
      throw new Error(
        `S3 object store returned version '${response.VersionId ?? "unknown"}' for key '${key}', expected '${versionId}'.`,
      );
    }
    const storedAt = response.LastModified?.toISOString();
    if (!storedAt) {
      throw new Error(
        `S3 object store response for '${key}' version '${versionId}' has no LastModified timestamp.`,
      );
    }
    const body = await collectBody(response.Body);

    return {
      body,
      versionId,
      storedAt,
      metadata: { ...(response.Metadata ?? {}) },
    };
  }
}
