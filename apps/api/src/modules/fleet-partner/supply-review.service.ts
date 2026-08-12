import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyReviewActionCommand,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  VehicleFleetAffiliationRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import {
  type SubmissionApprovalArtifacts,
  SupplySubmissionRepository,
  type SupplyReviewEventRecord,
} from "./supply-submission.repository";

const REVIEW_SUBMISSION_SEED: SupplySubmissionRecord[] = [
  {
    submissionId: "sub_s39",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "vehicle_onboarding",
    status: "in_review",
    revisionNo: 1,
    subjectDriverId: null,
    subjectVehicleId: "veh-demo-001",
    submittedBy: "fleet-user-1",
    submittedAt: "2026-06-18T14:02:00.000Z",
    reviewStartedBy: "LP",
    reviewStartedAt: "2026-06-18T14:05:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    reviewReasonCode: null,
    reviewComment: null,
    canonicalDriverId: null,
    canonicalVehicleId: "veh-demo-001",
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: "2026-06-18T14:02:00.000Z",
    updatedAt: "2026-06-18T14:05:00.000Z",
  },
  {
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
    createdAt: "2026-06-18T09:40:00.000Z",
    updatedAt: "2026-06-18T09:40:00.000Z",
  },
  {
    submissionId: "sub_t02",
    fleetPartnerId: "fleet-demo-002",
    submissionType: "driver_onboarding",
    status: "submitted",
    revisionNo: 1,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "fleet-user-3",
    submittedAt: "2026-06-18T08:15:00.000Z",
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
    createdAt: "2026-06-18T08:15:00.000Z",
    updatedAt: "2026-06-18T08:15:00.000Z",
  },
  {
    submissionId: "sub_r33",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "vehicle_onboarding",
    status: "submitted",
    revisionNo: 2,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "fleet-user-1",
    submittedAt: "2026-06-18T09:42:00.000Z",
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
    createdAt: "2026-06-18T09:42:00.000Z",
    updatedAt: "2026-06-18T09:42:00.000Z",
  },
  {
    submissionId: "sub_u51",
    fleetPartnerId: "fleet-demo-003",
    submissionType: "insurance_update",
    status: "in_review",
    revisionNo: 1,
    subjectDriverId: null,
    subjectVehicleId: "veh-demo-003",
    submittedBy: "fleet-user-4",
    submittedAt: "2026-06-17T16:50:00.000Z",
    reviewStartedBy: "張哲瑋",
    reviewStartedAt: "2026-06-17T17:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    reviewReasonCode: null,
    reviewComment: null,
    canonicalDriverId: null,
    canonicalVehicleId: "veh-demo-003",
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: "2026-06-17T16:50:00.000Z",
    updatedAt: "2026-06-17T17:00:00.000Z",
  },
  {
    submissionId: "sub_a20",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "driver_onboarding",
    status: "approved",
    revisionNo: 1,
    subjectDriverId: "drv_9120",
    subjectVehicleId: null,
    submittedBy: "fleet-user-1",
    submittedAt: "2026-06-15T11:08:00.000Z",
    reviewStartedBy: "LP",
    reviewStartedAt: "2026-06-15T11:10:00.000Z",
    reviewedBy: "LP",
    reviewedAt: "2026-06-15T11:15:00.000Z",
    reviewReasonCode: "all_documents_valid",
    reviewComment: "核可通過",
    canonicalDriverId: "d_9120",
    canonicalVehicleId: null,
    canonicalContractId: "contract_9120",
    canonicalPolicyId: "policy_9120",
    createdAt: "2026-06-15T11:08:00.000Z",
    updatedAt: "2026-06-15T11:15:00.000Z",
  },
  {
    submissionId: "sup-sub-demo-001",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "driver_onboarding",
    status: "submitted",
    revisionNo: 1,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "fleet-user-1",
    submittedAt: "2026-06-20T00:00:00.000Z",
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
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
  },
  {
    submissionId: "sup-sub-demo-002",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "vehicle_onboarding",
    status: "in_review",
    revisionNo: 2,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "fleet-user-2",
    submittedAt: "2026-06-20T00:10:00.000Z",
    reviewStartedBy: "platform-admin-demo-001",
    reviewStartedAt: "2026-06-20T00:15:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    reviewReasonCode: "initial_screening",
    reviewComment: "Manual review started.",
    canonicalDriverId: null,
    canonicalVehicleId: null,
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: "2026-06-20T00:10:00.000Z",
    updatedAt: "2026-06-20T00:15:00.000Z",
  },
];

