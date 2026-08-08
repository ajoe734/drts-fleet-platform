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

export const FX_PSR_QUEUE: SupplyQueueRow[] = [
  {
    id: "sub_s39",
    submissionId: "sub_s39",
    type: "車輛",
    submissionType: "vehicle_onboarding",
    fleet: "大都會車隊",
    fleetPartnerId: "fleet-demo-001",
    subject: "KAB-7720 · Hyundai Custo",
    rev: 1,
    revisionNo: 1,
    status: "in_review",
    at: "06-18 14:02",
    submittedAt: "2026-06-18T14:02:00.000Z",
    missing: 0,
    lockedBy: "林佩璇",
    area: "台北市",
    svc: "airport",
  },
  {
    id: "sub_s38",
    submissionId: "sub_s38",
    type: "司機",
    submissionType: "driver_onboarding",
    fleet: "大都會車隊",
    fleetPartnerId: "fleet-demo-001",
    subject: "蔡明憲",
    rev: 1,
    revisionNo: 1,
    status: "submitted",
    at: "06-18 09:40",
    submittedAt: "2026-06-18T09:40:00.000Z",
    missing: 0,
    lockedBy: null,
    area: "台北市",
    svc: "realtime",
  },
  {
    id: "sub_t02",
    submissionId: "sub_t02",
    type: "司機",
    submissionType: "driver_onboarding",
    fleet: "蘭陽小客車",
    fleetPartnerId: "fleet-demo-002",
    subject: "游志豪",
    rev: 1,
    revisionNo: 1,
    status: "submitted",
    at: "06-18 08:15",
    submittedAt: "2026-06-18T08:15:00.000Z",
    missing: 1,
    lockedBy: null,
    area: "宜蘭縣",
    svc: "realtime",
  },
  {
    id: "sub_r33",
    submissionId: "sub_r33",
    type: "車輛",
    submissionType: "vehicle_onboarding",
    fleet: "大都會車隊",
    fleetPartnerId: "fleet-demo-001",
    subject: "KAB-6610 · Toyota Sienta",
    rev: 2,
    revisionNo: 2,
    status: "submitted",
    at: "06-18 09:42",
    submittedAt: "2026-06-18T09:42:00.000Z",
    missing: 0,
    lockedBy: null,
    area: "台北市",
    svc: "business",
  },
  {
    id: "sub_u51",
    submissionId: "sub_u51",
    type: "保險",
    submissionType: "insurance_update",
    fleet: "海線車隊",
    fleetPartnerId: "fleet-demo-003",
    subject: "TXG-1180 · 保單",
    rev: 1,
    revisionNo: 1,
    status: "in_review",
    at: "06-17 16:50",
    submittedAt: "2026-06-17T16:50:00.000Z",
    missing: 0,
    lockedBy: "張哲瑋",
    area: "台中市",
    svc: "insurance",
  },
  {
    id: "sub_a20",
    submissionId: "sub_a20",
    type: "司機",
    submissionType: "driver_onboarding",
    fleet: "大都會車隊",
    fleetPartnerId: "fleet-demo-001",
    subject: "高至誠 → d_9120",
    rev: 1,
    revisionNo: 1,
    status: "approved",
    at: "06-15 11:08",
    submittedAt: "2026-06-15T11:08:00.000Z",
    missing: 0,
    lockedBy: null,
    area: "台北市",
    svc: "realtime",
  },
];

export interface DiffRow {
  label: string;
  submitted: string;
  canonical: string;
  changed: boolean;
}

export const DEFAULT_DIFF_ROWS: DiffRow[] = [
  {
    label: "座位數 · seat count",
    submitted: "9",
    canonical: "7",
    changed: true,
  },
  {
    label: "行李容量 · luggage",
    submitted: "6",
    canonical: "6",
    changed: false,
  },
  {
    label: "機場接送資格 · airport eligible",
    submitted: "是 true",
    canonical: "否 false",
    changed: true,
  },
  {
    label: "支援產品 · products",
    submitted: "realtime, business, airport",
    canonical: "realtime, business",
    changed: true,
  },
  {
    label: "保險到期 · insurance until",
    submitted: "2027-07-01",
    canonical: "2026-07-02",
    changed: true,
  },
];

