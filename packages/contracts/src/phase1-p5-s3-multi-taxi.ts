// Phase 1 · P-5 / S-3 · multi_taxi_direct contracts.
//
// Source of truth:
//   docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/
//     00_source_specs_index.md
//     03_gap_closure_implementation_plan.md
//
// Foundation anchors only: this module declares the contract shapes so the
// downstream P5-* / S3-* execution waves have a stable dependency surface.
// Service logic, persistence, and API wiring are implemented by those waves.
//
// Naming reconciliation with the live schema (see plan §R):
//   - the canonical vehicle disclosure profile uses `make`; the fleet supply
//     draft column is `brand` — mapping happens at the ingestion service.
//   - persistence schemas: reg.* (not registry.*), mobility.*, reporting.*,
//     and a new safety.* schema for S-3.

import type { ResolvedAddressPayload } from "./index";

// ===========================================================================
// §2 Runtime profile
// ===========================================================================

export const PASSENGER_SERVICE_RUNTIME_PROFILE_CODES = [
  "multi_taxi_direct",
] as const;
export type PassengerServiceRuntimeProfileCode =
  (typeof PASSENGER_SERVICE_RUNTIME_PROFILE_CODES)[number];

export const MULTI_TAXI_FORBIDDEN_CAPABILITIES = [
  "forwarded_order_ui",
  "external_platform_badge",
  "sandbox_disclosure",
  "av_fulfillment",
  "safety_operator",
  "remote_takeover",
] as const;
export type MultiTaxiForbiddenCapability =
  (typeof MULTI_TAXI_FORBIDDEN_CAPABILITIES)[number];

export interface PassengerServiceRuntimeProfile {
  code: PassengerServiceRuntimeProfileCode;
  displayName: string;
  orderDomains: Array<"owned">;
  allowedServiceProducts: Array<"taxi_reservation">;
  reservationOnly: true;
  passengerSurface: "direct_ride";
  driverSurface: "multi_taxi_driver";
  opsSurface: "multi_taxi_ops";
  forbiddenCapabilities: MultiTaxiForbiddenCapability[];
}

// ===========================================================================
// §3.1 Vehicle passenger disclosure profile
// ===========================================================================

export type VehiclePassengerDisclosureStatus =
  | "complete"
  | "incomplete"
  | "suspended";

export interface VehiclePassengerDisclosureProfile {
  vehicleId: string;
  make: string;
  model: string;
  modelYear: number;
  doorCount: number;
  color: string | null;

  status: VehiclePassengerDisclosureStatus;
  missingFieldCodes: string[];

  verifiedByActorId: string | null;
  verifiedAt: string | null;
  sourceSubmissionId: string | null;
  version: number;
  updatedAt: string;
}

// ===========================================================================
// §3.2 Driver public registration credential
// ===========================================================================

export type TaxiDriverRegistrationStatus =
  | "verified_active"
  | "expired"
  | "suspended"
  | "revoked"
  | "unverified"
  | "missing";

export interface DriverPublicRegistrationCredential {
  driverId: string;
  registrationNo: string | null;
  registrationArea: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  status: TaxiDriverRegistrationStatus;
  maskedDisplay: string;

  verifiedByActorId: string | null;
  verifiedAt: string | null;
  sourceSubmissionId: string | null;
  version: number;
  updatedAt: string;
}

// ===========================================================================
// §4 Driver rating authority
// ===========================================================================

export interface PassengerTripRatingRecord {
  ratingId: string;
  orderId: string;
  tripId: string;
  driverId: string;
  passengerSubjectRef: string;
  score: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  comment: string | null;
  status: "active" | "invalidated" | "under_review";
  submittedAt: string;
  updatedAt: string;
}

export type DriverRatingDisplayState = "rated" | "new_driver" | "unavailable";