const REVIEW_DRIVER_DRAFTS_SEED: DriverSupplyDraft[] = [
  {
    submissionId: "sub_s38",
    name: "蔡明憲",
    mobile: "0912345678",
    professionalDriverLicenseNo: "PDL-TPE-3801",
    professionalDriverLicenseExpiry: "2028-12-31",
    taxiDriverRegistrationNo: "TAXI-TPE-3801",
    taxiDriverRegistrationArea: "taipei",
    taxiDriverRegistrationExpiry: "2028-12-31",
    supportedServiceProductCodes: ["realtime", "business"],
    preferredVehicleSubmissionId: null,
  },
  {
    submissionId: "sub_t02",
    name: "游志豪",
    mobile: "0922333444",
    professionalDriverLicenseNo: "PDL-YLN-0201",
    professionalDriverLicenseExpiry: "2027-06-30",
    taxiDriverRegistrationNo: "TAXI-YLN-0201",
    taxiDriverRegistrationArea: "yilan",
    taxiDriverRegistrationExpiry: "2027-06-30",
    supportedServiceProductCodes: ["realtime"],
    preferredVehicleSubmissionId: null,
  },
  {
    submissionId: "sub_a20",
    name: "高至誠",
    mobile: "0933555777",
    professionalDriverLicenseNo: "PDL-TPE-2001",
    professionalDriverLicenseExpiry: "2029-01-01",
    taxiDriverRegistrationNo: "TAXI-TPE-2001",
    taxiDriverRegistrationArea: "taipei",
    taxiDriverRegistrationExpiry: "2029-01-01",
    supportedServiceProductCodes: ["realtime"],
    preferredVehicleSubmissionId: null,
  },
  {
    submissionId: "sup-sub-demo-002",
    name: "Demo Driver Two",
    mobile: "0912000002",
    professionalDriverLicenseNo: "PDL-DEMO-002",
    professionalDriverLicenseExpiry: "2027-12-31",
    taxiDriverRegistrationNo: "TAXI-DEMO-002",
    taxiDriverRegistrationArea: "taipei",
    taxiDriverRegistrationExpiry: "2027-12-31",
    supportedServiceProductCodes: ["standard_taxi"],
    preferredVehicleSubmissionId: null,
  },
];

const REVIEW_VEHICLE_DRAFTS_SEED: VehicleSupplyDraft[] = [
  {
    submissionId: "sub_s39",
    plateNo: "KAB-7720",
    licenseType: "multi_purpose_taxi",
    brand: "Hyundai",
    model: "Custo",
    modelYear: 2024,
    seatCount: 9,
    luggageCapacity: 6,
    businessArea: "taipei",
    supportedServiceProductCodes: ["realtime", "business", "airport"],
    airportTransferEligible: true,
    fixedFareAllowed: true,
    currentDriverSubmissionId: null,
    doorCount: 5,
    color: "yellow",
  },
  {
    submissionId: "sub_r33",
    plateNo: "KAB-6610",
    licenseType: "taxi",
    brand: "Toyota",
    model: "Sienta",
    modelYear: 2023,
    seatCount: 7,
    luggageCapacity: 4,
    businessArea: "taipei",
    supportedServiceProductCodes: ["business"],
    airportTransferEligible: false,
    fixedFareAllowed: true,
    currentDriverSubmissionId: null,
    doorCount: 5,
    color: "yellow",
  },
  {
    submissionId: "sub_u51",
    plateNo: "TXG-1180",
    licenseType: "taxi",
    brand: "Toyota",
    model: "Altis",
    modelYear: 2022,
    seatCount: 5,
    luggageCapacity: 2,
    businessArea: "taichung",
    supportedServiceProductCodes: ["realtime"],
    airportTransferEligible: false,
    fixedFareAllowed: true,
    currentDriverSubmissionId: null,
    doorCount: 4,
    color: "yellow",
  },
  {
    submissionId: "sup-sub-demo-002",
    plateNo: "SUP-2002",
    licenseType: "taxi",
    brand: "Toyota",
    model: "Camry",
    modelYear: 2024,
    seatCount: 4,
    luggageCapacity: 2,
    businessArea: "taipei",
    supportedServiceProductCodes: ["standard_taxi"],
    airportTransferEligible: false,
    fixedFareAllowed: true,
    currentDriverSubmissionId: null,
    doorCount: 4,
    color: "yellow",
  },
];

