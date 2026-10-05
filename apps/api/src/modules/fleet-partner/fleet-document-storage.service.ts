import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import {
  DOCUMENT_ARTIFACT_STORE,
  UnprovisionedDocumentArtifactStore,
  type DocumentArtifactStore,
} from "../../common/document-artifacts";
import { createRemittanceProofScanner } from "../billing-settlement/remittance-proof-runtime.config";
import type { RemittanceProofScannerPort } from "../billing-settlement/remittance-proof-scanner.port";
import type { RemittanceProofStorageProvider } from "../billing-settlement/remittance-proof-storage.port";

export const FLEET_DOCUMENT_SCANNER_FACTORY = Symbol(
  "FLEET_DOCUMENT_SCANNER_FACTORY",
);
export type FleetDocumentScannerFactory = (
  storage: RemittanceProofStorageProvider,
) => RemittanceProofScannerPort;
// Both provisioned scanner adapters enforce this limit. Do not issue an upload
// that the existing engine path cannot inspect.
export const MAX_FLEET_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface FleetDocumentUploadIntent {
  objectKey: string;
  family: "supply" | "case";
  fleetPartnerId: string;
  parentId: string;
  fileName: string;
  contentType: string;
  fileSize?: number;
  documentType?: string;
  attachmentId?: string;
  documentId?: string;
  consumedAt?: string;
  expiresAt: string;
}

@Injectable()
export class FleetDocumentStorageService {
  constructor(
    @Optional()
    @Inject(DOCUMENT_ARTIFACT_STORE)
    private readonly store: DocumentArtifactStore = new UnprovisionedDocumentArtifactStore(),
    @Optional()
    @Inject(FLEET_DOCUMENT_SCANNER_FACTORY)
    private readonly scannerFactory: FleetDocumentScannerFactory = createRemittanceProofScanner,
  ) {}

