import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
  VehicleSupplyDraft,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web";

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export type SupplyReviewActor = {
  name: string;
  display: string;
  role: string;
};

export const PSR_REVIEWER: SupplyReviewActor = {
  name: "LP",
  display: "林佩璇",
  role: "platform_supply_reviewer",
};

export function getPsrReviewer(t?: TranslateFn): SupplyReviewActor {
  return {
    name: "LP",
    display: t ? t("supplyReview.reviewerDisplay") : "林佩璇",
    role: "platform_supply_reviewer",
  };
}

export interface StatusMeta {
  key: string;
  code: string;
  tone: CanvasTone;
}

export const PSR_SUB_STATUS: Record<SupplySubmissionStatus, StatusMeta> = {
  draft: { key: "supplyReview.status.draft", code: "draft", tone: "neutral" },
  submitted: {
    key: "supplyReview.status.submitted",
    code: "submitted",
    tone: "info",
  },
  in_review: {
    key: "supplyReview.status.in_review",
    code: "in_review",
    tone: "accent",
  },
  needs_revision: {
    key: "supplyReview.status.needs_revision",
    code: "needs_revision",
    tone: "warn",
  },
  approved: {
    key: "supplyReview.status.approved",
    code: "approved",
    tone: "success",
  },
  rejected: {
    key: "supplyReview.status.rejected",
    code: "rejected",
    tone: "danger",
  },
  withdrawn: {
    key: "supplyReview.status.withdrawn",
    code: "withdrawn",
    tone: "neutral",
  },
};

export interface SupplyQueueRow {
  id: string;
  submissionId: string;
  type: string;
  submissionType: SupplySubmissionType;
  fleet: string;
  fleetPartnerId: string;
  subject: string;
  rev: number;
  revisionNo: number;
  status: SupplySubmissionStatus;
  at: string;
  submittedAt: string | null;
  missing: number;
  lockedBy: string | null;
  area: string;
  svc: string;
}

export interface DiffRow {
  label: string;
  submitted: string;
  canonical: string;
  changed: boolean;
}

export interface DocumentRow {
  zh: string;
  file: string;
  from: string;
  until: string;
  s: string;
  tone: CanvasTone;
  rawDoc?: SupplyDocumentRecord;
}

export const REASON_CODES = [
  { value: "manual_screening", label: "人工初審 · manual_screening" },
  {
    value: "all_documents_valid",
    label: "文件齊全且合規 · all_documents_valid",
  },
  { value: "document_expired", label: "文件過期需更新 · document_expired" },
  { value: "document_missing", label: "缺必要文件 · document_missing" },
  {
    value: "information_mismatch",
    label: "資料與證件不符 · information_mismatch",
  },
  {
    value: "vehicle_unsupported",
    label: "車款不符合資格 · vehicle_unsupported",
  },
  { value: "license_invalid", label: "執照失效 · license_invalid" },
  {
    value: "other_revision_required",
    label: "其他需補正事項 · other_revision_required",
  },
  {
    value: "other_rejection_reason",
    label: "其他駁回原因 · other_rejection_reason",
  },
];

export function getReasonCodes(t?: TranslateFn) {
  if (!t) return REASON_CODES;
  return [
    {
      value: "manual_screening",
      label: t("supplyReview.reason.manual_screening"),
    },
    {
      value: "all_documents_valid",
      label: t("supplyReview.reason.all_documents_valid"),
    },
    {
      value: "document_expired",
      label: t("supplyReview.reason.document_expired"),
    },
    {
      value: "document_missing",
      label: t("supplyReview.reason.document_missing"),
    },
    {
      value: "information_mismatch",
      label: t("supplyReview.reason.information_mismatch"),
    },
    {
      value: "vehicle_unsupported",
      label: t("supplyReview.reason.vehicle_unsupported"),
    },
    {
      value: "license_invalid",
      label: t("supplyReview.reason.license_invalid"),
    },
    {
      value: "other_revision_required",
      label: t("supplyReview.reason.other_revision_required"),
    },
    {
      value: "other_rejection_reason",
      label: t("supplyReview.reason.other_rejection_reason"),
    },
  ];
}

export interface SupplyReviewErrorInfo {
  code: string;
  message: string;
  isConflict: boolean;
  isSelfApprovalDenied: boolean;
}

export function classifySupplyReviewError(
  error: unknown,
  t?: TranslateFn,
): SupplyReviewErrorInfo {
  const errObj = error as any;
  const code =
    errObj?.response?.error?.code ||
    errObj?.code ||
    (errObj?.message && errObj.message.includes("SUBMISSION_REVISION_CONFLICT")
      ? "SUBMISSION_REVISION_CONFLICT"
      : errObj?.message &&
          errObj.message.includes("REVIEWER_SELF_APPROVAL_DENIED")
        ? "REVIEWER_SELF_APPROVAL_DENIED"
        : "UNKNOWN_ERROR");

  const defaultMsg = t
    ? t("supplyReview.err.defaultFailed")
    : "操作失敗，請稍後重試。";

  const message =
    errObj?.response?.error?.message || errObj?.message || defaultMsg;

  return {
    code,
    message,
    isConflict: code === "SUBMISSION_REVISION_CONFLICT",
    isSelfApprovalDenied: code === "REVIEWER_SELF_APPROVAL_DENIED",
  };
}

