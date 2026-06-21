import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  VehicleSupplyDraft,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import type { SupplyReviewEventRecord } from "./supply-submission.repository";
import { SupplySubmissionRepository } from "./supply-submission.repository";
import type {
  CreateDriverSupplySubmissionCommand,
  CreateVehicleSupplySubmissionCommand,
  SubmitSupplySubmissionCommand,
  SupplySubmissionDetail,
  SupplySubmissionFilters,
  UpdateDriverSupplySubmissionCommand,
  UpdateVehicleSupplySubmissionCommand,
  WithdrawSupplySubmissionCommand,
} from "./supply-submission.types";

const DRIVER_REQUIRED_DOCUMENTS: readonly SupplyDocumentRecord["documentType"][] = [
  "professional_driver_license",
  "taxi_driver_registration",
];

const VEHICLE_REQUIRED_DOCUMENTS: readonly SupplyDocumentRecord["documentType"][] = [
  "vehicle_registration",
  "insurance_policy",
];

const VEHICLE_CONTRACT_DOCUMENTS: readonly SupplyDocumentRecord["documentType"][] = [
  "fleet_participation_contract",
  "vehicle_management_contract",
];

const EDITABLE_STATUSES: readonly SupplySubmissionStatus[] = [
  "draft",
  "needs_revision",
  "withdrawn",
];

type LoadedState = {
  submissions: SupplySubmissionRecord[];
  driverDrafts: DriverSupplyDraft[];
  vehicleDrafts: VehicleSupplyDraft[];
  documents: SupplyDocumentRecord[];
  reviewEvents: SupplyReviewEventRecord[];
};

@Injectable()
export class SupplySubmissionService implements OnModuleInit {
  private submissions: SupplySubmissionRecord[] = [];
  private driverDrafts: DriverSupplyDraft[] = [];
  private vehicleDrafts: VehicleSupplyDraft[] = [];
  private documents: SupplyDocumentRecord[] = [];
  private reviewEvents: SupplyReviewEventRecord[] = [];