export interface DriverRatingSummary {
  driverId: string;
  displayState: DriverRatingDisplayState;
  averageRating: number | null;
  ratingCount: number;
  lastRatedAt: string | null;
  aggregateVersion: number;
  calculatedAt: string;
}

// ===========================================================================
// §5 Eligibility hard reasons
// ===========================================================================

export const PASSENGER_DISCLOSURE_BLOCK_REASONS = [
  "P5_VEHICLE_MAKE_MISSING",
  "P5_VEHICLE_MODEL_MISSING",
  "P5_VEHICLE_YEAR_MISSING",
  "P5_VEHICLE_DOOR_COUNT_MISSING",
  "P5_DRIVER_REGISTRATION_MISSING",
  "P5_DRIVER_REGISTRATION_EXPIRED",
  "P5_DRIVER_REGISTRATION_UNVERIFIED",
  "P5_RATING_STATE_UNINITIALIZED",
  "P5_RUNTIME_PROFILE_MISMATCH",
] as const;
export type PassengerDisclosureBlockReason =
  (typeof PASSENGER_DISCLOSURE_BLOCK_REASONS)[number];

// ===========================================================================
// §7 Route / fare disclosure snapshot
// ===========================================================================

export const FARE_QUOTE_ANOMALIES = [
  "quote_provider_unavailable",
  "quote_out_of_range",
  "route_unresolved",
  "fare_policy_missing",
  "calculation_mismatch",
] as const;
export type FareQuoteAnomaly = (typeof FARE_QUOTE_ANOMALIES)[number];

export interface RouteFareDisclosureSnapshot {
  routeSnapshotId: string;
  quoteSnapshotId: string;
  orderId: string;

  pickup: ResolvedAddressPayload;
  dropoff: ResolvedAddressPayload;

  estimatedDistanceMeters: number | null;
  estimatedDurationSeconds: number | null;
  encodedPolyline: string | null;

  chargingMode: "meter_estimate" | "fixed_quote";
  estimatedFareMinor: number | null;
  payableFareMinor: number | null;
  currency: "NTD";

  farePolicyId: string;
  farePolicyVersion: string;
  fareChangeRuleId: string;
  fareChangeRuleVersion: string;
  fareChangeRuleDisplayText: string;

  passengerConfirmedAt: string | null;
  generatedAt: string;
}

// ===========================================================================
// §6 Immutable assignment disclosure snapshot
// ===========================================================================

export interface PassengerDispatchDisclosureSnapshot {
  snapshotId: string;
  runtimeProfileCode: "multi_taxi_direct";

  orderId: string;
  bookingId: string | null;
  dispatchJobId: string;
  assignmentId: string;
  assignmentVersion: number;

  vehicle: {
    vehicleId: string;
    make: string;
    model: string;
    plateNo: string;
    modelYear: number;
    doorCount: number;
    color: string | null;
    profileVersion: number;
  };

  driver: {
    driverId: string;
    displayName: string | null;
    registrationMaskedDisplay: string;
    // Pinned to the literal per source spec §6: a disclosure snapshot is only
    // created inside the assignment transaction, which the §5 hard gate lets
    // through only for a verified_active credential. Widening this would let a
    // snapshot record an expired/unverified driver and break DoD #3.
    registrationStatus: "verified_active";
    registrationEffectiveUntil: string;
    credentialVersion: number;
  };

  rating: {
    displayState: "rated" | "new_driver";
    averageRating: number | null;
    ratingCount: number;
    aggregateVersion: number;
  };

  eta: {
    minutes: number | null;
    calculatedAt: string | null;
    locationFreshness: "fresh" | "stale" | "low_accuracy" | "missing";
  };

  routeFare: RouteFareDisclosureSnapshot;

  createdAt: string;
  supersededAt: string | null;
}

// ===========================================================================
// §8 Passenger ride authority
// ===========================================================================

