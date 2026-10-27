import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import {
  isSupplyRenewalSubmissionType,
  type DriverFleetAffiliationRecord,
  type DriverRegistryRecord,
  type Phase1ServiceBucket,
  type SupplyDocumentRecord,
  type SupplyReadinessReasonCode,
  type SupplyReadinessRecord,
  type SupplyReadinessState,
  type SupplySubmissionRecord,
  type VehicleFleetAffiliationRecord,
  type VehicleRegistryRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AcademyService } from "../driver-academy/academy.service";
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
  driverDraft: SupplySubmissionPersistenceState["driverDrafts"][number] | null;
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
  approvedDriverArtifactsByCanonicalId: Map<
    string,
    ApprovedSubmissionArtifacts
  >;
  approvedVehicleArtifactsByCanonicalId: Map<
    string,
    ApprovedSubmissionArtifacts
  >;
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
    // Required Nest dependency; the optional TypeScript argument preserves
    // older direct test construction without a global service locator.
    private readonly academyService?: AcademyService,
  ) {}

  async listFleetPartnerReadiness(
    fleetPartnerId: string,
  ): Promise<SupplyReadinessRecord[]> {
    const context = await this.buildPartnerContext(fleetPartnerId);

    const driverReadiness: SupplyReadinessRecord[] = [];
    for (const driverId of [...context.scopedDriverIds].sort((left, right) =>
      left.localeCompare(right),
    )) {
      driverReadiness.push(
        await this.evaluateDriverReadiness(driverId, context),
      );
    }
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

    return await this.evaluateDriverReadiness(driverId, context);
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

    const driver =
      driverId && context.scopedDriverIds.has(driverId)
        ? await this.evaluateDriverReadiness(driverId, context)
        : null;
    const vehicle =
      vehicleId && context.scopedVehicleIds.has(vehicleId)
        ? this.evaluateVehicleReadiness(vehicleId, context)
        : null;
    const pair =
      driverId &&
      vehicleId &&
      context.driversById.has(driverId) &&
      context.vehiclesById.has(vehicleId)
        ? await this.evaluatePairReadiness(driverId, vehicleId, context)
        : null;

    return { driver, vehicle, pair };
  }

  private async buildPartnerContext(
    fleetPartnerId: string,
  ): Promise<PartnerReadinessContext> {
    const evaluatedAt = new Date().toISOString();
    const fleetPartner =
      await this.fleetPartnerService.getFleetPartner(fleetPartnerId);
    const submissionState = await this.loadSubmissionState();
    const rawDriverAffiliations =
      typeof this.fleetPartnerService.listCanonicalFleetPartnerDrivers ===
      "function"
        ? await this.fleetPartnerService.listCanonicalFleetPartnerDrivers(
            fleetPartnerId,
          )
        : await this.fleetPartnerService.listFleetPartnerDrivers(
            fleetPartnerId,
          );
    const partnerDriverAffiliations = rawDriverAffiliations.filter(
      (affiliation) => this.isAffiliationActive(affiliation, evaluatedAt),
    );
    const partnerVehicleAffiliations =
      submissionState.vehicleAffiliations.filter(
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
      .map((submission, index) => ({ submission, index }))
      .filter(
        ({ submission }) =>
          submission.fleetPartnerId === fleetPartnerId &&
          submission.status === "approved",
      )
      .sort((left, right) => {
        const leftTime = left.submission.reviewedAt ?? left.submission.updatedAt;
        const rightTime =
          right.submission.reviewedAt ?? right.submission.updatedAt;
        const cmp = rightTime.localeCompare(leftTime);
        if (cmp !== 0) {
          return cmp;
        }
        const leftRenewal = isSupplyRenewalSubmissionType(
          left.submission.submissionType,
        );
        const rightRenewal = isSupplyRenewalSubmissionType(
          right.submission.submissionType,
        );
        if (leftRenewal !== rightRenewal) {
          return rightRenewal ? 1 : -1;
        }
        return right.index - left.index;
      })
      .map(({ submission }) => submission);
    const driverArtifactsByCanonicalId = new Map<
      string,
      ApprovedSubmissionArtifacts
    >();
    const vehicleArtifactsByCanonicalId = new Map<
      string,
      ApprovedSubmissionArtifacts
    >();

    for (const submission of approvedSubmissions) {
      const driverDraft =
        state.driverDrafts.find(
          (candidate) => candidate.submissionId === submission.submissionId,
        ) ?? null;
      const vehicleDraft =
        state.vehicleDrafts.find(
          (candidate) => candidate.submissionId === submission.submissionId,
        ) ?? null;
      const documents = state.documents.filter(
        (document) =>
          document.submissionId === submission.submissionId &&
          document.fleetPartnerId === fleetPartnerId,
      );

      const canonicalDriverId =
        submission.canonicalDriverId ??
        (submission.submissionType === "profile_correction"
          ? submission.subjectDriverId
          : null);
      if (canonicalDriverId) {
        const existing = driverArtifactsByCanonicalId.get(canonicalDriverId);
        if (!existing) {
          driverArtifactsByCanonicalId.set(canonicalDriverId, {
            submission,
            driverDraft: driverDraft ? { ...driverDraft } : null,
            vehicleDraft: null,
            documents: [...documents],
          });
        } else {
          existing.documents.push(...documents);
          if (!existing.driverDraft && driverDraft) {
            existing.driverDraft = { ...driverDraft };
          } else if (existing.driverDraft && driverDraft) {
            existing.driverDraft = {
              ...driverDraft,
              ...existing.driverDraft,
              name: existing.driverDraft.name.trim() || driverDraft.name,
              mobile: existing.driverDraft.mobile.trim() || driverDraft.mobile,
              professionalDriverLicenseNo:
                existing.driverDraft.professionalDriverLicenseNo.trim() ||
                driverDraft.professionalDriverLicenseNo,
              professionalDriverLicenseExpiry:
                existing.driverDraft.professionalDriverLicenseExpiry.trim() ||
                driverDraft.professionalDriverLicenseExpiry,
              taxiDriverRegistrationNo:
                existing.driverDraft.taxiDriverRegistrationNo.trim() ||
                driverDraft.taxiDriverRegistrationNo,
              taxiDriverRegistrationArea:
                existing.driverDraft.taxiDriverRegistrationArea.trim() ||
                driverDraft.taxiDriverRegistrationArea,
              taxiDriverRegistrationExpiry:
                existing.driverDraft.taxiDriverRegistrationExpiry.trim() ||
                driverDraft.taxiDriverRegistrationExpiry,
              supportedServiceProductCodes:
                existing.driverDraft.supportedServiceProductCodes.length > 0
                  ? existing.driverDraft.supportedServiceProductCodes
                  : driverDraft.supportedServiceProductCodes,
            };
          }
        }
      }

      const canonicalVehicleId =
        submission.canonicalVehicleId ??
        (submission.submissionType === "insurance_update" ||
        submission.submissionType === "contract_update"
          ? submission.subjectVehicleId
          : null);
      if (canonicalVehicleId) {
        const existing = vehicleArtifactsByCanonicalId.get(canonicalVehicleId);
        if (!existing) {
          vehicleArtifactsByCanonicalId.set(canonicalVehicleId, {
            submission,
            driverDraft: null,
            vehicleDraft: vehicleDraft ? { ...vehicleDraft } : null,
            documents: [...documents],
          });
        } else {
          existing.documents.push(...documents);
          if (!existing.vehicleDraft && vehicleDraft) {
            existing.vehicleDraft = { ...vehicleDraft };
          }
        }
      }
    }

    return {
      driverArtifactsByCanonicalId,
      vehicleArtifactsByCanonicalId,
    };
  }

  private async evaluateDriverReadiness(
    driverId: string,
    context: PartnerReadinessContext,
  ): Promise<SupplyReadinessRecord> {
    const driver = context.driversById.get(driverId);
    if (!driver) {
      return this.buildRecord(
        "driver",
        driverId,
        ["DRIVER_REGISTRY_MISSING"],
        context.evaluatedAt,
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

    this.evaluateDriverCredentialReasons(
      driver,
      artifacts,
      context,
      reasonCodes,
    );

    if (!this.hasActiveDriverAffiliation(driverId, context)) {
      this.pushReason(reasonCodes, "DRIVER_AFFILIATION_MISSING");
    }
    if (!this.supportsAnyServiceBucket(driver.supportedServiceBuckets)) {
      this.pushReason(reasonCodes, "SERVICE_PRODUCT_NOT_SUPPORTED");
    }
    if (
      !artifacts?.driverDraft &&
      (await this.isDriverTrainingIncomplete(driverId))
    ) {
      this.pushReason(reasonCodes, "TRAINING_REQUIRED");
    }

    return this.buildRecord(
      "driver",
      driverId,
      reasonCodes,
      context.evaluatedAt,
    );
  }

  // Reversible, per-request re-evaluation (no cached "on leave"/"untrained"
  // flag persisted here) against driver-academy's own authority
  // (AcademyService.listCourses -> userStatus derived from live attempts).
  // Deliberately does not touch RegulatoryRegistryService's
  // dispatchEligible/eligibilityBlockedReasons -- that is the AV/vehicle
  // dispatch-exclusion condition and stays untouched by this readiness-only
  // reason code.
  private async isDriverTrainingIncomplete(driverId: string): Promise<boolean> {
    if (!this.academyService) {
      return false;
    }
    if (typeof this.academyService.evaluateDriverQualification === "function") {
      const qualification =
        await this.academyService.evaluateDriverQualification(driverId);
      return qualification.trainingIncomplete;
    }
    const courses = await this.academyService.listCourses(driverId);
    return courses.some(
      (course) => course.isRequired && course.userStatus !== "passed",
    );
  }

  private evaluateVehicleReadiness(
    vehicleId: string,
    context: PartnerReadinessContext,
  ): SupplyReadinessRecord {
    const vehicle = context.vehiclesById.get(vehicleId);
    if (!vehicle) {
      return this.buildRecord(
        "vehicle",
        vehicleId,
        ["VEHICLE_REGISTRY_MISSING"],
        context.evaluatedAt,
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
    const contractEndAt = vehicle.supplyLifecycle.contract.endAt;
    const isContractDateExpired = Boolean(
      contractEndAt &&
        new Date(contractEndAt).getTime() <
          new Date(context.evaluatedAt).getTime(),
    );
    if (contractLifecycle === "missing") {
      this.pushReason(reasonCodes, "CONTRACT_MISSING");
    } else if (contractLifecycle !== "active" || isContractDateExpired) {
      this.pushReason(reasonCodes, "CONTRACT_INACTIVE");
    }

    const insuranceLifecycle =
      vehicle.supplyLifecycle.insurance.lifecycleStatus;
    const insuranceEndAt = vehicle.supplyLifecycle.insurance.endAt;
    const isInsuranceDateExpired = Boolean(
      insuranceEndAt &&
        new Date(insuranceEndAt).getTime() <
          new Date(context.evaluatedAt).getTime(),
    );
    if (insuranceLifecycle === "missing" || insuranceLifecycle === "pending") {
      this.pushReason(reasonCodes, "INSURANCE_MISSING");
    } else if (insuranceLifecycle !== "active" || isInsuranceDateExpired) {
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

    return this.buildRecord(
      "vehicle",
      vehicleId,
      reasonCodes,
      context.evaluatedAt,
    );
  }

  private async evaluatePairReadiness(
    driverId: string,
    vehicleId: string,
    context: PartnerReadinessContext,
  ): Promise<SupplyReadinessRecord> {
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
    const driverEvaluation = await this.evaluateDriverReadiness(
      driverId,
      context,
    );
    for (const reasonCode of driverEvaluation.reasonCodes) {
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
    const allDocs = artifacts?.documents ?? [];
    const anyApprovedLicenseDoc = allDocs.find(
      (doc) =>
        doc.documentType === "professional_driver_license" &&
        doc.reviewStatus === "approved",
    );
    const licenseDocument = this.findApprovedDocument(
      allDocs,
      "professional_driver_license",
      context.evaluatedAt,
    );
    const anyApprovedRegDoc = allDocs.find(
      (doc) =>
        doc.documentType === "taxi_driver_registration" &&
        doc.reviewStatus === "approved",
    );
    const registrationDocument = this.findApprovedDocument(
      allDocs,
      "taxi_driver_registration",
      context.evaluatedAt,
    );
    const driverDraft = artifacts?.driverDraft ?? null;

    if (driverDraft) {
      const effectiveLicenseExpiry =
        driver.professionalDriverLicenseExpiry ??
        driver.licenseExpiry ??
        driverDraft.professionalDriverLicenseExpiry;
      if (
        !driverDraft.professionalDriverLicenseNo.trim() ||
        !anyApprovedLicenseDoc
      ) {
        this.pushReason(reasonCodes, "DRIVER_LICENSE_MISSING");
      } else if (
        !licenseDocument ||
        (effectiveLicenseExpiry &&
          this.isDateOnlyExpired(
            effectiveLicenseExpiry.slice(0, 10),
            context.evaluatedAt,
          ))
      ) {
        this.pushReason(reasonCodes, "DRIVER_LICENSE_EXPIRED");
      }

      const effectiveRegExpiry =
        driver.taxiDriverRegistrationExpiry ??
        driverDraft.taxiDriverRegistrationExpiry;
      if (
        !driverDraft.taxiDriverRegistrationNo.trim() ||
        !anyApprovedRegDoc
      ) {
        this.pushReason(reasonCodes, "DRIVER_REGISTRATION_MISSING");
      } else if (
        !registrationDocument ||
        (effectiveRegExpiry &&
          this.isDateOnlyExpired(
            effectiveRegExpiry.slice(0, 10),
            context.evaluatedAt,
          ))
      ) {
        this.pushReason(reasonCodes, "DRIVER_REGISTRATION_EXPIRED");
      }
      return;
    }

    if (
      driver.taxiDriverRegistrationExpiry &&
      this.isDateOnlyExpired(
        driver.taxiDriverRegistrationExpiry.slice(0, 10),
        context.evaluatedAt,
      )
    ) {
      this.pushReason(reasonCodes, "DRIVER_REGISTRATION_EXPIRED");
    }
    if (
      (driver.professionalDriverLicenseExpiry &&
        this.isDateOnlyExpired(
          driver.professionalDriverLicenseExpiry.slice(0, 10),
          context.evaluatedAt,
        )) ||
      (driver.licenseExpiry &&
        this.isDateOnlyExpired(
          driver.licenseExpiry.slice(0, 10),
          context.evaluatedAt,
        )) ||
      !driver.licensesValid
    ) {
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
    if (
      driver.lifecycleStatus === "suspended" ||
      driver.lifecycleStatus === "retired"
    ) {
      return true;
    }

    return driver.eligibilityBlockedReasons.some((reason) =>
      [
        "lifecycle_suspended",
        "lifecycle_retired",
        "work_state_suspended",
        "work_state_incident_hold",
      ].includes(reason),
    );
  }

  private isVehicleManuallySuspended(vehicle: VehicleRegistryRecord) {
    return vehicle.supplyLifecycle.dispatch.blockedReasons.includes(
      "manual_hold",
    );
  }

  private supportsAnyServiceBucket(
    supportedServiceBuckets: readonly Phase1ServiceBucket[],
  ) {
    return supportedServiceBuckets.length > 0;
  }

  private isAffiliationActive(
    affiliation: DriverFleetAffiliationRecord | VehicleFleetAffiliationRecord,
    evaluatedAt: string,
  ) {
    if ("status" in affiliation && affiliation.status !== "active") {
      return false;
    }
    if (affiliation.effectiveFrom > evaluatedAt) {
      return false;
    }
    if (
      affiliation.effectiveUntil &&
      affiliation.effectiveUntil < evaluatedAt
    ) {
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
