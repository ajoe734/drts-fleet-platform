import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyReadinessReasonCode,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
  VehicleSupplyDraft,
} from "@drts/contracts";

export type SupplyDataSource = "live" | "fallback";

export type SupplyReviewEvent = {
  eventId: string;
  submissionId: string;
  eventType: string;
  actorId: string;
  actorType: string;
  reasonCode: string | null;
  comment: string | null;
  createdAt: string;
};

export type SupplySubmissionDetail = {
  submission: SupplySubmissionRecord;
  driverDraft: DriverSupplyDraft | null;
  vehicleDraft: VehicleSupplyDraft | null;
  documents: SupplyDocumentRecord[];
  reviewEvents: SupplyReviewEvent[];
};

export type SupplySubjectSummary = {
  title: string;
  subtitle: string;
};

export type SupplyDashboardGroup =
  | "draft"
  | "review"
  | "revision"
  | "approved"
  | "expiring"
  | "not_ready";

export type SupplyDashboardCard = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status?: SupplySubmissionStatus;
  tone?: "neutral" | "info" | "warn" | "success" | "danger";
  reasons?: SupplyReadinessReasonCode[];
};

export type SupplyDashboardView = {
  groups: Record<SupplyDashboardGroup, SupplyDashboardCard[]>;
  source: SupplyDataSource;
};

export type SupplyDocumentsView = {
  rows: Array<
    SupplyDocumentRecord & {
      submissionStatus: SupplySubmissionStatus;
      submissionType: SupplySubmissionType;
      subject: SupplySubjectSummary;
    }
  >;
  source: SupplyDataSource;
};

export function formatSupplySubject(
  detail: SupplySubmissionDetail,
): SupplySubjectSummary {
  if (detail.driverDraft) {
    return {
      title: detail.driverDraft.name,
      subtitle: detail.driverDraft.mobile,
    };
  }
  if (detail.vehicleDraft) {
    return {
      title: detail.vehicleDraft.plateNo,
      subtitle:
        [detail.vehicleDraft.brand, detail.vehicleDraft.model]
          .filter(Boolean)
          .join(" ") || detail.vehicleDraft.businessArea,
    };
  }
  return {
    title: detail.submission.submissionType,
    subtitle: detail.submission.submissionId,
  };
}

export function isEditableStatus(status: SupplySubmissionStatus) {
  return (
    status === "draft" || status === "needs_revision" || status === "withdrawn"
  );
}
