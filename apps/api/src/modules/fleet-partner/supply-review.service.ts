import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AddSupplyDocumentCommand,
  CreateSupplySubmissionCommand,
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyReviewActionCommand,
  SupplySubmissionLifecycleCommand,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
  UpsertDriverSupplyDraftCommand,
  UpsertVehicleSupplyDraftCommand,
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
  },
];

const REVIEW_DOCUMENTS_SEED: SupplyDocumentRecord[] = [
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
  private driverDrafts = REVIEW_DRIVER_DRAFTS_SEED.map((draft) => ({ ...draft }));
  private vehicleDrafts = REVIEW_VEHICLE_DRAFTS_SEED.map((draft) => ({
    ...draft,
  }));
  private documents = REVIEW_DOCUMENTS_SEED.map((document) => ({ ...document }));
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

  async listSubmissions() {
    if (this.supplySubmissionRepository?.isEnabled()) {
      const state = await this.supplySubmissionRepository.loadState();
      return state.submissions;
    }

    return this.submissions.map((submission) => ({ ...submission }));
  }

  async getSubmission(submissionId: string) {
    const submission = await this.findSubmission(submissionId);
    return { ...submission };
  }

  async listVehicleAffiliations() {
    if (this.supplySubmissionRepository?.isEnabled()) {
      const state = await this.supplySubmissionRepository.loadState();
      return state.vehicleAffiliations.map((affiliation) => ({
        ...affiliation,
      }));
    }

    return this.vehicleAffiliations.map((affiliation) => ({ ...affiliation }));
  }

  // -------------------------------------------------------------------------
  // Fleet-partner self-service write path (§1.1)
  //
  // The partner side of the lifecycle: create a submission, attach driver /
  // vehicle drafts + documents while it is editable (draft | needs_revision),
  // then submit it into the platform review queue. Kept on this service so the
  // in-memory and DB-backed states stay the single source the review path reads.
  // -------------------------------------------------------------------------

  async listFleetSubmissions(fleetPartnerId: string) {
    const normalizedFleetPartnerId = this.requireFleetPartnerId(fleetPartnerId);
    const submissions = await this.listSubmissions();
    return submissions
      .filter(
        (submission) => submission.fleetPartnerId === normalizedFleetPartnerId,
      )
      .map((submission) => ({ ...submission }));
  }

  async getFleetSubmission(fleetPartnerId: string, submissionId: string) {
    const submission = await this.findFleetScopedSubmission(
      submissionId,
      this.requireFleetPartnerId(fleetPartnerId),
    );
    return { ...submission };
  }

  async createSubmission(
    fleetPartnerId: string,
    command: CreateSupplySubmissionCommand,
  ): Promise<SupplySubmissionRecord> {
    const normalizedFleetPartnerId = this.requireFleetPartnerId(fleetPartnerId);
    const submissionType = this.requireSubmissionType(command?.submissionType);
    const now = new Date().toISOString();
    const submission: SupplySubmissionRecord = {
      submissionId: randomUUID(),
      fleetPartnerId: normalizedFleetPartnerId,
      submissionType,
      status: "draft",
      revisionNo: 0,
      subjectDriverId: command.subjectDriverId?.trim() || null,
      subjectVehicleId: command.subjectVehicleId?.trim() || null,
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
      createdAt: now,
      updatedAt: now,
    };

    if (this.supplySubmissionRepository?.isEnabled()) {
      await this.supplySubmissionRepository.persistChanges({
        submissions: [submission],
      });
    } else {
      this.submissions = [submission, ...this.submissions];
    }

    return { ...submission };
  }

  async upsertDriverDraft(
    fleetPartnerId: string,
    submissionId: string,
    command: UpsertDriverSupplyDraftCommand,
  ): Promise<DriverSupplyDraft> {
    const normalizedFleetPartnerId = this.requireFleetPartnerId(fleetPartnerId);
    const submission = await this.findFleetScopedSubmission(
      submissionId,
      normalizedFleetPartnerId,
    );
    this.assertEditable(submission);
    const draft = this.normalizeDriverDraft(submission.submissionId, command);

    if (this.supplySubmissionRepository?.isEnabled()) {
      await this.supplySubmissionRepository.persistChanges({
        driverDrafts: [draft],
      });
    } else {
      this.driverDrafts = [
        draft,
        ...this.driverDrafts.filter(
          (existing) => existing.submissionId !== draft.submissionId,
        ),
      ];
    }

    return { ...draft };
  }

  async upsertVehicleDraft(
    fleetPartnerId: string,
    submissionId: string,
    command: UpsertVehicleSupplyDraftCommand,
  ): Promise<VehicleSupplyDraft> {
    const normalizedFleetPartnerId = this.requireFleetPartnerId(fleetPartnerId);
    const submission = await this.findFleetScopedSubmission(
      submissionId,
      normalizedFleetPartnerId,
    );
    this.assertEditable(submission);
    const draft = this.normalizeVehicleDraft(submission.submissionId, command);

    if (this.supplySubmissionRepository?.isEnabled()) {
      await this.supplySubmissionRepository.withTransaction(async (executor) => {
        await this.supplySubmissionRepository!.assertVehiclePlateAvailable(
          executor,
          normalizedFleetPartnerId,
          draft.plateNo,
          draft.submissionId,
        );
        await this.supplySubmissionRepository!.persistSubmissionWorkflow(
          executor,
          { vehicleDrafts: [draft] },
        );
      });
    } else {
      this.assertInMemoryPlateAvailable(
        normalizedFleetPartnerId,
        draft.plateNo,
        draft.submissionId,
      );
      this.vehicleDrafts = [
        draft,
        ...this.vehicleDrafts.filter(
          (existing) => existing.submissionId !== draft.submissionId,
        ),
      ];
    }

    return { ...draft };
  }

  async addDocument(
    fleetPartnerId: string,
    submissionId: string,
    uploadedBy: string,
    command: AddSupplyDocumentCommand,
  ): Promise<SupplyDocumentRecord> {
    const normalizedFleetPartnerId = this.requireFleetPartnerId(fleetPartnerId);
    const uploader = this.requireActorId(uploadedBy);
    const submission = await this.findFleetScopedSubmission(
      submissionId,
      normalizedFleetPartnerId,
    );
    this.assertEditable(submission);
    const document = this.normalizeDocument(
      submission.submissionId,
      normalizedFleetPartnerId,
      uploader,
      command,
    );

    if (this.supplySubmissionRepository?.isEnabled()) {
      await this.supplySubmissionRepository.persistChanges({
        documents: [document],
      });
    } else {
      this.documents = [document, ...this.documents];
    }

    return { ...document };
  }

  async submitSubmission(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: SupplySubmissionLifecycleCommand,
  ): Promise<SupplySubmissionRecord> {
    return this.applyFleetLifecycleAction(
      fleetPartnerId,
      submissionId,
      actorId,
      command,
      {
        nextStatus: "submitted",
        eventType: "submitted",
        allowedCurrentStatuses: ["draft", "needs_revision"],
        requireDraft: true,
        stampSubmitter: true,
      },
    );
  }

  async withdrawSubmission(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: SupplySubmissionLifecycleCommand,
  ): Promise<SupplySubmissionRecord> {
    return this.applyFleetLifecycleAction(
      fleetPartnerId,
      submissionId,
      actorId,
      command,
      {
        nextStatus: "withdrawn",
        eventType: "withdrawn",
        allowedCurrentStatuses: ["draft", "submitted", "needs_revision"],
        requireDraft: false,
        stampSubmitter: false,
      },
    );
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
        this.driverDrafts.find((draft) => draft.submissionId === submissionId) ??
        null,
      vehicleDraft:
        this.vehicleDrafts.find((draft) => draft.submissionId === submissionId) ??
        null,
      documents: this.documents.filter(
        (document) => document.submissionId === submissionId,
      ),
    };
  }

  private async provisionCanonicalRecords(
    executor: { query<T>(text: string, values?: readonly unknown[]): Promise<T> } | null,
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
    if (this.supplySubmissionRepository?.isEnabled()) {
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

  // ---- Fleet-partner write-path helpers -----------------------------------

  private async applyFleetLifecycleAction(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: SupplySubmissionLifecycleCommand,
    config: FleetLifecycleConfig,
  ): Promise<SupplySubmissionRecord> {
    const normalizedFleetPartnerId = this.requireFleetPartnerId(fleetPartnerId);
    const expectedRevisionNo = this.requireExpectedRevisionNo(
      command?.expectedRevisionNo,
    );
    const comment = command?.comment?.trim() || null;
    const submitterId = this.requireActorId(actorId);
    const reasonCode =
      config.eventType === "submitted"
        ? "fleet_partner_submitted"
        : "fleet_partner_withdrawn";

    if (this.supplySubmissionRepository?.isEnabled()) {
      this.assertDbSubmissionIdFormat(submissionId);
      const updated = await this.supplySubmissionRepository.withTransaction(
        async (executor) => {
          const current = await this.supplySubmissionRepository!.lockSubmission(
            executor,
            submissionId,
          );
          this.assertFleetScope(current, normalizedFleetPartnerId);
          this.assertExpectedRevision(current, expectedRevisionNo);
          this.assertAllowedStatus(current, config);
          if (config.requireDraft) {
            const artifacts =
              await this.supplySubmissionRepository!.loadApprovalArtifacts(
                executor,
                current.submissionId,
              );
            this.assertSubmittableArtifacts(
              current.submissionId,
              artifacts.driverDraft,
              artifacts.vehicleDraft,
            );
          }

          const now = new Date().toISOString();
          const next =
            await this.supplySubmissionRepository!.transitionSubmissionStatus(
              executor,
              {
                submissionId: current.submissionId,
                fleetPartnerId: normalizedFleetPartnerId,
                expectedRevisionNo,
                nextStatus: config.nextStatus,
                allowedCurrentStatuses: config.allowedCurrentStatuses,
                reviewReasonCode: reasonCode,
                reviewComment: comment,
                ...(config.stampSubmitter
                  ? { submittedBy: submitterId, submittedAt: now }
                  : {}),
              },
            );
          await this.supplySubmissionRepository!.persistSubmissionWorkflow(
            executor,
            {
              reviewEvents: [
                this.createReviewEvent(
                  next,
                  config.eventType,
                  submitterId,
                  reasonCode,
                  comment,
                  now,
                ),
              ],
            },
          );
          return next;
        },
      );
      return updated;
    }

    const current = await this.findFleetScopedSubmission(
      submissionId,
      normalizedFleetPartnerId,
    );
    this.assertExpectedRevision(current, expectedRevisionNo);
    this.assertAllowedStatus(current, config);
    if (config.requireDraft) {
      this.assertSubmittableArtifacts(
        current.submissionId,
        this.driverDrafts.find(
          (draft) => draft.submissionId === current.submissionId,
        ) ?? null,
        this.vehicleDrafts.find(
          (draft) => draft.submissionId === current.submissionId,
        ) ?? null,
      );
    }

    const now = new Date().toISOString();
    const updated: SupplySubmissionRecord = {
      ...current,
      status: config.nextStatus,
      revisionNo: current.revisionNo + 1,
      reviewReasonCode: reasonCode,
      reviewComment: comment,
      updatedAt: now,
      ...(config.stampSubmitter
        ? { submittedBy: submitterId, submittedAt: now }
        : {}),
    };
    this.submissions = this.submissions.map((submission) =>
      submission.submissionId === updated.submissionId ? updated : submission,
    );
    this.reviewEvents = [
      this.createReviewEvent(
        updated,
        config.eventType,
        submitterId,
        reasonCode,
        comment,
        now,
      ),
      ...this.reviewEvents,
    ];
    return { ...updated };
  }

  private async findFleetScopedSubmission(
    submissionId: string,
    fleetPartnerId: string,
  ): Promise<SupplySubmissionRecord> {
    const submission = await this.findSubmission(submissionId);
    this.assertFleetScope(submission, fleetPartnerId);
    return submission;
  }

  private assertFleetScope(
    submission: SupplySubmissionRecord,
    fleetPartnerId: string,
  ) {
    if (submission.fleetPartnerId === fleetPartnerId) {
      return;
    }
    // Hide cross-fleet existence: a submission owned by another partner is
    // indistinguishable from a missing one to this caller.
    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "NOT_FOUND",
      "Supply submission was not found.",
      { submissionId: submission.submissionId },
    );
  }

  private assertEditable(submission: SupplySubmissionRecord) {
    if (
      submission.status === "draft" ||
      submission.status === "needs_revision"
    ) {
      return;
    }
    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "SUBMISSION_NOT_EDITABLE",
      "The supply submission can only be edited while in draft or needs_revision.",
      {
        submissionId: submission.submissionId,
        currentStatus: submission.status,
      },
    );
  }

  private assertSubmittableArtifacts(
    submissionId: string,
    driverDraft: DriverSupplyDraft | null,
    vehicleDraft: VehicleSupplyDraft | null,
  ) {
    if (driverDraft || vehicleDraft) {
      return;
    }
    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "SUBMISSION_INCOMPLETE",
      "A driver or vehicle draft is required before the submission can be submitted.",
      { submissionId },
    );
  }

  private assertInMemoryPlateAvailable(
    fleetPartnerId: string,
    plateNo: string,
    excludeSubmissionId: string,
  ) {
    const conflict = this.vehicleDrafts.find((draft) => {
      if (draft.submissionId === excludeSubmissionId) {
        return false;
      }
      if (draft.plateNo.toLowerCase() !== plateNo.toLowerCase()) {
        return false;
      }
      const owner = this.submissions.find(
        (submission) => submission.submissionId === draft.submissionId,
      );
      return owner?.fleetPartnerId === fleetPartnerId;
    });
    if (conflict) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DUPLICATE_PLATE",
        "A vehicle draft with the same plate already exists for this fleet partner.",
        { fleetPartnerId, plateNo, existingSubmissionId: conflict.submissionId },
      );
    }
  }

  private requireFleetPartnerId(fleetPartnerId?: string | null) {
    const normalized = fleetPartnerId?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FLEET_PARTNER_ID_REQUIRED",
        "fleetPartnerId is required.",
      );
    }
    return normalized;
  }

  private requireSubmissionType(
    submissionType?: SupplySubmissionType,
  ): SupplySubmissionType {
    const allowed: readonly SupplySubmissionType[] = [
      "driver_onboarding",
      "vehicle_onboarding",
      "insurance_update",
      "contract_update",
      "driver_affiliation",
      "vehicle_affiliation",
    ];
    if (submissionType && allowed.includes(submissionType)) {
      return submissionType;
    }
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "SUBMISSION_TYPE_INVALID",
      `submissionType must be one of: ${allowed.join(", ")}.`,
    );
  }

  private requireExpectedRevisionNo(expectedRevisionNo?: number): number {
    if (
      Number.isInteger(expectedRevisionNo) &&
      (expectedRevisionNo as number) >= 0
    ) {
      return expectedRevisionNo as number;
    }
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "EXPECTED_REVISION_NO_INVALID",
      "expectedRevisionNo must be a non-negative integer.",
    );
  }

  private requireText(value: string | undefined | null, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private normalizeServiceProductCodes(codes: unknown): string[] {
    if (!Array.isArray(codes)) {
      return [];
    }
    return [
      ...new Set(
        codes
          .map((code) => (typeof code === "string" ? code.trim() : ""))
          .filter((code) => code.length > 0),
      ),
    ];
  }

  private normalizeDriverDraft(
    submissionId: string,
    command: UpsertDriverSupplyDraftCommand,
  ): DriverSupplyDraft {
    return {
      submissionId,
      name: this.requireText(command?.name, "name"),
      mobile: this.requireText(command?.mobile, "mobile"),
      professionalDriverLicenseNo: this.requireText(
        command?.professionalDriverLicenseNo,
        "professionalDriverLicenseNo",
      ),
      professionalDriverLicenseExpiry: this.requireText(
        command?.professionalDriverLicenseExpiry,
        "professionalDriverLicenseExpiry",
      ),
      taxiDriverRegistrationNo: this.requireText(
        command?.taxiDriverRegistrationNo,
        "taxiDriverRegistrationNo",
      ),
      taxiDriverRegistrationArea: this.requireText(
        command?.taxiDriverRegistrationArea,
        "taxiDriverRegistrationArea",
      ),
      taxiDriverRegistrationExpiry: this.requireText(
        command?.taxiDriverRegistrationExpiry,
        "taxiDriverRegistrationExpiry",
      ),
      supportedServiceProductCodes: this.normalizeServiceProductCodes(
        command?.supportedServiceProductCodes,
      ),
      preferredVehicleSubmissionId:
        command?.preferredVehicleSubmissionId?.trim() || null,
    };
  }

  private normalizeVehicleDraft(
    submissionId: string,
    command: UpsertVehicleSupplyDraftCommand,
  ): VehicleSupplyDraft {
    return {
      submissionId,
      plateNo: this.requireText(command?.plateNo, "plateNo"),
      licenseType: this.requireText(command?.licenseType, "licenseType"),
      brand: command?.brand?.trim() || null,
      model: command?.model?.trim() || null,
      modelYear:
        typeof command?.modelYear === "number" ? command.modelYear : null,
      seatCount: this.requireNonNegativeInteger(command?.seatCount, "seatCount"),
      luggageCapacity: this.requireNonNegativeInteger(
        command?.luggageCapacity,
        "luggageCapacity",
      ),
      businessArea: this.requireText(command?.businessArea, "businessArea"),
      supportedServiceProductCodes: this.normalizeServiceProductCodes(
        command?.supportedServiceProductCodes,
      ),
      airportTransferEligible: command?.airportTransferEligible === true,
      fixedFareAllowed: command?.fixedFareAllowed === true,
      currentDriverSubmissionId:
        command?.currentDriverSubmissionId?.trim() || null,
    };
  }

  private normalizeDocument(
    submissionId: string,
    fleetPartnerId: string,
    uploadedBy: string,
    command: AddSupplyDocumentCommand,
  ): SupplyDocumentRecord {
    return {
      documentId: randomUUID(),
      fleetPartnerId,
      submissionId,
      documentType: this.requireText(
        command?.documentType,
        "documentType",
      ) as SupplyDocumentRecord["documentType"],
      fileObjectKey: this.requireText(command?.fileObjectKey, "fileObjectKey"),
      originalFileName: this.requireText(
        command?.originalFileName,
        "originalFileName",
      ),
      contentType: this.requireText(command?.contentType, "contentType"),
      fileSize: this.requireNonNegativeInteger(command?.fileSize, "fileSize"),
      checksumSha256: this.requireText(
        command?.checksumSha256,
        "checksumSha256",
      ),
      effectiveFrom: command?.effectiveFrom?.trim() || null,
      effectiveUntil: command?.effectiveUntil?.trim() || null,
      reviewStatus: "pending",
      reviewComment: null,
      uploadedBy,
      uploadedAt: new Date().toISOString(),
    };
  }

  private requireNonNegativeInteger(value: unknown, field: string): number {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "FIELD_INVALID",
      `${field} must be a non-negative number.`,
      { field },
    );
  }
}

type FleetLifecycleConfig = {
  nextStatus: SupplySubmissionStatus;
  eventType: SupplyReviewEventRecord["eventType"];
  allowedCurrentStatuses: readonly SupplySubmissionStatus[];
  requireDraft: boolean;
  stampSubmitter: boolean;
};
