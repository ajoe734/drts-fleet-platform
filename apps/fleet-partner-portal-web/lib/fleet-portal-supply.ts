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

/**
 * Unsaved-draft guard copy used by the new-driver / new-vehicle forms (R25).
 * Kept here so it is discoverable by tests and translators without touching
 * the shared translations.ts (outside this task's write scope).
 */
export const DRAFT_GUARD_STRINGS = {
  /** Shown in the browser's native beforeunload dialog (plain text only). */
  beforeUnload:
    "您有尚未儲存的草稿內容。確定要離開嗎？離開後資料將會遺失。",
  /** Shown in the in-app navigation confirmation dialog. */
  confirmLeaveTitle: "尚未儲存的草稿",
  confirmLeaveBody:
    "表單中有尚未儲存的內容，確定離開嗎？離開後資料將會遺失。",
  confirmLeaveCancel: "繼續填寫",
  confirmLeaveOk: "確定離開",
} as const;

/**
 * Returns a stable `id` string for a named form field within a form context,
 * e.g. `fieldId("new-driver", "name")` → `"form-new-driver-name"`.
 * Used to wire `<label htmlFor>` ↔ `<input id>` for assistive technology (R23).
 */
export function fieldId(form: string, field: string): string {
  return `form-${form}-${field}`;
}
