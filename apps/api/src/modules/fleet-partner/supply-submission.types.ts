import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyReadinessRecord,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
  VehicleSupplyDraft,
} from "@drts/contracts";

import type { SupplyReviewEventRecord } from "./supply-submission.repository";

export type SupplySubmissionFilters = {
  status?: SupplySubmissionStatus;
  submissionType?: SupplySubmissionType;
  subjectDriverId?: string;
  subjectVehicleId?: string;
};

export type CreateDriverSupplySubmissionCommand = Omit<
  DriverSupplyDraft,
  "submissionId"
>;

export type UpdateDriverSupplySubmissionCommand =
  CreateDriverSupplySubmissionCommand & {
    expectedRevisionNo: number;
  };

export type CreateVehicleSupplySubmissionCommand = Omit<
  VehicleSupplyDraft,
  "submissionId"
>;

export type UpdateVehicleSupplySubmissionCommand =
  CreateVehicleSupplySubmissionCommand & {
    expectedRevisionNo: number;
  };

export type CreateSupplyDocumentUploadUrlCommand = {
  expectedRevisionNo: number;
  documentType: SupplyDocumentRecord["documentType"];
  originalFileName: string;
  contentType: string;
};

export type ConfirmSupplyDocumentUploadCommand = {
  expectedRevisionNo: number;
  documentType: SupplyDocumentRecord["documentType"];
  objectKey: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  checksumSha256: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

export type DeleteSupplyDocumentCommand = {
  expectedRevisionNo: number;
};

export type SubmitSupplySubmissionCommand = {
  expectedRevisionNo: number;
};

export type WithdrawSupplySubmissionCommand = {
  expectedRevisionNo: number;
};

export type SupplySubmissionDetail = {
  submission: SupplySubmissionRecord;
  driverDraft: DriverSupplyDraft | null;
  vehicleDraft: VehicleSupplyDraft | null;
  documents: SupplyDocumentRecord[];
  reviewEvents: SupplyReviewEventRecord[];
};

export type SupplyReadinessListRecord = {
  items: SupplyReadinessRecord[];
};
