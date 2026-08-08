import "server-only";

import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyDocumentType,
  SupplyReadinessReasonCode,
  SupplyReadinessRecord,
  SupplyReadinessState,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
  VehicleSupplyDraft,
} from "@drts/contracts";

import { getServerFleetPartnerClient } from "./api-client.server";

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

type SupplyBundle = {
  submissions: SupplySubmissionDetail[];
  readiness: SupplyReadinessRecord[];
  source: SupplyDataSource;
};

const FALLBACK_SUBMISSIONS: SupplySubmissionDetail[] = [
  {
    submission: {
      submissionId: "sub_s39",
      fleetPartnerId: "fleet-demo-001",
      submissionType: "vehicle_onboarding",
      status: "in_review",
      revisionNo: 1,
      subjectDriverId: null,
      subjectVehicleId: null,
      submittedBy: "fleet-user-1",
      submittedAt: "2026-06-18T14:02:00.000Z",
      reviewStartedBy: "platform-reviewer-011",
      reviewStartedAt: "2026-06-18T15:02:00.000Z",
      reviewedBy: null,
      reviewedAt: null,
      reviewReasonCode: null,
      reviewComment: "Vehicle documents ready for approval.",
      canonicalDriverId: null,
      canonicalVehicleId: null,
      canonicalContractId: null,
      canonicalPolicyId: null,
      createdAt: "2026-06-18T13:42:00.000Z",
      updatedAt: "2026-06-18T15:02:00.000Z",
    },
    driverDraft: null,
    vehicleDraft: {
      submissionId: "sub_s39",
      plateNo: "KAB-7720",
      licenseType: "taxi",
      brand: "Hyundai",
      model: "Custo",
      modelYear: 2024,
      seatCount: 9,
      luggageCapacity: 6,
      businessArea: "台北市",
      supportedServiceProductCodes: ["taxi_realtime", "airport_transfer"],
      airportTransferEligible: true,
      fixedFareAllowed: false,
      currentDriverSubmissionId: "sub_s38",
      doorCount: 4,
      color: "black",
    },
    documents: [
      makeDoc("doc_01", "sub_s39", "vehicle_registration", "reg_kab7720.pdf", "approved", "2024-01-12", "2029-01-12"),
      makeDoc("doc_02", "sub_s39", "insurance_policy", "policy_kab7720.pdf", "pending", "2026-08-01", "2026-08-18"),
      makeDoc("doc_03", "sub_s39", "fleet_participation_contract", "contract_metro.pdf", "approved", "2025-06-01", "2026-09-02"),
    ],
    reviewEvents: [
      makeEvent("evt_01", "sub_s39", "submitted", "fleet-user-1", "partner_api_key", null, "Waiting for reviewer", "2026-06-18T14:02:00.000Z"),
      makeEvent("evt_02", "sub_s39", "review_started", "platform-reviewer-011", "platform_admin", "manual_screening", "Vehicle documents ready for approval.", "2026-06-18T15:02:00.000Z"),
    ],
  },
  {
    submission: {
      submissionId: "sub_s38",
      fleetPartnerId: "fleet-demo-001",
      submissionType: "driver_onboarding",
      status: "submitted",
      revisionNo: 1,
      subjectDriverId: null,
      subjectVehicleId: null,
      submittedBy: "fleet-user-1",
      submittedAt: "2026-06-18T09:40:00.000Z",
      reviewStartedBy: null,
      reviewStartedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReasonCode: null,
      reviewComment: null,
      canonicalDriverId: null,
      canonicalVehicleId: null,
      canonicalContractId: null,
      canonicalPolicyId: null,
      createdAt: "2026-06-18T09:00:00.000Z",
      updatedAt: "2026-06-18T09:40:00.000Z",
    },
    driverDraft: {
      submissionId: "sub_s38",
      name: "蔡明憲",
      mobile: "0922-118-446",
      professionalDriverLicenseNo: "A1-2208-44102",
      professionalDriverLicenseExpiry: "2028-03-01",
      taxiDriverRegistrationNo: "TXR-118-2204",
      taxiDriverRegistrationArea: "台北市",
      taxiDriverRegistrationExpiry: "2027-05-10",
      supportedServiceProductCodes: ["taxi_realtime", "business_dispatch"],
      preferredVehicleSubmissionId: "sub_s39",
    },
    vehicleDraft: null,
    documents: [
      makeDoc("doc_04", "sub_s38", "professional_driver_license", "license_tsai.pdf", "approved", "2024-03-01", "2028-03-01"),
      makeDoc("doc_05", "sub_s38", "taxi_driver_registration", "taxi_reg_tsai.jpg", "pending", "2026-08-01", "2026-08-30"),
    ],
    reviewEvents: [
      makeEvent("evt_03", "sub_s38", "submitted", "fleet-user-1", "partner_api_key", null, null, "2026-06-18T09:40:00.000Z"),
    ],
  },
  {
    submission: {
      submissionId: "sub_r33",
      fleetPartnerId: "fleet-demo-001",
      submissionType: "vehicle_onboarding",
      status: "needs_revision",
      revisionNo: 2,
      subjectDriverId: null,
      subjectVehicleId: null,
      submittedBy: "fleet-user-1",
      submittedAt: "2026-06-17T16:20:00.000Z",
      reviewStartedBy: "platform-reviewer-019",
      reviewStartedAt: "2026-06-17T16:40:00.000Z",
      reviewedBy: "platform-reviewer-019",
      reviewedAt: "2026-06-17T17:00:00.000Z",
      reviewReasonCode: "DOCUMENT_REQUIRED",
      reviewComment: "行照模糊，請重新上傳",
      canonicalDriverId: null,
      canonicalVehicleId: null,
      canonicalContractId: null,
      canonicalPolicyId: null,
      createdAt: "2026-06-17T15:40:00.000Z",
      updatedAt: "2026-06-17T17:00:00.000Z",
    },
    driverDraft: null,
    vehicleDraft: {
      submissionId: "sub_r33",
      plateNo: "KAB-6610",
      licenseType: "taxi",
      brand: "Toyota",
      model: "Sienta",
      modelYear: 2022,
      seatCount: 5,
      luggageCapacity: 3,
      businessArea: "台北市",
      supportedServiceProductCodes: ["taxi_realtime"],
      airportTransferEligible: false,
      fixedFareAllowed: false,
      currentDriverSubmissionId: null,
      doorCount: 4,
      color: "silver",
    },
    documents: [
      makeDoc("doc_06", "sub_r33", "vehicle_registration", "reg_kab6610.pdf", "rejected", "2024-01-12", "2029-01-12"),
    ],
    reviewEvents: [
      makeEvent("evt_04", "sub_r33", "submitted", "fleet-user-1", "partner_api_key", null, null, "2026-06-17T16:20:00.000Z"),
      makeEvent("evt_05", "sub_r33", "needs_revision", "platform-reviewer-019", "platform_admin", "DOCUMENT_REQUIRED", "行照模糊，請重新上傳", "2026-06-17T17:00:00.000Z"),
    ],
  },
  {
    submission: {
      submissionId: "sub_d41",
      fleetPartnerId: "fleet-demo-001",
      submissionType: "driver_onboarding",
      status: "draft",
      revisionNo: 0,
      subjectDriverId: null,
      subjectVehicleId: null,
      submittedBy: null,
      submittedAt: null,
      reviewStartedBy: null,
      reviewStartedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReasonCode: null,
      reviewComment: null,
      canonicalDriverId: null,
      canonicalVehicleId: null,
      canonicalContractId: null,
      canonicalPolicyId: null,
      createdAt: "2026-06-18T07:10:00.000Z",
      updatedAt: "2026-06-18T07:10:00.000Z",
    },
    driverDraft: {
      submissionId: "sub_d41",
      name: "周建良",
      mobile: "0912-345-678",
      professionalDriverLicenseNo: "A1-2208-22910",
      professionalDriverLicenseExpiry: "2028-06-01",
      taxiDriverRegistrationNo: "TXR-22910",
      taxiDriverRegistrationArea: "新北市",
      taxiDriverRegistrationExpiry: "2027-12-31",
      supportedServiceProductCodes: ["taxi_realtime"],
      preferredVehicleSubmissionId: null,
    },
    vehicleDraft: null,
    documents: [],
    reviewEvents: [],
  },
  {
    submission: {
      submissionId: "sub_a20",
      fleetPartnerId: "fleet-demo-001",
      submissionType: "driver_onboarding",
      status: "approved",
      revisionNo: 1,
      subjectDriverId: "d_9120",
      subjectVehicleId: null,
      submittedBy: "fleet-user-1",
      submittedAt: "2026-06-15T11:08:00.000Z",
      reviewStartedBy: "platform-reviewer-001",
      reviewStartedAt: "2026-06-15T11:20:00.000Z",
      reviewedBy: "platform-reviewer-001",
      reviewedAt: "2026-06-15T11:40:00.000Z",
      reviewReasonCode: "all_documents_valid",
      reviewComment: "已核可",
      canonicalDriverId: "d_9120",
      canonicalVehicleId: null,
      canonicalContractId: null,
      canonicalPolicyId: null,
      createdAt: "2026-06-15T10:40:00.000Z",
      updatedAt: "2026-06-15T11:40:00.000Z",
    },
    driverDraft: {
      submissionId: "sub_a20",
      name: "高至誠",
      mobile: "0928-000-112",
      professionalDriverLicenseNo: "A1-9910-11220",
      professionalDriverLicenseExpiry: "2029-02-01",
      taxiDriverRegistrationNo: "TXR-009120",
      taxiDriverRegistrationArea: "台北市",
      taxiDriverRegistrationExpiry: "2028-02-01",
      supportedServiceProductCodes: ["taxi_realtime", "business_dispatch"],
      preferredVehicleSubmissionId: null,
    },
    vehicleDraft: null,
    documents: [
      makeDoc("doc_07", "sub_a20", "professional_driver_license", "license_kao.pdf", "approved", "2025-02-01", "2029-02-01"),
    ],
    reviewEvents: [
      makeEvent("evt_06", "sub_a20", "approved", "platform-reviewer-001", "platform_admin", "all_documents_valid", "已寫入 canonical", "2026-06-15T11:40:00.000Z"),
    ],
  },
];

