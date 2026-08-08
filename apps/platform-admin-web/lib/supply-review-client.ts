import type { ApiClient } from "@drts/api-client";
import type {
  SupplyDocumentRecord,
  SupplyReviewActionCommand,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
} from "@drts/contracts";

export interface SupplyReviewItem {
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
  submittedAt: string;
  missing: number;
  lockedBy: string | null;
  area: string;
  svc: string;
  submittedBy: string | null;
  reviewReasonCode?: string | null;
  reviewComment?: string | null;
  canonicalVehicleId?: string | null;
  canonicalDriverId?: string | null;
}

export interface SupplyReviewDiffItem {
  label: string;
  submissionValue: string;
  canonicalValue: string;
  isChanged: boolean;
}

export interface SupplyReviewDocItem {
  zh: string;
  file: string;
  from: string;
  until: string;
  s: string;
  tone: "success" | "info" | "warn" | "danger" | "neutral";
}

export interface SupplyReviewDetailData {
  submission: SupplyReviewItem;
  diff: SupplyReviewDiffItem[];
  documents: SupplyReviewDocItem[];
  canonicalPreview: {
    vehicleOrDriver: string;
    affiliation: string;
    readiness: string;
    notification: string;
  };
}

export const PSR_REVIEWER = {
  name: "LP",
  display: "林佩璇",
  role: "platform_supply_reviewer",
  actorId: "platform-reviewer-001",
};

export const PSR_SUB_STATUS: Record<
  SupplySubmissionStatus,
  { zh: string; en: string; tone: "info" | "accent" | "warn" | "success" | "danger" | "neutral" }
> = {
  draft: { zh: "草稿", en: "draft", tone: "neutral" },
  submitted: { zh: "待受理", en: "submitted", tone: "info" },
  in_review: { zh: "審核中", en: "in_review", tone: "accent" },
  needs_revision: { zh: "已退補正", en: "needs_revision", tone: "warn" },
  approved: { zh: "已核可", en: "approved", tone: "success" },
  rejected: { zh: "已駁回", en: "rejected", tone: "danger" },
  withdrawn: { zh: "已撤回", en: "withdrawn", tone: "neutral" },
};

export const DEFAULT_QUEUE_DATA: SupplyReviewItem[] = [
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
    submittedAt: "2026-06-18T14:02:00Z",
    missing: 0,
    lockedBy: "林佩璇",
    area: "台北市",
    svc: "airport",
    submittedBy: "fleet-user-1",
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
    submittedAt: "2026-06-18T09:40:00Z",
    missing: 0,
    lockedBy: null,
    area: "台北市",
    svc: "realtime",
    submittedBy: "fleet-user-1",
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
    submittedAt: "2026-06-18T08:15:00Z",
    missing: 1,
    lockedBy: null,
    area: "宜蘭縣",
    svc: "realtime",
    submittedBy: "fleet-user-2",
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
    submittedAt: "2026-06-18T09:42:00Z",
    missing: 0,
    lockedBy: null,
    area: "台北市",
    svc: "business",
    submittedBy: "fleet-user-1",
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
    submittedAt: "2026-06-17T16:50:00Z",
    missing: 0,
    lockedBy: "張哲瑋",
    area: "台中市",
    svc: "insurance",
    submittedBy: "fleet-user-3",
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
    submittedAt: "2026-06-15T11:08:00Z",
    missing: 0,
    lockedBy: null,
    area: "台北市",
    svc: "realtime",
    submittedBy: "fleet-user-1",
  },
];

export const DEMO_SUBMISSION_DIFF: Record<string, SupplyReviewDiffItem[]> = {
  sub_s39: [
    { label: "座位數 · seat count", submissionValue: "9", canonicalValue: "7", isChanged: true },
    { label: "行李容量 · luggage", submissionValue: "6", canonicalValue: "6", isChanged: false },
    { label: "機場接送資格 · airport eligible", submissionValue: "是 true", canonicalValue: "否 false", isChanged: true },
    { label: "支援產品 · products", submissionValue: "realtime, business, airport", canonicalValue: "realtime, business", isChanged: true },
    { label: "保險到期 · insurance until", submissionValue: "2027-07-01", canonicalValue: "2026-07-02", isChanged: true },
  ],
};

export const DEMO_SUBMISSION_DOCS: Record<string, SupplyReviewDocItem[]> = {
  sub_s39: [
    { zh: "行照 · registration", file: "reg_kab7720.pdf", from: "2024-01", until: "2029-01", s: "已核可", tone: "success" },
    { zh: "保險保單 · insurance", file: "policy_kab7720.pdf", from: "2026-07", until: "2027-07", s: "待審", tone: "info" },
  ],
};

export function formatSubmissionTypeLabel(type: SupplySubmissionType | string): string {
  switch (type) {
    case "driver_onboarding":
    case "driver_affiliation":
      return "司機";
    case "vehicle_onboarding":
    case "vehicle_affiliation":
      return "車輛";
    case "insurance_update":
      return "保險";
    case "contract_update":
      return "合約";
    default:
      return type;
  }
}

