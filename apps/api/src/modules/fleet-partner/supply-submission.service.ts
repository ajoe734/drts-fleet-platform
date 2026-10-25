import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyReadinessReasonCode,
  SupplyReadinessRecord,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  VehicleFleetAffiliationRecord,
  VehicleSupplyDraft,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import type { SupplyReviewEventRecord } from "./supply-submission.repository";
import { SupplySubmissionRepository } from "./supply-submission.repository";
import type {
  CreateDriverSupplySubmissionCommand,
  CreateSupplyRenewalDraftCommand,
  CreateVehicleSupplySubmissionCommand,
  FleetSupplyRenewalTargetDriver,
  FleetSupplyRenewalTargetVehicle,
  FleetSupplyRenewalTargetsResponse,
  SubmitSupplySubmissionCommand,
  SupplyRenewalSubmissionType,
  SupplySubmissionDetail,
  SupplySubmissionFilters,
  UpdateDriverSupplySubmissionCommand,
  UpdateSupplyRenewalDraftCommand,
  UpdateVehicleSupplySubmissionCommand,
  WithdrawSupplySubmissionCommand,
} from "./supply-submission.types";

const DRIVER_REQUIRED_DOCUMENTS: readonly SupplyDocumentRecord["documentType"][] =
  ["professional_driver_license", "taxi_driver_registration"];

const VEHICLE_REQUIRED_DOCUMENTS: readonly SupplyDocumentRecord["documentType"][] =
  ["vehicle_registration", "insurance_policy"];

const VEHICLE_CONTRACT_DOCUMENTS: readonly SupplyDocumentRecord["documentType"][] =
  ["fleet_participation_contract", "vehicle_management_contract"];

const RENEWAL_CONTRACT_DOCUMENTS: readonly SupplyDocumentRecord["documentType"][] =
  [
    "fleet_participation_contract",
    "driver_management_contract",
    "vehicle_management_contract",
  ];

const RENEWAL_SUBMISSION_TYPES: readonly SupplyRenewalSubmissionType[] = [
  "insurance_update",
  "contract_update",
  "profile_correction",
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
  vehicleAffiliations?: VehicleFleetAffiliationRecord[];
};

