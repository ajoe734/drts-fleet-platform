import { createHash, randomUUID } from "node:crypto";
import {
  GoogleCloudHttpError,
  GoogleCloudObjectClient,
} from "../../common/google-cloud/google-cloud-object-client";
import type {
  RemittanceProofStorageProvider,
  StageRemittanceProofContentCommand,
} from "./remittance-proof-storage.port";

const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const precondition = (error: unknown) =>
  error instanceof GoogleCloudHttpError &&
  error.service === "storage" &&
  error.status === 412;

export class GcsRemittanceProofStorageAdapter implements RemittanceProofStorageProvider {
  readonly providerName = "gcs-remittance-proof";
  constructor(private readonly objects: GoogleCloudObjectClient) {}
  availability() {
    return { state: "available" as const };
  } // Configured, not a live-health assertion.
  async stage({
    bytes: input,
    contentType,
  }: StageRemittanceProofContentCommand) {
    if (
      !Buffer.isBuffer(input) ||
      !input.length ||
      input.length > MAX_BYTES ||
      !MIME_TYPES.has(contentType)
    ) {
      throw new Error("Proof must be a nonempty supported file within10MiB.");
    }
    const bytes = Buffer.from(input);
    const stagedContentRef = randomUUID();
    await this.objects.put(
      `remittance-proof/staged/${stagedContentRef}`,
      bytes,
      contentType,
      { expires: String(Date.now() + 15 * 60_000) },
      null,
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
    const staged = await this.objects.get(
      `remittance-proof/staged/${stagedContentRef}`,
      MAX_BYTES,
    );
    if (
      !staged ||
      !MIME_TYPES.has(staged.contentType) ||
      !Number.isFinite(Number(staged.metadata.expires)) ||
      Number(staged.metadata.expires) <= Date.now()
    )
      throw new Error("Staged proof missing, invalid or expired.");
    const contentHash = hash(staged.bytes);
    try {
      await this.objects.put(
        `remittance-proof/content/${contentHash}`,
        staged.bytes,
        staged.contentType,
        {},
        null,
      );
    } catch (error) {
      if (!precondition(error)) throw error;
      const existing = await this.read(contentHash);
      if (
        !existing ||
        !existing.bytes.equals(staged.bytes) ||
        existing.contentType !== staged.contentType
      ) {
        throw new Error("Existing proof does not match staged bytes/MIME.");
      }
    }
    // Native ifGenerationMatch=0 is the durable, cross-instance single-use claim.
    try {
      await this.objects.put(
        `remittance-proof/consumed/${stagedContentRef}`,
        Buffer.from(contentHash),
        "text/plain",
        {},
        null,
      );
    } catch (error) {
      if (precondition(error))
        throw new Error("Staged proof has already been consumed.");
      throw error; // Lost acknowledgement is NOT permission to consume twice.
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
    const object = await this.objects.get(
      `remittance-proof/content/${contentHash}`,
      MAX_BYTES,
    );
    if (!object) return null;
    if (
      !MIME_TYPES.has(object.contentType) ||
      hash(object.bytes) !== contentHash
    )
      throw new Error("Stored proof identity mismatch.");
    return { bytes: object.bytes, contentType: object.contentType };
  }
}