const REVIEW_DOCUMENTS_SEED: SupplyDocumentRecord[] = [
  {
    documentId: "doc-s39-reg",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "sub_s39",
    documentType: "vehicle_registration",
    fileObjectKey: "files/reg_kab7720.pdf",
    originalFileName: "reg_kab7720.pdf",
    contentType: "application/pdf",
    fileSize: 2048,
    checksumSha256: "sha256-reg-kab7720",
    effectiveFrom: "2024-01-01",
    effectiveUntil: "2029-01-01",
    reviewStatus: "approved",
    reviewComment: null,
    uploadedBy: "fleet-user-1",
    uploadedAt: "2026-06-18T14:02:00.000Z",
  },
  {
    documentId: "doc-s39-ins",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "sub_s39",
    documentType: "insurance_policy",
    fileObjectKey: "files/policy_kab7720.pdf",
    originalFileName: "policy_kab7720.pdf",
    contentType: "application/pdf",
    fileSize: 4096,
    checksumSha256: "sha256-policy-kab7720",
    effectiveFrom: "2026-07-01",
    effectiveUntil: "2027-07-01",
    reviewStatus: "pending",
    reviewComment: null,
    uploadedBy: "fleet-user-1",
    uploadedAt: "2026-06-18T14:02:00.000Z",
  },
  {
    documentId: "doc-s38-lic",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "sub_s38",
    documentType: "professional_driver_license",
    fileObjectKey: "files/pdl_3801.pdf",
    originalFileName: "pdl_3801.pdf",
    contentType: "application/pdf",
    fileSize: 1500,
    checksumSha256: "sha256-pdl-3801",
    effectiveFrom: "2023-01-01",
    effectiveUntil: "2028-12-31",
    reviewStatus: "pending",
    reviewComment: null,
    uploadedBy: "fleet-user-1",
    uploadedAt: "2026-06-18T09:40:00.000Z",
  },
  {
    documentId: "sup-doc-ins-002",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "sup-sub-demo-002",
    documentType: "insurance_policy",
    fileObjectKey: "files/ins-002.pdf",
    originalFileName: "insurance.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    checksumSha256: "ins-002",
    effectiveFrom: "2026-06-20",
    effectiveUntil: "2027-06-19",
    reviewStatus: "approved",
    reviewComment: null,
    uploadedBy: "fleet-user-2",
    uploadedAt: "2026-06-20T00:12:00.000Z",
  },
  {
    documentId: "sup-doc-contract-002",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "sup-sub-demo-002",
    documentType: "fleet_participation_contract",
    fileObjectKey: "files/contract-002.pdf",
    originalFileName: "contract.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    checksumSha256: "contract-002",
    effectiveFrom: "2026-06-20",
    effectiveUntil: "2027-06-19",
    reviewStatus: "approved",
    reviewComment: null,
    uploadedBy: "fleet-user-2",
    uploadedAt: "2026-06-20T00:13:00.000Z",
  },
];

type SubmissionTransitionConfig = {
  nextStatus: SupplySubmissionStatus;
  eventType: SupplyReviewEventRecord["eventType"];
  allowedCurrentStatuses: readonly SupplySubmissionStatus[];
};

@Injectable()
export class SupplyReviewService implements OnModuleInit {
  private submissions = REVIEW_SUBMISSION_SEED.map((submission) => ({
    ...submission,
  }));
  private reviewEvents: SupplyReviewEventRecord[] = [];
  private driverDrafts = REVIEW_DRIVER_DRAFTS_SEED.map((draft) => ({
    ...draft,
  }));
  private vehicleDrafts = REVIEW_VEHICLE_DRAFTS_SEED.map((draft) => ({
    ...draft,
  }));
  private documents = REVIEW_DOCUMENTS_SEED.map((document) => ({
    ...document,
  }));
  private vehicleAffiliations: VehicleFleetAffiliationRecord[] = [];

  constructor(
    @Optional()
    private readonly regulatoryRegistryService?: RegulatoryRegistryService,
    @Optional()
    private readonly supplySubmissionRepository?: SupplySubmissionRepository,
  ) {}

  async onModuleInit() {
    if (!this.supplySubmissionRepository?.isEnabled()) {
      return;
    }

    try {
      const state = await this.supplySubmissionRepository.loadState();
      if (state.submissions.length > 0) {
        this.submissions = state.submissions.map((submission) => ({
          ...submission,
        }));
      }
      this.driverDrafts = state.driverDrafts.map((draft) => ({ ...draft }));
      this.vehicleDrafts = state.vehicleDrafts.map((draft) => ({ ...draft }));
      this.documents = state.documents.map((document) => ({ ...document }));
      this.reviewEvents = state.reviewEvents.map((event) => ({ ...event }));
      this.vehicleAffiliations = state.vehicleAffiliations.map(
        (affiliation) => ({ ...affiliation }),
      );
    } catch (error) {
      this.supplySubmissionRepository.reportPersistenceFailure(
        error,
        "supply review module init",
      );
    }
  }

