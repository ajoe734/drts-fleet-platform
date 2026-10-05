import { createHash, randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import type {
  RemittanceProofStorageProvider,
  StageRemittanceProofContentCommand,
} from "./remittance-proof-storage.port";

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const STAGE_TTL_MS = 15 * 60_000;
const MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const isMissing = (error: unknown) =>
  (error as { name?: string })?.name === "NoSuchKey" ||
  (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode === 404;
const isPrecondition = (error: unknown) =>
  (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode === 412 ||
  (error as { name?: string })?.name === "PreconditionFailed";

/** Shared, content-addressed S3 storage. No local fallback or presigned public writes. */
export class S3RemittanceProofStorageAdapter implements RemittanceProofStorageProvider {
  readonly providerName = "s3-remittance-proof";
  private readonly client: S3Client;

  constructor(
    private readonly config: { bucket: string; clientConfig: S3ClientConfig },
    client?: S3Client,
  ) {
    this.client = client ?? new S3Client(config.clientConfig);
  }

  availability() {
    return { state: "available" as const };
  }

  async stage({ bytes, contentType }: StageRemittanceProofContentCommand) {
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.length === 0 ||
      bytes.length > MAX_PROOF_BYTES ||
      !MIME_TYPES.has(contentType)
    ) {
      throw new Error(
        "Proof must be a non-empty PDF, PNG, JPEG or WebP within 10 MiB.",
      );
    }
    const stagedContentRef = randomUUID();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: `remittance-proof/staged/${stagedContentRef}`,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.length,
        IfNoneMatch: "*",
        Metadata: { expires: String(Date.now() + STAGE_TTL_MS) },
      }),
    );
    return { stagedContentRef };
  }

  async commit({ stagedContentRef }: { stagedContentRef: string }) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        stagedContentRef,
      )
    ) {
      throw new Error("Invalid staged proof reference.");
    }
    const staged = await this.get(
      `remittance-proof/staged/${stagedContentRef}`,
    );
    if (
      !staged ||
      !Number.isFinite(Number(staged.expires)) ||
      Number(staged.expires) <= Date.now()
    ) {
      throw new Error("Staged proof is missing or expired.");
    }
    const contentHash = sha256(staged.bytes);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: `remittance-proof/content/${contentHash}`,
          Body: staged.bytes,
          ContentType: staged.contentType,
          ContentLength: staged.bytes.length,
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      if (!isPrecondition(error)) throw error;
      const existing = await this.read(contentHash);
      if (
        !existing ||
        !existing.bytes.equals(staged.bytes) ||
        existing.contentType !== staged.contentType
      ) {
        throw new Error(
          "Existing proof content does not match staged bytes/MIME.",
        );
      }
    }
    // A conditional *create* arbitrates single-use across instances. Deleting a
    // stage after GET would allow concurrent consumers. Retain claims >= stage
    // lifecycle; a backend without conditional PUT support is not compatible.
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: `remittance-proof/consumed/${stagedContentRef}`,
          Body: contentHash,
          ContentType: "text/plain",
          IfNoneMatch: "*",
        }),
      );
    } catch (error) {
      if (isPrecondition(error))
        throw new Error("Staged proof has already been consumed.");
      throw error;
    }
    return {
      contentHash,
      contentType: staged.contentType,
      sizeBytes: staged.bytes.length,
    };
  }

  async read(contentHash: string) {
    if (!/^[a-f0-9]{64}$/.test(contentHash))
      throw new Error("Invalid proof content hash.");
    const object = await this.get(`remittance-proof/content/${contentHash}`);
    if (!object) return null;
    if (sha256(object.bytes) !== contentHash)
      throw new Error("Stored proof hash mismatch.");
    return { bytes: object.bytes, contentType: object.contentType };
  }

  private async get(key: string) {
    let object;
    try {
      object = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const size = object.ContentLength;
    const contentType = object.ContentType ?? "";
    if (
      !Number.isSafeInteger(size) ||
      !size ||
      size < 0 ||
      size > MAX_PROOF_BYTES ||
      !MIME_TYPES.has(contentType)
    ) {
      throw new Error("Stored proof size or MIME is invalid.");
    }
    const body = object.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body || typeof body[Symbol.asyncIterator] !== "function")
      throw new Error("Unreadable proof body.");
    const chunks: Buffer[] = [];
    let count = 0;
    for await (const part of body) {
      const chunk = Buffer.from(part);
      count += chunk.length;
      if (count > MAX_PROOF_BYTES || count > size)
        throw new Error("Stored proof exceeds its byte limit.");
      chunks.push(chunk);
    }
    if (count !== size) throw new Error("Stored proof length mismatch.");
    return {
      bytes: Buffer.concat(chunks),
      contentType,
      expires: object.Metadata?.expires,
    };
  }
}
