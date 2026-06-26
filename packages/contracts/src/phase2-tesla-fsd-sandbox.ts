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

export const TESLA_PASSENGER_SERVICE_STATUSES = [
  "eligible",
  "gated",
] as const;
export type TeslaPassengerServiceStatus =
  (typeof TESLA_PASSENGER_SERVICE_STATUSES)[number];

export const TESLA_PASSENGER_SERVICE_REASON_CODES = [
  "required-capability-missing",
] as const;
export type TeslaPassengerServiceReasonCode =
  (typeof TESLA_PASSENGER_SERVICE_REASON_CODES)[number];

// A Tesla provider's latest capability advertisement persisted per VIN so
// passenger-service and sandbox-dispatch gates can evaluate a stable snapshot
// without live-calling the upstream provider on every request.
export interface TeslaRegulatoryCapabilityProfile {
  profileId: string;
  vehicleId: string | null;
  vin: string;
  externalVehicleRef: string;
  providerCode: string;
  providerSchemaVersion: string;
  checkedAt: string;

  requiredCapabilities: Phase2ProviderCapability[];
  capabilities: ProviderCapabilityDescriptor[];
  missingRequiredCapabilities: Phase2ProviderCapability[];

  passengerServiceStatus: TeslaPassengerServiceStatus;
  passengerServiceReasonCode: TeslaPassengerServiceReasonCode | null;
  reasonCodeDictionaryVersion: string;

  source: Phase2SourceMetadata;
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
export type SandboxDispatchOutcome =
  (typeof SANDBOX_DISPATCH_OUTCOMES)[number];

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

export interface TeslaRegulatoryReasonCodeEntry {
  entryId: string;
  providerCode: string;
  dictionaryVersion: string;
  reasonCode: string;
  displayLabel: string | null;
  description: string | null;
  relatedEventTypes: TeslaRegulatoryEventType[];
  source: Phase2SourceMetadata;
}

export interface TeslaRegulatoryReasonCodeDictionary {
  dictionaryId: string;
  providerCode: string;
  dictionaryVersion: string;
  effectiveFrom: string;
  publishedAt: string;
  entries: TeslaRegulatoryReasonCodeEntry[];
  source: Phase2SourceMetadata;
}

export const TESLA_AUTONOMY_STATES = [
  "manual",
  "fsd_standby",
  "fsd_engaged",
  "remote_assist",
  "minimal_risk_condition",
  "unknown",
] as const;
export type TeslaAutonomyState = (typeof TESLA_AUTONOMY_STATES)[number];

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

export interface TeslaFsdSession {
  sessionId: string;
  vehicleId: string;
  vin: string;
  externalVehicleRef: string;
  startedAt: string;
  endedAt: string | null;
  startedByEventId: string | null;
  endedByEventId: string | null;
  currentState: TeslaAutonomyState;
  disengagementCount: number;
  interventionCount: number;
  source: Phase2SourceMetadata;
}

export interface TeslaAutonomyTransition {
  transitionId: string;
  sessionId: string | null;
  vehicleId: string;
  vin: string;
  occurredAt: string;
  fromState: TeslaAutonomyState;
  toState: TeslaAutonomyState;
  triggeringEventId: string | null;
  providerReasonCode: string | null;
  source: Phase2SourceMetadata;
}

export interface TeslaSessionSummary {
  summaryId: string;
  sessionId: string;
  vehicleId: string;
  vin: string;
  generatedAt: string;
  fsdEngagedSeconds: number;
  disengagementCount: number;
  interventionCount: number;
  nearMissCount: number;
  collisionCount: number;
  source: Phase2SourceMetadata;
}

export const TESLA_INCIDENT_EVIDENCE_REFERENCE_TYPES = [
  "video_clip",
  "sensor_log",
  "event_log",
  "telemetry_export",
] as const;
export type TeslaIncidentEvidenceReferenceType =
  (typeof TESLA_INCIDENT_EVIDENCE_REFERENCE_TYPES)[number];

export interface TeslaIncidentEvidenceReference {
  evidenceReferenceId: string;
  vehicleId: string;
  vin: string;
  sessionId: string | null;
  triggeringEventId: string | null;
  evidenceManifestId: string | null;
  artifactId: string | null;
  referenceType: TeslaIncidentEvidenceReferenceType;
  recordedAt: string;
  notes: string | null;
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