@Injectable()
export class SupplySubmissionService implements OnModuleInit {
  private submissions: SupplySubmissionRecord[] = [];
  private driverDrafts: DriverSupplyDraft[] = [];
  private vehicleDrafts: VehicleSupplyDraft[] = [];
  private documents: SupplyDocumentRecord[] = [];
  private reviewEvents: SupplyReviewEventRecord[] = [];
  private vehicleAffiliations: VehicleFleetAffiliationRecord[] = [];

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
      if (!this.supplySubmissionRepository.isEnabled()) {
        this.runInMemoryIdempotentBackfill();
      }
    } catch (error) {
      this.supplySubmissionRepository.reportPersistenceFailure(
        error,
        "supply submission module init",
      );
    }
  }

  async syncState() {
    const state = await this.supplySubmissionRepository.loadState();
    this.hydrateState(state);
  }

  async listSupplySubmissions(
    fleetPartnerId: string,
    filters: SupplySubmissionFilters = {},
  ) {
    await this.syncState();
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

  async getSupplySubmissionDetail(
    fleetPartnerId: string,
    submissionId: string,
  ) {
    await this.syncState();
    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async listRenewalTargets(
    fleetPartnerId: string,
    readinessRecords?: readonly SupplyReadinessRecord[],
  ): Promise<FleetSupplyRenewalTargetsResponse> {
    await this.syncState();

    const readinessMap = new Map<string, SupplyReadinessRecord>();
    for (const record of readinessRecords ?? []) {
      readinessMap.set(`${record.subjectType}:${record.subjectId}`, record);
    }

    const today = new Date().toISOString().slice(0, 10);
    const approvedSubmissions = this.submissions
      .filter(
        (submission) =>
          submission.fleetPartnerId === fleetPartnerId &&
          submission.status === "approved",
      )
      .sort((left, right) =>
        (right.reviewedAt ?? right.updatedAt).localeCompare(
          left.reviewedAt ?? left.updatedAt,
        ),
      );

    const drivers: FleetSupplyRenewalTargetDriver[] =
      this.regulatoryRegistryService
        .listDrivers()
        .filter((driver) =>
          this.isDriverOwnedByFleet(driver.driverId, fleetPartnerId),
        )
        .map((driver) => {
          const latestDraft = this.findLatestApprovedDriverDraft(
            fleetPartnerId,
            driver.driverId,
          );
          const readiness = readinessMap.get(`driver:${driver.driverId}`);

          const professionalDriverLicenseExpiry =
            driver.professionalDriverLicenseExpiry ??
            latestDraft?.professionalDriverLicenseExpiry ??
            "";
          const taxiDriverRegistrationExpiry =
            driver.taxiDriverRegistrationExpiry ??
            latestDraft?.taxiDriverRegistrationExpiry ??
            "";

          const fallbackReasons: SupplyReadinessReasonCode[] = [];
          if (driver.lifecycleStatus === "suspended") {
            fallbackReasons.push("MANUALLY_SUSPENDED");
          }
          if (
            professionalDriverLicenseExpiry &&
            professionalDriverLicenseExpiry < today
          ) {
            fallbackReasons.push("DRIVER_LICENSE_EXPIRED");
          } else if (!professionalDriverLicenseExpiry) {
            fallbackReasons.push("DRIVER_LICENSE_MISSING");
          }
          if (
            taxiDriverRegistrationExpiry &&
            taxiDriverRegistrationExpiry < today
          ) {
            fallbackReasons.push("DRIVER_REGISTRATION_EXPIRED");
          } else if (!taxiDriverRegistrationExpiry) {
            fallbackReasons.push("DRIVER_REGISTRATION_MISSING");
          }
          if (!driver.licensesValid && fallbackReasons.length === 0) {
            fallbackReasons.push("DRIVER_LICENSE_EXPIRED");
          }

          return {
            driverId: driver.driverId,
            fleetPartnerId,
            name: driver.name,
            mobile: latestDraft?.mobile ?? "",
            professionalDriverLicenseNo:
              latestDraft?.professionalDriverLicenseNo ?? "",
            professionalDriverLicenseExpiry,
            taxiDriverRegistrationNo:
              latestDraft?.taxiDriverRegistrationNo ?? "",
            taxiDriverRegistrationArea:
              latestDraft?.taxiDriverRegistrationArea ?? "台北市",
            taxiDriverRegistrationExpiry,
            supportedServiceProductCodes:
              latestDraft?.supportedServiceProductCodes?.length
                ? [...latestDraft.supportedServiceProductCodes]
                : ["taxi_realtime"],
            lifecycleStatus: driver.lifecycleStatus,
            licensesValid: driver.licensesValid,
            ready: readiness
              ? readiness.state === "ready"
              : fallbackReasons.length === 0,
            reasonCodes: readiness
              ? [...readiness.reasonCodes]
              : fallbackReasons,
          };
        });

    const policiesById = new Map(
      this.regulatoryRegistryService
        .listPolicies()
        .map((p) => [p.policyId, p]),
    );
    const vehicles: FleetSupplyRenewalTargetVehicle[] =
      this.regulatoryRegistryService
        .listVehicles()
        .filter((vehicle) =>
          this.isVehicleOwnedByFleet(vehicle.vehicleId, fleetPartnerId),
        )
        .map((vehicle) => {
          const latestDraft = this.findLatestApprovedVehicleDraft(
            fleetPartnerId,
            vehicle.vehicleId,
          );
          const contract = vehicle.supplyLifecycle.contract;
          const policy = vehicle.supplyLifecycle.insurance;
          const activePolicyRecord = policy.policyId
            ? policiesById.get(policy.policyId)
            : undefined;
          const readiness = readinessMap.get(`vehicle:${vehicle.vehicleId}`);

          const contractEndDate = contract.endAt
            ? contract.endAt.slice(0, 10)
            : null;
          const policyEndDate = policy.endAt
            ? policy.endAt.slice(0, 10)
            : null;
          const fallbackReasons: SupplyReadinessReasonCode[] = [];
          if (contract.lifecycleStatus === "missing") {
            fallbackReasons.push("CONTRACT_MISSING");
          } else if (
            contract.lifecycleStatus !== "active" ||
            (contractEndDate !== null && contractEndDate < today)
          ) {
            fallbackReasons.push("CONTRACT_INACTIVE");
          }
          if (
            policy.lifecycleStatus === "missing" ||
            policy.lifecycleStatus === "pending"
          ) {
            fallbackReasons.push("INSURANCE_MISSING");
          } else if (
            policy.lifecycleStatus !== "active" ||
            (policyEndDate !== null && policyEndDate < today)
          ) {
            fallbackReasons.push("INSURANCE_EXPIRED");
          }

          return {
            vehicleId: vehicle.vehicleId,
            fleetPartnerId,
            plateNo: vehicle.plateNo,
            licenseType:
              vehicle.licenseType ?? latestDraft?.licenseType ?? "taxi",
            brand: latestDraft?.brand ?? null,
            model: latestDraft?.model ?? null,
            modelYear: latestDraft?.modelYear ?? null,
            seatCount: latestDraft?.seatCount ?? 4,
            luggageCapacity: latestDraft?.luggageCapacity ?? 2,
            businessArea: latestDraft?.businessArea ?? "台北市",
            supportedServiceProductCodes:
              latestDraft?.supportedServiceProductCodes?.length
                ? [...latestDraft.supportedServiceProductCodes]
                : ["taxi_realtime"],
            airportTransferEligible:
              latestDraft?.airportTransferEligible ?? false,
            fixedFareAllowed: latestDraft?.fixedFareAllowed ?? false,
            doorCount: latestDraft?.doorCount ?? 4,
            color: latestDraft?.color ?? "White",
            supplyLifecycle: vehicle.dispatchableFlag ? "active" : "suspended",
            activeContractId: contract.contractId ?? null,
            activeContractStatus: contract.lifecycleStatus ?? null,
            activeContractEndAt: contract.endAt ?? null,
            activePolicyId: policy.policyId ?? null,
            activePolicyNo: activePolicyRecord?.policyNo ?? null,
            activePolicyStatus: policy.lifecycleStatus ?? null,
            activePolicyEndAt: policy.endAt ?? null,
            ready: readiness
              ? readiness.state === "ready"
              : fallbackReasons.length === 0,
            reasonCodes: readiness
              ? [...readiness.reasonCodes]
              : fallbackReasons,
          };
        });

    void approvedSubmissions;
    return {
      fleetPartnerId,
      drivers,
      vehicles,
    };
  }

  async createRenewalDraft(
    fleetPartnerId: string,
    actorId: string,
    command: CreateSupplyRenewalDraftCommand,
    requestId?: string,
  ) {
    await this.syncState();

    if (
      !RENEWAL_SUBMISSION_TYPES.includes(
        command.submissionType as SupplyRenewalSubmissionType,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "submissionType must be insurance_update, contract_update, or profile_correction.",
        { submissionType: command.submissionType },
      );
    }

    const now = new Date().toISOString();
    const submissionId = randomUUID();

    if (command.submissionType === "profile_correction") {
      const targetDriverId = command.subjectDriverId?.trim();
      if (!targetDriverId) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "subjectDriverId is required for profile_correction renewal submissions.",
          { fieldName: "subjectDriverId" },
        );
      }
      const canonicalDriver = this.regulatoryRegistryService
        .listDrivers()
        .find((driver) => driver.driverId === targetDriverId);
      if (!canonicalDriver) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "NOT_FOUND",
          "The target canonical driver could not be found.",
          { subjectDriverId: targetDriverId },
        );
      }
      if (!this.isDriverOwnedByFleet(targetDriverId, fleetPartnerId)) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "FLEET_SCOPE_DENIED",
          "The target driver is outside the fleet partner scope.",
          { subjectDriverId: targetDriverId, fleetPartnerId },
        );
      }

      const latestDriverDraft = this.findLatestApprovedDriverDraft(
        fleetPartnerId,
        targetDriverId,
      );
      const mergedDriverCommand: CreateDriverSupplySubmissionCommand = {
        name: command.driverDraft?.name ?? canonicalDriver.name,
        mobile:
          command.driverDraft?.mobile ??
          latestDriverDraft?.mobile ??
          "0912345678",
        professionalDriverLicenseNo:
          command.driverDraft?.professionalDriverLicenseNo ??
          latestDriverDraft?.professionalDriverLicenseNo ??
          "",
        professionalDriverLicenseExpiry:
          command.driverDraft?.professionalDriverLicenseExpiry ??
          canonicalDriver.professionalDriverLicenseExpiry ??
          latestDriverDraft?.professionalDriverLicenseExpiry ??
          now.slice(0, 10),
        taxiDriverRegistrationNo:
          command.driverDraft?.taxiDriverRegistrationNo ??
          latestDriverDraft?.taxiDriverRegistrationNo ??
          "",
        taxiDriverRegistrationArea:
          command.driverDraft?.taxiDriverRegistrationArea ??
          latestDriverDraft?.taxiDriverRegistrationArea ??
          "台北市",
        taxiDriverRegistrationExpiry:
          command.driverDraft?.taxiDriverRegistrationExpiry ??
          canonicalDriver.taxiDriverRegistrationExpiry ??
          latestDriverDraft?.taxiDriverRegistrationExpiry ??
          now.slice(0, 10),
        supportedServiceProductCodes:
          command.driverDraft?.supportedServiceProductCodes ??
          (latestDriverDraft?.supportedServiceProductCodes?.length
            ? [...latestDriverDraft.supportedServiceProductCodes]
            : ["taxi_realtime"]),
        preferredVehicleSubmissionId:
          command.driverDraft?.preferredVehicleSubmissionId !== undefined
            ? command.driverDraft.preferredVehicleSubmissionId
            : (latestDriverDraft?.preferredVehicleSubmissionId ?? null),
      };

      this.validateDriverDraft(mergedDriverCommand);
      this.assertDriverIdentityAvailable(
        mergedDriverCommand.professionalDriverLicenseNo,
        mergedDriverCommand.taxiDriverRegistrationNo,
        submissionId,
        targetDriverId,
      );

      const submission: SupplySubmissionRecord = {
        submissionId,
        fleetPartnerId,
        submissionType: "profile_correction",
        status: "draft",
        revisionNo: 1,
        subjectDriverId: targetDriverId,
        subjectVehicleId: null,
        submittedBy: null,
        submittedAt: null,
        reviewStartedBy: null,
        reviewStartedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReasonCode: null,
        reviewComment: null,
        canonicalDriverId: targetDriverId,
        canonicalVehicleId: null,
        canonicalContractId: null,
        canonicalPolicyId: null,
        createdAt: now,
        updatedAt: now,
      };
      const draft: DriverSupplyDraft = {
        submissionId,
        ...this.normalizeDriverDraft(mergedDriverCommand),
      };

      this.submissions = [submission, ...this.submissions];
      this.driverDrafts = [draft, ...this.driverDrafts];
      await this.persistChanges(
        { submissions: [submission], driverDrafts: [draft] },
        "create driver renewal draft",
      );
      this.recordAudit(
        {
          actorId,
          actorType: "partner_api_key",
          tenantId: null,
          moduleName: "fleet-partner",
          actionName: "create_supply_submission_renewal",
          resourceType: "supply_submission",
          resourceId: submissionId,
          newValuesSummary: {
            fleetPartnerId,
            submissionType: submission.submissionType,
            canonicalDriverId: targetDriverId,
          },
        },
        requestId,
      );

      return this.buildDetail(submissionId, fleetPartnerId);
    }

    const targetVehicleId = command.subjectVehicleId?.trim();
    if (!targetVehicleId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "subjectVehicleId is required for vehicle renewal submissions.",
        { fieldName: "subjectVehicleId" },
      );
    }
    const canonicalVehicle = this.regulatoryRegistryService
      .listVehicles()
      .find((vehicle) => vehicle.vehicleId === targetVehicleId);
    if (!canonicalVehicle) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "The target canonical vehicle could not be found.",
        { subjectVehicleId: targetVehicleId },
      );
    }
    if (!this.isVehicleOwnedByFleet(targetVehicleId, fleetPartnerId)) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "FLEET_SCOPE_DENIED",
        "The target vehicle is outside the fleet partner scope.",
        { subjectVehicleId: targetVehicleId, fleetPartnerId },
      );
    }

    if (
      command.vehicleDraft?.plateNo &&
      command.vehicleDraft.plateNo.trim().toUpperCase() !==
        canonicalVehicle.plateNo.trim().toUpperCase()
    ) {
      throw this.conflict(
        "PLATE_IMMUTABLE_ON_RENEWAL",
        "Vehicle plate number cannot be changed in a renewal submission.",
        {
          subjectVehicleId: targetVehicleId,
          canonicalPlateNo: canonicalVehicle.plateNo,
          requestedPlateNo: command.vehicleDraft.plateNo,
        },
      );
    }

    const latestVehicleDraft = this.findLatestApprovedVehicleDraft(
      fleetPartnerId,
      targetVehicleId,
    );
    const mergedVehicleCommand: CreateVehicleSupplySubmissionCommand = {
      plateNo: canonicalVehicle.plateNo,
      licenseType:
        command.vehicleDraft?.licenseType ??
        canonicalVehicle.licenseType ??
        latestVehicleDraft?.licenseType ??
        "taxi",
      brand:
        command.vehicleDraft?.brand !== undefined
          ? command.vehicleDraft.brand
          : (latestVehicleDraft?.brand ?? null),
      model:
        command.vehicleDraft?.model !== undefined
          ? command.vehicleDraft.model
          : (latestVehicleDraft?.model ?? null),
      modelYear:
        command.vehicleDraft?.modelYear !== undefined
          ? command.vehicleDraft.modelYear
          : (latestVehicleDraft?.modelYear ?? null),
      seatCount:
        command.vehicleDraft?.seatCount ?? latestVehicleDraft?.seatCount ?? 4,
      luggageCapacity:
        command.vehicleDraft?.luggageCapacity ??
        latestVehicleDraft?.luggageCapacity ??
        2,
      businessArea:
        command.vehicleDraft?.businessArea ??
        latestVehicleDraft?.businessArea ??
        "台北市",
      supportedServiceProductCodes:
        command.vehicleDraft?.supportedServiceProductCodes ??
        (latestVehicleDraft?.supportedServiceProductCodes?.length
          ? [...latestVehicleDraft.supportedServiceProductCodes]
          : ["taxi_realtime"]),
      airportTransferEligible:
        command.vehicleDraft?.airportTransferEligible ??
        latestVehicleDraft?.airportTransferEligible ??
        false,
      fixedFareAllowed:
        command.vehicleDraft?.fixedFareAllowed ??
        latestVehicleDraft?.fixedFareAllowed ??
        false,
      currentDriverSubmissionId:
        command.vehicleDraft?.currentDriverSubmissionId !== undefined
          ? command.vehicleDraft.currentDriverSubmissionId
          : (latestVehicleDraft?.currentDriverSubmissionId ?? null),
      doorCount:
        command.vehicleDraft?.doorCount !== undefined
          ? command.vehicleDraft.doorCount
          : (latestVehicleDraft?.doorCount ?? 4),
      color:
        command.vehicleDraft?.color !== undefined
          ? command.vehicleDraft.color
          : (latestVehicleDraft?.color ?? "White"),
    };

    this.validateVehicleDraft(mergedVehicleCommand);

    const activeContractId =
      canonicalVehicle.supplyLifecycle.contract.contractId ?? null;
    const activePolicyId =
      canonicalVehicle.supplyLifecycle.insurance.policyId ?? null;

    const submission: SupplySubmissionRecord = {
      submissionId,
      fleetPartnerId,
      submissionType: command.submissionType,
      status: "draft",
      revisionNo: 1,
      subjectDriverId: null,
      subjectVehicleId: targetVehicleId,
      submittedBy: null,
      submittedAt: null,
      reviewStartedBy: null,
      reviewStartedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReasonCode: null,
      reviewComment: null,
      canonicalDriverId: null,
      canonicalVehicleId: targetVehicleId,
      canonicalContractId: activeContractId,
      canonicalPolicyId: activePolicyId,
      createdAt: now,
      updatedAt: now,
    };
    const draft: VehicleSupplyDraft = {
      submissionId,
      ...this.normalizeVehicleDraft(mergedVehicleCommand),
    };

    this.submissions = [submission, ...this.submissions];
    this.vehicleDrafts = [draft, ...this.vehicleDrafts];
    await this.persistChanges(
      { submissions: [submission], vehicleDrafts: [draft] },
      "create vehicle renewal draft",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "create_supply_submission_renewal",
        resourceType: "supply_submission",
        resourceId: submissionId,
        newValuesSummary: {
          fleetPartnerId,
          submissionType: submission.submissionType,
          canonicalVehicleId: targetVehicleId,
          plateNo: draft.plateNo,
        },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async updateRenewalDraft(
    fleetPartnerId: string,
    submissionId: string,
    actorId: string,
    command: UpdateSupplyRenewalDraftCommand,
    requestId?: string,
  ) {
    await this.syncState();

    const submission = this.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    if (
      !RENEWAL_SUBMISSION_TYPES.includes(
        submission.submissionType as SupplyRenewalSubmissionType,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Submission is not a supply renewal draft.",
        { submissionId, submissionType: submission.submissionType },
      );
    }
    this.assertEditable(submission);
    this.assertExpectedRevisionNo(submission, command.expectedRevisionNo);

    if (submission.submissionType === "profile_correction") {
      const draft = this.requireDriverDraft(submissionId);
      const previous = { ...draft };
      const merged: CreateDriverSupplySubmissionCommand = {
        name: command.driverDraft?.name ?? draft.name,
        mobile: command.driverDraft?.mobile ?? draft.mobile,
        professionalDriverLicenseNo:
          command.driverDraft?.professionalDriverLicenseNo ??
          draft.professionalDriverLicenseNo,
        professionalDriverLicenseExpiry:
          command.driverDraft?.professionalDriverLicenseExpiry ??
          draft.professionalDriverLicenseExpiry,
        taxiDriverRegistrationNo:
          command.driverDraft?.taxiDriverRegistrationNo ??
          draft.taxiDriverRegistrationNo,
        taxiDriverRegistrationArea:
          command.driverDraft?.taxiDriverRegistrationArea ??
          draft.taxiDriverRegistrationArea,
        taxiDriverRegistrationExpiry:
          command.driverDraft?.taxiDriverRegistrationExpiry ??
          draft.taxiDriverRegistrationExpiry,
        supportedServiceProductCodes:
          command.driverDraft?.supportedServiceProductCodes ?? [
            ...draft.supportedServiceProductCodes,
          ],
        preferredVehicleSubmissionId:
          command.driverDraft?.preferredVehicleSubmissionId !== undefined
            ? command.driverDraft.preferredVehicleSubmissionId
            : draft.preferredVehicleSubmissionId,
      };
      this.validateDriverDraft(merged);
      this.assertDriverIdentityAvailable(
        merged.professionalDriverLicenseNo,
        merged.taxiDriverRegistrationNo,
        submissionId,
        submission.canonicalDriverId ?? submission.subjectDriverId ?? undefined,
      );

      Object.assign(draft, this.normalizeDriverDraft(merged));
      this.bumpSubmissionRevision(submission);

      await this.persistChanges(
        { submissions: [submission], driverDrafts: [draft] },
        "update driver renewal draft",
      );
      this.recordAudit(
        {
          actorId,
          actorType: "partner_api_key",
          tenantId: null,
          moduleName: "fleet-partner",
          actionName: "update_supply_submission_renewal",
          resourceType: "supply_submission",
          resourceId: submissionId,
          oldValuesSummary: { ...previous },
          newValuesSummary: { ...draft },
        },
        requestId,
      );

      return this.buildDetail(submissionId, fleetPartnerId);
    }

    const draft = this.requireVehicleDraft(submissionId);
    if (
      command.vehicleDraft?.plateNo &&
      command.vehicleDraft.plateNo.trim().toUpperCase() !==
        draft.plateNo.trim().toUpperCase()
    ) {
      throw this.conflict(
        "PLATE_IMMUTABLE_ON_RENEWAL",
        "Vehicle plate number cannot be changed in a renewal submission.",
        {
          submissionId,
          canonicalPlateNo: draft.plateNo,
          requestedPlateNo: command.vehicleDraft.plateNo,
        },
      );
    }
    const previous = { ...draft };
    const merged: CreateVehicleSupplySubmissionCommand = {
      plateNo: draft.plateNo,
      licenseType: command.vehicleDraft?.licenseType ?? draft.licenseType,
      brand:
        command.vehicleDraft?.brand !== undefined
          ? command.vehicleDraft.brand
          : draft.brand,
      model:
        command.vehicleDraft?.model !== undefined
          ? command.vehicleDraft.model
          : draft.model,
      modelYear:
        command.vehicleDraft?.modelYear !== undefined
          ? command.vehicleDraft.modelYear
          : draft.modelYear,
      seatCount: command.vehicleDraft?.seatCount ?? draft.seatCount,
      luggageCapacity:
        command.vehicleDraft?.luggageCapacity ?? draft.luggageCapacity,
      businessArea: command.vehicleDraft?.businessArea ?? draft.businessArea,
      supportedServiceProductCodes:
        command.vehicleDraft?.supportedServiceProductCodes ?? [
          ...draft.supportedServiceProductCodes,
        ],
      airportTransferEligible:
        command.vehicleDraft?.airportTransferEligible ??
        draft.airportTransferEligible,
      fixedFareAllowed:
        command.vehicleDraft?.fixedFareAllowed ?? draft.fixedFareAllowed,
      currentDriverSubmissionId:
        command.vehicleDraft?.currentDriverSubmissionId !== undefined
          ? command.vehicleDraft.currentDriverSubmissionId
          : draft.currentDriverSubmissionId,
      doorCount:
        command.vehicleDraft?.doorCount !== undefined
          ? command.vehicleDraft.doorCount
          : draft.doorCount,
      color:
        command.vehicleDraft?.color !== undefined
          ? command.vehicleDraft.color
          : draft.color,
    };
    this.validateVehicleDraft(merged);

    Object.assign(draft, this.normalizeVehicleDraft(merged));
    this.bumpSubmissionRevision(submission);

    await this.persistChanges(
      { submissions: [submission], vehicleDrafts: [draft] },
      "update vehicle renewal draft",
    );
    this.recordAudit(
      {
        actorId,
        actorType: "partner_api_key",
        tenantId: null,
        moduleName: "fleet-partner",
        actionName: "update_supply_submission_renewal",
        resourceType: "supply_submission",
        resourceId: submissionId,
        oldValuesSummary: { ...previous },
        newValuesSummary: { ...draft },
      },
      requestId,
    );

    return this.buildDetail(submissionId, fleetPartnerId);
  }

  async createDriverDraft(
    fleetPartnerId: string,
    actorId: string,
    command: CreateDriverSupplySubmissionCommand,
    requestId?: string,
  ) {
    await this.syncState();
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
    await this.syncState();
    this.validateDriverDraft(command);
    const submission = this.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    this.assertEditable(submission);
    this.assertExpectedRevisionNo(submission, command.expectedRevisionNo);
    this.assertDriverIdentityAvailable(
      command.professionalDriverLicenseNo,
      command.taxiDriverRegistrationNo,
      submissionId,
      submission.canonicalDriverId ??
        (submission.submissionType === "profile_correction"
          ? submission.subjectDriverId
          : null) ??
        undefined,
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
    await this.syncState();
    this.validateVehicleDraft(command);
    this.assertVehiclePlateAvailable(command.plateNo, undefined, fleetPartnerId);

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
    await this.syncState();
    this.validateVehicleDraft(command);
    const submission = this.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    this.assertEditable(submission);
    this.assertExpectedRevisionNo(submission, command.expectedRevisionNo);

    const draft = this.requireVehicleDraft(submissionId);
    if (
      submission.submissionType === "insurance_update" ||
      submission.submissionType === "contract_update"
    ) {
      if (
        command.plateNo.trim().toUpperCase() !==
        draft.plateNo.trim().toUpperCase()
      ) {
        throw this.conflict(
          "PLATE_IMMUTABLE_ON_RENEWAL",
          "Vehicle plate number cannot be changed in a renewal submission.",
          {
            submissionId,
            canonicalPlateNo: draft.plateNo,
            requestedPlateNo: command.plateNo,
          },
        );
      }
    } else {
      this.assertVehiclePlateAvailable(
        command.plateNo,
        submissionId,
        fleetPartnerId,
      );
    }

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
    await this.syncState();
    const submission = this.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
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

    const updatedDriverDraft =
      submission.submissionType === "profile_correction"
        ? this.driverDrafts.find(
            (draft) => draft.submissionId === submission.submissionId,
          )
        : undefined;

    await this.persistChanges(
      {
        submissions: [submission],
        reviewEvents: [event],
        ...(updatedDriverDraft ? { driverDrafts: [updatedDriverDraft] } : {}),
      },
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
    await this.syncState();
    const submission = this.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
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
    await this.persistChanges(
      { submissions: [submission], documents },
      context,
    );
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
    this.submissions = state.submissions.map((submission) => ({
      ...submission,
    }));
    this.driverDrafts = state.driverDrafts.map((draft) => ({ ...draft }));
    this.vehicleDrafts = state.vehicleDrafts.map((draft) => ({ ...draft }));
    this.documents = state.documents.map((document) => ({ ...document }));
    this.reviewEvents = state.reviewEvents.map((event) => ({ ...event }));
    this.vehicleAffiliations = (state.vehicleAffiliations ?? []).map(
      (affiliation) => ({ ...affiliation }),
    );
  }

  private isDriverOwnedByFleet(
    driverId: string,
    fleetPartnerId: string,
  ): boolean {
    if (
      this.submissions.some(
        (sub) =>
          sub.fleetPartnerId === fleetPartnerId &&
          sub.status === "approved" &&
          (sub.canonicalDriverId === driverId ||
            sub.subjectDriverId === driverId),
      )
    ) {
      return true;
    }
    const pairs =
      typeof this.regulatoryRegistryService.listSupplyPairs === "function"
        ? this.regulatoryRegistryService.listSupplyPairs()
        : [];
    return pairs.some(
      (pair) =>
        pair.driverId === driverId &&
        this.isVehicleOwnedByFleet(pair.vehicleId, fleetPartnerId),
    );
  }

  private isVehicleOwnedByFleet(
    vehicleId: string,
    fleetPartnerId: string,
  ): boolean {
    if (
      this.submissions.some(
        (sub) =>
          sub.fleetPartnerId === fleetPartnerId &&
          sub.status === "approved" &&
          (sub.canonicalVehicleId === vehicleId ||
            sub.subjectVehicleId === vehicleId),
      )
    ) {
      return true;
    }
    return this.vehicleAffiliations.some(
      (affiliation) =>
        affiliation.vehicleId === vehicleId &&
        affiliation.fleetPartnerId === fleetPartnerId,
    );
  }

  private buildDetail(
    submissionId: string,
    fleetPartnerId: string,
  ): SupplySubmissionDetail {
    const submission = this.requireScopedSubmission(
      submissionId,
      fleetPartnerId,
    );
    return {
      submission: { ...submission },
      driverDraft:
        this.driverDrafts.find(
          (draft) => draft.submissionId === submissionId,
        ) ?? null,
      vehicleDraft:
        this.vehicleDrafts.find(
          (draft) => draft.submissionId === submissionId,
        ) ?? null,
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
    if (command.doorCount !== null && command.doorCount !== undefined) {
      this.assertPositiveInteger(command.doorCount, "doorCount");
      if (command.doorCount < 3 || command.doorCount > 6) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "doorCount must be between 3 and 6.",
          { fieldName: "doorCount", value: command.doorCount },
        );
      }
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
      currentDriverSubmissionId:
        command.currentDriverSubmissionId?.trim() || null,
      doorCount: command.doorCount !== undefined ? command.doorCount : null,
      color: command.color?.trim() || null,
    };
  }

  private findLatestApprovedDriverDraft(
    fleetPartnerId: string,
    canonicalDriverId: string,
  ): DriverSupplyDraft | undefined {
    const approvedSubs = this.submissions
      .filter(
        (sub) =>
          sub.fleetPartnerId === fleetPartnerId &&
          sub.status === "approved" &&
          (sub.canonicalDriverId === canonicalDriverId ||
            sub.subjectDriverId === canonicalDriverId),
      )
      .sort((left, right) =>
        (right.reviewedAt ?? right.updatedAt).localeCompare(
          left.reviewedAt ?? left.updatedAt,
        ),
      );
    for (const sub of approvedSubs) {
      const draft = this.driverDrafts.find(
        (candidate) => candidate.submissionId === sub.submissionId,
      );
      if (draft) {
        return draft;
      }
    }
    return undefined;
  }

  private findLatestApprovedVehicleDraft(
    fleetPartnerId: string,
    canonicalVehicleId: string,
  ): VehicleSupplyDraft | undefined {
    const approvedSubs = this.submissions
      .filter(
        (sub) =>
          sub.fleetPartnerId === fleetPartnerId &&
          sub.status === "approved" &&
          (sub.canonicalVehicleId === canonicalVehicleId ||
            sub.subjectVehicleId === canonicalVehicleId),
      )
      .sort((left, right) =>
        (right.reviewedAt ?? right.updatedAt).localeCompare(
          left.reviewedAt ?? left.updatedAt,
        ),
      );
    for (const sub of approvedSubs) {
      const draft = this.vehicleDrafts.find(
        (candidate) => candidate.submissionId === sub.submissionId,
      );
      if (draft) {
        return draft;
      }
    }
    return undefined;
  }

  private assertDriverIdentityAvailable(
    professionalDriverLicenseNo: string,
    taxiDriverRegistrationNo: string,
    excludeSubmissionId?: string,
    excludeCanonicalDriverId?: string,
  ) {
    const normalizedLicenseNo = professionalDriverLicenseNo
      .trim()
      .toLowerCase();
    const normalizedRegistrationNo = taxiDriverRegistrationNo
      .trim()
      .toLowerCase();
    const excludedSubmissionIds = new Set<string>();
    if (excludeSubmissionId) {
      excludedSubmissionIds.add(excludeSubmissionId);
    }
    if (excludeCanonicalDriverId) {
      for (const sub of this.submissions) {
        if (
          sub.canonicalDriverId === excludeCanonicalDriverId ||
          sub.subjectDriverId === excludeCanonicalDriverId
        ) {
          excludedSubmissionIds.add(sub.submissionId);
        }
      }
    }
    const existing = this.driverDrafts.find(
      (candidate) =>
        !excludedSubmissionIds.has(candidate.submissionId) &&
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
    fleetPartnerId?: string,
  ) {
    const normalizedPlateNo = plateNo.trim().toLowerCase();
    const activeOnboardingSubmissionIds = new Set(
      this.submissions
        .filter(
          (sub) =>
            sub.submissionType === "vehicle_onboarding" &&
            ["draft", "submitted", "in_review", "needs_revision"].includes(
              sub.status,
            ),
        )
        .map((sub) => sub.submissionId),
    );
    const existingDraft = this.vehicleDrafts.find(
      (candidate) =>
        candidate.submissionId !== excludeSubmissionId &&
        activeOnboardingSubmissionIds.has(candidate.submissionId) &&
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
      const fleetPartnerOwned = Boolean(
        fleetPartnerId &&
          this.isVehicleOwnedByFleet(existingVehicle.vehicleId, fleetPartnerId),
      );
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PLATE_ALREADY_EXISTS",
        fleetPartnerOwned
          ? "This vehicle plate is already approved under your fleet. Create a supply renewal submission to update insurance or contract credentials."
          : "A canonical vehicle with the same plate already exists.",
        {
          vehicleId: existingVehicle.vehicleId,
          existingCanonicalVehicleId: existingVehicle.vehicleId,
          plateNo,
          fleetPartnerOwned,
          ...(fleetPartnerOwned
            ? {
                suggestedAction: "create_renewal",
                renewalPath: `/supply/renewals/new?targetVehicleId=${encodeURIComponent(existingVehicle.vehicleId)}`,
              }
            : {}),
        },
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
    if (submission.submissionType === "vehicle_onboarding") {
      const draft = this.vehicleDrafts.find(
        (candidate) => candidate.submissionId === submission.submissionId,
      );
      if (
        !draft ||
        draft.doorCount === null ||
        draft.doorCount === undefined ||
        !draft.color?.trim()
      ) {
        throw this.conflict(
          "VEHICLE_DRAFT_INCOMPLETE",
          "Vehicle door count and color must be specified before submitting.",
          {
            submissionId: submission.submissionId,
            doorCount: draft?.doorCount ?? null,
            color: draft?.color ?? null,
          },
        );
      }
    }

    const documents = this.listDocumentsForSubmission(submission.submissionId);
    const today = new Date().toISOString().slice(0, 10);
    const invalidRangeDocument = documents.find(
      (document) =>
        document.effectiveFrom &&
        document.effectiveUntil &&
        document.effectiveFrom > document.effectiveUntil,
    );
    if (invalidRangeDocument) {
      throw this.conflict(
        "INVALID_DOCUMENT_EFFECTIVE_RANGE",
        "Document effectiveFrom must not be later than effectiveUntil.",
        {
          submissionId: submission.submissionId,
          documentId: invalidRangeDocument.documentId,
          documentType: invalidRangeDocument.documentType,
          effectiveFrom: invalidRangeDocument.effectiveFrom,
          effectiveUntil: invalidRangeDocument.effectiveUntil,
        },
      );
    }
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

    if (submission.submissionType === "insurance_update") {
      const insuranceDocuments = documents.filter(
        (document) => document.documentType === "insurance_policy",
      );
      if (insuranceDocuments.length === 0) {
        throw this.conflict(
          "DOCUMENT_REQUIRED",
          "Required supply documents are missing.",
          {
            submissionId: submission.submissionId,
            missingDocumentTypes: ["insurance_policy"],
          },
        );
      }
      const missingEffectiveDateDoc = insuranceDocuments.find(
        (document) => !document.effectiveUntil?.trim(),
      );
      if (missingEffectiveDateDoc) {
        throw this.conflict(
          "DOCUMENT_EFFECTIVE_DATE_REQUIRED",
          "Insurance policy renewal requires a valid effectiveUntil date.",
          {
            submissionId: submission.submissionId,
            documentId: missingEffectiveDateDoc.documentId,
            documentType: missingEffectiveDateDoc.documentType,
          },
        );
      }
      return;
    }

    if (submission.submissionType === "contract_update") {
      const contractDocuments = documents.filter((document) =>
        RENEWAL_CONTRACT_DOCUMENTS.includes(document.documentType),
      );
      if (contractDocuments.length === 0) {
        throw this.conflict(
          "DOCUMENT_REQUIRED",
          "Required supply documents are missing.",
          {
            submissionId: submission.submissionId,
            missingDocumentTypes: ["fleet_participation_contract"],
          },
        );
      }
      const missingEffectiveDateDoc = contractDocuments.find(
        (document) => !document.effectiveUntil?.trim(),
      );
      if (missingEffectiveDateDoc) {
        throw this.conflict(
          "DOCUMENT_EFFECTIVE_DATE_REQUIRED",
          "Contract renewal requires a valid effectiveUntil date.",
          {
            submissionId: submission.submissionId,
            documentId: missingEffectiveDateDoc.documentId,
            documentType: missingEffectiveDateDoc.documentType,
          },
        );
      }
      return;
    }

    if (submission.submissionType === "profile_correction") {
      const draft = this.requireDriverDraft(submission.submissionId);
      const licenseDoc = documents.find(
        (document) => document.documentType === "professional_driver_license",
      );
      const registrationDoc = documents.find(
        (document) => document.documentType === "taxi_driver_registration",
      );
      if (!licenseDoc && !registrationDoc) {
        throw this.conflict(
          "DOCUMENT_REQUIRED",
          "Driver renewal submission requires at least one updated credential document.",
          {
            submissionId: submission.submissionId,
            missingDocumentTypes: [
              "professional_driver_license",
              "taxi_driver_registration",
            ],
          },
        );
      }
      if (licenseDoc?.effectiveUntil?.trim()) {
        draft.professionalDriverLicenseExpiry =
          licenseDoc.effectiveUntil.trim();
      }
      if (registrationDoc?.effectiveUntil?.trim()) {
        draft.taxiDriverRegistrationExpiry =
          registrationDoc.effectiveUntil.trim();
      }
      if (
        draft.professionalDriverLicenseExpiry < today ||
        draft.taxiDriverRegistrationExpiry < today
      ) {
        throw this.conflict(
          "DOCUMENT_EXPIRED",
          "Driver credential expiry dates must be today or in the future before submitting.",
          {
            submissionId: submission.submissionId,
            professionalDriverLicenseExpiry:
              draft.professionalDriverLicenseExpiry,
            taxiDriverRegistrationExpiry: draft.taxiDriverRegistrationExpiry,
          },
        );
      }
      return;
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

  private runInMemoryIdempotentBackfill() {
    let modified = false;
    for (const submission of this.submissions) {
      if (
        (submission.status === "submitted" ||
          submission.status === "in_review" ||
          submission.status === "approved") &&
        submission.submissionType === "vehicle_onboarding"
      ) {
        const draft = this.vehicleDrafts.find(
          (d) => d.submissionId === submission.submissionId,
        );
        if (
          !draft ||
          draft.doorCount === null ||
          draft.doorCount === undefined ||
          draft.color === null ||
          draft.color === undefined
        ) {
          submission.status = "needs_revision";
          submission.updatedAt = new Date().toISOString();
          modified = true;
        }
      }
    }
    if (modified) {
      void this.persistChanges(
        { submissions: this.submissions },
        "in-memory backfill",
      );
    }
  }
}