  private getFleetPartnerName(fleetPartnerId: string): string {
    const fleetMap: Record<string, string> = {
      "fleet-demo-001": "大都會車隊",
      "fleet-demo-002": "蘭陽小客車",
      "fleet-demo-003": "海線車隊",
    };
    return fleetMap[fleetPartnerId] || `車行 (${fleetPartnerId})`;
  }

  async listSubmissions() {
    let rawSubmissions: SupplySubmissionRecord[];
    let driverDrafts = this.driverDrafts;
    let vehicleDrafts = this.vehicleDrafts;
    let documents = this.documents;

    if (this.supplySubmissionRepository) {
      const state = await this.supplySubmissionRepository.loadState();
      rawSubmissions = state.submissions;
      driverDrafts = state.driverDrafts;
      vehicleDrafts = state.vehicleDrafts;
      documents = state.documents;
    } else {
      rawSubmissions = this.submissions;
    }

    return rawSubmissions.map((sub) => {
      const vDraft = vehicleDrafts.find(
        (d) => d.submissionId === sub.submissionId,
      );
      const dDraft = driverDrafts.find(
        (d) => d.submissionId === sub.submissionId,
      );
      const docs = documents.filter(
        (doc) => doc.submissionId === sub.submissionId,
      );

      let subject = "物件送審";
      if (sub.submissionId === "sub_s39") subject = "KAB-7720 · Hyundai Custo";
      else if (sub.submissionId === "sub_s38") subject = "蔡明憲";
      else if (sub.submissionId === "sub_t02") subject = "游志豪";
      else if (sub.submissionId === "sub_r33")
        subject = "KAB-6610 · Toyota Sienta";
      else if (sub.submissionId === "sub_u51") subject = "TXG-1180 · 保單";
      else if (sub.submissionId === "sub_a20") subject = "高至誠 → d_9120";
      else if (vDraft)
        subject =
          `${vDraft.plateNo} · ${vDraft.brand || ""} ${vDraft.model || ""}`.trim();
      else if (dDraft) subject = dDraft.name;

      let businessArea = "taipei";
      if (sub.submissionId === "sub_t02") businessArea = "yilan";
      else if (sub.submissionId === "sub_u51") businessArea = "taichung";
      else if (vDraft?.businessArea) businessArea = vDraft.businessArea;
      else if (dDraft?.taxiDriverRegistrationArea)
        businessArea = dDraft.taxiDriverRegistrationArea;

      let missingItemsCount = 0;
      if (sub.submissionId === "sub_t02") missingItemsCount = 1;
      else if (docs.length === 0 && sub.status === "submitted")
        missingItemsCount = 1;

      let lockedBy: string | null = null;
      if (sub.status === "in_review") {
        if (
          sub.reviewStartedBy === "LP" ||
          sub.reviewStartedBy === "platform-admin-demo-001"
        ) {
          lockedBy = "林佩璇";
        } else {
          lockedBy = sub.reviewStartedBy || "審核員";
        }
      }

      return {
        ...sub,
        fleetPartnerName: this.getFleetPartnerName(sub.fleetPartnerId),
        subject,
        businessArea,
        supportedServiceProductCodes: vDraft?.supportedServiceProductCodes ||
          dDraft?.supportedServiceProductCodes || ["realtime"],
        missingItemsCount,
        lockedBy,
      };
    });
  }

