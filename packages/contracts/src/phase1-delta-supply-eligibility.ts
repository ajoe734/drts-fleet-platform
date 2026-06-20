// Phase 1 delta contracts: fleet-partner supply self-onboarding, exact service
// product eligibility, mobile heartbeat durability, and operations reporting.
//
// Source of truth:
//   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md
//   §2 Contracts 設計
//
// This module only declares the contract shapes. Service logic, command wiring,
// and persistence are implemented by the downstream execution waves.

// ---------------------------------------------------------------------------
// §2.1 Supply Submission
// ---------------------------------------------------------------------------

export type SupplySubmissionType =
  | "driver_onboarding"
  | "vehicle_onboarding"
  | "insurance_update"
  | "contract_update"
  | "driver_affiliation"
  | "vehicle_affiliation";

export type SupplySubmissionStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "needs_revision"
  | "approved"
  | "rejected"
  | "withdrawn";

export interface SupplySubmissionRecord {
  submissionId: string;
  fleetPartnerId: string;
  submissionType: SupplySubmissionType;
  status: SupplySubmissionStatus;
  revisionNo: number;

  subjectDriverId: string | null;
  subjectVehicleId: string | null;

  submittedBy: string | null;
  submittedAt: string | null;
  reviewStartedBy: string | null;
  reviewStartedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;

  reviewReasonCode: string | null;
  reviewComment: string | null;

  canonicalDriverId: string | null;
  canonicalVehicleId: string | null;
  canonicalContractId: string | null;
  canonicalPolicyId: string | null;

  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// §2.2 Driver Submission
// ---------------------------------------------------------------------------

export interface DriverSupplyDraft {
  submissionId: string;
  name: string;
  mobile: string;

  professionalDriverLicenseNo: string;
  professionalDriverLicenseExpiry: string;

  taxiDriverRegistrationNo: string;
  taxiDriverRegistrationArea: string;
  taxiDriverRegistrationExpiry: string;

  supportedServiceProductCodes: string[];
  preferredVehicleSubmissionId: string | null;
}

// ---------------------------------------------------------------------------
// §2.3 Vehicle Submission
// ---------------------------------------------------------------------------

export interface VehicleSupplyDraft {
  submissionId: string;
  plateNo: string;
  licenseType: string;

  brand: string | null;
  model: string | null;
  modelYear: number | null;

  seatCount: number;
  luggageCapacity: number;
  businessArea: string;

  supportedServiceProductCodes: string[];
  airportTransferEligible: boolean;
  fixedFareAllowed: boolean;

