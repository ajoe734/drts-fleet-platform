import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import type { SupplyDocumentRecord } from "@drts/contracts";

import { FleetDocumentStorageService } from "./fleet-document-storage.service";
import { ApiRequestError } from "../../common/api-envelope";
import { SupplySubmissionRepository } from "./supply-submission.repository";
import { SupplySubmissionService } from "./supply-submission.service";
import type {
  ConfirmSupplyDocumentUploadCommand,
  CreateSupplyDocumentUploadUrlCommand,
  DeleteSupplyDocumentCommand,
} from "./supply-submission.types";

@Injectable()
export class SupplyDocumentService {
  constructor(
    private readonly supplySubmissionService: SupplySubmissionService,
    private readonly supplySubmissionRepository: SupplySubmissionRepository,
    @Optional()
    private readonly storage: FleetDocumentStorageService = new FleetDocumentStorageService(),
  ) {}

  async createUploadUrl(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: CreateSupplyDocumentUploadUrlCommand,
    requestId?: string,
  ) {
    await this.supplySubmissionService.syncState();
    const submission = this.supplySubmissionService.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    this.supplySubmissionService.assertSubmissionEditable(submission);
    this.supplySubmissionService.assertSubmissionRevision(
      submission,
      command.expectedRevisionNo,
    );
    this.assertNonBlank(command.originalFileName, "originalFileName");
    this.assertNonBlank(command.contentType, "contentType");

    const objectKey = [
      "fleet-partner",
      fleetPartnerId,
      "supply-submissions",
      submissionId,
      `${randomUUID()}-${this.sanitizeFileName(command.originalFileName)}`,
    ].join("/");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    await this.storage.createIntent({
      family: "supply",
      documentId: randomUUID(),
      parentId: submissionId,
      fleetPartnerId,
      documentType: command.documentType,
      objectKey,
      fileName: command.originalFileName.trim(),
      contentType: command.contentType.trim(),
      expiresAt,
    });

    this.supplySubmissionService.recordMutationAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "create_supply_document_upload_url",
        resourceType: "supply_submission",
        resourceId: submissionId,
        newValuesSummary: {
          documentType: command.documentType,
          objectKey,
          expiresAt,
        },
      },
      requestId,
    );

    return {
      submissionId,
      objectKey,
      uploadUrl: `/api/fleet-partner/supply-submissions/${encodeURIComponent(submissionId)}/documents/content?objectKey=${encodeURIComponent(objectKey)}`,
      expiresAt,
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
      },
    };
  }

  async confirmUpload(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: ConfirmSupplyDocumentUploadCommand,
    requestId?: string,
  ) {
    await this.supplySubmissionService.syncState();
    const objectKey = command.objectKey.trim();
    const originalFileName = command.originalFileName.trim();
    const contentType = command.contentType.trim();
    const checksumSha256 = command.checksumSha256.trim();
    const effectiveFrom = command.effectiveFrom?.trim() || null;
    const effectiveUntil = command.effectiveUntil?.trim() || null;

    const submission = this.supplySubmissionService.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    this.supplySubmissionService.assertSubmissionEditable(submission);
    this.supplySubmissionService.assertSubmissionRevision(
      submission,
      command.expectedRevisionNo,
    );
    this.assertNonBlank(objectKey, "objectKey");
    this.assertNonBlank(originalFileName, "originalFileName");
    this.assertNonBlank(contentType, "contentType");
    this.assertNonBlank(checksumSha256, "checksumSha256");
    this.assertPositiveInteger(command.fileSize, "fileSize");
    this.assertSha256Checksum(checksumSha256);
    if (effectiveFrom) {
      this.assertDateOnly(effectiveFrom, "effectiveFrom");
    }
    if (effectiveUntil) {
      this.assertDateOnly(effectiveUntil, "effectiveUntil");
    }
    if (effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "effectiveUntil must be on or after effectiveFrom.",
        { effectiveFrom, effectiveUntil },
      );
    }

    const uploadIntent = await this.storage.intent(
      objectKey,
      "supply",
      fleetPartnerId,
      submissionId,
    );
    const mismatchedFields = [
      ["documentType", uploadIntent.documentType, command.documentType],
      ["originalFileName", uploadIntent.fileName, originalFileName],
      ["contentType", uploadIntent.contentType, contentType],
    ]
      .filter(([, expected, actual]) => expected !== actual)
      .map(([field]) => field);
    if (mismatchedFields.length) {
      throw new ApiRequestError(
        409,
        "UPLOAD_URL_INVALID",
        "Confirmation metadata does not match the upload intent.",
        { submissionId, objectKey, mismatchedFields },
      );
    }
    if (
      !uploadIntent.documentId ||
      this.supplySubmissionService.getDocumentById(uploadIntent.documentId)
    ) {
      throw new ApiRequestError(
        409,
        "UPLOAD_URL_INVALID",
        "Upload intent has already been confirmed.",
      );
    }
    const content = await this.storage.read(objectKey, {
      fileSize: command.fileSize,
      contentType,
      checksumSha256,
    });

    const document: SupplyDocumentRecord = {
      documentId: uploadIntent.documentId,
      fleetPartnerId,
      submissionId,
      documentType: command.documentType,
      fileObjectKey: objectKey,
      originalFileName,
      contentType,
      fileSize: command.fileSize,
      checksumSha256: content.checksumSha256,
      effectiveFrom,
      effectiveUntil,
      reviewStatus: "pending",
      reviewComment: null,
      uploadedBy: actorId,
      uploadedAt: new Date().toISOString(),
    };
    this.supplySubmissionService.bumpRevisionForSubmission(submission);
    this.supplySubmissionService.replaceDocument(document);

    await this.supplySubmissionService.persistSubmissionAndDocuments(
      submission,
      [document],
      "confirm supply document upload",
    );
    await this.storage.consumeIntent(objectKey);
    this.supplySubmissionService.recordMutationAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "confirm_supply_document_upload",
        resourceType: "supply_document",
        resourceId: document.documentId,
        newValuesSummary: {
          submissionId,
          documentType: document.documentType,
          fileObjectKey: document.fileObjectKey,
        },
      },
      requestId,
    );

    return document;
  }

  async uploadContent(
    fleetPartnerId: string,
    submissionId: string,
    objectKey: string,
    stream: AsyncIterable<Uint8Array>,
    contentType: string,
  ) {
    await this.supplySubmissionService.syncState();
    const submission = this.supplySubmissionService.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    this.supplySubmissionService.assertSubmissionEditable(submission);
    const intent = await this.storage.intent(
      objectKey,
      "supply",
      fleetPartnerId,
      submissionId,
    );
    return this.storage.upload(intent, stream, contentType);
  }

  async downloadDocument(
    fleetPartnerId: string | null,
    submissionId: string,
    documentId: string,
  ) {
    await this.supplySubmissionService.syncState();
    const document = this.supplySubmissionService.getDocumentById(documentId);
    if (!document || document.submissionId !== submissionId)
      throw new ApiRequestError(404, "NOT_FOUND", "Supply document not found.");
    this.supplySubmissionService.requireScopedSubmission(
      submissionId,
      fleetPartnerId ?? document.fleetPartnerId,
    );
    if (fleetPartnerId && document.fleetPartnerId !== fleetPartnerId)
      throw new ApiRequestError(
        403,
        "FLEET_SCOPE_DENIED",
        "Document is outside the fleet scope.",
      );
    const content = await this.storage.read(document.fileObjectKey, document);
    return { document, ...content };
  }

  async deleteDocument(
    fleetPartnerId: string,
    submissionId: string,
    documentId: string,
    actorId: string,
    command: DeleteSupplyDocumentCommand,
    requestId?: string,
  ) {
    await this.supplySubmissionService.syncState();
    const submission = this.supplySubmissionService.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    this.supplySubmissionService.assertSubmissionEditable(submission);
    this.supplySubmissionService.assertSubmissionRevision(
      submission,
      command.expectedRevisionNo,
    );

    const document = this.supplySubmissionService.getDocumentById(documentId);
    if (!document) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "The supply document could not be found.",
        { documentId },
      );
    }
    if (
      document.submissionId !== submissionId ||
      document.fleetPartnerId !== fleetPartnerId
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "FLEET_SCOPE_DENIED",
        "The supply document is outside the fleet partner scope.",
        { documentId, submissionId, fleetPartnerId },
      );
    }

    this.supplySubmissionService.removeDocument(documentId);
    this.supplySubmissionService.bumpRevisionForSubmission(submission);
    await this.supplySubmissionRepository.deleteDocument(
      documentId,
      submissionId,
      fleetPartnerId,
    );
    await this.supplySubmissionService.persistSubmissionAndDocuments(
      submission,
      [],
      "delete supply document",
    );
    this.supplySubmissionService.recordMutationAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "delete_supply_document",
        resourceType: "supply_document",
        resourceId: documentId,
        oldValuesSummary: { ...document },
      },
      requestId,
    );

    return { deleted: true };
  }

  private sanitizeFileName(fileName: string) {
    return fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { fieldName },
      );
    }
  }

  private assertPositiveInteger(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must be a positive integer.`,
        { fieldName, value },
      );
    }
  }

  private assertSha256Checksum(value: string) {
    if (!/^[a-fA-F0-9]{64}$/.test(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "checksumSha256 must be a 64-character hexadecimal SHA-256 digest.",
        { fieldName: "checksumSha256" },
      );
    }
  }

  private assertDateOnly(value: string, fieldName: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must use YYYY-MM-DD format.`,
        { fieldName },
      );
    }
  }
}