  async getSubmission(submissionId: string) {
    const submission = await this.findSubmission(submissionId);
    let artifacts: SubmissionApprovalArtifacts;
    if (this.supplySubmissionRepository?.isEnabled()) {
      artifacts = await this.supplySubmissionRepository.loadApprovalArtifacts(
        null,
        submissionId,
      );
    } else if (this.supplySubmissionRepository) {
      const state = await this.supplySubmissionRepository.loadState();
      artifacts = this.loadApprovalArtifactsFromState(state, submissionId);
    } else {
      artifacts = this.loadInMemoryApprovalArtifacts(submissionId);
    }

    const canonicalDriver =
      submission.canonicalDriverId || submission.subjectDriverId
        ? (this.regulatoryRegistryService
            ?.listDrivers()
            .find(
              (d) =>
                d.driverId ===
                (submission.canonicalDriverId || submission.subjectDriverId),
            ) ?? null)
        : null;

    const canonicalVehicle =
      submission.canonicalVehicleId || submission.subjectVehicleId
        ? (this.regulatoryRegistryService
            ?.listVehicles()
            .find(
              (v) =>
                v.vehicleId ===
                (submission.canonicalVehicleId || submission.subjectVehicleId),
            ) ?? null)
        : null;

    const missingDocuments: string[] = [];
    const expiredDocuments: string[] = [];
    const today = new Date().toISOString().slice(0, 10);

    artifacts.documents.forEach((doc) => {
      if (doc.effectiveUntil && doc.effectiveUntil < today) {
        expiredDocuments.push(doc.originalFileName || doc.documentType);
      }
    });

    if (
      submission.submissionType === "vehicle_onboarding" &&
      artifacts.documents.length === 0
    ) {
      missingDocuments.push("行照 registration", "保險保單 insurance_policy");
    }

    const isComplete =
      missingDocuments.length === 0 && expiredDocuments.length === 0;

    return {
      submission: { ...submission },
      ...submission,
      fleetPartnerName: this.getFleetPartnerName(submission.fleetPartnerId),
      driverDraft: artifacts.driverDraft,
      vehicleDraft: artifacts.vehicleDraft,
      documents: artifacts.documents,
      canonicalDriver: canonicalDriver
        ? {
            driverId: canonicalDriver.driverId,
            name: canonicalDriver.name,
            supportedServiceBuckets: canonicalDriver.supportedServiceBuckets,
            workState: canonicalDriver.workState,
            licensesValid: canonicalDriver.licensesValid,
          }
        : null,
      canonicalVehicle: canonicalVehicle
        ? {
            vehicleId: canonicalVehicle.vehicleId,
            plateNo: canonicalVehicle.plateNo,
            licenseType: canonicalVehicle.licenseType,
            operatingArea: canonicalVehicle.operatingArea,
            supportedServiceBuckets: canonicalVehicle.supportedServiceBuckets,
            dispatchableFlag: canonicalVehicle.dispatchableFlag,
            insuranceStatus: canonicalVehicle.insuranceStatus,
          }
        : null,
      validationSummary: {
        isComplete,
        missingDocuments,
        expiredDocuments,
        warnings: isComplete
          ? [
              "必填欄位齊全 · 文件類型完整 · 無重複車牌/證號。",
              "附件與草稿資料校對完成。",
            ]
          : [
              ...(missingDocuments.length > 0
                ? [`缺件提示: ${missingDocuments.join(", ")}`]
                : []),
              ...(expiredDocuments.length > 0
                ? [`文件過期: ${expiredDocuments.join(", ")}`]
                : []),
            ],
      },
    };
  }

  async listVehicleAffiliations() {
    if (this.supplySubmissionRepository) {
      const state = await this.supplySubmissionRepository.loadState();
      return state.vehicleAffiliations.map((affiliation) => ({
        ...affiliation,
      }));
    }

    return this.vehicleAffiliations.map((affiliation) => ({ ...affiliation }));
  }

  async startSubmissionReview(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(submissionId, command, reviewerActorId, {
      nextStatus: "in_review",
      eventType: "review_started",
      allowedCurrentStatuses: ["submitted"],
    });
  }

  async requestRevision(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(submissionId, command, reviewerActorId, {
      nextStatus: "needs_revision",
      eventType: "revision_requested",
      allowedCurrentStatuses: ["in_review"],
    });
  }

  async approveSubmission(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(submissionId, command, reviewerActorId, {
      nextStatus: "approved",
      eventType: "approved",
      allowedCurrentStatuses: ["in_review"],
    });
  }

  async rejectSubmission(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(submissionId, command, reviewerActorId, {
      nextStatus: "rejected",
      eventType: "rejected",
      allowedCurrentStatuses: ["in_review"],
    });
  }