  currentDriverSubmissionId: string | null;
}

// ---------------------------------------------------------------------------
// §2.4 Document
// ---------------------------------------------------------------------------

export type SupplyDocumentType =
  | "professional_driver_license"
  | "taxi_driver_registration"
  | "vehicle_registration"
  | "insurance_policy"
  | "fleet_participation_contract"
  | "driver_management_contract"
  | "vehicle_management_contract"
  | "other";

export type SupplyDocumentReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface SupplyDocumentRecord {
  documentId: string;
  fleetPartnerId: string;
  submissionId: string;

  documentType: SupplyDocumentType;
  fileObjectKey: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  checksumSha256: string;

  effectiveFrom: string | null;
  effectiveUntil: string | null;

  reviewStatus: SupplyDocumentReviewStatus;
  reviewComment: string | null;

  uploadedBy: string;
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// §2.5 Vehicle Fleet Affiliation
// ---------------------------------------------------------------------------

export type VehicleFleetAffiliationType =
  | "owned_by"
  | "managed_by"
  | "contracted_under";

export interface VehicleFleetAffiliationRecord {
  affiliationId: string;
  vehicleId: string;
  fleetPartnerId: string;
  affiliationType: VehicleFleetAffiliationType;

  effectiveFrom: string;
  effectiveUntil: string | null;
  status: "active" | "inactive";

  sourceSubmissionId: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// §2.6 Readiness
// ---------------------------------------------------------------------------

export type SupplyReadinessState = "ready" | "not_ready" | "suspended";

export type SupplyReadinessReasonCode =
  | "DRIVER_LICENSE_MISSING"
  | "DRIVER_LICENSE_EXPIRED"
  | "DRIVER_REGISTRATION_MISSING"
  | "DRIVER_REGISTRATION_EXPIRED"
  | "VEHICLE_DOCUMENT_MISSING"
  | "INSURANCE_MISSING"
  | "INSURANCE_EXPIRED"
  | "CONTRACT_MISSING"
  | "CONTRACT_INACTIVE"
  | "DRIVER_AFFILIATION_MISSING"
  | "VEHICLE_AFFILIATION_MISSING"
  | "SERVICE_PRODUCT_NOT_SUPPORTED"
  | "TRAINING_REQUIRED"
  | "FLEET_PARTNER_INACTIVE"
  | "MANUALLY_SUSPENDED";

export interface SupplyReadinessRecord {
  subjectType: "driver" | "vehicle" | "driver_vehicle_pair";
  subjectId: string;
  state: SupplyReadinessState;
  reasonCodes: SupplyReadinessReasonCode[];
  evaluatedAt: string;
  policyVersion: string;
}

// ---------------------------------------------------------------------------
// §2.7 Exact Service Product Context
// ---------------------------------------------------------------------------

export interface ExactServiceProductContext {
  serviceProductId: string;
  serviceProductCode: string;
  serviceProductVersion: string;
  serviceBucket: "standard_taxi" | "business_dispatch";
  resolvedBy:
    | "tenant_program"
    | "partner_program"
    | "ops_selection"
    | "external_adapter";
  sourceProgramId: string | null;
  sourcePlatform: string | null;
}

// ---------------------------------------------------------------------------
// §2.8 Eligibility Decision
// ---------------------------------------------------------------------------

export type EligibilityDecision =
  | "eligible"
  | "conditionally_eligible"
  | "ineligible";

export interface RuntimeEligibilityDecisionRecord {
  decisionId: string;
  orderId: string;
  dispatchJobId: string;
  driverId: string;
  vehicleId: string;

  serviceProductId: string;
  serviceProductCode: string;
  policyVersion: string;

  decision: EligibilityDecision;
  hardReasonCodes: string[];
  softReasonCodes: string[];
  missingRequirements: string[];

  locationState: "fresh" | "stale" | "low_accuracy" | "missing";
  evaluatedAt: string;
}

export interface DispatchCandidateEligibilityDecoration {
  serviceProductContext: {
    serviceProductId: string;
    serviceProductCode: string;
    policyVersion: string;
    evaluatedAt: string;
  };
  eligibilityDecision: EligibilityDecision;
  hardReasonCodes: string[];
  softReasonCodes: string[];
  missingRequirements: string[];
  locationState: "fresh" | "stale" | "low_accuracy" | "missing";
}

// ---------------------------------------------------------------------------
// §2.9 Mobile Heartbeat
// ---------------------------------------------------------------------------

export interface DriverLocationHeartbeatEnvelope {
  eventId: string;
  deviceId: string;
  driverId: string;
  vehicleId: string | null;
  taskId: string | null;

  sequenceNo: number;
  recordedAt: string;

  lat: number;
  lng: number;
  accuracyM: number | null;

  workState:
    | "offline"
    | "available"
    | "assigned"
    | "enroute"
    | "arrived"
    | "on_trip"
    | "incident";

  appState: "foreground" | "background";
  transportMode: "foreground" | "background";
  networkType: "wifi" | "cellular" | "offline" | "unknown";
}

export interface DriverLocationHeartbeatAck {
  eventId: string;
  accepted: boolean;
  duplicate: boolean;
  currentLocationUpdated: boolean;
  serverReceivedAt: string;
}

// ---------------------------------------------------------------------------
// §2.10 Reporting Types
// ---------------------------------------------------------------------------

export interface DispatchDailyRecord {
  serviceDate: string;
  orderId: string;
  orderNo: string;

  orderSource: string;
  tenantId: string | null;
  partnerId: string | null;

  serviceProductCode: string;
  requestedAt: string;
  reservationTime: string | null;

  pickupAddressSnapshot: string;
  dropoffAddressSnapshot: string | null;

  firstDispatchAt: string | null;
  firstAssignedAt: string | null;

  finalDriverId: string | null;
  finalVehicleId: string | null;
  finalPlateNo: string | null;

  etaSecondsAtAssignment: number | null;
  arrivedPickupAt: string | null;
  tripStartedAt: string | null;
  tripCompletedAt: string | null;

  finalStatus: string;
  redispatchCount: number;
  cancellationReason: string | null;
  complaintCount: number;

  generatedAt: string;
}

export const DISPATCHABLE_SUPPLY_SNAPSHOT_SOURCE_HEALTH = [
  "complete",
  "location_missing",
  "location_stale",
  "location_low_accuracy",
] as const;
export type DispatchableSupplySnapshotSourceHealth =
  (typeof DISPATCHABLE_SUPPLY_SNAPSHOT_SOURCE_HEALTH)[number];

export interface DispatchableSupplySnapshotRecord {
  snapshotAt: string;
  businessArea: string;
  serviceProductCode: string;

  dispatchableVehicleCount: number;
  availableDriverCount: number;

  sourceHealth: DispatchableSupplySnapshotSourceHealth;
  generatedAt: string;
}

export interface SixMonthOperationsSummary {
  from: string;
  to: string;

  businessArea: string | null;
  serviceProductCode: string | null;

  demandRequestCount: number;
  actualDispatchCount: number;
  completedTripCount: number;
  cancelledOrderCount: number;

  averageDispatchableVehicleCount: number;
  validSnapshotCount: number;
  expectedSnapshotCount: number;
  snapshotCoverageRate: number;

  complaintCount: number;
  complaintsByCategory: Record<string, number>;

  generatedAt: string;
}
