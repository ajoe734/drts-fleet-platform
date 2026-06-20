import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import type {
  DriverFleetAffiliationRecord,
  DriverRegistryRecord,
  Phase1ServiceBucket,
  SupplyDocumentRecord,
  SupplyReadinessReasonCode,
  SupplyReadinessRecord,
  SupplyReadinessState,
  SupplySubmissionRecord,
  VehicleFleetAffiliationRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
import { FleetPartnerService } from "./fleet-partner.service";
import {
  SupplySubmissionRepository,
  type SupplySubmissionPersistenceState,
} from "./supply-submission.repository";

const READINESS_POLICY_VERSION = "phase1-delta-supply-readiness-2026-06-19";

type ApprovedSubmissionArtifacts = {
  submission: SupplySubmissionRecord;
  driverDraft:
    | SupplySubmissionPersistenceState["driverDrafts"][number]
    | null;
  vehicleDraft:
    | SupplySubmissionPersistenceState["vehicleDrafts"][number]
    | null;
  documents: SupplyDocumentRecord[];
};

type PartnerReadinessContext = {
  evaluatedAt: string;
  partnerActive: boolean;
  partnerDriverAffiliations: DriverFleetAffiliationRecord[];
  partnerVehicleAffiliations: VehicleFleetAffiliationRecord[];
  driversById: Map<string, DriverRegistryRecord>;
  vehiclesById: Map<string, VehicleRegistryRecord>;
  approvedDriverArtifactsByCanonicalId: Map<string, ApprovedSubmissionArtifacts>;
  approvedVehicleArtifactsByCanonicalId: Map<string, ApprovedSubmissionArtifacts>;
  scopedDriverIds: Set<string>;
  scopedVehicleIds: Set<string>;
};

export type CanonicalSupplyReference = {
  fleetPartnerId: string;
  canonicalDriverId?: string | null;
  canonicalVehicleId?: string | null;
};

export type CanonicalSupplyReadinessEvaluation = {
  driver: SupplyReadinessRecord | null;
  vehicle: SupplyReadinessRecord | null;
  pair: SupplyReadinessRecord | null;
};

@Injectable()
export class SupplyReadinessService {
  constructor(
    private readonly fleetPartnerService: FleetPartnerService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly vehicleEligibilityService: VehicleEligibilityService,
    @Optional()
    private readonly supplySubmissionRepository?: SupplySubmissionRepository,
  ) {}

  async listFleetPartnerReadiness(
    fleetPartnerId: string,
  ): Promise<SupplyReadinessRecord[]> {
    const context = await this.buildPartnerContext(fleetPartnerId);

    const driverReadiness = [...context.scopedDriverIds]
      .sort((left, right) => left.localeCompare(right))
      .map((driverId) => this.evaluateDriverReadiness(driverId, context));
    const vehicleReadiness = [...context.scopedVehicleIds]
      .sort((left, right) => left.localeCompare(right))
      .map((vehicleId) => this.evaluateVehicleReadiness(vehicleId, context));

    return [...driverReadiness, ...vehicleReadiness];
  }

  async getDriverReadiness(
    fleetPartnerId: string,
    driverId: string,
  ): Promise<SupplyReadinessRecord> {
    const context = await this.buildPartnerContext(fleetPartnerId);
    if (!context.scopedDriverIds.has(driverId)) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "READINESS_SUBJECT_NOT_FOUND",
        "Driver readiness subject was not found for this fleet partner.",
        { fleetPartnerId, driverId },
      );
    }

    return this.evaluateDriverReadiness(driverId, context);
  }

  async getVehicleReadiness(
    fleetPartnerId: string,
    vehicleId: string,
  ): Promise<SupplyReadinessRecord> {
    const context = await this.buildPartnerContext(fleetPartnerId);
    if (!context.scopedVehicleIds.has(vehicleId)) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "READINESS_SUBJECT_NOT_FOUND",
        "Vehicle readiness subject was not found for this fleet partner.",
        { fleetPartnerId, vehicleId },
      );
    }

    return this.evaluateVehicleReadiness(vehicleId, context);
  }

  async evaluateCanonicalSupply(
    reference: CanonicalSupplyReference,
  ): Promise<CanonicalSupplyReadinessEvaluation> {
    const context = await this.buildPartnerContext(reference.fleetPartnerId);
    const driverId = reference.canonicalDriverId?.trim() || null;
    const vehicleId = reference.canonicalVehicleId?.trim() || null;

    return {
      driver:
        driverId && context.scopedDriverIds.has(driverId)
          ? this.evaluateDriverReadiness(driverId, context)
          : null,
      vehicle:
        vehicleId && context.scopedVehicleIds.has(vehicleId)
          ? this.evaluateVehicleReadiness(vehicleId, context)
          : null,
      pair:
        driverId &&
        vehicleId &&
        context.driversById.has(driverId) &&
        context.vehiclesById.has(vehicleId)
          ? this.evaluatePairReadiness(driverId, vehicleId, context)
          : null,
    };
  }

  private async buildPartnerContext(
    fleetPartnerId: string,
  ): Promise<PartnerReadinessContext> {
    const evaluatedAt = new Date().toISOString();
    const fleetPartner = this.fleetPartnerService.getFleetPartner(fleetPartnerId);
    const submissionState = await this.loadSubmissionState();
    const partnerDriverAffiliations = this.fleetPartnerService
      .listFleetPartnerDrivers(fleetPartnerId)
      .filter((affiliation) => this.isAffiliationActive(affiliation, evaluatedAt));
    const partnerVehicleAffiliations = submissionState.vehicleAffiliations.filter(
      (affiliation) =>
        affiliation.fleetPartnerId === fleetPartnerId &&
        this.isAffiliationActive(affiliation, evaluatedAt),
    );
    const approvedArtifacts = this.collectApprovedSubmissionArtifacts(
      submissionState,
      fleetPartnerId,
    );

    const driversById = new Map(
      this.regulatoryRegistryService
        .listDrivers()
        .map((driver) => [driver.driverId, driver] as const),
    );
    const vehiclesById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle] as const),
    );

    const scopedDriverIds = new Set(
      partnerDriverAffiliations.map((affiliation) => affiliation.driverId),
    );
    for (const driverId of approvedArtifacts.driverArtifactsByCanonicalId.keys()) {
      scopedDriverIds.add(driverId);
    }

    const scopedVehicleIds = new Set(
      partnerVehicleAffiliations.map((affiliation) => affiliation.vehicleId),
    );
    for (const vehicleId of approvedArtifacts.vehicleArtifactsByCanonicalId.keys()) {
      scopedVehicleIds.add(vehicleId);
    }
    for (const pair of this.regulatoryRegistryService.listSupplyPairs()) {
      if (scopedDriverIds.has(pair.driverId)) {
        scopedVehicleIds.add(pair.vehicleId);
      }
    }

    return {
      evaluatedAt,
      partnerActive: fleetPartner.active,
      partnerDriverAffiliations,
      partnerVehicleAffiliations,
      driversById,
      vehiclesById,
      approvedDriverArtifactsByCanonicalId:
        approvedArtifacts.driverArtifactsByCanonicalId,
      approvedVehicleArtifactsByCanonicalId:
        approvedArtifacts.vehicleArtifactsByCanonicalId,
      scopedDriverIds,
      scopedVehicleIds,
    };
  }

  private async loadSubmissionState(): Promise<SupplySubmissionPersistenceState> {
    if (!this.supplySubmissionRepository) {
      return {
        submissions: [],
        driverDrafts: [],
        vehicleDrafts: [],
        documents: [],
        reviewEvents: [],
        vehicleAffiliations: [],
      };
    }

    return this.supplySubmissionRepository.loadState();
  }

  private collectApprovedSubmissionArtifacts(
    state: SupplySubmissionPersistenceState,
    fleetPartnerId: string,
  ) {
    const approvedSubmissions = state.submissions
      .filter(
        (submission) =>
          submission.fleetPartnerId === fleetPartnerId &&
          submission.status === "approved",
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const driverArtifactsByCanonicalId = new Map<
      string,
      ApprovedSubmissionArtifacts
    >();
    const vehicleArtifactsByCanonicalId = new Map<
      string,
      ApprovedSubmissionArtifacts
    >();

    for (const submission of approvedSubmissions) {
      const artifacts: ApprovedSubmissionArtifacts = {
        submission,
        driverDraft:
          state.driverDrafts.find(
            (candidate) => candidate.submissionId === submission.submissionId,
          ) ?? null,
        vehicleDraft:
          state.vehicleDrafts.find(
            (candidate) => candidate.submissionId === submission.submissionId,
          ) ?? null,
        documents: state.documents.filter(
          (document) =>
            document.submissionId === submission.submissionId &&
            document.fleetPartnerId === fleetPartnerId,
        ),
      };

      if (
        submission.canonicalDriverId &&
        !driverArtifactsByCanonicalId.has(submission.canonicalDriverId)
      ) {
        driverArtifactsByCanonicalId.set(submission.canonicalDriverId, artifacts);
      }
      if (
        submission.canonicalVehicleId &&
        !vehicleArtifactsByCanonicalId.has(submission.canonicalVehicleId)
      ) {
        vehicleArtifactsByCanonicalId.set(submission.canonicalVehicleId, artifacts);
      }
    }

    return {
      driverArtifactsByCanonicalId,
      vehicleArtifactsByCanonicalId,
    };
  }

  private evaluateDriverReadiness(
    driverId: string,
    context: PartnerReadinessContext,
  ): SupplyReadinessRecord {
    const driver = context.driversById.get(driverId);
    if (!driver) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "READINESS_SUBJECT_NOT_FOUND",
        "Canonical driver was not found.",
        { driverId },
      );
    }

    const artifacts =
      context.approvedDriverArtifactsByCanonicalId.get(driverId) ?? null;
    const reasonCodes: SupplyReadinessReasonCode[] = [];

    if (!context.partnerActive) {
      this.pushReason(reasonCodes, "FLEET_PARTNER_INACTIVE");
    }
    if (this.isDriverManuallySuspended(driver)) {
      this.pushReason(reasonCodes, "MANUALLY_SUSPENDED");
    }

    this.evaluateDriverCredentialReasons(driver, artifacts, context, reasonCodes);

    if (!this.hasActiveDriverAffiliation(driverId, context)) {
      this.pushReason(reasonCodes, "DRIVER_AFFILIATION_MISSING");
    }
    if (!this.supportsAnyServiceBucket(driver.supportedServiceBuckets)) {
      this.pushReason(reasonCodes, "SERVICE_PRODUCT_NOT_SUPPORTED");
    }

    return this.buildRecord("driver", driverId, reasonCodes, context.evaluatedAt);
  }

  private evaluateVehicleReadiness(
    vehicleId: string,
    context: PartnerReadinessContext,
  ): SupplyReadinessRecord {
    const vehicle = context.vehiclesById.get(vehicleId);
    if (!vehicle) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "READINESS_SUBJECT_NOT_FOUND",
        "Canonical vehicle was not found.",
        { vehicleId },
      );
    }

    const artifacts =
      context.approvedVehicleArtifactsByCanonicalId.get(vehicleId) ?? null;
    const reasonCodes: SupplyReadinessReasonCode[] = [];

    if (!context.partnerActive) {
      this.pushReason(reasonCodes, "FLEET_PARTNER_INACTIVE");
    }
    if (this.isVehicleManuallySuspended(vehicle)) {
      this.pushReason(reasonCodes, "MANUALLY_SUSPENDED");
    }

    const vehicleDocument = this.findApprovedDocument(
      artifacts?.documents ?? [],
      "vehicle_registration",
      context.evaluatedAt,
    );
    if (!vehicleDocument) {
      this.pushReason(reasonCodes, "VEHICLE_DOCUMENT_MISSING");
    }

    const contractLifecycle = vehicle.supplyLifecycle.contract.lifecycleStatus;
    if (contractLifecycle === "missing") {
      this.pushReason(reasonCodes, "CONTRACT_MISSING");
    } else if (contractLifecycle !== "active") {
      this.pushReason(reasonCodes, "CONTRACT_INACTIVE");
    }

    const insuranceLifecycle = vehicle.supplyLifecycle.insurance.lifecycleStatus;
    if (insuranceLifecycle === "missing" || insuranceLifecycle === "pending") {
      this.pushReason(reasonCodes, "INSURANCE_MISSING");
    } else if (insuranceLifecycle !== "active") {
      this.pushReason(reasonCodes, "INSURANCE_EXPIRED");
    }

    if (!this.hasActiveVehicleAffiliation(vehicleId, context)) {
      this.pushReason(reasonCodes, "VEHICLE_AFFILIATION_MISSING");
    }
    if (!this.supportsAnyServiceBucket(vehicle.supportedServiceBuckets)) {
      this.pushReason(reasonCodes, "SERVICE_PRODUCT_NOT_SUPPORTED");
    }
    if (
      this.vehicleEligibilityService.resolveRuntimeVehicleCapability(vehicleId)
        ?.trainingRequired
    ) {
      this.pushReason(reasonCodes, "TRAINING_REQUIRED");
    }

    return this.buildRecord("vehicle", vehicleId, reasonCodes, context.evaluatedAt);
  }

  private evaluatePairReadiness(
    driverId: string,
    vehicleId: string,
    context: PartnerReadinessContext,
  ): SupplyReadinessRecord {
    const driver = context.driversById.get(driverId);
    const vehicle = context.vehiclesById.get(vehicleId);
    if (!driver || !vehicle) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "READINESS_SUBJECT_NOT_FOUND",
        "Canonical driver or vehicle was not found.",
        { driverId, vehicleId },
      );
    }

    const reasonCodes: SupplyReadinessReasonCode[] = [];
    for (const reasonCode of this.evaluateDriverReadiness(driverId, context)
      .reasonCodes) {
      this.pushReason(reasonCodes, reasonCode);
    }
    for (const reasonCode of this.evaluateVehicleReadiness(vehicleId, context)
      .reasonCodes) {
      this.pushReason(reasonCodes, reasonCode);
    }

    const sharedBuckets = driver.supportedServiceBuckets.filter((bucket) =>
      vehicle.supportedServiceBuckets.includes(bucket),
    );
    if (sharedBuckets.length === 0) {
      this.pushReason(reasonCodes, "SERVICE_PRODUCT_NOT_SUPPORTED");
    }

    return this.buildRecord(
      "driver_vehicle_pair",
      `${driverId}:${vehicleId}`,
      reasonCodes,
      context.evaluatedAt,
    );
  }

  private evaluateDriverCredentialReasons(
    driver: DriverRegistryRecord,
    artifacts: ApprovedSubmissionArtifacts | null,
    context: PartnerReadinessContext,
    reasonCodes: SupplyReadinessReasonCode[],
  ) {
    const licenseDocument = this.findApprovedDocument(
      artifacts?.documents ?? [],
      "professional_driver_license",
      context.evaluatedAt,
    );
    const registrationDocument = this.findApprovedDocument(
      artifacts?.documents ?? [],
      "taxi_driver_registration",
      context.evaluatedAt,
    );
    const driverDraft = artifacts?.driverDraft ?? null;

    if (driverDraft) {
      if (!driverDraft.professionalDriverLicenseNo.trim() || !licenseDocument) {
        this.pushReason(reasonCodes, "DRIVER_LICENSE_MISSING");
      } else if (
        this.isDateOnlyExpired(
          driverDraft.professionalDriverLicenseExpiry,
          context.evaluatedAt,
        )
      ) {
        this.pushReason(reasonCodes, "DRIVER_LICENSE_EXPIRED");
      }

      if (
        !driverDraft.taxiDriverRegistrationNo.trim() ||
        !registrationDocument
      ) {
        this.pushReason(reasonCodes, "DRIVER_REGISTRATION_MISSING");
      } else if (
        this.isDateOnlyExpired(
          driverDraft.taxiDriverRegistrationExpiry,
          context.evaluatedAt,
        )
      ) {
        this.pushReason(reasonCodes, "DRIVER_REGISTRATION_EXPIRED");
      }
      return;
    }

    if (!driver.licensesValid) {
      this.pushReason(reasonCodes, "DRIVER_LICENSE_EXPIRED");
    }
  }

  private findApprovedDocument(
    documents: readonly SupplyDocumentRecord[],
    documentType: SupplyDocumentRecord["documentType"],
    evaluatedAt: string,
  ) {
    return documents.find((document) => {
      if (document.documentType !== documentType) {
        return false;
      }
      if (document.reviewStatus !== "approved") {
        return false;
      }
      if (
        document.effectiveUntil &&
        this.isDateOnlyExpired(document.effectiveUntil, evaluatedAt)
      ) {
        return false;
      }
      return true;
    });
  }

  private hasActiveDriverAffiliation(
    driverId: string,
    context: PartnerReadinessContext,
  ) {
    return context.partnerDriverAffiliations.some(
      (affiliation) => affiliation.driverId === driverId,
    );
  }

  private hasActiveVehicleAffiliation(
    vehicleId: string,
    context: PartnerReadinessContext,
  ) {
    return context.partnerVehicleAffiliations.some(
      (affiliation) => affiliation.vehicleId === vehicleId,
    );
  }

  private isDriverManuallySuspended(driver: DriverRegistryRecord) {
    if (driver.lifecycleStatus === "suspended" || driver.lifecycleStatus === "retired") {
      return true;
    }

    return driver.eligibilityBlockedReasons.some((reason) =>
      ["lifecycle_suspended", "lifecycle_retired", "work_state_suspended", "work_state_incident_hold"].includes(
        reason,
      ),
    );
  }

  private isVehicleManuallySuspended(vehicle: VehicleRegistryRecord) {
    return vehicle.supplyLifecycle.dispatch.blockedReasons.includes("manual_hold");
  }

  private supportsAnyServiceBucket(
    supportedServiceBuckets: readonly Phase1ServiceBucket[],
  ) {
    return supportedServiceBuckets.length > 0;
  }

  private isAffiliationActive(
    affiliation:
      | DriverFleetAffiliationRecord
      | VehicleFleetAffiliationRecord,
    evaluatedAt: string,
  ) {
    if ("status" in affiliation && affiliation.status !== "active") {
      return false;
    }
    if (affiliation.effectiveFrom > evaluatedAt) {
      return false;
    }
    if (affiliation.effectiveUntil && affiliation.effectiveUntil < evaluatedAt) {
      return false;
    }
    return true;
  }

  private buildRecord(
    subjectType: SupplyReadinessRecord["subjectType"],
    subjectId: string,
    reasonCodes: readonly SupplyReadinessReasonCode[],
    evaluatedAt: string,
  ): SupplyReadinessRecord {
    return {
      subjectType,
      subjectId,
      state: this.resolveState(reasonCodes),
      reasonCodes: [...reasonCodes],
      evaluatedAt,
      policyVersion: READINESS_POLICY_VERSION,
    };
  }

  private resolveState(
    reasonCodes: readonly SupplyReadinessReasonCode[],
  ): SupplyReadinessState {
    if (reasonCodes.length === 0) {
      return "ready";
    }
    if (
      reasonCodes.includes("FLEET_PARTNER_INACTIVE") ||
      reasonCodes.includes("MANUALLY_SUSPENDED")
    ) {
      return "suspended";
    }
    return "not_ready";
  }

  private isDateOnlyExpired(dateOnly: string, evaluatedAt: string) {
    return dateOnly < evaluatedAt.slice(0, 10);
  }

  private pushReason(
    target: SupplyReadinessReasonCode[],
    reasonCode: SupplyReadinessReasonCode,
  ) {
    if (!target.includes(reasonCode)) {
      target.push(reasonCode);
    }
  }
}