  private async applyReviewAction(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
    config: SubmissionTransitionConfig,
  ) {
    const normalizedCommand = this.normalizeActionCommand(command);
    const reviewerId = this.requireActorId(reviewerActorId);

    if (this.supplySubmissionRepository?.isEnabled()) {
      // DB-backed path only: submission_id is a uuid column, so a non-UUID id
      // makes "WHERE submission_id = $1" throw a Postgres type error -> 500.
      // Reject it as 404 up front (a non-UUID submission can never exist). The
      // in-memory path below tolerates arbitrary string ids (used by tests).
      this.assertDbSubmissionIdFormat(submissionId);
      const result = await this.supplySubmissionRepository.withTransaction(
        async (executor) => {
          const current = await this.supplySubmissionRepository!.lockSubmission(
            executor,
            submissionId,
          );
          this.assertExpectedRevision(
            current,
            normalizedCommand.expectedRevisionNo,
          );
          this.assertAllowedStatus(current, config);
          if (config.nextStatus === "approved") {
            this.assertReviewerNotSubmitter(current, reviewerId);
          }

          const approvalArtifacts =
            config.nextStatus === "approved"
              ? await this.supplySubmissionRepository!.loadApprovalArtifacts(
                  executor,
                  current.submissionId,
                )
              : null;
          const approvedDocuments =
            config.nextStatus === "approved"
              ? this.markDocumentsApproved(approvalArtifacts?.documents ?? [])
              : [];
          const canonical =
            config.nextStatus === "approved"
              ? await this.provisionCanonicalRecords(
                  executor,
                  current,
                  approvalArtifacts,
                  reviewerId,
                )
              : null;
          const transitionCanonical = canonical
            ? {
                canonicalDriverId: canonical.canonicalDriverId,
                canonicalVehicleId: canonical.canonicalVehicleId,
                canonicalContractId: canonical.canonicalContractId,
                canonicalPolicyId: canonical.canonicalPolicyId,
              }
            : null;

          const now = new Date().toISOString();
          const transitionParams = {
            submissionId: current.submissionId,
            fleetPartnerId: current.fleetPartnerId,
            expectedRevisionNo: normalizedCommand.expectedRevisionNo,
            nextStatus: config.nextStatus,
            allowedCurrentStatuses: config.allowedCurrentStatuses,
            reviewReasonCode: normalizedCommand.reasonCode,
            reviewComment: normalizedCommand.comment,
            ...(config.eventType === "review_started"
              ? {
                  reviewStartedBy: reviewerId,
                  reviewStartedAt: now,
                }
              : {
                  reviewedBy: reviewerId,
                  reviewedAt: now,
                }),
            ...(transitionCanonical ?? {}),
          };
          const updated =
            await this.supplySubmissionRepository!.transitionSubmissionStatus(
              executor,
              transitionParams,
            );

          await this.supplySubmissionRepository!.persistSubmissionWorkflow(
            executor,
            {
              reviewEvents: [
                this.createReviewEvent(
                  updated,
                  config.eventType,
                  reviewerId,
                  normalizedCommand.reasonCode,
                  normalizedCommand.comment,
                  now,
                ),
              ],
              ...(approvedDocuments.length > 0
                ? { documents: approvedDocuments }
                : {}),
              ...(canonical?.vehicleAffiliation
                ? {
                    vehicleAffiliations: [canonical.vehicleAffiliation],
                  }
                : {}),
            },
          );
          return {
            updated,
            vehicleAffiliation: canonical?.vehicleAffiliation ?? null,
          };
        },
      );
      if (result.vehicleAffiliation) {
        this.regulatoryRegistryService?.recordVehicleFleetAffiliationCreated(
          result.vehicleAffiliation,
          reviewerId,
        );
      }

      return result.updated;
    }

    if (this.supplySubmissionRepository) {
      const state = await this.supplySubmissionRepository.loadState();
      const current = state.submissions.find(
        (item) => item.submissionId === submissionId,
      );
      if (!current) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "NOT_FOUND",
          "Supply submission was not found.",
          { submissionId },
        );
      }

      this.assertExpectedRevision(
        current,
        normalizedCommand.expectedRevisionNo,
      );
      this.assertAllowedStatus(current, config);
      if (config.nextStatus === "approved") {
        this.assertReviewerNotSubmitter(current, reviewerId);
      }

      const now = new Date().toISOString();
      const approvalArtifacts =
        config.nextStatus === "approved"
          ? this.loadApprovalArtifactsFromState(state, current.submissionId)
          : null;
      const approvedDocuments =
        config.nextStatus === "approved"
          ? this.markDocumentsApproved(approvalArtifacts?.documents ?? [])
          : [];
      const canonical =
        config.nextStatus === "approved"
          ? await this.provisionCanonicalRecords(
              null,
              current,
              approvalArtifacts,
              reviewerId,
            )
          : null;
      const transitionCanonical = canonical
        ? {
            canonicalDriverId: canonical.canonicalDriverId,
            canonicalVehicleId: canonical.canonicalVehicleId,
            canonicalContractId: canonical.canonicalContractId,
            canonicalPolicyId: canonical.canonicalPolicyId,
          }
        : null;
      const updated: SupplySubmissionRecord = {
        ...current,
        status: config.nextStatus,
        revisionNo: current.revisionNo + 1,
        reviewReasonCode: normalizedCommand.reasonCode,
        reviewComment: normalizedCommand.comment,
        updatedAt: now,
        ...(transitionCanonical ?? {}),
      };
      if (config.eventType === "review_started") {
        updated.reviewStartedBy = reviewerId;
        updated.reviewStartedAt = now;
      } else {
        updated.reviewedBy = reviewerId;
        updated.reviewedAt = now;
      }