export function mapSubmissionToTypeZh(type?: string, t?: TranslateFn): string {
  if (!type) return t ? t("supplyReview.type.object") : "物件";
  if (type.includes("driver"))
    return t ? t("supplyReview.type.driver") : "司機";
  if (type.includes("vehicle"))
    return t ? t("supplyReview.type.vehicle") : "車輛";
  if (type.includes("insurance"))
    return t ? t("supplyReview.type.insurance") : "保險";
  if (type.includes("contract"))
    return t ? t("supplyReview.type.contract") : "合約";
  return type;
}

export function mapDocTypeToZh(docType?: string, t?: TranslateFn): string {
  if (!docType) return t ? t("supplyReview.docType.doc") : "文件 · document";
  if (docType.includes("registration"))
    return t ? t("supplyReview.docType.registration") : "行照 · registration";
  if (docType.includes("insurance"))
    return t ? t("supplyReview.docType.insurance") : "保險保單 · insurance";
  if (docType.includes("contract"))
    return t ? t("supplyReview.docType.contract") : "加盟合約 · contract";
  if (docType.includes("driver_license"))
    return t ? t("supplyReview.docType.driver_license") : "職業駕照 · license";
  if (docType.includes("taxi_registration"))
    return t
      ? t("supplyReview.docType.taxi_registration")
      : "執照登記證 · taxi reg";
  return `${docType.replace(/_/g, " ")} · doc`;
}

