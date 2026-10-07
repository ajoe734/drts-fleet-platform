import { createHash } from "node:crypto";
import {
  GoogleCloudHttpError,
  GoogleCloudObjectClient,
} from "../google-cloud/google-cloud-object-client";
import type { DocumentArtifactKind } from "./document-artifact-kinds";
import type {
  DocumentArtifactRecord,
  DocumentArtifactStore,
  PutDocumentArtifactCommand,
} from "./document-artifact.types";
import { validatePutDocumentArtifactCommand } from "./document-artifact-validation";

const MAX_BYTES = 25 * 1024 * 1024;
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** Native GCS generations implement the SAME shared conditional-write contract. */
export class GcsDocumentArtifactStoreAdapter implements DocumentArtifactStore {
  constructor(private readonly objects: GoogleCloudObjectClient) {}
  private key(kind: DocumentArtifactKind, subjectId: string) {
    return `document-artifacts/${kind}/${encodeURIComponent(subjectId)}`;
  }
  private async write(
    command: PutDocumentArtifactCommand,
    expected?: string | null,
  ): Promise<DocumentArtifactRecord> {
    const normalized = validatePutDocumentArtifactCommand(command);
    const bytes = normalized.bytes; // Shared validation already copied caller bytes.
    if (bytes.length > MAX_BYTES)
      throw new Error("Document artifact exceeds byte limit.");
    const storedAt = new Date().toISOString();
    const generation = await this.objects.put(
      this.key(command.kind, normalized.subjectId),
      bytes,
      normalized.mimeType,
      { "stored-at": storedAt },
      expected,
    );
    return {
      kind: command.kind,
      subjectId: normalized.subjectId,
      mimeType: normalized.mimeType,
      storedAt,
      generation,
      sha256: hash(bytes),
      byteLength: bytes.length,
    };
  }
  put(command: PutDocumentArtifactCommand) {
    return this.write({ ...command });
  }
  async putIfAbsent(input: PutDocumentArtifactCommand) {
    const command = { ...input };
    try {
      return { created: true, record: await this.write(command, null) };
    } catch (error) {
      if (
        !(error instanceof GoogleCloudHttpError) ||
        error.service !== "storage" ||
        error.status !== 412
      )
        throw error;
      const existing = await this.get(command.kind, command.subjectId.trim());
      if (!existing) throw error;
      return { created: false, record: existing.record };
    }
  }
  async putIfUnchanged(
    input: PutDocumentArtifactCommand,
    expectedGeneration: string | null,
  ) {
    const command = { ...input };
    try {
      return {
        applied: true as const,
        record: await this.write(command, expectedGeneration),
      };
    } catch (error) {
      if (
        !(error instanceof GoogleCloudHttpError) ||
        error.service !== "storage" ||
        error.status !== 412
      )
        throw error;
      return {
        applied: false as const,
        record:
          (await this.get(command.kind, command.subjectId.trim()))?.record ??
          null,
      };
    }
  }
  async get(kind: DocumentArtifactKind, subjectId: string) {
    const object = await this.objects.get(this.key(kind, subjectId), MAX_BYTES);
    if (!object) return null;
    return {
      bytes: object.bytes,
      record: {
        kind,
        subjectId,
        generation: object.generation,
        mimeType: object.contentType,
        sha256: hash(object.bytes),
        byteLength: object.bytes.length,
        storedAt: object.metadata["stored-at"] ?? object.updated,
      },
    };
  }
}