export const PASSENGER_RIDE_TOKEN_SCOPES = [
  "ride:read",
  "ride:cancel",
  "ride:rate",
  "ride:contact",
  "receipt:read",
] as const;
export type PassengerRideTokenScope =
  (typeof PASSENGER_RIDE_TOKEN_SCOPES)[number];

export interface PassengerRideAccessToken {
  tokenId: string;
  orderId: string;
  passengerSubjectRef: string;
  scopes: PassengerRideTokenScope[];
  expiresAt: string;
  revokedAt: string | null;
}

export const PASSENGER_RIDE_SSE_EVENTS = [
  "assignment_disclosure_ready",
  "assignment_replaced",
  "driver_location_updated",
  "eta_changed",
  "driver_arrived",
  "trip_started",
  "trip_completed",
  "trip_cancelled",
  "receipt_ready",
] as const;
export type PassengerRideSseEvent =
  (typeof PASSENGER_RIDE_SSE_EVENTS)[number];

// ===========================================================================
// §9 Consumer notification outbox
// ===========================================================================

export interface ConsumerNotificationOutboxRecord {
  outboxId: string;
  orderId: string;
  passengerSubjectRef: string;
  eventType:
    | "assignment_disclosure_ready"
    | "assignment_replaced"
    | "eta_changed"
    | "driver_arrived"
    | "receipt_ready";
  assignmentVersion: number | null;
  payload: Record<string, unknown>;
  status: "pending" | "sending" | "delivered" | "failed";
  attemptCount: number;
  nextAttemptAt: string;
  createdAt: string;
  deliveredAt: string | null;
}

// ===========================================================================
// §12 Passenger electronic payment (state only; provider deferred)
// ===========================================================================

export type PassengerPaymentStatus =
  | "not_selected"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "manual_recovery";

// ===========================================================================
// §14 Two-year multi-taxi operational record
// ===========================================================================

export interface MultiTaxiTripOperationalRecord {
  recordId: string;
  orderId: string;
  tripId: string;

  vehicleId: string;
  plateNo: string;

  reservedAt: string;
  pickupAt: string | null;
  dropoffAt: string | null;

  route: {
    encodedPolyline: string | null;
    pointCount: number;
    distanceMeters: number | null;
    durationSeconds: number | null;
    source: "driver_gps" | "provider_route" | "mixed";
  };

  payableFareMinor: number;
  actualFareMinor: number;
  tollMinor: number;
  currency: "NTD";

  farePolicyVersion: string;
  chargingMode: "meter" | "platform_quote";

  generatedAt: string;
  retainUntil: string;
}

// ===========================================================================
// §15 Public fare version
// ===========================================================================

export interface MultiTaxiPublicFareVersion {
  fareVersionId: string;
  displayName: string;
  status: "draft" | "filed" | "active" | "retired";
  effectiveFrom: string;
  effectiveUntil: string | null;
  publicSummary: string;
  authorityFilingRef: string | null;
}

// ===========================================================================
// §16 S-3 Driver SOS domain
// ===========================================================================

export const DRIVER_SOS_STATUSES = [
  "local_triggered",
  "queued_offline",
  "submitted",
  "duty_alerted",
  "acknowledged",
  "false_alarm_dismissed",
  "investigating",
  "resolved",
  "closed",
] as const;
export type DriverSosStatus = (typeof DRIVER_SOS_STATUSES)[number];

export const DRIVER_SOS_EVENT_TYPES = [
  "traffic_accident",
  "security_incident",
  "passenger_medical",
  "other",
] as const;
export type DriverSosEventType = (typeof DRIVER_SOS_EVENT_TYPES)[number];

export type DriverSosSeverity = "major" | "normal";

export interface DriverSosLocationSnapshot {
  lat: number;
  lng: number;
  accuracyM: number | null;
  recordedAt: string;
  reverseGeocodedAddress: string | null;
  geocodeProvider: string | null;
}

export interface DriverSosEventRecord {
  sosEventId: string;
  clientEventId: string;
  eventNo: string;
  incidentId: string | null;