const FALLBACK_READINESS: SupplyReadinessRecord[] = [
  {
    subjectType: "driver",
    subjectId: "d_8881",
    state: "not_ready",
    reasonCodes: ["DRIVER_REGISTRATION_EXPIRED", "TRAINING_REQUIRED"],
    evaluatedAt: "2026-06-18T11:00:00.000Z",
    policyVersion: "phase1-delta-supply-readiness-2026-06-19",
  },
  {
    subjectType: "vehicle",
    subjectId: "v_3308",
    state: "not_ready",
    reasonCodes: ["INSURANCE_EXPIRED"],
    evaluatedAt: "2026-06-18T11:00:00.000Z",
    policyVersion: "phase1-delta-supply-readiness-2026-06-19",
  },
];

function makeDoc(
  documentId: string,
  submissionId: string,
  documentType: SupplyDocumentType,
  originalFileName: string,
  reviewStatus: SupplyDocumentRecord["reviewStatus"],
  effectiveFrom: string | null,
  effectiveUntil: string | null,
): SupplyDocumentRecord {
  return {
    documentId,
    fleetPartnerId: "fleet-demo-001",
    submissionId,
    documentType,
    fileObjectKey: `fleet-partner/fleet-demo-001/supply-submissions/${submissionId}/${originalFileName}`,
    originalFileName,
    contentType: originalFileName.endsWith(".jpg") ? "image/jpeg" : "application/pdf",
    fileSize: 1024,
    checksumSha256: "a".repeat(64),
    effectiveFrom,
    effectiveUntil,
    reviewStatus,
    reviewComment: reviewStatus === "rejected" ? "請重新上傳清晰版本" : null,
    uploadedBy: "fleet-user-1",
    uploadedAt: "2026-06-18T09:00:00.000Z",
  };
}