export function buildSideBySideDiff(
  submissionId: string,
  submissionType: string,
  vehicleDraft: VehicleSupplyDraft | null | undefined,
  driverDraft: DriverSupplyDraft | null | undefined,
  canonicalVehicle: Record<string, any> | null | undefined,
  canonicalDriver: Record<string, any> | null | undefined,
  documents: SupplyDocumentRecord[] | undefined,
  t?: TranslateFn,
): DiffRow[] {
  const notCreated = t ? t("supplyReview.diff.notCreated") : "— (未建立)";
  const expiredText = t ? t("supplyReview.diff.expired") : "已過期";

  if (vehicleDraft) {
    const insDoc = documents?.find((d) => d.documentType.includes("insurance"));
    return [
      {
        label: t ? t("supplyReview.diff.plateNo") : "車牌號碼 · plate no",
        submitted: vehicleDraft.plateNo || "—",
        canonical: canonicalVehicle?.plateNo || notCreated,
        changed: Boolean(
          canonicalVehicle && vehicleDraft.plateNo !== canonicalVehicle.plateNo,
        ),
      },
      {
        label: t
          ? t("supplyReview.diff.licenseType")
          : "牌照類型 · license type",
        submitted: vehicleDraft.licenseType || "—",
        canonical: canonicalVehicle?.licenseType || "—",
        changed: Boolean(
          canonicalVehicle &&
          vehicleDraft.licenseType !== canonicalVehicle.licenseType,
        ),
      },
      {
        label: t ? t("supplyReview.diff.brandModel") : "廠牌車型 · brand/model",
        submitted:
          `${vehicleDraft.brand || ""} ${vehicleDraft.model || ""} (${vehicleDraft.modelYear || "—"})`.trim(),
        canonical: canonicalVehicle?.model
          ? `${canonicalVehicle.brand || ""} ${canonicalVehicle.model}`.trim()
          : "—",
        changed: Boolean(canonicalVehicle),
      },
      {
        label: t ? t("supplyReview.diff.seatCount") : "座位數 · seat count",
        submitted:
          typeof vehicleDraft.seatCount === "number"
            ? String(vehicleDraft.seatCount)
            : "—",
        canonical:
          canonicalVehicle && typeof canonicalVehicle.seatCount === "number"
            ? String(canonicalVehicle.seatCount)
            : "—",
        changed: Boolean(
          canonicalVehicle &&
          typeof vehicleDraft.seatCount === "number" &&
          typeof canonicalVehicle.seatCount === "number" &&
          vehicleDraft.seatCount !== canonicalVehicle.seatCount,
        ),
      },
      {
        label: t ? t("supplyReview.diff.luggage") : "行李容量 · luggage",
        submitted:
          typeof vehicleDraft.luggageCapacity === "number"
            ? String(vehicleDraft.luggageCapacity)
            : "—",
        canonical:
          canonicalVehicle &&
          typeof canonicalVehicle.luggageCapacity === "number"
            ? String(canonicalVehicle.luggageCapacity)
            : "—",
        changed: Boolean(
          canonicalVehicle &&
          typeof vehicleDraft.luggageCapacity === "number" &&
          typeof canonicalVehicle.luggageCapacity === "number" &&
          vehicleDraft.luggageCapacity !== canonicalVehicle.luggageCapacity,
        ),
      },
      {
        label: t
          ? t("supplyReview.diff.businessArea")
          : "營業區域 · business area",
        submitted: vehicleDraft.businessArea || "—",
        canonical: canonicalVehicle?.operatingArea || "—",
        changed: Boolean(
          canonicalVehicle &&
          vehicleDraft.businessArea !== canonicalVehicle.operatingArea,
        ),
      },
      {
        label: t ? t("supplyReview.diff.products") : "支援產品 · products",
        submitted: Array.isArray(vehicleDraft.supportedServiceProductCodes)
          ? vehicleDraft.supportedServiceProductCodes.join(", ")
          : "—",
        canonical: Array.isArray(canonicalVehicle?.supportedServiceBuckets)
          ? canonicalVehicle.supportedServiceBuckets.join(", ")
          : "—",
        changed: Boolean(canonicalVehicle),
      },
      {
        label: t
          ? t("supplyReview.diff.insuranceUntil")
          : "保險到期 · insurance until",
        submitted: insDoc?.effectiveUntil || "—",
        canonical:
          canonicalVehicle?.insuranceStatus === "expired"
            ? canonicalVehicle?.insuranceEffectiveUntil || expiredText
            : canonicalVehicle?.insuranceEffectiveUntil || "—",
        changed: Boolean(insDoc),
      },
    ];
  }

  if (driverDraft) {
    return [
      {
        label: t ? t("supplyReview.diff.driverName") : "司機姓名 · name",
        submitted: driverDraft.name || "—",
        canonical: canonicalDriver?.name || notCreated,
        changed: Boolean(
          canonicalDriver && driverDraft.name !== canonicalDriver.name,
        ),
      },
      {
        label: t ? t("supplyReview.diff.mobile") : "行動電話 · mobile",
        submitted: driverDraft.mobile || "—",
        canonical: canonicalDriver?.mobile || "—",
        changed: Boolean(
          canonicalDriver && driverDraft.mobile !== canonicalDriver.mobile,
        ),
      },
      {
        label: t
          ? t("supplyReview.diff.licenseNo")
          : "職業駕照號碼 · license no",
        submitted: driverDraft.professionalDriverLicenseNo || "—",
        canonical: canonicalDriver?.professionalDriverLicenseNo || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: t
          ? t("supplyReview.diff.licenseExpiry")
          : "駕照到期日 · license expiry",
        submitted: driverDraft.professionalDriverLicenseExpiry || "—",
        canonical: canonicalDriver?.professionalDriverLicenseExpiry || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: t
          ? t("supplyReview.diff.registrationNo")
          : "執照號碼 · registration no",
        submitted: driverDraft.taxiDriverRegistrationNo || "—",
        canonical: canonicalDriver?.taxiDriverRegistrationNo || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: t
          ? t("supplyReview.diff.registrationArea")
          : "執照區域 · registration area",
        submitted: driverDraft.taxiDriverRegistrationArea || "—",
        canonical: canonicalDriver?.taxiDriverRegistrationArea || "—",
        changed: Boolean(
          canonicalDriver &&
          driverDraft.taxiDriverRegistrationArea !==
            canonicalDriver.taxiDriverRegistrationArea,
        ),
      },
      {
        label: t ? t("supplyReview.diff.products") : "支援產品 · products",
        submitted: Array.isArray(driverDraft.supportedServiceProductCodes)
          ? driverDraft.supportedServiceProductCodes.join(", ")
          : "—",
        canonical: Array.isArray(canonicalDriver?.supportedServiceBuckets)
          ? canonicalDriver.supportedServiceBuckets.join(", ")
          : "—",
        changed: Boolean(canonicalDriver),
      },
    ];
  }

  return [];
}

export function buildDocumentRows(
  documents: SupplyDocumentRecord[] | undefined,
  t?: TranslateFn,
): DocumentRow[] {
  if (!documents || documents.length === 0) {
    return [];
  }

  return documents.map((doc) => ({
    zh: mapDocTypeToZh(doc.documentType, t),
    file: doc.originalFileName || `${doc.documentId}.pdf`,
    from: doc.effectiveFrom ? doc.effectiveFrom.slice(0, 7) : "—",
    until: doc.effectiveUntil ? doc.effectiveUntil.slice(0, 7) : "—",
    s:
      doc.reviewStatus === "approved"
        ? t
          ? t("supplyReview.docStatus.approved")
          : "已核可"
        : doc.reviewStatus === "rejected"
          ? t
            ? t("supplyReview.docStatus.rejected")
            : "已駁回"
          : doc.reviewStatus === "expired"
            ? t
              ? t("supplyReview.docStatus.expired")
              : "已過期"
            : t
              ? t("supplyReview.docStatus.pending")
              : "待審",
    tone:
      doc.reviewStatus === "approved"
        ? "success"
        : doc.reviewStatus === "rejected"
          ? "danger"
          : doc.reviewStatus === "expired"
            ? "warn"
            : "info",
    rawDoc: doc,
  }));
}