  driverId: string;
  vehicleId: string | null;
  plateNo: string | null;
  orderId: string | null;
  taskId: string | null;

  status: DriverSosStatus;
  eventType: DriverSosEventType | null;
  severity: DriverSosSeverity | null;
  description: string | null;

  location: DriverSosLocationSnapshot | null;

  originalTriggeredAt: string;
  serverReceivedAt: string | null;
  offlineAtTrigger: boolean;

  falseAlarm: {
    dismissed: boolean;
    dismissedAt: string | null;
    dismissedByDriverId: string | null;
    note: string | null;
  };

  dutyAcknowledgement: {
    acknowledgedAt: string | null;
    acknowledgedByActorId: string | null;
  };

  createdAt: string;
  updatedAt: string;
}

export interface SubmitDriverSosEventCommand {
  clientEventId: string;
  driverId?: string | null;
  vehicleId?: string | null;
  plateNo?: string | null;
  orderId?: string | null;
  taskId?: string | null;
  eventType?: DriverSosEventType | null;
  severity?: DriverSosSeverity | null;
  description?: string | null;
  location?: DriverSosLocationSnapshot | null;
  originalTriggeredAt: string;
  offlineAtTrigger: boolean;
}

export const DRIVER_SOS_TIMELINE_EVENTS = [
  "sos_local_triggered",
  "fleet_report_confirmed",
  "server_received",
  "incident_created",
  "duty_alert_dispatched",
  "duty_acknowledged",
  "supplement_added",
  "attachment_uploaded",
  "false_alarm_dismissed",
  "investigation_started",
  "resolved",
  "closed",
] as const;
export type DriverSosTimelineEvent =
  (typeof DRIVER_SOS_TIMELINE_EVENTS)[number];

export type DriverSosTimelineActorType = "system" | "driver" | "ops";

export interface DriverSosTimelineEntry {
  timelineId: string;
  sosEventId: string;
  eventType: DriverSosTimelineEvent;
  actorType: DriverSosTimelineActorType;
  actorId: string | null;
  occurredAt: string;
  recordedAt: string;
  payload: Record<string, unknown>;
}

export const DRIVER_SOS_URGENT_ALERT_OUTBOX_STATUSES = [
  "pending",
  "sending",
  "delivered",
  "failed",
] as const;
export type DriverSosUrgentAlertOutboxStatus =
  (typeof DRIVER_SOS_URGENT_ALERT_OUTBOX_STATUSES)[number];

export interface DriverSosUrgentAlertOutboxRecord {
  outboxId: string;
  sosEventId: string;
  incidentId: string;
  driverId: string;
  eventNo: string;
  status: DriverSosUrgentAlertOutboxStatus;
  attemptCount: number;
  nextAttemptAt: string;
  payload: Record<string, unknown>;
  createdAt: string;
  deliveredAt: string | null;
}

export interface DriverSosSubmissionReceipt {
  sosEventId: string;
  incidentId: string;
  clientEventId: string;
  eventNo: string;
  duplicate: boolean;
  serverReceivedAt: string;
}

export interface SubmitDriverSosEventResult {
  event: DriverSosEventRecord;
  receipt: DriverSosSubmissionReceipt;
}

// §20 Driver-app offline outbox item (client durable state)
export interface PendingSosOutboxItem {
  clientEventId: string;
  originalTriggeredAt: string;
  payload: Record<string, unknown>;
  attachmentLocalUris: string[];
  state:
    | "pending"
    | "sending"
    | "submitted"
    | "attachment_pending"
    | "complete"
    | "failed_retryable";
  attemptCount: number;
  nextAttemptAt: string;
}

// §24.2 Ops duty acknowledgement (first-writer-wins)
export interface SosDutyAcknowledgement {
  sosEventId: string;
  acknowledgedByActorId: string;
  acknowledgedAt: string;
  note: string | null;
}