  private async storage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError(
        503,
        "DOCUMENT_STORAGE_UNAVAILABLE",
        "Document storage is unavailable.",
      );
    }
  }

  async createIntent(intent: FleetDocumentUploadIntent) {
    if (
      !intent.fileName.trim() ||
      !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(intent.contentType) ||
      (intent.fileSize !== undefined &&
        (!Number.isInteger(intent.fileSize) ||
          intent.fileSize <= 0 ||
          intent.fileSize > MAX_FLEET_DOCUMENT_BYTES))
    ) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        "A file name, valid content type and file size up to 10 MiB are required.",
      );
    }
    await this.storage(() =>
      this.store.putIfAbsent({
        kind: "fleet-upload-intent",
        subjectId: intent.objectKey,
        mimeType: "application/json",
        bytes: Buffer.from(JSON.stringify(intent)),
      }),
    );
  }

  async intent(
    objectKey: string,
    family: FleetDocumentUploadIntent["family"],
    fleetPartnerId: string,
    parentId: string,
  ) {
    const entry = await this.storage(() =>
      this.store.get("fleet-upload-intent", objectKey),
    );
    const intent: FleetDocumentUploadIntent | null = entry
      ? JSON.parse(entry.bytes.toString("utf8"))
      : null;
    if (
      !intent ||
      intent.consumedAt ||
      intent.objectKey !== objectKey ||
      intent.family !== family ||
      intent.fleetPartnerId !== fleetPartnerId ||
      intent.parentId !== parentId ||
      !Number.isFinite(Date.parse(intent.expiresAt)) ||
      Date.parse(intent.expiresAt) <= Date.now()
    ) {
      throw new ApiRequestError(
        409,
        "UPLOAD_URL_INVALID",
        "Upload intent is missing, expired or outside this resource scope.",
      );
    }
    return intent;
  }

  async consumeIntent(objectKey: string) {
    const current = await this.storage(() =>
      this.store.get("fleet-upload-intent", objectKey),
    );
    if (!current)
      throw new ApiRequestError(
        409,
        "UPLOAD_URL_INVALID",
        "Upload intent is missing.",
      );
    const intent: FleetDocumentUploadIntent = JSON.parse(
      current.bytes.toString("utf8"),
    );
    if (intent.consumedAt) return;
    const result = await this.storage(() =>
      this.store.putIfUnchanged(
        {
          kind: "fleet-upload-intent",
          subjectId: objectKey,
          mimeType: "application/json",
          bytes: Buffer.from(
            JSON.stringify({ ...intent, consumedAt: new Date().toISOString() }),
          ),
        },
        current.record.generation,
      ),
    );
    if (!result.applied)
      throw new ApiRequestError(
        409,
        "DOCUMENT_WRITE_CONFLICT",
        "Upload intent changed concurrently.",
      );
  }

  /** Auth and parent editability are checked by the caller before consuming the stream. */
  async upload(
    intent: FleetDocumentUploadIntent,
    stream: AsyncIterable<Uint8Array>,
    transportType: string,
  ) {
    if (transportType !== "application/octet-stream") {
      throw new ApiRequestError(
        415,
        "UPLOAD_CONTENT_TYPE_INVALID",
        "Upload bytes with Content-Type application/octet-stream.",
      );
    }
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_FLEET_DOCUMENT_BYTES)
        throw new ApiRequestError(
          413,
          "DOCUMENT_TOO_LARGE",
          "Document exceeds 10 MiB.",
        );
      chunks.push(Buffer.from(chunk));
    }
    if (!size || (intent.fileSize !== undefined && size !== intent.fileSize)) {
      throw new ApiRequestError(
        400,
        "DOCUMENT_CONTENT_MISMATCH",
        "Uploaded byte length does not match the upload intent.",
      );
    }
    const bytes = Buffer.concat(chunks);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    // Conditional create prevents a second PUT changing bytes after scanning or
    // confirmation. Retrying the SAME bytes after a scanner outage is safe.
    const stored = await this.storage(() =>
      this.store.putIfAbsent({
        kind: "fleet-upload-content",
        subjectId: intent.objectKey,
        mimeType: intent.contentType,
        bytes,
      }),
    );
    if (
      stored.record.sha256 !== sha256 ||
      stored.record.byteLength !== size ||
      stored.record.mimeType !== intent.contentType
    ) {
      throw new ApiRequestError(
        409,
        "DOCUMENT_CONTENT_MISMATCH",
        "This upload already contains different bytes.",
      );
    }
    const unsupported = async (): Promise<never> => {
      throw new Error("Scanner storage is read-only.");
    };
    // Reuse the existing ClamAV / authenticated Cloud Run scanner path. Its
    // read port resolves THIS private immutable object, never a client hash.
    const scannerStorage: RemittanceProofStorageProvider = {
      providerName: "fleet-document-artifact",
      availability: () => ({ state: "available" }),
      stage: unsupported,
      commit: unsupported,
      read: async (hash) => {
        if (hash !== sha256) return null;
        const object = await this.storage(() =>
          this.store.get("fleet-upload-content", intent.objectKey),
        );
        return object
          ? { bytes: object.bytes, contentType: object.record.mimeType }
          : null;
      },
    };
    let outcome;
    try {
      const scanner = this.scannerFactory(scannerStorage);
      if (scanner.availability().state !== "available")
        throw new Error("Scanner unavailable");
      outcome = await scanner.scan({
        proofId: intent.objectKey,
        contentHash: sha256,
        contentType: intent.contentType,
        sizeBytes: size,
      });
    } catch {
      throw new ApiRequestError(
        503,
        "DOCUMENT_SCANNER_UNAVAILABLE",
        "Document scanning is unavailable. Retry the upload before confirming it.",
      );
    }
    if (outcome.scanState !== "clean")
      throw new ApiRequestError(
        422,
        "DOCUMENT_SCAN_REJECTED",
        "Document failed malware scanning.",
      );
    await this.storage(() =>
      this.store.putIfAbsent({
        kind: "fleet-upload-scan",
        subjectId: intent.objectKey,
        mimeType: "application/json",
        bytes: Buffer.from(
          JSON.stringify({
            sha256,
            size,
            contentType: intent.contentType,
            scannedAt: outcome.scanCompletedAt,
          }),
        ),
      }),
    );
    return {
      checksumSha256: sha256,
      fileSize: size,
      scanState: "clean" as const,
    };
  }

  async read(
    objectKey: string,
    expected?: {
      fileSize: number;
      contentType: string;
      checksumSha256?: string;
    },
  ) {
    const receipt = await this.storage(() =>
      this.store.get("fleet-upload-scan", objectKey),
    );
    if (!receipt)
      throw new ApiRequestError(
        409,
        "DOCUMENT_NOT_SCANNED",
        "Document bytes have not passed scanning.",
      );
    const scan = JSON.parse(receipt.bytes.toString("utf8"));
    const entry = await this.storage(() =>
      this.store.get("fleet-upload-content", objectKey),
    );
    if (!entry)
      throw new ApiRequestError(
        404,
        "DOCUMENT_CONTENT_NOT_FOUND",
        "Document bytes are missing.",
      );
    const hash = createHash("sha256").update(entry.bytes).digest("hex");
    if (
      hash !== scan.sha256 ||
      entry.bytes.length !== scan.size ||
      entry.record.mimeType !== scan.contentType ||
      (expected &&
        (expected.fileSize !== entry.bytes.length ||
          expected.contentType !== entry.record.mimeType ||
          (expected.checksumSha256 !== undefined &&
            expected.checksumSha256.toLowerCase() !== hash)))
    ) {
      throw new ApiRequestError(
        409,
        "DOCUMENT_CONTENT_MISMATCH",
        "Stored content does not match the scanned document.",
      );
    }
    return {
      bytes: entry.bytes,
      checksumSha256: hash,
      contentType: entry.record.mimeType,
      fileSize: entry.bytes.length,
    };
  }

  async getCaseRecords<T>(caseId: string): Promise<T[]> {
    const entry = await this.storage(() =>
      this.store.get("fleet-case-attachments", caseId),
    );
    return entry ? JSON.parse(entry.bytes.toString("utf8")) : [];
  }

  async saveCaseRecord<T extends { attachmentId: string }>(
    caseId: string,
    record: T,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.storage(() =>
        this.store.get("fleet-case-attachments", caseId),
      );
      const records: T[] = current
        ? JSON.parse(current.bytes.toString("utf8"))
        : [];
      const existing = records.find(
        (item) => item.attachmentId === record.attachmentId,
      );
      if (existing) return existing;
      const result = await this.storage(() =>
        this.store.putIfUnchanged(
          {
            kind: "fleet-case-attachments",
            subjectId: caseId,
            mimeType: "application/json",
            bytes: Buffer.from(JSON.stringify([...records, record])),
          },
          current?.record.generation ?? null,
        ),
      );
      if (result.applied) return record;
    }
    throw new ApiRequestError(
      409,
      "DOCUMENT_WRITE_CONFLICT",
      "Concurrent attachment update; retry confirmation.",
    );
  }
}