function makeEvent(
  eventId: string,
  submissionId: string,
  eventType: string,
  actorId: string,
  actorType: string,
  reasonCode: string | null,
  comment: string | null,
  createdAt: string,
): SupplyReviewEvent {
  return {
    eventId,
    submissionId,
    eventType,
    actorId,
    actorType,
    reasonCode,
    comment,
    createdAt,
  };
}

function isConfigError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.includes("Missing fleet scope configuration")
  );
}

function cloneDetail(detail: SupplySubmissionDetail): SupplySubmissionDetail {
  return {
    submission: { ...detail.submission },
    driverDraft: detail.driverDraft ? { ...detail.driverDraft } : null,
    vehicleDraft: detail.vehicleDraft ? { ...detail.vehicleDraft } : null,
    documents: detail.documents.map((document) => ({ ...document })),
    reviewEvents: detail.reviewEvents.map((event) => ({ ...event })),
  };
}

async function loadSupplyBundle(): Promise<SupplyBundle> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const [submissions, readiness] = await Promise.all([
      client.listFleetPortalSupplySubmissions(),
      client.listFleetPortalReadiness(),
    ]);
    return { submissions, readiness, source: "live" };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    return {
      submissions: FALLBACK_SUBMISSIONS.map(cloneDetail),
      readiness: FALLBACK_READINESS.map((item) => ({ ...item })),
      source: "fallback",
    };
  }
}