export interface DocumentRow {
  zh: string;
  file: string;
  from: string;
  until: string;
  s: string;
  tone: CanvasTone;
  rawDoc?: SupplyDocumentRecord;
}

export const DEFAULT_DOCUMENT_ROWS: DocumentRow[] = [
  {
    zh: "行照 · registration",
    file: "reg_kab7720.pdf",
    from: "2024-01",
    until: "2029-01",
    s: "已核可",
    tone: "success",
  },
  {
    zh: "保險保單 · insurance",
    file: "policy_kab7720.pdf",
    from: "2026-07",
    until: "2027-07",
    s: "待審",
    tone: "info",
  },
];

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
  if (submissionId === "sub_s39" || (!vehicleDraft && !driverDraft && submissionType.includes("vehicle"))) {
    const insDoc = documents?.find((d) => d.documentType.includes("insurance"));
    return [
      {
        label: "座位數 · seat count",
        submitted: vehicleDraft ? String(vehicleDraft.seatCount) : "9",
        canonical: canonicalVehicle ? String(canonicalVehicle.seatCount ?? 7) : "7",
        changed: true,
      },
      {
        label: "行李容量 · luggage",
        submitted: vehicleDraft ? String(vehicleDraft.luggageCapacity) : "6",
        canonical: canonicalVehicle ? String(canonicalVehicle.luggageCapacity ?? 6) : "6",
        changed: false,
      },
      {
        label: "機場接送資格 · airport eligible",
        submitted: vehicleDraft ? (vehicleDraft.airportTransferEligible ? "是 true" : "否 false") : "是 true",
        canonical: canonicalVehicle ? (canonicalVehicle.airportTransferEligible ? "是 true" : "否 false") : "否 false",
        changed: true,
      },
      {
        label: "支援產品 · products",
        submitted: vehicleDraft ? vehicleDraft.supportedServiceProductCodes.join(", ") : "realtime, business, airport",
        canonical: canonicalVehicle ? (canonicalVehicle.supportedServiceBuckets || []).join(", ") : "realtime, business",
        changed: true,
      },
      {
        label: "保險到期 · insurance until",
        submitted: insDoc?.effectiveUntil || "2027-07-01",
        canonical: canonicalVehicle?.insuranceStatus === "expired" ? "2026-03-31" : "2026-07-02",
        changed: true,
      },
    ];
  }

  if (vehicleDraft) {
    const insDoc = documents?.find((d) => d.documentType.includes("insurance"));
    return [
      {
        label: "車牌號碼 · plate no",
        submitted: vehicleDraft.plateNo,
        canonical: canonicalVehicle?.plateNo || "— (未建立)",
        changed: Boolean(canonicalVehicle && vehicleDraft.plateNo !== canonicalVehicle.plateNo),
      },
      {
        label: "牌照類型 · license type",
        submitted: vehicleDraft.licenseType,
        canonical: canonicalVehicle?.licenseType || "—",
        changed: Boolean(canonicalVehicle && vehicleDraft.licenseType !== canonicalVehicle.licenseType),
      },
      {
        label: "廠牌車型 · brand/model",
        submitted: `${vehicleDraft.brand} ${vehicleDraft.model} (${vehicleDraft.modelYear})`,
        canonical: canonicalVehicle?.model ? `${canonicalVehicle.brand || ""} ${canonicalVehicle.model}` : "—",
        changed: Boolean(canonicalVehicle),
      },
      {
        label: "座位數 · seat count",
        submitted: String(vehicleDraft.seatCount),
        canonical: canonicalVehicle?.seatCount ? String(canonicalVehicle.seatCount) : "—",
        changed: Boolean(canonicalVehicle && vehicleDraft.seatCount !== canonicalVehicle.seatCount),
      },
      {
        label: "行李容量 · luggage",
        submitted: String(vehicleDraft.luggageCapacity),
        canonical: canonicalVehicle?.luggageCapacity ? String(canonicalVehicle.luggageCapacity) : "—",
        changed: Boolean(canonicalVehicle && vehicleDraft.luggageCapacity !== canonicalVehicle.luggageCapacity),
      },
      {
        label: "營業區域 · business area",
        submitted: vehicleDraft.businessArea,
        canonical: canonicalVehicle?.operatingArea || "—",
        changed: Boolean(canonicalVehicle && vehicleDraft.businessArea !== canonicalVehicle.operatingArea),
      },
      {
        label: "支援產品 · products",
        submitted: vehicleDraft.supportedServiceProductCodes.join(", "),
        canonical: canonicalVehicle?.supportedServiceBuckets ? canonicalVehicle.supportedServiceBuckets.join(", ") : "—",
        changed: true,
      },
      {
        label: "保險到期 · insurance until",
        submitted: insDoc?.effectiveUntil || "—",
        canonical: canonicalVehicle?.insuranceStatus === "expired" ? "2026-03-31" : "—",
        changed: Boolean(insDoc),
      },
    ];
  }

  if (driverDraft) {
    return [
      {
        label: "司機姓名 · name",
        submitted: driverDraft.name,
        canonical: canonicalDriver?.name || "— (未建立)",
        changed: Boolean(canonicalDriver && driverDraft.name !== canonicalDriver.name),
      },
      {
        label: "行動電話 · mobile",
        submitted: driverDraft.mobile,
        canonical: canonicalDriver?.mobile || "—",
        changed: Boolean(canonicalDriver && driverDraft.mobile !== canonicalDriver.mobile),
      },
      {
        label: "職業駕照號碼 · license no",
        submitted: driverDraft.professionalDriverLicenseNo,
        canonical: canonicalDriver?.professionalDriverLicenseNo || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: "駕照到期日 · license expiry",
        submitted: driverDraft.professionalDriverLicenseExpiry,
        canonical: canonicalDriver?.professionalDriverLicenseExpiry || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: "執照號碼 · registration no",
        submitted: driverDraft.taxiDriverRegistrationNo,
        canonical: canonicalDriver?.taxiDriverRegistrationNo || "—",
        changed: Boolean(canonicalDriver),
      },
      {
        label: "執照區域 · registration area",
        submitted: driverDraft.taxiDriverRegistrationArea,
        canonical: canonicalDriver?.taxiDriverRegistrationArea || "—",
        changed: Boolean(canonicalDriver && driverDraft.taxiDriverRegistrationArea !== canonicalDriver.taxiDriverRegistrationArea),
      },
      {
        label: "支援產品 · products",
        submitted: driverDraft.supportedServiceProductCodes.join(", "),
        canonical: canonicalDriver?.supportedServiceBuckets ? canonicalDriver.supportedServiceBuckets.join(", ") : "—",
        changed: true,
      },
    ];
  }

  return DEFAULT_DIFF_ROWS;
}

export function buildDocumentRows(
  documents: SupplyDocumentRecord[] | undefined,
): DocumentRow[] {
  if (!documents || documents.length === 0) {
    return DEFAULT_DOCUMENT_ROWS;
  }

  return documents.map((doc) => ({
    zh: mapDocTypeToZh(doc.documentType),
    file: doc.originalFileName || `${doc.documentId}.pdf`,
    from: doc.effectiveFrom ? doc.effectiveFrom.slice(0, 7) : "2024-01",
    until: doc.effectiveUntil ? doc.effectiveUntil.slice(0, 7) : "2029-01",
    s: doc.reviewStatus === "approved" ? "已核可" : "待審",
    tone: doc.reviewStatus === "approved" ? "success" : "info",
    rawDoc: doc,
  }));
}
