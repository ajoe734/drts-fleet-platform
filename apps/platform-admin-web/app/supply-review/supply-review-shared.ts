import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
  VehicleSupplyDraft,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web";

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

export interface StatusMeta {
  zh: string;
  en: string;
  tone: CanvasTone;
}

export const PSR_SUB_STATUS: Record<SupplySubmissionStatus, StatusMeta> = {
  draft: { zh: "草稿", en: "draft", tone: "neutral" },
  submitted: { zh: "待受理", en: "submitted", tone: "info" },
  in_review: { zh: "審核中", en: "in_review", tone: "accent" },
  needs_revision: { zh: "已退補正", en: "needs_revision", tone: "warn" },
  approved: { zh: "已核可", en: "approved", tone: "success" },
  rejected: { zh: "已駁回", en: "rejected", tone: "danger" },
  withdrawn: { zh: "已撤回", en: "withdrawn", tone: "neutral" },
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

export interface SupplyReviewErrorInfo {
  code: string;
  message: string;
  isConflict: boolean;
  isSelfApprovalDenied: boolean;
}

export function classifySupplyReviewError(
  error: unknown,
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

  const message =
    errObj?.response?.error?.message ||
    errObj?.message ||
    "操作失敗，請稍後重試。";

  return {
    code,
    message,
    isConflict: code === "SUBMISSION_REVISION_CONFLICT",
    isSelfApprovalDenied: code === "REVIEWER_SELF_APPROVAL_DENIED",
  };
}

export function mapSubmissionToTypeZh(type?: string): string {
  if (!type) return "物件";
  if (type.includes("driver")) return "司機";
  if (type.includes("vehicle")) return "車輛";
  if (type.includes("insurance")) return "保險";
  if (type.includes("contract")) return "合約";
  return type;
}

export function mapDocTypeToZh(docType?: string): string {
  if (!docType) return "文件 · document";
  if (docType.includes("registration")) return "行照 · registration";
  if (docType.includes("insurance")) return "保險保單 · insurance";
  if (docType.includes("contract")) return "加盟合約 · contract";
  if (docType.includes("driver_license")) return "職業駕照 · license";
  if (docType.includes("taxi_registration")) return "執照登記證 · taxi reg";
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
): DiffRow[] {
  if (vehicleDraft) {
    const insDoc = documents?.find((d) => d.documentType.includes("insurance"));
    return [
      {
        label: "車牌號碼 · plate no",
        submitted: vehicleDraft.plateNo || "—",
        canonical: canonicalVehicle?.plateNo || "— (未建立)",
        changed: Boolean(
          canonicalVehicle && vehicleDraft.plateNo !== canonicalVehicle.plateNo,
        ),
      },
      {
        label: "牌照類型 · license type",
        submitted: vehicleDraft.licenseType || "—",
        canonical: canonicalVehicle?.licenseType || "—",
        changed: Boolean(
          canonicalVehicle &&
          vehicleDraft.licenseType !== canonicalVehicle.licenseType,
        ),
      },
      {
        label: "廠牌車型 · brand/model",
        submitted:
          `${vehicleDraft.brand || ""} ${vehicleDraft.model || ""} (${vehicleDraft.modelYear || "—"})`.trim(),
        canonical: canonicalVehicle?.model
          ? `${canonicalVehicle.brand || ""} ${canonicalVehicle.model}`.trim()
          : "—",
        changed: Boolean(canonicalVehicle),
      },
      {
        label: "座位數 · seat count",
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
        label: "行李容量 · luggage",
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
        label: "營業區域 · business area",
        submitted: vehicleDraft.businessArea || "—",
        canonical: canonicalVehicle?.operatingArea || "—",
        changed: Boolean(
          canonicalVehicle &&
          vehicleDraft.businessArea !== canonicalVehicle.operatingArea,
        ),
      },
      {
        label: "支援產品 · products",
        submitted: Array.isArray(vehicleDraft.supportedServiceProductCodes)
          ? vehicleDraft.supportedServiceProductCodes.join(", ")
          : "—",
        canonical: Array.isArray(canonicalVehicle?.supportedServiceBuckets)
          ? canonicalVehicle.supportedServiceBuckets.join(", ")
          : "—",
        changed: Boolean(canonicalVehicle),
      },
      {
        label: "保險到期 · insurance until",
        submitted: insDoc?.effectiveUntil || "—",
        canonical:
          canonicalVehicle?.insuranceStatus === "expired"
            ? canonicalVehicle?.insuranceEffectiveUntil || "已過期"
            : canonicalVehicle?.insuranceEffectiveUntil || "—",
        changed: Boolean(insDoc),
      },
    ];
  }

  if (driverDraft) {
    return [
      {
        label: "司機姓名 · name",
        submitted: driverDraft.name || "—",
        canonical: canonicalDriver?.name || "— (未建立)",
        changed: Boolean(
          canonicalDriver && driverDraft.name !== canonicalDriver.name,
        ),
      },
      {
        label: "行動電話 · mobile",
        submitted: driverDraft.mobile || "—",
        canonical: canonicalDriver?.mobile || "—",
        changed: Boolean(
          canonicalDriver && driverDraft.mobile !== canonicalDriver.mobile,
        ),
      },
      {
        label: "職業駕照號碼 · license no",
        submitted: driverDraft.professionalDriverLicenseNo || "—",
        canonical: canonicalDriver?.professionalDriverLicenseNo || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: "駕照到期日 · license expiry",
        submitted: driverDraft.professionalDriverLicenseExpiry || "—",
        canonical: canonicalDriver?.professionalDriverLicenseExpiry || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: "執照號碼 · registration no",
        submitted: driverDraft.taxiDriverRegistrationNo || "—",
        canonical: canonicalDriver?.taxiDriverRegistrationNo || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: "執照區域 · registration area",
        submitted: driverDraft.taxiDriverRegistrationArea || "—",
        canonical: canonicalDriver?.taxiDriverRegistrationArea || "—",
        changed: Boolean(
          canonicalDriver &&
          driverDraft.taxiDriverRegistrationArea !==
            canonicalDriver.taxiDriverRegistrationArea,
        ),
      },
      {
        label: "支援產品 · products",
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
): DocumentRow[] {
  if (!documents || documents.length === 0) {
    return [];
  }

  return documents.map((doc) => ({
    zh: mapDocTypeToZh(doc.documentType),
    file: doc.originalFileName || `${doc.documentId}.pdf`,
    from: doc.effectiveFrom ? doc.effectiveFrom.slice(0, 7) : "—",
    until: doc.effectiveUntil ? doc.effectiveUntil.slice(0, 7) : "—",
    s:
      doc.reviewStatus === "approved"
        ? "已核可"
        : doc.reviewStatus === "rejected"
          ? "已駁回"
          : doc.reviewStatus === "expired"
            ? "已過期"
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
