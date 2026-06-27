import type {
  GeoJsonMultiLineString,
  GeoPoint,
  PassengerDisclosureAcknowledgementMode,
  PassengerDisclosureChannel,
  SandboxDispatchDecision,
  SandboxDispatchReasonCode,
} from "@drts/contracts";

type TeslaProviderHealthState =
  | "healthy"
  | "delayed"
  | "gap_detected"
  | "backfill"
  | "complete"
  | "incomplete_hold"
  | "regulator_data_incident";

export interface SandboxDispatchRocRestrictionSnapshot {
  reasonCodes: SandboxDispatchReasonCode[];
  stopNewDispatchActive: boolean;
  operationalHoldActive: boolean;
  humanFallbackActive: boolean;
}

export interface SandboxDispatchGateInput {
  orderId: string;
  dispatchJobId?: string | null;
  vehicleId: string;
  driverId?: string | null;
  sandboxProgramId: string;
  policyVersion: string;
  requestedAt?: string | null;
  candidateRoute?: GeoJsonMultiLineString | null;
  bookingWindow?: {
    start: string | null;
    end: string | null;
  } | null;
  pickup?: GeoPoint | null;
  dropoff?: GeoPoint | null;
  entitlement?: {
    active: boolean | null;
  } | null;
  vehicleEnrollment?: {
    status: "pending" | "active" | "suspended" | "revoked" | "expired" | null;
    approvedAreaIds?: string[];
    approvedRouteIds?: string[];
    maxConcurrentTrips?: number | null;
  } | null;
  safetyOperator?: {
    required: boolean | null;
    available: boolean | null;
    safetyOperatorId?: string | null;
    qualificationStatus?:
      | "pending"
      | "qualified"
      | "suspended"
      | "revoked"
      | "expired"
      | null;
    approvedAreaIds?: string[];
    approvedRouteIds?: string[];
  } | null;
  providerCapabilities?: Partial<
    Record<
      | "av_dispatch"
      | "remote_command"
      | "telemetry_stream"
      | "regulatory_event_feed"
      | "evidence_recorder"
      | "odd_geofence"
      | "minimal_risk_condition",
      boolean | null
    >
  > | null;
  telemetry?: {
    stale: boolean | null;
    minimalRiskConditionActive: boolean | null;
    socPercent: number | null;
    currentTripCount?: number | null;
    odometerKm?: number | null;
    qualityScore?: number | null;
    providerHealthState?: TeslaProviderHealthState | null;
    dispatchHold?: boolean | null;
  } | null;
  regulatory?: {
    approvalFresh: boolean | null;
    vehicleCertified: boolean | null;
  } | null;
  recorder?: {
    healthy: boolean | null;
  } | null;
  roc?: Partial<SandboxDispatchRocRestrictionSnapshot> | null;
  operatingArea?: {
    inBounds: boolean | null;
    boundaryRisk: boolean | null;
    matchedAreaIds?: string[];
  } | null;
  routeContainment?: {
    contained: boolean | null;
    matchedRouteIds?: string[];
  } | null;
  holdState?: {
    activeSafetyIncident: boolean | null;
    programSuspended: boolean | null;
    vehicleHold: boolean | null;
  } | null;
  limits?: {
    minSocPercent?: number | null;
    maxConcurrentTrips?: number | null;
    maxOdometerKm?: number | null;
  } | null;
  passengerDisclosure?: {
    channel: PassengerDisclosureChannel;
    policyId: string | null;
    policyVersion: string | null;
    messageCode: string | null;
    requiresAcknowledgement: boolean | null;
    acknowledgementMode: PassengerDisclosureAcknowledgementMode | null;
    acknowledgedAt: string | null;
    acknowledgementRecordId?: string | null;
  } | null;
}

export interface SandboxDispatchEvaluationRecord {
  decision: SandboxDispatchDecision;
  evaluationSnapshot: SandboxDispatchGateInput;
  releaseAudit?: Record<string, unknown> | null;
}

export interface SandboxDispatchStoredEvaluationRecord extends SandboxDispatchEvaluationRecord {
  releaseAudit: Record<string, unknown> | null;
}

export interface SandboxDispatchManualReleaseCommand {
  actorId: string;
  actorType?: "ops_user" | "system";
  reason: string;
  decisionId?: string | null;
}

export const SANDBOX_DISPATCH_ERROR_CODE_MAP: Record<
  SandboxDispatchReasonCode,
  string
> = {
  ODD_OUT_OF_BOUNDS: "SANDBOX_ODD_OUT_OF_BOUNDS",
  ODD_BOUNDARY_RISK: "SANDBOX_ODD_BOUNDARY_RISK",
  PROVIDER_CAPABILITY_MISSING: "SANDBOX_PROVIDER_CAPABILITY_MISSING",
  RECORDER_UNHEALTHY: "SANDBOX_RECORDER_UNHEALTHY",
  ROC_STOP_NEW_DISPATCH: "SANDBOX_ROC_STOP_NEW_DISPATCH",
  ROC_OPERATIONAL_HOLD: "SANDBOX_ROC_OPERATIONAL_HOLD",
  SAFETY_OPERATOR_REQUIRED: "SANDBOX_SAFETY_OPERATOR_REQUIRED",
  SAFETY_OPERATOR_UNAVAILABLE: "SANDBOX_SAFETY_OPERATOR_UNAVAILABLE",
  REGULATORY_APPROVAL_MISSING: "SANDBOX_REGULATORY_APPROVAL_MISSING",
  VEHICLE_NOT_CERTIFIED: "SANDBOX_VEHICLE_NOT_CERTIFIED",
  TELEMETRY_STALE: "SANDBOX_TELEMETRY_STALE",
  ACTIVE_SAFETY_INCIDENT: "SANDBOX_ACTIVE_SAFETY_INCIDENT",
  MINIMAL_RISK_CONDITION_ACTIVE: "SANDBOX_MINIMAL_RISK_CONDITION_ACTIVE",
  SANDBOX_PROGRAM_SUSPENDED: "SANDBOX_PROGRAM_SUSPENDED",
  PASSENGER_DISCLOSURE_POLICY_MISSING:
    "SANDBOX_PASSENGER_DISCLOSURE_POLICY_MISSING",
  PASSENGER_DISCLOSURE_MESSAGE_MISSING:
    "SANDBOX_PASSENGER_DISCLOSURE_MESSAGE_MISSING",
  PASSENGER_ACKNOWLEDGEMENT_REQUIRED:
    "SANDBOX_PASSENGER_ACKNOWLEDGEMENT_REQUIRED",
};
