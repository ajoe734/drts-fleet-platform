import type {
  DriverSosAttachmentRecord,
  DriverSosAttachmentScanStatus,
  DriverSosAttachmentType,
} from "@drts/contracts";

export const DRIVER_SOS_ATTACHMENT_STORAGE = Symbol(
  "DRIVER_SOS_ATTACHMENT_STORAGE",
);
export const DRIVER_SOS_ATTACHMENT_SCANNER = Symbol(
  "DRIVER_SOS_ATTACHMENT_SCANNER",
);

export type DriverSosProviderAvailability =
  | { state: "available" }
  | { state: "unavailable"; reason: string };

export interface DriverSosAttachmentUploadIntentInput {
  sosEventId: string;
  driverId: string;
  attachmentType: DriverSosAttachmentType;
  objectKey: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  expiresAt: string;
}

export interface DriverSosAttachmentUploadIntent {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface DriverSosUploadedObjectMetadata {
  objectKey: string;
  contentType: string;
  fileSize: number;
  checksumSha256: string;
}

export interface DriverSosAttachmentStorageProvider {
  readonly providerName: string;
  availability(): DriverSosProviderAvailability;
  createUploadIntent(
    input: DriverSosAttachmentUploadIntentInput,
  ): Promise<DriverSosAttachmentUploadIntent>;
  inspectUploadedObject(
    objectKey: string,
  ): Promise<DriverSosUploadedObjectMetadata>;
}

export interface DriverSosAttachmentScanInput {
  attachment: DriverSosAttachmentRecord;
}

export interface DriverSosAttachmentScanResult {
  status: Exclude<DriverSosAttachmentScanStatus, "pending" | "unavailable">;
  reason: string | null;
  scannedAt: string;
}

export interface DriverSosAttachmentScanner {
  readonly providerName: string;
  availability(): DriverSosProviderAvailability;
  scan(
    input: DriverSosAttachmentScanInput,
  ): Promise<DriverSosAttachmentScanResult>;
}