      const reviewEvent = this.createReviewEvent(
        updated,
        config.eventType,
        reviewerId,
        normalizedCommand.reasonCode,
        normalizedCommand.comment,
        now,
      );

      await this.supplySubmissionRepository.persistChanges({
        submissions: [updated],
        reviewEvents: [reviewEvent],
        ...(approvedDocuments.length > 0
          ? { documents: approvedDocuments }
          : {}),
        ...(canonical?.vehicleAffiliation
          ? { vehicleAffiliations: [canonical.vehicleAffiliation] }
          : {}),
      });
      if (canonical?.vehicleAffiliation) {
        this.regulatoryRegistryService?.recordVehicleFleetAffiliationCreated(
          canonical.vehicleAffiliation,
          reviewerId,
        );
      }

      return updated;
    }

    const current = await this.findSubmission(submissionId);
    this.assertExpectedRevision(current, normalizedCommand.expectedRevisionNo);
    this.assertAllowedStatus(current, config);
    if (config.nextStatus === "approved") {
      this.assertReviewerNotSubmitter(current, reviewerId);
    }

    const now = new Date().toISOString();
    const approvalArtifacts =
      config.nextStatus === "approved"
        ? this.loadInMemoryApprovalArtifacts(current.submissionId)
        : null;
    const approvedDocuments =
      config.nextStatus === "approved"
        ? this.markDocumentsApproved(approvalArtifacts?.documents ?? [])
        : [];
    const canonical =
      config.nextStatus === "approved"
        ? await this.provisionCanonicalRecords(
            null,
            current,
            approvalArtifacts,
            reviewerId,
          )
        : null;
    const transitionCanonical = canonical
      ? {
          canonicalDriverId: canonical.canonicalDriverId,
          canonicalVehicleId: canonical.canonicalVehicleId,
          canonicalContractId: canonical.canonicalContractId,
          canonicalPolicyId: canonical.canonicalPolicyId,
        }
      : null;
    const updated: SupplySubmissionRecord = {
      ...current,
      status: config.nextStatus,
      revisionNo: current.revisionNo + 1,
      reviewReasonCode: normalizedCommand.reasonCode,
      reviewComment: normalizedCommand.comment,
      updatedAt: now,
      ...(transitionCanonical ?? {}),
    };
    if (config.eventType === "review_started") {
      updated.reviewStartedBy = reviewerId;
      updated.reviewStartedAt = now;
    } else {
      updated.reviewedBy = reviewerId;
      updated.reviewedAt = now;
    }

    this.submissions = this.submissions.map((submission) =>
      submission.submissionId === submissionId ? updated : submission,
    );
    this.reviewEvents = [
      this.createReviewEvent(
        updated,
        config.eventType,
        reviewerId,
        normalizedCommand.reasonCode,
        normalizedCommand.comment,
        now,
      ),
      ...this.reviewEvents,
    ];
    if (approvedDocuments.length > 0) {
      const approvedDocumentIds = new Set(
        approvedDocuments.map((document) => document.documentId),
      );
      this.documents = [
        ...approvedDocuments.map((document) => ({ ...document })),
        ...this.documents.filter(
          (document) => !approvedDocumentIds.has(document.documentId),
        ),
      ];
    }
    if (canonical?.vehicleAffiliation) {
      this.vehicleAffiliations = [
        { ...canonical.vehicleAffiliation },
        ...this.vehicleAffiliations,
      ];
      this.regulatoryRegistryService?.recordVehicleFleetAffiliationCreated(
        canonical.vehicleAffiliation,
        reviewerId,
      );
    }

    return { ...updated };
  }

  private loadInMemoryApprovalArtifacts(
    submissionId: string,
  ): SubmissionApprovalArtifacts {
    return {
      driverDraft:
        this.driverDrafts.find(
          (draft) => draft.submissionId === submissionId,
        ) ?? null,
      vehicleDraft:
        this.vehicleDrafts.find(
          (draft) => draft.submissionId === submissionId,
        ) ?? null,
      documents: this.documents.filter(
        (document) => document.submissionId === submissionId,
      ),
    };
  }

  private loadApprovalArtifactsFromState(
    state: {
      driverDrafts: DriverSupplyDraft[];
      vehicleDrafts: VehicleSupplyDraft[];
      documents: SupplyDocumentRecord[];
    },
    submissionId: string,
  ): SubmissionApprovalArtifacts {
    return {
      driverDraft:
        state.driverDrafts.find(
          (draft) => draft.submissionId === submissionId,
        ) ?? null,
      vehicleDraft:
        state.vehicleDrafts.find(
          (draft) => draft.submissionId === submissionId,
        ) ?? null,
      documents: state.documents.filter(
        (document) => document.submissionId === submissionId,
      ),
    };
  }

  private markDocumentsApproved(documents: readonly SupplyDocumentRecord[]) {
    return documents.map((document) => ({
      ...document,
      reviewStatus: "approved" as const,
    }));
  }

  private async provisionCanonicalRecords(
    executor: {
      query<T>(text: string, values?: readonly unknown[]): Promise<T>;
    } | null,
    submission: SupplySubmissionRecord,
    artifacts: SubmissionApprovalArtifacts | null,
    reviewerId: string,
  ) {
    if (!artifacts || !this.regulatoryRegistryService) {
      return null;
    }

    return this.regulatoryRegistryService.provisionFromSubmission(
      executor as never,
      {
        submission,
        driverDraft: artifacts.driverDraft,
        vehicleDraft: artifacts.vehicleDraft,
        documents: artifacts.documents,
        approvedAt: new Date().toISOString(),
        reviewerId,
      },
    );
  }

  private assertDbSubmissionIdFormat(submissionId: string) {
    const id = (submissionId ?? "").trim();
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(id)) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Supply submission was not found.",
        { submissionId },
      );
    }
  }

  private async findSubmission(submissionId: string) {
    if (this.supplySubmissionRepository) {
      const state = await this.supplySubmissionRepository.loadState();
      const submission = state.submissions.find(
        (item) => item.submissionId === submissionId,
      );
      if (!submission) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "NOT_FOUND",
          "Supply submission was not found.",
          { submissionId },
        );
      }
      return submission;
    }

    const submission = this.submissions.find(
      (item) => item.submissionId === submissionId,
    );
    if (!submission) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Supply submission was not found.",
        { submissionId },
      );
    }
    return submission;
  }

  private normalizeActionCommand(command: SupplyReviewActionCommand) {
    if (
      !Number.isInteger(command.expectedRevisionNo) ||
      command.expectedRevisionNo < 0
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "EXPECTED_REVISION_NO_INVALID",
        "expectedRevisionNo must be a non-negative integer.",
      );
    }

    const reasonCode = command.reasonCode?.trim();
    if (!reasonCode) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REASON_CODE_REQUIRED",
        "reasonCode is required.",
      );
    }

    return {
      expectedRevisionNo: command.expectedRevisionNo,
      reasonCode,
      comment: command.comment?.trim() || null,
    };
  }

  private requireActorId(actorId?: string | null) {
    const normalized = actorId?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ACTOR_ID_REQUIRED",
        "Reviewer actorId is required.",
      );
    }
    return normalized;
  }

  private assertExpectedRevision(
    submission: SupplySubmissionRecord,
    expectedRevisionNo: number,
  ) {
    if (submission.revisionNo !== expectedRevisionNo) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SUBMISSION_REVISION_CONFLICT",
        "The supply submission revision is stale.",
        {
          submissionId: submission.submissionId,
          expectedRevisionNo,
          actualRevisionNo: submission.revisionNo,
        },
      );
    }
  }

  private assertAllowedStatus(
    submission: SupplySubmissionRecord,
    config: SubmissionTransitionConfig,
  ) {
    if (config.allowedCurrentStatuses.includes(submission.status)) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "INVALID_STATE_TRANSITION",
      "The supply submission status transition is not allowed.",
      {
        submissionId: submission.submissionId,
        currentStatus: submission.status,
        nextStatus: config.nextStatus,
        allowedCurrentStatuses: [...config.allowedCurrentStatuses],
      },
    );
  }

  private assertReviewerNotSubmitter(
    submission: SupplySubmissionRecord,
    reviewerActorId: string,
  ) {
    if (submission.submittedBy !== reviewerActorId) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "REVIEWER_SELF_APPROVAL_DENIED",
      "The submitting actor cannot approve the same supply submission.",
      {
        submissionId: submission.submissionId,
        actorId: reviewerActorId,
      },
    );
  }

  private createReviewEvent(
    submission: SupplySubmissionRecord,
    eventType: SupplyReviewEventRecord["eventType"],
    actorId: string,
    reasonCode: string,
    comment: string | null,
    createdAt: string,
  ): SupplyReviewEventRecord {
    return {
      eventId: randomUUID(),
      submissionId: submission.submissionId,
      revisionNo: submission.revisionNo,
      eventType,
      actorId,
      reasonCode,
      comment,
      createdAt,
    };
  }
}
