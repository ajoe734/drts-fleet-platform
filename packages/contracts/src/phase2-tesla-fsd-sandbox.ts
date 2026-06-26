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
  "open",
  "evidence_pending",
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

export interface AccidentCaseRecord {
  caseId: string;
  vehicleId: string;
  orderId: string | null;
  triggeringEventId: string | null;

  status: AccidentCaseStatus;
  severity: AccidentSeverity;

  occurredAt: string;
  reportedAt: string;
  reportedBy: string;

  evidenceManifestId: string | null;
  regulatoryReportId: string | null;

  summary: string | null;
  closedAt: string | null;
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
] as const;
export type Phase2ErrorCode = (typeof PHASE2_ERROR_CODES)[number];
