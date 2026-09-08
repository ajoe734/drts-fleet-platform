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
  beforeUnload: "您有尚未儲存至伺服器的草稿內容。確定要離開嗎？",
  /** Shown in the in-app navigation confirmation dialog. */
  confirmLeaveTitle: "尚未儲存的草稿",
  confirmLeaveBody: "表單中有尚未儲存至伺服器的內容，確定離開嗎？",
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

/**
 * True when any client-side draft value differs from its initial form state.
 * This deliberately includes optional fields and checkbox selections so that
 * no user-entered supply data can be lost without a leave warning (R25).
 */
export function hasUnsavedDraftChanges<T>(current: T, initial: T): boolean {
  return JSON.stringify(current) !== JSON.stringify(initial);
}

/**
 * Whether a client-side link needs the unsaved-draft confirmation. External
 * navigation is intentionally left to the native `beforeunload` prompt.
 */
export function shouldConfirmDraftNavigation(
  dirty: boolean,
  currentHref: string,
  nextHref: string,
): boolean {
  if (!dirty || nextHref.startsWith("#")) return false;

  const current = new URL(currentHref);
  const next = new URL(nextHref, current);
  return (
    current.origin === next.origin &&
    (current.pathname !== next.pathname ||
      current.search !== next.search ||
      current.hash !== next.hash)
  );
}

/** Reject stale/corrupt browser drafts before using them as controlled values. */
export function restoreSupplyDraft<T extends object>(
  raw: string | null,
  initial: T,
): T {
  if (!raw) return initial;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return initial;
    const valid = Object.entries(initial).every(([key, value]) => {
      const candidate = parsed[key];
      if (value === null)
        return candidate === null || typeof candidate === "string";
      if (Array.isArray(value))
        return (
          Array.isArray(candidate) &&
          candidate.every((item: unknown) => typeof item === "string")
        );
      return (
        typeof candidate === typeof value &&
        (typeof candidate !== "number" || Number.isFinite(candidate))
      );
    });
    if (!valid) return initial;
    return Object.fromEntries(
      Object.keys(initial).map((key) => [key, parsed[key]]),
    ) as T;
  } catch {
    return initial;
  }
}
