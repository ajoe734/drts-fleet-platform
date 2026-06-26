import type {
  CrossAppResourceLink,
  ResourceActionDescriptor,
  UiHealthEnvelope,
} from "./ui-runtime";

// Phase 2 contracts: Tesla Fleet integration, FSD/AV regulatory telemetry,
// sandbox dispatch governance, safety-operator / ROC operations, on-board
// evidence custody, accident investigation, and regulatory reporting.
//
// Source of truth:
//   docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md
//     Family 3 — AV / ODD / Tesla / ROC Live-Board Extensions (PRD §16)
//   phase2-tesla-fsd-sandbox-202606 phase SD §2/§3 (contracts + data model)
//
// Scaffold-only module: it declares the contract shapes (DTO / event / error
// surfaces) and adapter capability descriptors that the downstream Phase 2
// execution waves implement. No service logic, command wiring, or persistence
// lives here. Field names are camelCase; the API snake_case interceptor owns
// wire conversion, mirroring the Phase 1 contracts.

// ---------------------------------------------------------------------------
// §3.0 Shared source metadata / provenance
// ---------------------------------------------------------------------------

// Every Phase 2 record that originates outside the platform of record carries a
// provenance stamp so regulatory exports and evidence custody can trace each
// field back to its ingesting system and signed attestation.
export const PHASE2_SOURCE_SYSTEMS = [
  "tesla_fleet_api",
  "tesla_public_telemetry",
  "onboard_recorder",
  "roc_operator",
  "sandbox_governance",
  "regulatory_filing",
  "manual_entry",
] as const;
export type Phase2SourceSystem = (typeof PHASE2_SOURCE_SYSTEMS)[number];

export interface Phase2SourceMetadata {
  sourceSystem: Phase2SourceSystem;
  // External identifier at the source (Tesla event id, recorder clip id, ...).
  sourceRef: string | null;
  // When the platform ingested the record.
  ingestedAt: string;
  // When the source captured/recorded the underlying fact, if distinct.
  recordedAt: string | null;
  // Pointer to a detached signature / attestation artifact, when the source is
  // cryptographically attested (regulatory chain-of-custody).
  signatureRef: string | null;
  // Schema version of the source payload as ingested.
  schemaVersion: string;
}

// ---------------------------------------------------------------------------
// §3.1 Provider capability requirements
// ---------------------------------------------------------------------------

// Sandbox / AV dispatch requires its provider adapters to advertise discrete
// capabilities. The dispatch gate and governance modules check the required
// capability set before allowing an AV vehicle into a sandbox order.
export const PHASE2_PROVIDER_CAPABILITIES = [
  "av_dispatch",
  "remote_command",
  "telemetry_stream",
  "regulatory_event_feed",
  "evidence_recorder",
  "odd_geofence",
  "minimal_risk_condition",
] as const;
export type Phase2ProviderCapability =
  (typeof PHASE2_PROVIDER_CAPABILITIES)[number];

export interface ProviderCapabilityRequirement {
  capability: Phase2ProviderCapability;
  required: boolean;
  // Minimum adapter/provider schema version that satisfies the requirement.
  minSchemaVersion: string | null;
  notes: string | null;
}

// A provider's self-declared capability advertisement, checked against the
// ProviderCapabilityRequirement set for a sandbox program.
export interface ProviderCapabilityDescriptor {
  providerCode: string;
  capability: Phase2ProviderCapability;
  available: boolean;
  schemaVersion: string;
}

// ---------------------------------------------------------------------------
// §3.1A Sandbox governance geometry / schedule / enrollment DTOs
// ---------------------------------------------------------------------------

export type GeoJsonPosition = [number, number];

export interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: GeoJsonPosition[][][];
}

export interface GeoJsonMultiLineString {
  type: "MultiLineString";
  coordinates: GeoJsonPosition[][];
}

export const SANDBOX_HOLIDAY_POLICIES = ["inherit", "open", "closed"] as const;
export type SandboxHolidayPolicy = (typeof SANDBOX_HOLIDAY_POLICIES)[number];

