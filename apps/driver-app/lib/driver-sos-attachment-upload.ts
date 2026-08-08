import type {
  ConfirmDriverSosAttachmentUploadResult,
  CreateDriverSosAttachmentUploadIntentCommand,
  CreateDriverSosAttachmentUploadIntentResult,
  DriverSosAttachmentRecord,
} from "@drts/contracts";

import { formatDriverError } from "@/lib/api-client";
import type { DriverSosAttachmentDraft } from "./driver-sos-outbox";

export interface PreparedDriverSosAttachment {
  body: Blob;
  contentType: string;
  fileSize: number;
}

export interface DriverSosAttachmentTransport {
  prepare(
    attachment: DriverSosAttachmentDraft,
  ): Promise<PreparedDriverSosAttachment>;
  createUploadIntent(
    sosEventId: string,
    command: CreateDriverSosAttachmentUploadIntentCommand,
  ): Promise<CreateDriverSosAttachmentUploadIntentResult>;
  upload(
    intent: Extract<
      CreateDriverSosAttachmentUploadIntentResult,
      { state: "ready" }
    >,
    prepared: PreparedDriverSosAttachment,
  ): Promise<void>;
  confirm(
    sosEventId: string,
    objectKey: string,
  ): Promise<ConfirmDriverSosAttachmentUploadResult>;
  retryScan(
    sosEventId: string,
    attachmentId: string,
  ): Promise<DriverSosAttachmentRecord>;
}

export interface DriverSosAttachmentSyncSummary {
  attachments: DriverSosAttachmentDraft[];
  confirmedCount: number;
  unavailableCount: number;
  failedCount: number;
}

function attachmentType(contentType: string) {
  return contentType.startsWith("audio/")
    ? ("audio" as const)
    : ("photo" as const);
}

function applyServerAttachment(
  draft: DriverSosAttachmentDraft,
  attachment: DriverSosAttachmentRecord,
): DriverSosAttachmentDraft {
  return {
    ...draft,
    uploadState: "confirmed",
    serverAttachmentId: attachment.attachmentId,
    scanStatus: attachment.scanStatus,
    lastError:
      attachment.scanStatus === "clean"
        ? null
        : (attachment.scanReason ?? `scan_${attachment.scanStatus}`),
  };
}

async function syncOne(
  sosEventId: string,
  draft: DriverSosAttachmentDraft,
  transport: DriverSosAttachmentTransport,
): Promise<DriverSosAttachmentDraft> {
  if (
    draft.serverAttachmentId &&
    (draft.scanStatus === "unavailable" ||
      draft.scanStatus === "error" ||
      draft.scanStatus === "pending")
  ) {
    try {
      return applyServerAttachment(
        draft,
        await transport.retryScan(sosEventId, draft.serverAttachmentId),
      );
    } catch (error) {
      return {
        ...draft,
        lastError: formatDriverError(error, "Attachment scan retry failed."),
      };
    }
  }
  if (draft.serverAttachmentId) {
    return draft;
  }

  try {
    const prepared = await transport.prepare(draft);
    const intent = await transport.createUploadIntent(sosEventId, {
      attachmentType: attachmentType(prepared.contentType),
      originalFileName: draft.fileName,
      contentType: prepared.contentType,
      fileSize: prepared.fileSize,
    });
    if (intent.state === "unavailable") {
      return {
        ...draft,
        uploadState: "unavailable",
        lastError: intent.reason,
      };
    }

    await transport.upload(intent, prepared);
    const confirmation = await transport.confirm(sosEventId, intent.objectKey);
    if (confirmation.state === "unavailable") {
      return {
        ...draft,
        uploadState: "unavailable",
        lastError: confirmation.reason,
      };
    }
    return applyServerAttachment(draft, confirmation.attachment);
  } catch (error) {
    return {
      ...draft,
      uploadState: "failed_retryable",
      lastError: formatDriverError(error, "Attachment upload failed."),
    };
  }
}

export async function syncDriverSosAttachments(params: {
  sosEventId: string;
  attachments: DriverSosAttachmentDraft[];
  transport: DriverSosAttachmentTransport;
}): Promise<DriverSosAttachmentSyncSummary> {
  const attachments: DriverSosAttachmentDraft[] = [];
  for (const draft of params.attachments) {
    attachments.push(await syncOne(params.sosEventId, draft, params.transport));
  }

  return {
    attachments,
    confirmedCount: attachments.filter(
      (attachment) => attachment.uploadState === "confirmed",
    ).length,
    unavailableCount: attachments.filter(
      (attachment) =>
        attachment.uploadState === "unavailable" ||
        attachment.scanStatus === "unavailable",
    ).length,
    failedCount: attachments.filter(
      (attachment) => attachment.uploadState === "failed_retryable",
    ).length,
  };
}