  constructor(
    private readonly supplySubmissionRepository: SupplySubmissionRepository,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  async onModuleInit() {
    try {
      const state = await this.supplySubmissionRepository.loadState();
      this.hydrateState(state);
    } catch (error) {
      this.supplySubmissionRepository.reportPersistenceFailure(
        error,
        "supply submission module init",
      );
    }
  }

  listSupplySubmissions(
    fleetPartnerId: string,
    filters: SupplySubmissionFilters = {},
  ) {
    return this.submissions
      .filter((submission) => submission.fleetPartnerId === fleetPartnerId)
      .filter((submission) =>
        filters.status ? submission.status === filters.status : true,
      )
      .filter((submission) =>
        filters.submissionType
          ? submission.submissionType === filters.submissionType
          : true,
      )
      .filter((submission) =>
        filters.subjectDriverId
          ? submission.subjectDriverId === filters.subjectDriverId
          : true,
      )
      .filter((submission) =>
        filters.subjectVehicleId
          ? submission.subjectVehicleId === filters.subjectVehicleId
          : true,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((submission) =>
        this.buildDetail(submission.submissionId, fleetPartnerId),
      );
  }

  getSupplySubmissionDetail(fleetPartnerId: string, submissionId: string) {
    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async createDriverDraft(
    fleetPartnerId: string,
    actorId: string,
    command: CreateDriverSupplySubmissionCommand,
    requestId?: string,
  ) {
    this.validateDriverDraft(command);
    this.assertDriverIdentityAvailable(
      command.professionalDriverLicenseNo,
      command.taxiDriverRegistrationNo,
    );

    const now = new Date().toISOString();
    const submissionId = randomUUID();
    const submission: SupplySubmissionRecord = {
      submissionId,
      fleetPartnerId,
      submissionType: "driver_onboarding",
      status: "draft",
      revisionNo: 1,
      subjectDriverId: submissionId,
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
      createdAt: now,
      updatedAt: now,
    };
    const draft: DriverSupplyDraft = {
      submissionId,
      ...this.normalizeDriverDraft(command),
    };

    this.submissions = [submission, ...this.submissions];
    this.driverDrafts = [draft, ...this.driverDrafts];
    await this.persistChanges(
      { submissions: [submission], driverDrafts: [draft] },
      "create driver draft",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "create_supply_submission_driver",
        resourceType: "supply_submission",
        resourceId: submissionId,
        newValuesSummary: {
          fleetPartnerId,
          submissionType: submission.submissionType,
          status: submission.status,
        },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async updateDriverDraft(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: UpdateDriverSupplySubmissionCommand,
    requestId?: string,
  ) {
    this.validateDriverDraft(command);
    const submission = this.requireScopedSubmission(submissionId, fleetPartnerId);
    this.assertEditable(submission);
    this.assertExpectedRevisionNo(submission, command.expectedRevisionNo);
    this.assertDriverIdentityAvailable(
      command.professionalDriverLicenseNo,
      command.taxiDriverRegistrationNo,
      submissionId,
    );

    const draft = this.requireDriverDraft(submissionId);
    const previous = { ...draft };
    Object.assign(draft, this.normalizeDriverDraft(command));
    this.bumpSubmissionRevision(submission);

    await this.persistChanges(
      { submissions: [submission], driverDrafts: [draft] },
      "update driver draft",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "update_supply_submission_driver",
        resourceType: "supply_submission",
        resourceId: submissionId,
        oldValuesSummary: { ...previous },
        newValuesSummary: { ...draft },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async createVehicleDraft(
    fleetPartnerId: string,
    actorId: string,
    command: CreateVehicleSupplySubmissionCommand,
    requestId?: string,
  ) {
    this.validateVehicleDraft(command);
    this.assertVehiclePlateAvailable(command.plateNo);

    const now = new Date().toISOString();
    const submissionId = randomUUID();
    const submission: SupplySubmissionRecord = {
      submissionId,
      fleetPartnerId,
      submissionType: "vehicle_onboarding",
      status: "draft",
      revisionNo: 1,
      subjectDriverId: null,
      subjectVehicleId: submissionId,
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
    const draft: VehicleSupplyDraft = {
      submissionId,
      ...this.normalizeVehicleDraft(command),
    };

    this.submissions = [submission, ...this.submissions];
    this.vehicleDrafts = [draft, ...this.vehicleDrafts];
    await this.persistChanges(
      { submissions: [submission], vehicleDrafts: [draft] },
      "create vehicle draft",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "create_supply_submission_vehicle",
        resourceType: "supply_submission",
        resourceId: submissionId,
        newValuesSummary: {
          fleetPartnerId,
          submissionType: submission.submissionType,
          plateNo: draft.plateNo,
        },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async updateVehicleDraft(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: UpdateVehicleSupplySubmissionCommand,
    requestId?: string,
  ) {
    this.validateVehicleDraft(command);
    const submission = this.requireScopedSubmission(submissionId, fleetPartnerId);
    this.assertEditable(submission);
    this.assertExpectedRevisionNo(submission, command.expectedRevisionNo);
    this.assertVehiclePlateAvailable(command.plateNo, submissionId);

    const draft = this.requireVehicleDraft(submissionId);
    const previous = { ...draft };
    Object.assign(draft, this.normalizeVehicleDraft(command));
    this.bumpSubmissionRevision(submission);

    await this.persistChanges(
      { submissions: [submission], vehicleDrafts: [draft] },
      "update vehicle draft",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "update_supply_submission_vehicle",
        resourceType: "supply_submission",
        resourceId: submissionId,
        oldValuesSummary: { ...previous },
        newValuesSummary: { ...draft },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async submitSupplySubmission(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: SubmitSupplySubmissionCommand,
    requestId?: string,
  ) {
    const submission = this.requireScopedSubmission(submissionId, fleetPartnerId);
    this.assertExpectedRevisionNo(submission, command.expectedRevisionNo);
    if (!EDITABLE_STATUSES.includes(submission.status)) {
      throw this.conflict(
        "INVALID_STATE_TRANSITION",
        "The supply submission cannot be submitted from the current status.",
        { submissionId, currentStatus: submission.status },
      );
    }
    this.assertSubmissionComplete(submission);

    const previousStatus = submission.status;
    submission.status = "submitted";
    submission.revisionNo += 1;
    submission.submittedBy = actorId;
    submission.submittedAt = new Date().toISOString();
    submission.updatedAt = submission.submittedAt;
    const event = this.createReviewEvent(
      submission,
      "submitted",
      actorId,
      null,
      null,
    );
    this.reviewEvents = [event, ...this.reviewEvents];

    await this.persistChanges(
      { submissions: [submission], reviewEvents: [event] },
      "submit supply submission",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "submit_supply_submission",
        resourceType: "supply_submission",
        resourceId: submissionId,
        oldValuesSummary: { previousStatus },
        newValuesSummary: {
          status: submission.status,
          submittedBy: submission.submittedBy,
          submittedAt: submission.submittedAt,
        },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async withdrawSupplySubmission(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: WithdrawSupplySubmissionCommand,
    requestId?: string,
  ) {
    const submission = this.requireScopedSubmission(submissionId, fleetPartnerId);
    this.assertExpectedRevisionNo(submission, command.expectedRevisionNo);
    if (submission.status !== "submitted") {
      throw this.conflict(
        "INVALID_STATE_TRANSITION",
        "Only submitted supply submissions can be withdrawn.",
        { submissionId, currentStatus: submission.status },
      );
    }

    submission.status = "withdrawn";
    submission.revisionNo += 1;
    submission.updatedAt = new Date().toISOString();
    const event = this.createReviewEvent(
      submission,
      "withdrawn",
      actorId,
      null,
      null,
    );
    this.reviewEvents = [event, ...this.reviewEvents];

    await this.persistChanges(
      { submissions: [submission], reviewEvents: [event] },
      "withdraw supply submission",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "withdraw_supply_submission",
        resourceType: "supply_submission",
        resourceId: submissionId,
        newValuesSummary: { status: submission.status },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  listDocumentsForSubmission(submissionId: string) {
    return this.documents
      .filter((document) => document.submissionId === submissionId)
      .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
      .map((document) => ({ ...document }));
  }

  listReviewEventsForSubmission(submissionId: string) {
    return this.reviewEvents
      .filter((event) => event.submissionId === submissionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((event) => ({ ...event }));
  }

  listDriverDrafts() {
    return this.driverDrafts.map((draft) => ({ ...draft }));
  }

  listVehicleDrafts() {
    return this.vehicleDrafts.map((draft) => ({ ...draft }));
  }

  listSubmissionsSnapshot() {
    return this.submissions.map((submission) => ({ ...submission }));
  }

  requireScopedSubmission(submissionId: string, fleetPartnerId: string) {
    const submission = this.submissions.find(
      (candidate) => candidate.submissionId === submissionId,
    );
    if (!submission) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "The supply submission could not be found.",
        { submissionId },
      );
    }
    if (submission.fleetPartnerId !== fleetPartnerId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "FLEET_SCOPE_DENIED",
        "The supply submission is outside the fleet partner scope.",
        { submissionId, fleetPartnerId },
      );
    }
    return submission;
  }

  async persistSubmissionAndDocuments(
    submission: SupplySubmissionRecord,
    documents: readonly SupplyDocumentRecord[],
    context: string,
  ) {
    await this.persistChanges({ submissions: [submission], documents }, context);
  }

  replaceDocument(document: SupplyDocumentRecord) {
    this.documents = [
      document,
      ...this.documents.filter(
        (candidate) => candidate.documentId !== document.documentId,
      ),
    ];
  }

  removeDocument(documentId: string) {
    this.documents = this.documents.filter(
      (document) => document.documentId !== documentId,
    );
  }

  getDocumentById(documentId: string) {
    return (
      this.documents.find((document) => document.documentId === documentId) ??
      null
    );
  }

  bumpRevisionForSubmission(submission: SupplySubmissionRecord) {
    this.bumpSubmissionRevision(submission);
  }

  assertSubmissionRevision(
    submission: SupplySubmissionRecord,
    expectedRevisionNo: number,
  ) {
    this.assertExpectedRevisionNo(submission, expectedRevisionNo);
  }

  assertSubmissionEditable(submission: SupplySubmissionRecord) {
    this.assertEditable(submission);
  }

  recordMutationAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    this.recordAudit(input, requestId);
  }

  private hydrateState(state: LoadedState) {
    this.submissions = state.submissions.map((submission) => ({ ...submission }));
    this.driverDrafts = state.driverDrafts.map((draft) => ({ ...draft }));
    this.vehicleDrafts = state.vehicleDrafts.map((draft) => ({ ...draft }));
    this.documents = state.documents.map((document) => ({ ...document }));
    this.reviewEvents = state.reviewEvents.map((event) => ({ ...event }));
  }

  private buildDetail(
    submissionId: string,
    fleetPartnerId: string,
  ): SupplySubmissionDetail {
    const submission = this.requireScopedSubmission(submissionId, fleetPartnerId);
    return {
      submission: { ...submission },
      driverDraft:
        this.driverDrafts.find((draft) => draft.submissionId === submissionId) ??
        null,
      vehicleDraft:
        this.vehicleDrafts.find((draft) => draft.submissionId === submissionId) ??
        null,
      documents: this.listDocumentsForSubmission(submissionId),
      reviewEvents: this.listReviewEventsForSubmission(submissionId),
    };
  }

  private requireDriverDraft(submissionId: string) {
    const draft = this.driverDrafts.find(
      (candidate) => candidate.submissionId === submissionId,
    );
    if (!draft) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "The driver draft could not be found for this submission.",
        { submissionId },
      );
    }
    return draft;
  }

  private requireVehicleDraft(submissionId: string) {
    const draft = this.vehicleDrafts.find(
      (candidate) => candidate.submissionId === submissionId,
    );
    if (!draft) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "The vehicle draft could not be found for this submission.",
        { submissionId },
      );
    }
    return draft;
  }

  private validateDriverDraft(command: CreateDriverSupplySubmissionCommand) {
    this.assertNonBlank(command.name, "name");
    this.assertNonBlank(command.mobile, "mobile");
    this.assertNonBlank(
      command.professionalDriverLicenseNo,
      "professionalDriverLicenseNo",
    );
    this.assertDateOnly(
      command.professionalDriverLicenseExpiry,
      "professionalDriverLicenseExpiry",
    );
    this.assertNonBlank(
      command.taxiDriverRegistrationNo,
      "taxiDriverRegistrationNo",
    );
    this.assertNonBlank(
      command.taxiDriverRegistrationArea,
      "taxiDriverRegistrationArea",
    );
    this.assertDateOnly(
      command.taxiDriverRegistrationExpiry,
      "taxiDriverRegistrationExpiry",
    );
    this.assertStringArray(
      command.supportedServiceProductCodes,
      "supportedServiceProductCodes",
    );
  }

  private validateVehicleDraft(command: CreateVehicleSupplySubmissionCommand) {
    this.assertNonBlank(command.plateNo, "plateNo");
    this.assertNonBlank(command.licenseType, "licenseType");
    this.assertPositiveInteger(command.seatCount, "seatCount");
    this.assertNonNegativeInteger(command.luggageCapacity, "luggageCapacity");
    this.assertNonBlank(command.businessArea, "businessArea");
    this.assertStringArray(
      command.supportedServiceProductCodes,
      "supportedServiceProductCodes",
    );
    if (command.modelYear !== null && command.modelYear !== undefined) {
      this.assertPositiveInteger(command.modelYear, "modelYear");
    }
  }

  private normalizeDriverDraft(
    command: CreateDriverSupplySubmissionCommand,
  ): CreateDriverSupplySubmissionCommand {
    return {
      ...command,
      name: command.name.trim(),
      mobile: command.mobile.trim(),
      professionalDriverLicenseNo: command.professionalDriverLicenseNo.trim(),
      professionalDriverLicenseExpiry:
        command.professionalDriverLicenseExpiry.trim(),
      taxiDriverRegistrationNo: command.taxiDriverRegistrationNo.trim(),
      taxiDriverRegistrationArea: command.taxiDriverRegistrationArea.trim(),
      taxiDriverRegistrationExpiry: command.taxiDriverRegistrationExpiry.trim(),
      supportedServiceProductCodes: command.supportedServiceProductCodes.map(
        (item) => item.trim(),
      ),
      preferredVehicleSubmissionId:
        command.preferredVehicleSubmissionId?.trim() || null,
    };
  }

  private normalizeVehicleDraft(
    command: CreateVehicleSupplySubmissionCommand,
  ): CreateVehicleSupplySubmissionCommand {
    return {
      ...command,
      plateNo: command.plateNo.trim().toUpperCase(),
      licenseType: command.licenseType.trim(),
      brand: command.brand?.trim() || null,
      model: command.model?.trim() || null,
      businessArea: command.businessArea.trim(),
      supportedServiceProductCodes: command.supportedServiceProductCodes.map(
        (item) => item.trim(),
      ),
      currentDriverSubmissionId: command.currentDriverSubmissionId?.trim() || null,
    };
  }

  private assertDriverIdentityAvailable(
    professionalDriverLicenseNo: string,
    taxiDriverRegistrationNo: string,
    excludeSubmissionId?: string,
  ) {
    const normalizedLicenseNo = professionalDriverLicenseNo.trim().toLowerCase();
    const normalizedRegistrationNo = taxiDriverRegistrationNo.trim().toLowerCase();
    const existing = this.driverDrafts.find(
      (candidate) =>
        candidate.submissionId !== excludeSubmissionId &&
        (candidate.professionalDriverLicenseNo.trim().toLowerCase() ===
          normalizedLicenseNo ||
          candidate.taxiDriverRegistrationNo.trim().toLowerCase() ===
            normalizedRegistrationNo),
    );
    if (existing) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DRIVER_IDENTITY_ALREADY_EXISTS",
        "A driver draft with the same professional identity already exists.",
        { existingSubmissionId: existing.submissionId },
      );
    }
  }

  private assertVehiclePlateAvailable(
    plateNo: string,
    excludeSubmissionId?: string,
  ) {
    const normalizedPlateNo = plateNo.trim().toLowerCase();
    const existingDraft = this.vehicleDrafts.find(
      (candidate) =>
        candidate.submissionId !== excludeSubmissionId &&
        candidate.plateNo.trim().toLowerCase() === normalizedPlateNo,
    );
    if (existingDraft) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATE_ALREADY_EXISTS",
        "A vehicle draft with the same plate already exists.",
        { existingSubmissionId: existingDraft.submissionId, plateNo },
      );
    }

    const existingVehicle = this.regulatoryRegistryService
      .listVehicles()
      .find(
        (vehicle) => vehicle.plateNo.trim().toLowerCase() === normalizedPlateNo,
      );
    if (existingVehicle) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATE_ALREADY_EXISTS",
        "A canonical vehicle with the same plate already exists.",
        { vehicleId: existingVehicle.vehicleId, plateNo },
      );
    }
  }

  private assertExpectedRevisionNo(
    submission: SupplySubmissionRecord,
    expectedRevisionNo: number,
  ) {
    if (submission.revisionNo !== expectedRevisionNo) {
      throw this.conflict(
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

  private assertEditable(submission: SupplySubmissionRecord) {
    if (EDITABLE_STATUSES.includes(submission.status)) {
      return;
    }
    throw this.conflict(
      "SUBMISSION_NOT_EDITABLE",
      "The supply submission is not editable in the current status.",
      {
        submissionId: submission.submissionId,
        status: submission.status,
      },
    );
  }

  private assertSubmissionComplete(submission: SupplySubmissionRecord) {
    const documents = this.listDocumentsForSubmission(submission.submissionId);
    const today = new Date().toISOString().slice(0, 10);
    const expiredDocument = documents.find(
      (document) => document.effectiveUntil && document.effectiveUntil < today,
    );
    if (expiredDocument) {
      throw this.conflict(
        "DOCUMENT_EXPIRED",
        "A required document is expired and must be replaced before submission.",
        {
          submissionId: submission.submissionId,
          documentId: expiredDocument.documentId,
          documentType: expiredDocument.documentType,
          effectiveUntil: expiredDocument.effectiveUntil,
        },
      );
    }

    const requiredDocumentTypes =
      submission.submissionType === "driver_onboarding"
        ? DRIVER_REQUIRED_DOCUMENTS
        : submission.submissionType === "vehicle_onboarding"
          ? [...VEHICLE_REQUIRED_DOCUMENTS, ...VEHICLE_CONTRACT_DOCUMENTS]
          : [];
    const missingDocumentTypes = requiredDocumentTypes.filter(
      (documentType) =>
        !documents.some((document) => document.documentType === documentType),
    );
    if (
      submission.submissionType === "vehicle_onboarding" &&
      missingDocumentTypes.length > 0
    ) {
      const hasContractDocument = documents.some((document) =>
        VEHICLE_CONTRACT_DOCUMENTS.includes(document.documentType),
      );
      const filteredMissing = missingDocumentTypes.filter(
        (documentType) =>
          !VEHICLE_CONTRACT_DOCUMENTS.includes(documentType) ||
          !hasContractDocument,
      );
      if (filteredMissing.length > 0) {
        throw this.conflict(
          "DOCUMENT_REQUIRED",
          "Required supply documents are missing.",
          {
            submissionId: submission.submissionId,
            missingDocumentTypes: filteredMissing,
          },
        );
      }
    }
    if (
      submission.submissionType !== "vehicle_onboarding" &&
      missingDocumentTypes.length > 0
    ) {
      throw this.conflict(
        "DOCUMENT_REQUIRED",
        "Required supply documents are missing.",
        {
          submissionId: submission.submissionId,
          missingDocumentTypes,
        },
      );
    }
  }

  private createReviewEvent(
    submission: SupplySubmissionRecord,
    eventType: SupplyReviewEventRecord["eventType"],
    actorId: string,
    reasonCode: string | null,
    comment: string | null,
  ): SupplyReviewEventRecord {
    return {
      eventId: randomUUID(),
      submissionId: submission.submissionId,
      revisionNo: submission.revisionNo,
      eventType,
      actorId,
      reasonCode,
      comment,
      createdAt: new Date().toISOString(),
    };
  }

  private bumpSubmissionRevision(submission: SupplySubmissionRecord) {
    submission.revisionNo += 1;
    submission.updatedAt = new Date().toISOString();
  }

  private async persistChanges(
    changes: {
      submissions?: readonly SupplySubmissionRecord[];
      driverDrafts?: readonly DriverSupplyDraft[];
      vehicleDrafts?: readonly VehicleSupplyDraft[];
      documents?: readonly SupplyDocumentRecord[];
      reviewEvents?: readonly SupplyReviewEventRecord[];
    },
    context: string,
  ) {
    try {
      await this.supplySubmissionRepository.persistChanges(changes);
    } catch (error) {
      this.supplySubmissionRepository.reportPersistenceFailure(error, context);
      throw error;
    }
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    if (!this.auditNotificationService) {
      return;
    }
    const log = { ...input };
    if (requestId) {
      (log as { requestId?: string }).requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(log);
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} is required.`,
        { fieldName },
      );
    }
  }

  private assertDateOnly(value: string, fieldName: string) {
    this.assertNonBlank(value, fieldName);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must use YYYY-MM-DD format.`,
        { fieldName },
      );
    }
  }

  private assertStringArray(value: readonly string[], fieldName: string) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must contain at least one item.`,
        { fieldName },
      );
    }
    if (value.some((item) => typeof item !== "string" || !item.trim())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} contains invalid items.`,
        { fieldName },
      );
    }
  }

  private assertPositiveInteger(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must be a positive integer.`,
        { fieldName, value },
      );
    }
  }

  private assertNonNegativeInteger(value: number, fieldName: string) {
    if (!Number.isInteger(value) || value < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${fieldName} must be a non-negative integer.`,
        { fieldName, value },
      );
    }
  }

  private conflict(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new ApiRequestError(HttpStatus.CONFLICT, code, message, details);
  }
}