export function transformRecordToItem(record: SupplySubmissionRecord): SupplyReviewItem {
  return {
    id: record.submissionId,
    submissionId: record.submissionId,
    type: formatSubmissionTypeLabel(record.submissionType),
    submissionType: record.submissionType,
    fleet: record.fleetPartnerId === "fleet-demo-001" ? "大都會車隊" : record.fleetPartnerId,
    fleetPartnerId: record.fleetPartnerId,
    subject: record.subjectVehicleId || record.subjectDriverId || `${record.submissionType} (${record.submissionId})`,
    rev: record.revisionNo,
    revisionNo: record.revisionNo,
    status: record.status,
    at: record.submittedAt ? record.submittedAt.slice(5, 16).replace("T", " ") : "—",
    submittedAt: record.submittedAt || record.createdAt,
    missing: 0,
    lockedBy: record.reviewStartedBy || null,
    area: "台北市",
    svc: "realtime",
    submittedBy: record.submittedBy,
    reviewReasonCode: record.reviewReasonCode,
    reviewComment: record.reviewComment,
    canonicalVehicleId: record.canonicalVehicleId,
    canonicalDriverId: record.canonicalDriverId,
  };
}

export async function fetchSupplyReviewSubmissions(client: ApiClient): Promise<SupplyReviewItem[]> {
  try {
    const apiRecords = await client.listSupplyReviewSubmissions();
    if (apiRecords && Array.isArray(apiRecords) && apiRecords.length > 0) {
      const transformed = apiRecords.map(transformRecordToItem);
      // Merge defaults that are not present in API results
      const existingIds = new Set(transformed.map((t) => t.id));
      const missingDefaults = DEFAULT_QUEUE_DATA.filter((d) => !existingIds.has(d.id));
      return [...transformed, ...missingDefaults];
    }
  } catch {
    // Return default queue fallback for development or offline testing
  }

  return DEFAULT_QUEUE_DATA;
}

export async function fetchSupplyReviewDetail(
  client: ApiClient,
  submissionId: string,
): Promise<SupplyReviewDetailData> {
  const targetId = submissionId || "sub_s39";
  let item: SupplyReviewItem | undefined;

  try {
    const apiRecord = await client.getSupplyReviewSubmission(targetId);
    if (apiRecord) {
      item = transformRecordToItem(apiRecord);
    }
  } catch {
    // Ignore and fallback
  }

  if (!item) {
    item = DEFAULT_QUEUE_DATA.find((i) => i.id === targetId || i.submissionId === targetId);
  }

  if (!item) {
    item = {
      id: targetId,
      submissionId: targetId,
      type: "車輛",
      submissionType: "vehicle_onboarding",
      fleet: "大都會車隊",
      fleetPartnerId: "fleet-demo-001",
      subject: `${targetId} · Supply Submission`,
      rev: 1,
      revisionNo: 1,
      status: "in_review",
      at: "06-18 14:02",
      submittedAt: new Date().toISOString(),
      missing: 0,
      lockedBy: "林佩璇",
      area: "台北市",
      svc: "airport",
      submittedBy: "fleet-user-1",
    };
  }

  const diff: SupplyReviewDiffItem[] = DEMO_SUBMISSION_DIFF[targetId] || DEMO_SUBMISSION_DIFF["sub_s39"] || [];
  const documents: SupplyReviewDocItem[] = DEMO_SUBMISSION_DOCS[targetId] || DEMO_SUBMISSION_DOCS["sub_s39"] || [];

  return {
    submission: item,
    diff,
    documents,
    canonicalPreview: {
      vehicleOrDriver: "veh_9120 (update)",
      affiliation: `${item.fleet === "大都會車隊" ? "METRO_FLEET" : item.fleetPartnerId} ↔ veh_9120`,
      readiness: "ready",
      notification: "車行 + 司機",
    },
  };
}

export async function startReviewAction(
  client: ApiClient,
  submissionId: string,
  expectedRevisionNo: number,
  comment?: string,
): Promise<SupplySubmissionRecord> {
  const command: SupplyReviewActionCommand = {
    expectedRevisionNo,
    reasonCode: "manual_screening",
    comment: comment || "Start queue handling.",
  };

  return client.startSupplyReview(submissionId, command);
}

export async function requestRevisionAction(
  client: ApiClient,
  submissionId: string,
  expectedRevisionNo: number,
  reasonCode: string,
  comment?: string,
): Promise<SupplySubmissionRecord> {
  const command: SupplyReviewActionCommand = {
    expectedRevisionNo,
    reasonCode: reasonCode || "document_expired",
    comment: comment || "Please re-upload missing/expired documents.",
  };

  return client.requestSupplyRevision(submissionId, command);
}

export async function approveSubmissionAction(
  client: ApiClient,
  submissionId: string,
  expectedRevisionNo: number,
  comment?: string,
): Promise<SupplySubmissionRecord> {
  const command: SupplyReviewActionCommand = {
    expectedRevisionNo,
    reasonCode: "all_documents_valid",
    comment: comment || "Approval completed and canonical registry provisioned.",
  };

  return client.approveSupplySubmission(submissionId, command);
}

export async function rejectSubmissionAction(
  client: ApiClient,
  submissionId: string,
  expectedRevisionNo: number,
  reasonCode: string,
  comment?: string,
): Promise<SupplySubmissionRecord> {
  const command: SupplyReviewActionCommand = {
    expectedRevisionNo,
    reasonCode: reasonCode || "rejected_by_reviewer",
    comment: comment || "Submission rejected after manual screening.",
  };

  return client.rejectSupplySubmission(submissionId, command);
}