export interface SandboxScheduleWindow {
  scheduleId: string;
  version: number;
  active: boolean;
  daysOfWeek: number[];
  startLocalTime: string;
  endLocalTime: string;
  exceptionDates: string[];
  holidayPolicy: SandboxHolidayPolicy;
  maxConcurrentVehicles: number | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export const SANDBOX_OPERATING_AREA_KINDS = [
  "operating_area",
  "pickup_dropoff_zone",
] as const;
export type SandboxOperatingAreaKind =
  (typeof SANDBOX_OPERATING_AREA_KINDS)[number];

export interface ApprovedOperatingAreaRecord {
  areaId: string;
  sandboxProgramId: string;
  name: string;
  areaKind: SandboxOperatingAreaKind;
  version: number;
  active: boolean;
  geometry: GeoJsonMultiPolygon;
  schedules: SandboxScheduleWindow[];
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovedRouteRecord {
  routeId: string;
  sandboxProgramId: string;
  name: string;
  areaId: string | null;
  version: number;
  active: boolean;
  geometry: GeoJsonMultiLineString;
  schedules: SandboxScheduleWindow[];
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export const VEHICLE_ENROLLMENT_STATUSES = [
  "pending",
  "active",
  "suspended",
  "revoked",
  "expired",
] as const;
export type VehicleEnrollmentStatus =
  (typeof VEHICLE_ENROLLMENT_STATUSES)[number];

export interface VehicleEnrollmentRecord {
  enrollmentId: string;
  sandboxProgramId: string;
  vehicleId: string;
  providerCode: string;
  version: number;
  status: VehicleEnrollmentStatus;
  approvedAreaIds: string[];
  approvedRouteIds: string[];
  maxConcurrentTrips: number | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SAFETY_OPERATOR_QUALIFICATION_STATUSES = [
  "pending",
  "qualified",
  "suspended",
  "revoked",
  "expired",
] as const;
export type SafetyOperatorQualificationStatus =
  (typeof SAFETY_OPERATOR_QUALIFICATION_STATUSES)[number];

export interface SafetyOperatorQualificationRecord {
  qualificationId: string;
  sandboxProgramId: string;
  safetyOperatorId: string;
  providerCode: string;
  version: number;
  status: SafetyOperatorQualificationStatus;
  approvedAreaIds: string[];
  approvedRouteIds: string[];
  certificationRefs: string[];
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertApprovedOperatingAreasCommand {
  items: ApprovedOperatingAreaRecord[];
}

export interface UpsertApprovedRoutesCommand {
  items: ApprovedRouteRecord[];
}

export interface UpsertVehicleEnrollmentsCommand {
  items: VehicleEnrollmentRecord[];
}

export interface UpsertSafetyOperatorQualificationsCommand {
  items: SafetyOperatorQualificationRecord[];
}

export interface ValidateOperatingAreaPointCommand {
  sandboxProgramId: string;
  point: GeoPoint;
  asOf: string | null;
}

export interface ValidateRouteContainmentCommand {
  sandboxProgramId: string;
  candidatePath: GeoJsonMultiLineString;
  asOf: string | null;
  toleranceMeters: number | null;
}

export interface ApprovedAreaMatchRecord {
  areaId: string;
  areaKind: SandboxOperatingAreaKind;
  name: string;
}

export interface ValidateOperatingAreaPointResult {
  sandboxProgramId: string;
  point: GeoPoint;
  matches: ApprovedAreaMatchRecord[];
  inApprovedArea: boolean;
  evaluatedAt: string;
}

export interface ValidateRouteContainmentResult {
  sandboxProgramId: string;
  routeIds: string[];
  contained: boolean;
  evaluatedAt: string;
  toleranceMeters: number;
}

// §3.1.5 Tesla Fleet integration control-plane DTOs
// ---------------------------------------------------------------------------

export const TESLA_FLEET_REGIONS = [
  "north_america",
  "europe_middle_east_africa",
  "asia_pacific",
] as const;
export type TeslaFleetRegion = (typeof TESLA_FLEET_REGIONS)[number];

export const TESLA_OAUTH_CONNECTION_STATUSES = [
  "active",
  "revoked",
  "expired",
] as const;
export type TeslaOAuthConnectionStatus =
  (typeof TESLA_OAUTH_CONNECTION_STATUSES)[number];

export interface TeslaOAuthConnectionRecord {
  connectionId: string;
  businessAccountId: string;
  region: TeslaFleetRegion;
  scopes: string[];
  status: TeslaOAuthConnectionStatus;
  authorizedAt: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  lastRefreshedAt: string | null;
  revokedAt: string | null;
  source: Phase2SourceMetadata;
}

export interface TeslaBeginOAuthCommand {
  businessAccountId: string;
  region: TeslaFleetRegion;
  authorizationCode: string;
  scopes?: string[];
}

export interface TeslaRefreshOAuthCommand {
  connectionId: string;
  reason?: string | null;
}

export interface TeslaRevokeOAuthCommand {
  connectionId: string;
  reason?: string | null;
}

export interface TeslaDiscoveredVehicle {
  vin: string;
  externalVehicleRef: string;
  connectionId: string;
  region: TeslaFleetRegion;
  model: string;
  online: boolean;
  batteryLevelPct: number | null;
  lastSeenAt: string;
  source: Phase2SourceMetadata;
}

export interface TeslaVehicleBindingRecord {
  bindingId: string;
  vehicleId: string;
  vin: string;
  externalVehicleRef: string;
  connectionId: string;
  region: TeslaFleetRegion;
  boundAt: string;
  lastDiscoveredAt: string;
  source: Phase2SourceMetadata;
}

export interface BindTeslaVehicleCommand {
  vehicleId: string;
  vin: string;
}

export const TESLA_VIRTUAL_KEY_PAIRING_STATUSES = [
  "unpaired",
  "pairing_pending",
  "paired",
  "revoked",
  "failed",
] as const;
export type TeslaVirtualKeyPairingStatus =
  (typeof TESLA_VIRTUAL_KEY_PAIRING_STATUSES)[number];

export interface TeslaVirtualKeyRecord {
  vehicleId: string;
  externalVehicleRef: string;
  status: TeslaVirtualKeyPairingStatus;
  requestedAt: string;
  pairedAt: string | null;
  revokedAt: string | null;
  requestedBy: string;
  publicKeyHint: string;
  source: Phase2SourceMetadata;
}

export interface TeslaPairVirtualKeyCommand {
  vehicleId: string;
  requestedBy: string;
}

export const TESLA_TELEMETRY_MODES = ["fleet_api", "public_mock"] as const;
export type TeslaTelemetryMode = (typeof TESLA_TELEMETRY_MODES)[number];

export interface ConfigureTeslaTelemetryCommand {
  vehicleId: string;
  mode: TeslaTelemetryMode;
  sampleIntervalSec: number;
  mockOnline?: boolean;
  mockBatteryLevelPct?: number | null;
  mockLocation?: GeoPoint | null;
}

export interface TeslaTelemetryStatusRecord {
  vehicleId: string;
  externalVehicleRef: string;
  mode: TeslaTelemetryMode;
  sampleIntervalSec: number;
  enabled: boolean;
  configuredAt: string;
  lastSyncAt: string | null;
  lastProjectionAt: string | null;
  lastPublicSampleId: string | null;
  health: "ok" | "stale" | "disabled";
  source: Phase2SourceMetadata;
}

export interface IssueTeslaCommandCommand {
  vehicleId: string;
  commandType: TeslaRemoteCommandType;
  issuedBy: string;
  idempotencyKey?: string;
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// §3.2 Remote command receipt (Tesla command bridge)
// ---------------------------------------------------------------------------

export const COMMAND_RECEIPT_STATUSES = [
  "accepted",
  "queued",
  "dispatched",
  "acknowledged",
  "rejected",
  "failed",
  "expired",
] as const;
export type CommandReceiptStatus = (typeof COMMAND_RECEIPT_STATUSES)[number];

// Vehicle remote commands bridged through the Tesla Fleet API. Commands are
// idempotent on idempotencyKey so retries never double-issue.
export const TESLA_REMOTE_COMMAND_TYPES = [
  "wake_up",
  "honk_horn",
  "flash_lights",
  "door_lock",
  "door_unlock",
  "remote_start",
  "set_charge_limit",
  "charge_start",
  "charge_stop",
  "minimal_risk_stop",
] as const;
export type TeslaRemoteCommandType =
  (typeof TESLA_REMOTE_COMMAND_TYPES)[number];

export interface CommandReceipt {
  commandId: string;
  idempotencyKey: string;
  vehicleId: string;
  commandType: TeslaRemoteCommandType;
  status: CommandReceiptStatus;
  issuedBy: string;
  issuedAt: string;
  acknowledgedAt: string | null;
  // Provider-side correlation id once dispatched downstream.
  providerRef: string | null;
  failureReasonCode: string | null;
  source: Phase2SourceMetadata;
}

// ---------------------------------------------------------------------------
// §3.3 Sandbox dispatch decision (dispatch gate)
// ---------------------------------------------------------------------------

export const SANDBOX_DISPATCH_OUTCOMES = [
  "allow",
  "allow_with_safety_operator",
  "block",
  "defer",
] as const;
export type SandboxDispatchOutcome = (typeof SANDBOX_DISPATCH_OUTCOMES)[number];

export const SANDBOX_DISPATCH_REASON_CODES = [
  "ODD_OUT_OF_BOUNDS",
  "ODD_BOUNDARY_RISK",
  "PROVIDER_CAPABILITY_MISSING",
  "RECORDER_UNHEALTHY",
  "ROC_STOP_NEW_DISPATCH",
  "ROC_OPERATIONAL_HOLD",
  "SAFETY_OPERATOR_REQUIRED",
  "SAFETY_OPERATOR_UNAVAILABLE",
  "REGULATORY_APPROVAL_MISSING",
  "VEHICLE_NOT_CERTIFIED",
  "TELEMETRY_STALE",
  "ACTIVE_SAFETY_INCIDENT",
  "MINIMAL_RISK_CONDITION_ACTIVE",
  "SANDBOX_PROGRAM_SUSPENDED",
] as const;
export type SandboxDispatchReasonCode =
  (typeof SANDBOX_DISPATCH_REASON_CODES)[number];

export interface SandboxDispatchDecision {
  decisionId: string;
  orderId: string;
  dispatchJobId: string | null;
  vehicleId: string;
  sandboxProgramId: string;

  decision: SandboxDispatchOutcome;
  oddInBounds: boolean;
  hardReasonCodes: SandboxDispatchReasonCode[];
  softReasonCodes: SandboxDispatchReasonCode[];

  // Set when the outcome is allow_with_safety_operator.
  requiredSafetyOperatorId: string | null;

  policyVersion: string;
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// §3.4 Tesla regulatory telemetry DTOs
// ---------------------------------------------------------------------------

// Regulatory-grade autonomy events (FSD engagement, disengagement, safety
// interventions) that must be retained for accident investigation and
// regulatory filing.
export const TESLA_REGULATORY_EVENT_TYPES = [
  "fsd_engagement",
  "fsd_disengagement",
  "safety_intervention",
  "odd_boundary_exit",
  "minimal_risk_condition_entered",
  "minimal_risk_condition_cleared",
  "remote_assist_requested",
  "remote_assist_resolved",
  "collision",
  "near_miss",
] as const;
export type TeslaRegulatoryEventType =
  (typeof TESLA_REGULATORY_EVENT_TYPES)[number];

export const TESLA_DISENGAGEMENT_CAUSES = [
  "driver_initiated",
  "system_initiated",
  "safety_operator_initiated",
  "remote_assist_initiated",
  "odd_exit",
  "fault",
  "unknown",
] as const;
export type TeslaDisengagementCause =
  (typeof TESLA_DISENGAGEMENT_CAUSES)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TeslaRegulatoryEvent {
  eventId: string;
  vehicleId: string;
  externalVehicleRef: string | null;
  eventType: TeslaRegulatoryEventType;

  occurredAt: string;
  location: GeoPoint | null;
  speedMps: number | null;
  headingDeg: number | null;

  // Present for disengagement events.
  disengagementCause: TeslaDisengagementCause | null;
  // Free-form provider-supplied subcategory / fault code.
  providerReasonCode: string | null;

  // Correlated safety-operator / ROC actors, when applicable.
  safetyOperatorId: string | null;
  rocOperatorId: string | null;

  oddZoneId: string | null;
  source: Phase2SourceMetadata;
}

// Periodic vehicle state snapshot synced from the Tesla Fleet API
// (charge/drive/climate). Used by ROC live-board and dispatch gate freshness.
export interface TeslaVehicleStateSnapshot {
  snapshotId: string;
  vehicleId: string;
  externalVehicleRef: string;
  capturedAt: string;

  // drive state
  location: GeoPoint | null;
  speedMps: number | null;
  headingDeg: number | null;
  shiftState: "P" | "R" | "N" | "D" | null;
  autonomyState: "manual" | "fsd_supervised" | "fsd_engaged" | "unknown";

  // charge state
  batteryLevelPct: number | null;
  batteryRangeKm: number | null;
  charging: boolean | null;

  online: boolean;
  source: Phase2SourceMetadata;
}

// A single public-telemetry sample (lower-trust feed used where Fleet API
// access is unavailable). Kept separate from regulatory events by design.
export interface TeslaPublicTelemetrySample {
  sampleId: string;
  externalVehicleRef: string;
  capturedAt: string;
  location: GeoPoint | null;
  batteryLevelPct: number | null;
  online: boolean | null;
  source: Phase2SourceMetadata;
}

// ---------------------------------------------------------------------------
// §3.5 Safety operator & ROC operations
// ---------------------------------------------------------------------------

export const SAFETY_OPERATOR_ASSIGNMENT_STATUSES = [
  "assigned",
  "engaged",
  "released",
  "expired",
] as const;
export type SafetyOperatorAssignmentStatus =
  (typeof SAFETY_OPERATOR_ASSIGNMENT_STATUSES)[number];

export interface SafetyOperatorAssignment {
  assignmentId: string;
  safetyOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  status: SafetyOperatorAssignmentStatus;
  assignedAt: string;
  releasedAt: string | null;
  sandboxProgramId: string;
}

export interface CreateSafetyOperatorAssignmentCommand {
  safetyOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  sandboxProgramId: string;
}

export interface EngageSafetyOperatorAssignmentCommand {
  safetyOperatorId: string;
}

export interface ReleaseSafetyOperatorAssignmentCommand {
  safetyOperatorId: string;
}

export const SAFETY_OPERATOR_SHIFT_STATUSES = [
  "active",
  "completed",
  "abandoned",
] as const;
export type SafetyOperatorShiftStatus =
  (typeof SAFETY_OPERATOR_SHIFT_STATUSES)[number];

export interface SafetyOperatorShift {
  shiftId: string;
  safetyOperatorId: string;
  sandboxProgramId: string;
  deviceId: string;
  vehicleId: string | null;
  assignmentId: string | null;
  status: SafetyOperatorShiftStatus;
  startedAt: string;
  endedAt: string | null;
  startLocation: GeoPoint | null;
  endLocation: GeoPoint | null;
  notes: string | null;
}

export interface StartSafetyOperatorShiftCommand {
  safetyOperatorId: string;
  sandboxProgramId: string;
  deviceId: string;
  vehicleId: string | null;
  assignmentId: string | null;
  startLocation: GeoPoint | null;
  notes: string | null;
}

export interface EndSafetyOperatorShiftCommand {
  safetyOperatorId: string;
  deviceId: string;
  endLocation: GeoPoint | null;
  notes: string | null;
}

export interface SafetyOperatorQualificationCheckCommand {
  safetyOperatorId: string;
  sandboxProgramId: string;
  vehicleId: string | null;
  asOf: string | null;
}

export interface SafetyOperatorQualificationCheckResult {
  safetyOperatorId: string;
  sandboxProgramId: string;
  vehicleId: string | null;
  asOf: string;
  qualified: boolean;
  matchedQualificationIds: string[];
  activeAssignmentId: string | null;
  reasons: string[];
}

export const SAFETY_OPERATOR_CHECKLIST_ITEM_KEYS = [
  "vehicle_exterior",
  "cab_cleanliness",
  "seatbelts",
  "brakes",
  "lights",
  "tires",
  "mirrors",
  "recorder_health",
  "autonomy_stack",
  "fallback_comms",
] as const;
export type SafetyOperatorChecklistItemKey =
  (typeof SAFETY_OPERATOR_CHECKLIST_ITEM_KEYS)[number];

export const SAFETY_OPERATOR_CHECKLIST_ITEM_STATUSES = [
  "pass",
  "fail",
  "na",
] as const;
export type SafetyOperatorChecklistItemStatus =
  (typeof SAFETY_OPERATOR_CHECKLIST_ITEM_STATUSES)[number];

export interface SafetyOperatorChecklistItem {
  itemKey: SafetyOperatorChecklistItemKey;
  status: SafetyOperatorChecklistItemStatus;
  note: string | null;
}

export interface SafetyOperatorPreTripChecklist {
  checklistId: string;
  shiftId: string;
  assignmentId: string | null;
  safetyOperatorId: string;
  vehicleId: string;
  completedAt: string;
  allPassed: boolean;
  blockerCodes: string[];
  items: SafetyOperatorChecklistItem[];
  notes: string | null;
}

export interface SubmitSafetyOperatorPreTripChecklistCommand {
  shiftId: string;
  assignmentId: string | null;
  safetyOperatorId: string;
  vehicleId: string;
  blockerCodes: string[];
  items: SafetyOperatorChecklistItem[];
  notes: string | null;
}

export const SAFETY_OPERATOR_TAKEOVER_TRIGGERS = [
  "safety_operator",
  "vehicle_alert",
  "roc_request",
  "odd_boundary",
  "fallback_system",
] as const;
export type SafetyOperatorTakeoverTrigger =
  (typeof SAFETY_OPERATOR_TAKEOVER_TRIGGERS)[number];

export const SAFETY_OPERATOR_TAKEOVER_REASON_CODES = [
  "obstacle",
  "road_hazard",
  "weather",
  "construction",
  "map_mismatch",
  "sensor_fault",
  "vehicle_fault",
  "passenger_emergency",
  "remote_assist_request",
  "other",
] as const;
export type SafetyOperatorTakeoverReasonCode =
  (typeof SAFETY_OPERATOR_TAKEOVER_REASON_CODES)[number];

export const SAFETY_OPERATOR_TAKEOVER_DISPOSITIONS = [
  "continued_manual",
  "fsd_resumed",
  "remote_assist",
  "minimal_risk_stop",
  "trip_ended",
] as const;
export type SafetyOperatorTakeoverDisposition =
  (typeof SAFETY_OPERATOR_TAKEOVER_DISPOSITIONS)[number];

export interface SafetyOperatorTakeoverReport {
  reportId: string;
  clientGeneratedReportId: string;
  safetyOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  sandboxProgramId: string;
  shiftId: string | null;
  assignmentId: string | null;
  correlationId: string;
  trigger: SafetyOperatorTakeoverTrigger;
  reasonCode: SafetyOperatorTakeoverReasonCode;
  disposition: SafetyOperatorTakeoverDisposition;
  fsdResumed: boolean;
  bookmarkId: string | null;
  incidentId: string | null;
  evidenceArtifactIds: string[];
  notes: string | null;
  occurredAt: string;
  serverReceivedAt: string;
}

export interface SubmitSafetyOperatorTakeoverReportCommand {
  clientGeneratedReportId: string;
  safetyOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  sandboxProgramId: string;
  shiftId: string | null;
  assignmentId: string | null;
  correlationId: string;
  trigger: SafetyOperatorTakeoverTrigger;
  reasonCode: SafetyOperatorTakeoverReasonCode;
  disposition: SafetyOperatorTakeoverDisposition;
  fsdResumed: boolean;
  bookmarkId: string | null;
  incidentId: string | null;
  evidenceArtifactIds: string[];
  notes: string | null;
  occurredAt: string;
}

export interface SafetyOperatorTakeoverReportReceipt {
  reportId: string;
  clientGeneratedReportId: string;
  correlationId: string;
  duplicate: boolean;
  serverReceivedAt: string;
}

export interface SubmitSafetyOperatorTakeoverReportResult {
  report: SafetyOperatorTakeoverReport;
  receipt: SafetyOperatorTakeoverReportReceipt;
}

export const SAFETY_OPERATOR_TRIP_CLOSEOUT_STATUSES = [
  "completed",
  "handoff",
  "incident_escalated",
  "cancelled",
] as const;
export type SafetyOperatorTripCloseoutStatus =
  (typeof SAFETY_OPERATOR_TRIP_CLOSEOUT_STATUSES)[number];

export interface SafetyOperatorTripCloseout {
  closeoutId: string;
  assignmentId: string | null;
  shiftId: string | null;
  safetyOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  closeoutStatus: SafetyOperatorTripCloseoutStatus;
  closeoutAt: string;
  takeoverReportIds: string[];
  incidentId: string | null;
  evidenceArtifactIds: string[];
  notes: string | null;
}

export interface CreateSafetyOperatorTripCloseoutCommand {
  assignmentId: string | null;
  shiftId: string | null;
  safetyOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  closeoutStatus: SafetyOperatorTripCloseoutStatus;
  takeoverReportIds: string[];
  incidentId: string | null;
  evidenceArtifactIds: string[];
  notes: string | null;
}

export const ROC_INTERVENTION_TYPES = [
  "remote_assist",
  "minimal_risk_stop",
  "reroute",
  "odd_recovery",
  "manual_takeover",
] as const;
export type RocInterventionType = (typeof ROC_INTERVENTION_TYPES)[number];

export interface RocIntervention {
  interventionId: string;
  rocOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  interventionType: RocInterventionType;
  triggeredByEventId: string | null;
  startedAt: string;
  resolvedAt: string | null;
  outcomeNote: string | null;
  source: Phase2SourceMetadata;
}

export const TESLA_AUTONOMY_TRANSITION_TYPES = [
  "fsd_disengagement",
  "manual_takeover",
  "autonomy_resumed",
] as const;
export type TeslaAutonomyTransitionType =
  (typeof TESLA_AUTONOMY_TRANSITION_TYPES)[number];

export interface TeslaAutonomyTransitionEvent {
  eventId: string;
  takeoverCorrelationId: string | null;
  autonomySessionId: string | null;
  vehicleId: string;
  orderId: string | null;
  transitionType: TeslaAutonomyTransitionType;
  occurredAt: string;
  source: Phase2SourceMetadata;
}

export interface RocTakeoverResponseRecord {
  responseId: string;
  takeoverCorrelationId: string | null;
  autonomySessionId: string | null;
  triggeredByTeslaEventId: string | null;
  rocOperatorId: string;
  vehicleId: string;
  orderId: string | null;
  responseType: RocInterventionType;
  requestedAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  outcomeNote: string | null;
  source: Phase2SourceMetadata;
}

export interface CreateManualTakeoverCorrelationCommand {
  manualLinkId: string;
  vehicleId: string;
  takeoverReportId: string;
  teslaEventId: string | null;
  rocResponseId: string | null;
  linkedBy: string;
  linkedAt: string;
  note: string | null;
}

export interface ManualTakeoverCorrelationLink {
  manualLinkId: string;
  vehicleId: string;
  takeoverReportId: string;
  teslaEventId: string | null;
  rocResponseId: string | null;
  linkedBy: string;
  linkedAt: string;
  note: string | null;
}

export const TAKEOVER_CORRELATION_MATCH_MODES = [
  "takeover_correlation_id",
  "vehicle_time_trip",
  "manual",
] as const;
export type TakeoverCorrelationMatchMode =
  (typeof TAKEOVER_CORRELATION_MATCH_MODES)[number];

export const TAKEOVER_DISCREPANCY_TYPES = [
  "timestamp_mismatch",
  "trip_mismatch",
  "correlation_id_mismatch",
] as const;
export type TakeoverDiscrepancyType =
  (typeof TAKEOVER_DISCREPANCY_TYPES)[number];

export interface EvidenceDiscrepancyCase {
  discrepancyCaseId: string;
  correlatedTakeoverCaseId: string;
  vehicleId: string;
  discrepancyTypes: TakeoverDiscrepancyType[];
  openedAt: string;
  summary: string;
  investigationLink?: CrossAppResourceLink | null;
  sourceFacts: {
    teslaOccurredAt: string | null;
    safetyOccurredAt: string | null;
    rocRequestedAt: string | null;
    rocRespondedAt: string | null;
    teslaOrderId: string | null;
    safetyOrderId: string | null;
    rocOrderId: string | null;
    teslaTakeoverCorrelationId: string | null;
    safetyTakeoverCorrelationId: string | null;
    rocTakeoverCorrelationId: string | null;
  };
}

export interface CorrelatedTakeoverCase {
  correlatedTakeoverCaseId: string;
  vehicleId: string;
  orderId: string | null;
  takeoverCorrelationId: string | null;
  correlationPriority: 1 | 2 | 3;
  matchedBy: TakeoverCorrelationMatchMode;
  sourceRecordIds: {
    teslaEventId: string | null;
    safetyOperatorTakeoverReportId: string;
    rocTakeoverResponseId: string | null;
  };
  sourceTimestamps: {
    teslaOccurredAt: string | null;
    safetyOccurredAt: string;
    safetyServerReceivedAt: string;
    rocRequestedAt: string | null;
    rocRespondedAt: string | null;
    rocResolvedAt: string | null;
  };
  teslaEvent: TeslaAutonomyTransitionEvent | null;
  safetyOperatorTakeoverReport: SafetyOperatorTakeoverReport;
  rocTakeoverResponse: RocTakeoverResponseRecord | null;
  manualCorrelation: ManualTakeoverCorrelationLink | null;
  discrepancyCaseIds: string[];
  investigationLink?: CrossAppResourceLink | null;
}

export const ROC_ALERT_TYPES = [
  "provider_health",
  "takeover_discrepancy",
  "dispatch_gate",
  "operational_hold",
  "evidence_freeze",
  "human_fallback",
  "manual_attention",
] as const;
export type RocAlertType = (typeof ROC_ALERT_TYPES)[number];

export const ROC_ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type RocAlertSeverity = (typeof ROC_ALERT_SEVERITIES)[number];

export const ROC_ALERT_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
] as const;
export type RocAlertStatus = (typeof ROC_ALERT_STATUSES)[number];

export interface RocDataFreshness {
  dataFreshness: "fresh" | "stale" | "degraded" | "unknown";
  observedAt: string | null;
  staleAfterMs: number;
}

export interface RocOverviewReadModel {
  generatedAt: string;
  activeVehicleCount: number;
  activeTripCount: number;
  activeTakeoverCount: number;
  openAlertCount: number;
  criticalAlertCount: number;
  acknowledgedAlertCount: number;
  stopNewDispatchVehicleCount: number;
  operationalHoldVehicleCount: number;
  evidenceFreezeVehicleCount: number;
  humanFallbackVehicleCount: number;
  providerHealth: UiHealthEnvelope;
}

export interface RocVehicleReadModel {
  vehicleId: string;
  sandboxProgramId: string | null;
  currentOrderId: string | null;
  safetyOperatorId: string | null;
  autonomyState:
    | "manual"
    | "fsd_supervised"
    | "fsd_engaged"
    | "unknown"
    | null;
  location: GeoPoint | null;
  telemetryFreshness: RocDataFreshness;
  regulatoryFreshness: RocDataFreshness;
  stopNewDispatchActive: boolean;
  operationalHoldActive: boolean;
  evidenceFreezeActive: boolean;
  humanFallbackActive: boolean;
  dispatchGateStatus: SandboxDispatchOutcome;
  gateReasonCodes: SandboxDispatchReasonCode[];
  alertIds: string[];
}

export const ROC_TRIP_STATUSES = [
  "monitoring",
  "takeover_active",
  "operational_hold",
  "human_fallback",
  "completed",
] as const;
export type RocTripStatus = (typeof ROC_TRIP_STATUSES)[number];

export interface RocTripReadModel {
  tripId: string;
  orderId: string | null;
  vehicleId: string;
  sandboxProgramId: string | null;
  safetyOperatorId: string | null;
  status: RocTripStatus;
  latestTakeoverOccurredAt: string | null;
  stopNewDispatchActive: boolean;
  operationalHoldActive: boolean;
  humanFallbackActive: boolean;
  alertIds: string[];
}

export interface RocAlertReadModel {
  alertId: string;
  alertType: RocAlertType;
  status: RocAlertStatus;
  severity: RocAlertSeverity;
  title: string;
  summary: string;
  vehicleId: string | null;
  orderId: string | null;
  sandboxProgramId: string | null;
  providerCode: string | null;
  sourceRecordId: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  linkedIncidentId: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  openedAt: string;
  updatedAt: string;
  availableActions: ResourceActionDescriptor[];
}

export interface RocProviderHealthReadModel {
  providerCode: string;
  displayName: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  lastCheckedAt: string;
  message: string | null;
  affectedVehicleIds: string[];
}

export interface RocProviderHealthSnapshot {
  health: UiHealthEnvelope;
  items: RocProviderHealthReadModel[];
}

export interface RocAlertActionCommand {
  reason?: string | null;
  note?: string | null;
}

export interface AssignRocAlertCommand extends RocAlertActionCommand {
  assigneeId: string;
}

export interface RequestRocSafetyActionCommand extends RocAlertActionCommand {
  safetyOperatorId: string;
  sandboxProgramId: string;
  orderId?: string | null;
}

export interface OpenRocIncidentCommand extends RocAlertActionCommand {
  title?: string | null;
  description?: string | null;
  category?: "safety" | "operational" | "other";
  severity?: "low" | "medium" | "high" | "critical";
}

export interface StartRocEvidenceFreezeCommand extends RocAlertActionCommand {
  retentionHours?: number | null;
}

export interface NotifyRocAlertCommand extends RocAlertActionCommand {
  channel: "email" | "slack" | "sms" | "pager";
  target: string;
  message?: string | null;
}

// ---------------------------------------------------------------------------
// §3.6 Vehicle evidence custody
// ---------------------------------------------------------------------------

export const EVIDENCE_ARTIFACT_TYPES = [
  "video_clip",
  "sensor_log",
  "event_log",
  "snapshot_image",
  "telemetry_export",
  "signed_report",
] as const;
export type EvidenceArtifactType = (typeof EVIDENCE_ARTIFACT_TYPES)[number];

export const EVIDENCE_CUSTODY_STATES = [
  "captured",
  "uploaded",
  "verified",
  "sealed",
  "released",
  "purged",
] as const;
export type EvidenceCustodyState = (typeof EVIDENCE_CUSTODY_STATES)[number];

// One artifact line inside an evidence manifest. The manifest groups all
// artifacts captured for a vehicle/case window; each item carries an integrity
// checksum and its own provenance stamp for chain-of-custody.
export interface EvidenceManifestItem {
  artifactId: string;
  manifestId: string;
  artifactType: EvidenceArtifactType;

  objectKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;

  capturedAt: string;
  custodyState: EvidenceCustodyState;

  vehicleId: string | null;
  caseId: string | null;
  // Retention boundary for regulatory purge policy.
  retentionUntil: string | null;

  source: Phase2SourceMetadata;
}

export interface EvidenceManifest {
  manifestId: string;
  vehicleId: string;
  caseId: string | null;
  windowStart: string;
  windowEnd: string;
  itemCount: number;
  custodyState: EvidenceCustodyState;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// §3.7 Accident investigation
// ---------------------------------------------------------------------------

export const ACCIDENT_CASE_STATUSES = [
  "detected",
  "roc_acknowledged",
  "operation_suspended",
  "emergency_response_active",
  "evidence_frozen",
  "initial_notification_sent",
  "under_investigation",
  "regulator_review",
  "closed",
] as const;
export type AccidentCaseStatus = (typeof ACCIDENT_CASE_STATUSES)[number];

export const ACCIDENT_SEVERITIES = [
  "near_miss",
  "minor",
  "major",
  "fatal",
] as const;
export type AccidentSeverity = (typeof ACCIDENT_SEVERITIES)[number];

export const ACCIDENT_TIMELINE_FACT_CONFIDENCES = [
  "provider_signed",
  "provider_reported",
  "platform_recorded",
  "operator_reported",
  "system_derived",
  "unknown",
] as const;
export type AccidentTimelineFactConfidence =
  (typeof ACCIDENT_TIMELINE_FACT_CONFIDENCES)[number];

export const ACCIDENT_TIMELINE_SOURCE_SYSTEMS = [
  ...PHASE2_SOURCE_SYSTEMS,
  "accident_case",
  "system_derived",
] as const;
export type AccidentTimelineSourceSystem =
  (typeof ACCIDENT_TIMELINE_SOURCE_SYSTEMS)[number];

export type AccidentTimelineFactValue =
  | string
  | number
  | boolean
  | null;

export interface AccidentTimelineSourceRecord {
  sourceSystem: AccidentTimelineSourceSystem;
  sourceRef: string | null;
  signatureRef: string | null;
  recordedAt: string | null;
  ingestedAt: string | null;
  schemaVersion: string | null;
}

export interface AccidentCaseRecord {
  caseId: string;
  vehicleId: string;
  orderId: string | null;
  triggeringEventId: string | null;
  takeoverCorrelationId: string | null;

  status: AccidentCaseStatus;
  severity: AccidentSeverity;

  occurredAt: string;
  reportedAt: string;
  reportedBy: string;

  evidenceManifestId: string | null;
  regulatoryReportId: string | null;

  summary: string | null;
  discrepancyCaseIds: string[];
  externalDocumentIds: string[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CreateAccidentCaseCommand {
  caseId?: string;
  vehicleId: string;
  orderId?: string | null;
  triggeringEventId?: string | null;
  takeoverCorrelationId?: string | null;
  severity: AccidentSeverity;
  occurredAt: string;
  reportedAt?: string | null;
  reportedBy: string;
  summary?: string | null;
  evidenceManifestId?: string | null;
  regulatoryReportId?: string | null;
}

export interface TransitionAccidentCaseCommand {
  toStatus: AccidentCaseStatus;
  transitionedAt?: string | null;
  actorId: string;
  note?: string | null;
  evidenceManifestId?: string | null;
  regulatoryReportId?: string | null;
}

export interface AddAccidentTimelineFactCommand {
  factId?: string;
  factKey: string;
  label: string;
  value: AccidentTimelineFactValue;
  occurredAt: string;
  recordedAt?: string | null;
  confidence: AccidentTimelineFactConfidence;
  sourceSystem: AccidentTimelineSourceSystem;
  sourceRef?: string | null;
  signatureRef?: string | null;
  schemaVersion?: string | null;
  derivationRule?: string | null;
  derivedFromFactIds?: string[];
  note?: string | null;
  discrepancyCaseIds?: string[];
  externalDocumentId?: string | null;
}

export interface AccidentTimelineFactRecord {
  factId: string;
  caseId: string;
  factKey: string;
  label: string;
  value: AccidentTimelineFactValue;
  occurredAt: string;
  recordedAt: string | null;
  confidence: AccidentTimelineFactConfidence;
  source: AccidentTimelineSourceRecord;
  derivationRule: string | null;
  derivedFromFactIds: string[];
  discrepancyCaseIds: string[];
  externalDocumentId: string | null;
  note: string | null;
}

export interface AccidentTimelineEntry {
  entryId: string;
  caseId: string;
  factKey: string;
  label: string;
  occurredAt: string;
  value: AccidentTimelineFactValue;
  confidence: AccidentTimelineFactConfidence;
  sourceSystem: AccidentTimelineSourceSystem;
  sourceRef: string | null;
  derivationRule: string | null;
  discrepancyCaseIds: string[];
  externalDocumentIds: string[];
  facts: AccidentTimelineFactRecord[];
}

export const ACCIDENT_EXTERNAL_DOCUMENT_TYPES = [
  "police_report",
  "insurer_notice",
  "insurer_assessment",
  "insurer_settlement",
  "witness_statement",
  "medical_report",
  "other",
] as const;
export type AccidentExternalDocumentType =
  (typeof ACCIDENT_EXTERNAL_DOCUMENT_TYPES)[number];

export interface AccidentExternalDocumentFactInput {
  factId?: string;
  factKey: string;
  label: string;
  value: AccidentTimelineFactValue;
  occurredAt: string;
  recordedAt?: string | null;
  confidence?: AccidentTimelineFactConfidence | null;
  note?: string | null;
}

export interface ImportAccidentExternalDocumentCommand {
  documentId?: string;
  documentType: AccidentExternalDocumentType;
  title: string;
  providerName?: string | null;
  receivedAt: string;
  checksumSha256?: string | null;
  source: Phase2SourceMetadata;
  extractedFacts?: AccidentExternalDocumentFactInput[];
}

export interface AccidentExternalDocumentRecord {
  documentId: string;
  caseId: string;
  documentType: AccidentExternalDocumentType;
  title: string;
  providerName: string | null;
  receivedAt: string;
  checksumSha256: string | null;
  source: Phase2SourceMetadata;
  factIds: string[];
}

export interface GenerateAccidentInvestigationBundleCommand {
  actorId: string;
  requestedAt?: string | null;
  note?: string | null;
}

export interface AccidentInvestigationBundleSection {
  sectionId: string;
  title: string;
  itemCount: number;
  checksumSha256: string;
  payload: Record<string, unknown>;
}

export interface AccidentInvestigationBundleManifestEntry {
  sectionId: string;
  title: string;
  itemCount: number;
  checksumSha256: string;
}

export interface AccidentInvestigationBundleManifest {
  manifestId: string;
  caseId: string;
  generatedAt: string;
  entryCount: number;
  entries: AccidentInvestigationBundleManifestEntry[];
  checksumSha256: string;
  immutable: true;
}

export interface AccidentInvestigationBundleCustodyRecord {
  custodyId: string;
  occurredAt: string;
  actorId: string;
  action: string;
  note: string | null;
  evidenceRefs: string[];
}

export interface AccidentInvestigationBundleKnownGap {
  sectionId: string;
  code: string;
  message: string;
  upstream: string;
}

export interface AccidentInvestigationBundleKnownGapsSectionPayload {
  knownGaps: AccidentInvestigationBundleKnownGap[];
  summary: {
    totalCount: number;
    upstreams: string[];
  };
}

export interface AccidentInvestigationBundleDownloadMetadata {
  kind: string;
  subjectId: string;
  manifestHash: string;
  host: string;
  keyId: string;
  signedAt: string;
  expiresAt: string;
  ttlMinutes: number;
  signatureVersion: number;
  signature: string;
  downloadUrl: string;
  immutable: true;
}

export interface AccidentInvestigationBundleView {
  bundleId: string;
  caseId: string;
  generatedAt: string;
  requestedAt: string;
  generatedBy: string;
  status: "completed";
  manifestHash: string;
  manifest: AccidentInvestigationBundleManifest;
  custodyPackage: {
    statement: string;
    records: AccidentInvestigationBundleCustodyRecord[];
  };
  sections: AccidentInvestigationBundleSection[];
  knownGaps: AccidentInvestigationBundleKnownGap[];
  liabilityConclusion: null;
  liabilityConclusionEmitted: false;
  immutable: true;
  downloadMetadata: {
    bundle: AccidentInvestigationBundleDownloadMetadata;
  };
}

// ---------------------------------------------------------------------------
// §3.8 Regulatory reporting
// ---------------------------------------------------------------------------

export const REGULATORY_REPORT_TYPES = [
  "disengagement_summary",
  "collision_report",
  "mileage_report",
  "odd_compliance_report",
  "incident_filing",
] as const;
export type RegulatoryReportType = (typeof REGULATORY_REPORT_TYPES)[number];

export const REGULATORY_REPORT_STATUSES = [
  "draft",
  "generated",
  "submitted",
  "accepted",
  "rejected",
] as const;
export type RegulatoryReportStatus =
  (typeof REGULATORY_REPORT_STATUSES)[number];

export interface RegulatoryReportFiling {
  reportId: string;
  reportType: RegulatoryReportType;
  status: RegulatoryReportStatus;

  periodStart: string;
  periodEnd: string;
  jurisdiction: string;

  caseId: string | null;
  evidenceManifestId: string | null;

  generatedAt: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  acknowledgementRef: string | null;

  artifactObjectKey: string | null;
  artifactChecksumSha256: string | null;
}

export interface SubmitRegulatoryReportCommand {
  acknowledgementRef?: string | null;
  note?: string | null;
}

export const SANDBOX_CONTROLLED_EVIDENCE_EXPORT_STATUSES = [
  "pending_approval",
  "approved",
  "completed",
  "rejected",
] as const;
export type SandboxControlledEvidenceExportStatus =
  (typeof SANDBOX_CONTROLLED_EVIDENCE_EXPORT_STATUSES)[number];

export interface RequestSandboxControlledEvidenceExportCommand {
  caseId?: string | null;
  manifestId: string;
  reportId?: string | null;
  recipientLabel: string;
  recipientScope: string;
  reason: string;
}

export interface ApproveSandboxControlledEvidenceExportCommand {
  approvalNote?: string | null;
}

export interface SandboxControlledEvidenceExportRecord {
  exportRequestId: string;
  caseId: string | null;
  manifestId: string;
  reportId: string | null;
  recipientLabel: string;
  recipientScope: string;
  reason: string;
  status: SandboxControlledEvidenceExportStatus;
  requestedByActorId: string;
  requestedAt: string;
  approvedByActorId: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  completedAt: string | null;
  artifactChecksumSha256: string | null;
}

export const SANDBOX_LEGAL_HOLD_STATUSES = [
  "active",
  "release_requested",
  "released",
] as const;
export type SandboxLegalHoldStatus =
  (typeof SANDBOX_LEGAL_HOLD_STATUSES)[number];

export interface CreateSandboxLegalHoldCommand {
  caseId: string;
  manifestId: string;
  scopeSummary: string;
  reason: string;
  expiresAt?: string | null;
}

export interface RequestSandboxLegalHoldReleaseCommand {
  releaseReason: string;
}

export interface ApproveSandboxLegalHoldReleaseCommand {
  approvalNote?: string | null;
}

export interface SandboxLegalHoldRecord {
  holdId: string;
  caseId: string;
  manifestId: string;
  scopeSummary: string;
  reason: string;
  status: SandboxLegalHoldStatus;
  retentionConflictResolved: boolean;
  placedByActorId: string;
  placedAt: string;
  expiresAt: string | null;
  releaseRequestedByActorId: string | null;
  releaseRequestedAt: string | null;
  releaseRequestReason: string | null;
  releasedByActorId: string | null;
  releasedAt: string | null;
  approvalNote: string | null;
}

export interface SandboxEvidenceManifestView extends EvidenceManifest {
  legalHoldActive: boolean;
  knownGapCount: number;
  items: EvidenceManifestItem[];
}

// ---------------------------------------------------------------------------
// §3.8A Sandbox governance + compliance snapshot
// ---------------------------------------------------------------------------

export const SANDBOX_GOVERNANCE_NOTIFICATION_CHANNELS = [
  "email",
  "slack",
  "pagerduty",
  "webhook",
] as const;
export type SandboxGovernanceNotificationChannel =
  (typeof SANDBOX_GOVERNANCE_NOTIFICATION_CHANNELS)[number];

export const SANDBOX_GOVERNANCE_RECIPIENT_KINDS = [
  "role",
  "user",
  "distribution_list",
  "webhook",
] as const;
export type SandboxGovernanceRecipientKind =
  (typeof SANDBOX_GOVERNANCE_RECIPIENT_KINDS)[number];

export const SANDBOX_GOVERNANCE_NOTIFICATION_TRIGGERS = [
  "experiment_published",
  "experiment_suspended",
  "experiment_authorizations_resumed",
  "jurisdiction_profile_published",
  "approval_document_uploaded",
  "approval_document_superseded",
  "compliance_snapshot_generated",
] as const;
export type SandboxGovernanceNotificationTrigger =
  (typeof SANDBOX_GOVERNANCE_NOTIFICATION_TRIGGERS)[number];

export interface SandboxGovernanceNotificationRecipient {
  recipientId: string;
  kind: SandboxGovernanceRecipientKind;
  target: string;
  channels: SandboxGovernanceNotificationChannel[];
}

export interface SandboxGovernanceNotificationMatrixEntry {
  trigger: SandboxGovernanceNotificationTrigger;
  recipients: SandboxGovernanceNotificationRecipient[];
  escalationWithinMinutes: number | null;
  retentionDays: number | null;
}

export interface SandboxGovernancePolicyVersionRefs {
  routePolicyVersion: string | null;
  schedulePolicyVersion: string | null;
  enrollmentPolicyVersion: string | null;
  capabilityPolicyVersion: string | null;
  compliancePolicyVersion: string | null;
}

export const SANDBOX_VERSION_LIFECYCLE_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;
export type SandboxVersionLifecycleStatus =
  (typeof SANDBOX_VERSION_LIFECYCLE_STATUSES)[number];

export const SANDBOX_AUTHORIZATION_STATUSES = [
  "pending",
  "active",
  "suspended",
] as const;
export type SandboxAuthorizationStatus =
  (typeof SANDBOX_AUTHORIZATION_STATUSES)[number];

export interface SandboxExperimentProgramVersionRecord {
  experimentId: string;
  versionId: string;
  versionNo: number;
  programCode: string;
  name: string;
  description: string | null;
  jurisdictionIds: string[];
  requiredCapabilities: ProviderCapabilityRequirement[];
  notificationMatrix: SandboxGovernanceNotificationMatrixEntry[];
  policyVersions: SandboxGovernancePolicyVersionRefs;
  lifecycleStatus: SandboxVersionLifecycleStatus;
  authorizationStatus: SandboxAuthorizationStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  rollbackFromVersionId: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SandboxExperimentProgramRecord {
  experimentId: string;
  programCode: string;
  currentVersionId: string | null;
  versions: SandboxExperimentProgramVersionRecord[];
  archivedAt: string | null;
}

export interface CreateSandboxExperimentProgramCommand {
  programCode: string;
  name: string;
  description?: string | null;
  jurisdictionIds?: string[];
  requiredCapabilities?: ProviderCapabilityRequirement[];
  notificationMatrix?: SandboxGovernanceNotificationMatrixEntry[];
  policyVersions?: Partial<SandboxGovernancePolicyVersionRefs>;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
}

export interface UpdateSandboxExperimentProgramCommand {
  name?: string;
  description?: string | null;
  jurisdictionIds?: string[];
  requiredCapabilities?: ProviderCapabilityRequirement[];
  notificationMatrix?: SandboxGovernanceNotificationMatrixEntry[];
  policyVersions?: Partial<SandboxGovernancePolicyVersionRefs>;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
}

export interface PublishSandboxGovernanceVersionCommand {
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
}

export interface RollbackSandboxGovernanceVersionCommand {
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
  publish?: boolean;
}

export interface SuspendSandboxExperimentAuthorizationsCommand {
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
  reason?: string | null;
}

export interface ResumeSandboxExperimentAuthorizationsCommand {
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
  reason?: string | null;
}

export interface SandboxJurisdictionProfileVersionRecord {
  jurisdictionId: string;
  versionId: string;
  versionNo: number;
  jurisdictionCode: string;
  name: string;
  regulatorName: string;
  approvalLeadTimeDays: number | null;
  retentionDays: number | null;
  notificationMatrix: SandboxGovernanceNotificationMatrixEntry[];
  policyVersions: SandboxGovernancePolicyVersionRefs;
  lifecycleStatus: SandboxVersionLifecycleStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  rollbackFromVersionId: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SandboxJurisdictionProfileRecord {
  jurisdictionId: string;
  jurisdictionCode: string;
  currentVersionId: string | null;
  versions: SandboxJurisdictionProfileVersionRecord[];
  archivedAt: string | null;
}

export interface CreateSandboxJurisdictionProfileCommand {
  jurisdictionCode: string;
  name: string;
  regulatorName: string;
  approvalLeadTimeDays?: number | null;
  retentionDays?: number | null;
  notificationMatrix?: SandboxGovernanceNotificationMatrixEntry[];
  policyVersions?: Partial<SandboxGovernancePolicyVersionRefs>;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
}

export interface UpdateSandboxJurisdictionProfileCommand {
  name?: string;
  regulatorName?: string;
  approvalLeadTimeDays?: number | null;
  retentionDays?: number | null;
  notificationMatrix?: SandboxGovernanceNotificationMatrixEntry[];
  policyVersions?: Partial<SandboxGovernancePolicyVersionRefs>;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
}

export const SANDBOX_APPROVAL_DOCUMENT_TYPES = [
  "permit",
  "waiver",
  "insurance_certificate",
  "operating_plan",
  "safety_case",
  "other",
] as const;
export type SandboxApprovalDocumentType =
  (typeof SANDBOX_APPROVAL_DOCUMENT_TYPES)[number];

export interface ApprovalDocumentVersionRecord {
  documentId: string;
  versionId: string;
  versionNo: number;
  experimentId: string;
  jurisdictionId: string;
  documentType: SandboxApprovalDocumentType;
  title: string;
  summary: string | null;
  artifactFileName: string;
  artifactContentType: string;
  artifactByteSize: number;
  artifactSha256: string;
  artifactUploadedAt: string;
  artifactUploadedBy: string | null;
  supersedesVersionId: string | null;
  lifecycleStatus: SandboxVersionLifecycleStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  rollbackFromVersionId: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ApprovalDocumentRecord {
  documentId: string;
  experimentId: string;
  jurisdictionId: string;
  documentType: SandboxApprovalDocumentType;
  title: string;
  currentVersionId: string | null;
  versions: ApprovalDocumentVersionRecord[];
  archivedAt: string | null;
}

export interface CreateApprovalDocumentVersionCommand {
  experimentId: string;
  jurisdictionId: string;
  documentType: SandboxApprovalDocumentType;
  title: string;
  summary?: string | null;
  artifactFileName: string;
  artifactContentType: string;
  artifactContentBase64: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
}

export interface UpdateApprovalDocumentVersionCommand {
  title?: string;
  summary?: string | null;
  artifactFileName: string;
  artifactContentType: string;
  artifactContentBase64: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  actorId?: string | null;
}

export interface SandboxComplianceSnapshotRecord {
  snapshotId: string;
  experimentId: string;
  experimentVersionId: string | null;
  asOf: string;
  generatedAt: string;
  generatedBy: string | null;
  snapshotHashSha256: string;
  policyVersions: SandboxGovernancePolicyVersionRefs;
  authorizationStatus: SandboxAuthorizationStatus | null;
  requiredCapabilities: ProviderCapabilityRequirement[];
  jurisdictions: SandboxJurisdictionProfileVersionRecord[];
  approvalDocuments: ApprovalDocumentVersionRecord[];
  operatingAreas: ApprovedOperatingAreaRecord[];
  routes: ApprovedRouteRecord[];
  vehicleEnrollments: VehicleEnrollmentRecord[];
}

export interface GenerateSandboxComplianceSnapshotCommand {
  asOf?: string | null;
  actorId?: string | null;
}

// ---------------------------------------------------------------------------
// §3.9 Error-code enum
// ---------------------------------------------------------------------------

// Stable, machine-checkable error codes returned by Phase 2 endpoints. Wired
// into the shared API error envelope by the downstream execution waves.
export const PHASE2_ERROR_CODES = [
  "PHASE2_PROVIDER_CAPABILITY_MISSING",
  "PHASE2_PROVIDER_UNAVAILABLE",
  "PHASE2_COMMAND_IDEMPOTENCY_CONFLICT",
  "PHASE2_COMMAND_REJECTED",
  "PHASE2_SANDBOX_DISPATCH_BLOCKED",
  "PHASE2_RECORDER_UNHEALTHY",
  "PHASE2_ODD_OUT_OF_BOUNDS",
  "PHASE2_SAFETY_OPERATOR_REQUIRED",
  "PHASE2_SAFETY_OPERATOR_UNAVAILABLE",
  "PHASE2_REGULATORY_APPROVAL_MISSING",
  "PHASE2_TELEMETRY_STALE",
  "PHASE2_EVIDENCE_CHECKSUM_MISMATCH",
  "PHASE2_EVIDENCE_CUSTODY_VIOLATION",
  "PHASE2_EVIDENCE_RETENTION_EXPIRED",
  "PHASE2_ACCIDENT_CASE_NOT_FOUND",
  "PHASE2_REGULATORY_REPORT_INVALID_PERIOD",
  "PHASE2_REGULATORY_REPORT_ALREADY_SUBMITTED",
  "PHASE2_SANDBOX_GOVERNANCE_NOT_FOUND",
  "PHASE2_SANDBOX_GOVERNANCE_CONFLICT",
  "PHASE2_SANDBOX_GOVERNANCE_INVALID_EFFECTIVE_RANGE",
  "PHASE2_SANDBOX_GOVERNANCE_INVALID_VERSION_STATE",
] as const;
export type Phase2ErrorCode = (typeof PHASE2_ERROR_CODES)[number];
