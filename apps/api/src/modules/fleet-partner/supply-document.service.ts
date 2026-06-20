import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";

import type { SupplyDocumentRecord } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { SupplySubmissionRepository } from "./supply-submission.repository";
import { SupplySubmissionService } from "./supply-submission.service";
import type {
  ConfirmSupplyDocumentUploadCommand,
  CreateSupplyDocumentUploadUrlCommand,
  DeleteSupplyDocumentCommand,
} from "./supply-submission.types";

type PendingDocumentUploadIntent = {
  submissionId: string;
  fleetPartnerId: string;
  documentType: SupplyDocumentRecord["documentType"];
  objectKey: string;
  originalFileName: string;
  contentType: string;
  createdAt: string;
  expiresAt: string;
};

@Injectable()
export class SupplyDocumentService {
  private readonly pendingUploadIntents = new Map<string, PendingDocumentUploadIntent>();

  constructor(
    private readonly supplySubmissionService: SupplySubmissionService,
    private readonly supplySubmissionRepository: SupplySubmissionRepository,
  ) {}

  createUploadUrl(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: CreateSupplyDocumentUploadUrlCommand,
    requestId?: string,
  ) {
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
    this.pendingUploadIntents.set(objectKey, {
      submissionId,
      fleetPartnerId,
      documentType: command.documentType,
      objectKey,
      originalFileName: command.originalFileName.trim(),
      contentType: command.contentType.trim(),
      createdAt: now.toISOString(),
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
      uploadUrl: `https://uploads.drts.example/presigned/${encodeURIComponent(objectKey)}`,
      expiresAt,
      method: "PUT",
      headers: {
        "content-type": command.contentType.trim(),
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
    const submission = this.supplySubmissionService.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    this.supplySubmissionService.assertSubmissionEditable(submission);
    this.supplySubmissionService.assertSubmissionRevision(
      submission,
      command.expectedRevisionNo,
    );
    this.assertNonBlank(command.objectKey, "objectKey");
    this.assertNonBlank(command.originalFileName, "originalFileName");
    this.assertNonBlank(command.contentType, "contentType");
    this.assertNonBlank(command.checksumSha256, "checksumSha256");
    this.assertPositiveInteger(command.fileSize, "fileSize");
    if (command.effectiveFrom) {
      this.assertDateOnly(command.effectiveFrom, "effectiveFrom");
    }
    if (command.effectiveUntil) {
      this.assertDateOnly(command.effectiveUntil, "effectiveUntil");
    }

    const uploadIntent = this.pendingUploadIntents.get(command.objectKey);
    if (!uploadIntent || uploadIntent.submissionId !== submissionId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "UPLOAD_URL_INVALID",
        "The upload confirmation does not match an active pre-signed upload intent.",
        {
          submissionId,
          objectKey: command.objectKey,
        },
      );
    }
    this.assertUploadIntent(uploadIntent, fleetPartnerId, submissionId, command);

    const document: SupplyDocumentRecord = {
      documentId: randomUUID(),
      fleetPartnerId,
      submissionId,
      documentType: command.documentType,
      fileObjectKey: command.objectKey.trim(),
      originalFileName: command.originalFileName.trim(),
      contentType: command.contentType.trim(),
      fileSize: command.fileSize,
      checksumSha256: command.checksumSha256.trim(),
      effectiveFrom: command.effectiveFrom ?? null,
      effectiveUntil: command.effectiveUntil ?? null,
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
    this.pendingUploadIntents.delete(command.objectKey);
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

  async deleteDocument(
    fleetPartnerId: string,
    submissionId: string,
    documentId: string,
    actorId: string,
    command: DeleteSupplyDocumentCommand,
    requestId?: string,
  ) {
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

  private assertUploadIntent(
    uploadIntent: PendingDocumentUploadIntent,
    fleetPartnerId: string,
    submissionId: string,
    command: ConfirmSupplyDocumentUploadCommand,
  ) {
    if (
      uploadIntent.fleetPartnerId !== fleetPartnerId ||
      uploadIntent.submissionId !== submissionId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "UPLOAD_URL_INVALID",
        "The upload confirmation does not match an active pre-signed upload intent.",
        {
          submissionId,
          fleetPartnerId,
          objectKey: command.objectKey,
        },
      );
    }

    if (new Date(uploadIntent.expiresAt).getTime() <= Date.now()) {
      this.pendingUploadIntents.delete(command.objectKey);
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "UPLOAD_URL_INVALID",
        "The pre-signed upload intent has expired.",
        {
          submissionId,
          objectKey: command.objectKey,
          expiresAt: uploadIntent.expiresAt,
        },
      );
    }

    const mismatchedFields: string[] = [];
    if (uploadIntent.documentType !== command.documentType) {
      mismatchedFields.push("documentType");
    }
    if (uploadIntent.originalFileName !== command.originalFileName.trim()) {
      mismatchedFields.push("originalFileName");
    }
    if (uploadIntent.contentType !== command.contentType.trim()) {
      mismatchedFields.push("contentType");
    }
    if (mismatchedFields.length > 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "UPLOAD_URL_INVALID",
        "The upload confirmation metadata does not match the issued pre-signed upload intent.",
        {
          submissionId,
          objectKey: command.objectKey,
          mismatchedFields,
        },
      );
    }
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
