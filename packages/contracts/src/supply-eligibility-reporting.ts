export const SUPPLY_SUBMISSION_TYPES = [
  "driver_onboarding",
  "vehicle_onboarding",
  "insurance_update",
  "contract_update",
  "driver_affiliation",
  "vehicle_affiliation",
] as const;
export type SupplySubmissionType = (typeof SUPPLY_SUBMISSION_TYPES)[number];

export const SUPPLY_SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "needs_revision",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export type SupplySubmissionStatus =
  (typeof SUPPLY_SUBMISSION_STATUSES)[number];

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

export const SUPPLY_DOCUMENT_TYPES = [
  "professional_driver_license",
  "taxi_driver_registration",
  "vehicle_registration",
  "insurance_policy",
  "fleet_participation_contract",
  "driver_management_contract",
  "vehicle_management_contract",
  "other",
] as const;
export type SupplyDocumentType = (typeof SUPPLY_DOCUMENT_TYPES)[number];

export const SUPPLY_DOCUMENT_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const;
export type SupplyDocumentReviewStatus =
  (typeof SUPPLY_DOCUMENT_REVIEW_STATUSES)[number];

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

export const VEHICLE_FLEET_AFFILIATION_TYPES = [
  "owned_by",
  "managed_by",
  "contracted_under",
] as const;
export type VehicleFleetAffiliationType =
  (typeof VEHICLE_FLEET_AFFILIATION_TYPES)[number];

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

export const SUPPLY_READINESS_STATES = [
  "ready",
  "not_ready",
  "suspended",
] as const;
export type SupplyReadinessState = (typeof SUPPLY_READINESS_STATES)[number];

export const SUPPLY_READINESS_REASON_CODES = [
  "DRIVER_LICENSE_MISSING",
  "DRIVER_LICENSE_EXPIRED",
  "DRIVER_REGISTRATION_MISSING",
  "DRIVER_REGISTRATION_EXPIRED",
  "VEHICLE_DOCUMENT_MISSING",
  "INSURANCE_MISSING",
  "INSURANCE_EXPIRED",
  "CONTRACT_MISSING",
  "CONTRACT_INACTIVE",
  "DRIVER_AFFILIATION_MISSING",
  "VEHICLE_AFFILIATION_MISSING",
  "SERVICE_PRODUCT_NOT_SUPPORTED",
  "TRAINING_REQUIRED",
  "FLEET_PARTNER_INACTIVE",
  "MANUALLY_SUSPENDED",
] as const;
export type SupplyReadinessReasonCode =
  (typeof SUPPLY_READINESS_REASON_CODES)[number];

export interface SupplyReadinessRecord {
  subjectType: "driver" | "vehicle" | "driver_vehicle_pair";
  subjectId: string;
  state: SupplyReadinessState;
  reasonCodes: SupplyReadinessReasonCode[];
  evaluatedAt: string;
  policyVersion: string;
}

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

export const ELIGIBILITY_DECISIONS = [
  "eligible",
  "conditionally_eligible",
  "ineligible",
] as const;
export type EligibilityDecision = (typeof ELIGIBILITY_DECISIONS)[number];

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
