import { createHash } from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  DriverSosAttachmentStorageProvider,
  DriverSosAttachmentUploadIntentInput,
} from "./driver-sos-attachment.ports";
import type { DriverSosS3StorageConfig } from "./driver-sos-provider.config";

const MAX_UPLOAD_URL_TTL_SECONDS = 15 * 60;
const MAX_INSPECTED_OBJECT_BYTES = 20 * 1024 * 1024;

type Presign = typeof getSignedUrl;

interface S3StorageDependencies {
  client?: S3Client;
  presign?: Presign;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === "function",
  );
}

export class S3DriverSosAttachmentStorageAdapter implements DriverSosAttachmentStorageProvider {
  readonly providerName: string;
  private readonly client: S3Client;
  private readonly presign: Presign;

  constructor(
    private readonly config: DriverSosS3StorageConfig,
    dependencies: S3StorageDependencies = {},
  ) {
    this.providerName = config.providerName;
    this.client =
      dependencies.client ??
      new S3Client({
        region: config.region,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle,
        ...(config.credentials ? { credentials: config.credentials } : {}),
      });
    this.presign = dependencies.presign ?? getSignedUrl;
  }

  availability() {
    return { state: "available" as const };
  }

  async createUploadIntent(input: DriverSosAttachmentUploadIntentInput) {
    this.assertObjectKey(input.objectKey);
    const expiresIn = Math.min(
      MAX_UPLOAD_URL_TTL_SECONDS,
      Math.ceil((Date.parse(input.expiresAt) - Date.now()) / 1000),
    );
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error("Driver SOS upload intent expiry must be in the future.");
    }

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.fileSize,
    });
    const uploadUrl = await this.presign(this.client, command, { expiresIn });

    return {
      uploadUrl,
      method: "PUT" as const,
      headers: {
        "content-type": input.contentType,
      },
    };
  }

  async inspectUploadedObject(objectKey: string) {
    this.assertObjectKey(objectKey);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }),
    );
    const contentType = this.requireContentType(response);
    const expectedSize = this.requireContentLength(response);
    if (expectedSize > MAX_INSPECTED_OBJECT_BYTES) {
      throw new Error("Driver SOS object exceeds the inspection size limit.");
    }
    if (!isAsyncIterable(response.Body)) {
      throw new Error("Driver SOS object body is not readable.");
    }

    const hash = createHash("sha256");
    let actualSize = 0;
    for await (const rawChunk of response.Body) {
      const chunk =
        typeof rawChunk === "string"
          ? Buffer.from(rawChunk)
          : Buffer.from(rawChunk as Uint8Array);
      actualSize += chunk.byteLength;
      if (actualSize > MAX_INSPECTED_OBJECT_BYTES) {
        throw new Error("Driver SOS object exceeds the inspection size limit.");
      }
      hash.update(chunk);
    }
    if (actualSize !== expectedSize) {
      throw new Error(
        "Driver SOS object length changed while it was being inspected.",
      );
    }

    return {
      objectKey,
      contentType,
      fileSize: actualSize,
      checksumSha256: hash.digest("hex"),
    };
  }

  private assertObjectKey(objectKey: string) {
    const segments = objectKey.split("/");
    if (
      segments.length !== 3 ||
      segments[0] !== "driver-sos" ||
      segments.some(
        (segment) => !segment || segment === "." || segment === "..",
      )
    ) {
      throw new Error(
        "Driver SOS object key is outside the allowed namespace.",
      );
    }
  }

  private requireContentType(response: GetObjectCommandOutput) {
    const contentType = response.ContentType?.trim().toLowerCase();
    if (!contentType) {
      throw new Error("Driver SOS object has no provider content type.");
    }
    return contentType;
  }

  private requireContentLength(response: GetObjectCommandOutput) {
    const contentLength = response.ContentLength;
    if (
      contentLength === undefined ||
      !Number.isSafeInteger(contentLength) ||
      contentLength <= 0
    ) {
      throw new Error(
        "Driver SOS object has no valid provider content length.",
      );
    }
    return contentLength;
  }
}