function mapSubmissionSubject(detail: SupplySubmissionDetail): SupplySubjectSummary {
  if (detail.driverDraft) {
    return {
      title: detail.driverDraft.name,
      subtitle: detail.driverDraft.mobile,
    };
  }
  if (detail.vehicleDraft) {
    return {
      title: detail.vehicleDraft.plateNo,
      subtitle: [detail.vehicleDraft.brand, detail.vehicleDraft.model]
        .filter(Boolean)
        .join(" ") || detail.vehicleDraft.businessArea,
    };
  }
  return {
    title: detail.submission.submissionType,
    subtitle: detail.submission.submissionId,
  };
}

function mapDashboardGroups(
  submissions: SupplySubmissionDetail[],
  readiness: SupplyReadinessRecord[],
): Record<SupplyDashboardGroup, SupplyDashboardCard[]> {
  const groups: Record<SupplyDashboardGroup, SupplyDashboardCard[]> = {
    draft: [],
    review: [],
    revision: [],
    approved: [],
    expiring: [],
    not_ready: [],
  };

  for (const detail of submissions) {
    const subject = mapSubmissionSubject(detail);
    const item: SupplyDashboardCard = {
      id: detail.submission.submissionId,
      title: subject.title,
      subtitle: subject.subtitle,
      href: `/supply/submissions/${detail.submission.submissionId}`,
      status: detail.submission.status,
    };
    if (detail.submission.status === "draft") {
      groups.draft.push(item);
    } else if (
      detail.submission.status === "submitted" ||
      detail.submission.status === "in_review"
    ) {
      groups.review.push(item);
    } else if (detail.submission.status === "needs_revision") {
      groups.revision.push(item);
    } else if (detail.submission.status === "approved") {
      groups.approved.push(item);
    }
    for (const document of detail.documents) {
      if (isExpiringSoon(document.effectiveUntil)) {
        groups.expiring.push({
          id: document.documentId,
          title: document.originalFileName,
          subtitle: `${subject.title} · ${document.effectiveUntil}`,
          href: `/supply/submissions/${detail.submission.submissionId}`,
          tone: "warn",
        });
      }
    }
  }

  groups.not_ready = readiness.map((item) => ({
    id: item.subjectId,
    title: item.subjectId,
    subtitle: item.state,
    href: "/supply/submissions",
    tone: item.state === "suspended" ? "danger" : "warn",
    reasons: item.reasonCodes,
  }));

  return groups;
}

function isExpiringSoon(effectiveUntil: string | null) {
  if (!effectiveUntil) {
    return false;
  }
  const now = new Date();
  const until = new Date(effectiveUntil);
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return until >= now && until <= windowEnd;
}

export async function loadSupplyDashboard(): Promise<SupplyDashboardView> {
  const bundle = await loadSupplyBundle();
  return {
    groups: mapDashboardGroups(bundle.submissions, bundle.readiness),
    source: bundle.source,
  };
}

export async function loadSupplySubmissions(filters?: {
  status?: SupplySubmissionStatus;
  submissionType?: SupplySubmissionType;
}) {
  const bundle = await loadSupplyBundle();
  const rows = bundle.submissions.filter((detail) => {
    if (filters?.status && detail.submission.status !== filters.status) {
      return false;
    }
    if (
      filters?.submissionType &&
      detail.submission.submissionType !== filters.submissionType
    ) {
      return false;
    }
    return true;
  });
  return { rows, source: bundle.source };
}

export async function loadSupplySubmissionDetail(submissionId: string) {
  const bundle = await loadSupplyBundle();
  const detail = bundle.submissions.find(
    (item) => item.submission.submissionId === submissionId,
  );
  if (!detail) {
    return null;
  }
  return { detail, source: bundle.source };
}

export async function loadSupplyDocuments(): Promise<SupplyDocumentsView> {
  const bundle = await loadSupplyBundle();
  return {
    rows: bundle.submissions.flatMap((detail) =>
      detail.documents.map((document) => ({
        ...document,
        submissionStatus: detail.submission.status,
        submissionType: detail.submission.submissionType,
        subject: mapSubmissionSubject(detail),
      })),
    ),
    source: bundle.source,
  };
}

export async function loadSupplyReadiness() {
  const bundle = await loadSupplyBundle();
  return { rows: bundle.readiness, source: bundle.source };
}

export function formatSupplySubject(detail: SupplySubmissionDetail) {
  return mapSubmissionSubject(detail);
}

export function isEditableStatus(status: SupplySubmissionStatus) {
  return status === "draft" || status === "needs_revision";
}

export function readinessTone(state: SupplyReadinessState) {
  switch (state) {
    case "ready":
      return "success";
    case "suspended":
      return "danger";
    default:
      return "warn";
  }
}
