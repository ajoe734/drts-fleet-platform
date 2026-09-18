// Partner passenger notification — wire contract, entry binding, order route
// and migration-scope typed failures — SR-PARTNER-NOTIFY-CON-20260917
//
// Source of truth: docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md
// (fixed baseline dev@38a68a79959619faa5a10b9782e77dd7ca41f4c2). This module
// is contract-and-numbering only: it defines the shapes the follow-on
// SR-PARTNER-NOTIFY-ROUTE/ACK/TRANSPORT/NAV/UI/LEGACY/QA tasks implement
// against. It does not implement transport, does not change DI wiring, and
// does not touch webhook-dispatch.service.ts, multi-taxi.module.ts, or any
// other runtime behavior.
//
// Compatibility boundary (do not violate from this module or any consumer):
//   - `ConsumerNotificationOutboxRecord.status` (pending/sending/delivered/
//     failed) and `PASSENGER_PUSH_DELIVERY_RESULTS` in `./phase1-p5-s3-multi-taxi`
//     are unchanged. New semantics ride alongside as separate fields
//     (deliveryTarget/deliveryStage/failureReason/retryDisposition) on the
//     delivery context defined below, never as new outbox/result enum values.
//   - `TenantWebhookEndpoint` (./index) keeps its existing field semantics;
//     entry-level notification governance is a new, separate binding that
//     references an existing endpoint by id, not a second endpoint table.

import type { WebhookEventPayload } from "./index";
import type { ConsumerNotificationOutboxRecord } from "./phase1-p5-s3-multi-taxi";

// ===========================================================================
// §5 Event catalog — internal event names never change; only new external
// (wire) names and a fixed body schema version are added.
// ===========================================================================

/**
 * Reuses `ConsumerNotificationOutboxRecord.eventType` by reference rather
 * than redeclaring the union, so this module cannot silently drift from the
 * outbox contract it must not rename.
 */
export type PartnerPassengerEventType =
  ConsumerNotificationOutboxRecord["eventType"];

export const PARTNER_NOTIFICATION_SCHEMA_VERSION = "1.0" as const;
export type PartnerNotificationSchemaVersion =
  typeof PARTNER_NOTIFICATION_SCHEMA_VERSION;

/** External (wire) event name for each internal event type — passenger.<name>.v1. */
export const PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME = {
  assignment_disclosure_ready: "passenger.assignment_disclosure_ready.v1",
  assignment_replaced: "passenger.assignment_replaced.v1",
  eta_changed: "passenger.eta_changed.v1",
  driver_arrived: "passenger.driver_arrived.v1",
  receipt_ready: "passenger.receipt_ready.v1",
} as const satisfies Record<PartnerPassengerEventType, string>;

export const PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS = [
  "passenger.assignment_disclosure_ready.v1",
  "passenger.assignment_replaced.v1",
  "passenger.eta_changed.v1",
  "passenger.driver_arrived.v1",
  "passenger.receipt_ready.v1",
] as const;
export type PartnerPassengerNotificationExternalEvent =
  (typeof PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS)[number];

/** Binding-test-only event; never tied to a real ride and never pushed to a real resident. */
export const PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT =
  "passenger.notification.test.v1" as const;

export type PartnerPassengerWireEvent =
  | PartnerPassengerNotificationExternalEvent
  | typeof PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT;

/**
 * §5 product-default expiry per event type (not a regulatory threshold).
 * Whichever comes first of `expiresAt` or the endpoint's `maxAttempts` stops
 * further automatic retry.
 */
export const PARTNER_PASSENGER_EVENT_DEFAULT_TTL_SECONDS = {
  assignment_disclosure_ready: 600,
  assignment_replaced: 600,
  eta_changed: 120,
  driver_arrived: 300,
  receipt_ready: 7 * 24 * 60 * 60,
} as const satisfies Record<PartnerPassengerEventType, number>;

// ===========================================================================
// §3.1 Entry notification binding — reuses TenantWebhookEndpoint governance;
// this is the explicit entry -> webhook binding, not a second endpoint table.
// ===========================================================================

export const PARTNER_ENTRY_NOTIFICATION_BINDING_STATES = [
  "test_pending",
  "ready",
  "disabled",
] as const;
export type PartnerEntryNotificationBindingState =
  (typeof PARTNER_ENTRY_NOTIFICATION_BINDING_STATES)[number];

export const PARTNER_ENTRY_NOTIFICATION_BINDING_PURPOSE =
  "passenger_notification" as const;

export const PARTNER_NOTIFICATION_ACKNOWLEDGEMENT_POLICY =
  "durable_partner_acceptance_v1" as const;

/**
 * One entry has at most one primary binding (v1). A caller must verify
 * entry.tenantId === binding.tenantId === webhook.tenantId,
 * entry.partnerId === binding.partnerId, entry active, binding
 * state === "ready", webhook active, and that the outgoing event is in both
 * `eventTypes` and the referenced endpoint's `events` allowlist before
 * dispatch. Listing "every webhook subscribed to this event on the tenant"
 * and fanning out is forbidden — dispatch is always by this binding's
 * `webhookId`, resolved by id, never by a tenant-wide event scan. An
 * ordinary tenant webhook subscription does not implicitly gain
 * `passenger.*` events; only a `ready` binding does.
 */
export interface PartnerEntryNotificationBinding {
  bindingId: string;
  entrySlug: string;
  tenantId: string;
  partnerId: string;
  webhookId: string;
  version: number;
  state: PartnerEntryNotificationBindingState;
  purpose: typeof PARTNER_ENTRY_NOTIFICATION_BINDING_PURPOSE;
  eventTypes: PartnerPassengerEventType[];
  schemaVersion: PartnerNotificationSchemaVersion;
  acknowledgementPolicy: typeof PARTNER_NOTIFICATION_ACKNOWLEDGEMENT_POLICY;
  validatedEndpointFingerprint: string | null;
  validatedAt: string | null;
  updatedAt: string;
}

// ===========================================================================
// §4 Order notification route — frozen "which app / which resident" source,
// written once inside the authenticated handoff transaction that creates the
// order. Never re-derived from a later, possibly stale, session.
// ===========================================================================

export const ORDER_PARTNER_NOTIFICATION_ROUTE_POLICY_VERSION =
  "partner_notification_v1" as const;

/**
 * `drtsPassengerId` and `passengerSubjectRef` are for internal reconciliation
 * only and must never appear in the outbound wire payload (§6). `rideRef`
 * identifies the ride for navigation purposes but must not be usable as a
 * bearer credential. When history cannot be uniquely resolved, no route is
 * created — see `route_missing` / `route_ambiguous` in
 * `PartnerNotificationFailureReason` below; do not guess a recipient from
 * phone/email/tenant/last-remaining-endpoint.
 */
export interface OrderPartnerNotificationRoute {
  orderId: string;
  tenantId: string;
  partnerId: string;
  entrySlug: string;
  partnerUserRef: string;
  drtsPassengerId: string;
  passengerSubjectRef: string;
  identityLinkedAt: string;
  consentBundleVersion: string;
  notificationPolicyVersion: typeof ORDER_PARTNER_NOTIFICATION_ROUTE_POLICY_VERSION;
  rideRef: string;
  createdAt: string;
}

// ===========================================================================
// §10 Navigation — deep link carries only a ride reference, never a
// pre-authenticated token.
// ===========================================================================

export const PARTNER_PASSENGER_NAVIGATION_TYPES = ["ride"] as const;
export type PartnerPassengerNavigationType =
  (typeof PARTNER_PASSENGER_NAVIGATION_TYPES)[number];

export interface PartnerPassengerNotificationNavigation {
  type: PartnerPassengerNavigationType;
  rideRef: string;
}

// ===========================================================================
// §6 Wire payload — allowlisted `data` for the shared WebhookEventPayload
// envelope; the existing serializer converts these camelCase fields to
// snake_case on the wire (schema_version, notification_id, partner_entry_slug,
// recipient.partner_user_ref, ride_ref, event_sequence, assignment_version,
// expires_at, eta.as_of, ...). `data` must be built from this allowlist, never
// by spreading `outbox.payload` directly onto the wire.
// ===========================================================================

export interface PartnerPassengerNotificationEta {
  minutes: number;
  asOf: string;
}

/**
 * First-version prohibited fields (never send): full or masked phone,
 * resident name, unit/room, address, origin/destination, GPS, trace,
 * driverId, license number/image, payment/card/insurance data, raw access
 * token, handoff artifact, cookie, or any VAPID/API/signature secret. Plate
 * and driver name are also withheld in v1 — the passenger's existing
 * permissioned P-5 page carries full detail.
 */
export interface PartnerPassengerNotificationWireData {
  schemaVersion: PartnerNotificationSchemaVersion;
  /** The outboxId this notification was generated from. */
  notificationId: string;
  partnerEntrySlug: string;
  recipient: {
    partnerUserRef: string;
  };
  rideRef: string;
  eventSequence: number;
  assignmentVersion: number | null;
  expiresAt: string;
  message: string;
  navigation: PartnerPassengerNotificationNavigation;
  /** Only present for ETA/assignment events where source data exists. */
  eta?: PartnerPassengerNotificationEta;
}

export type PartnerPassengerNotificationWirePayload =
  WebhookEventPayload<PartnerPassengerNotificationWireData>;

/** `passenger.notification.test.v1` — binding validation only; no ride, no real resident. */
export interface PartnerPassengerNotificationTestWireData {
  schemaVersion: PartnerNotificationSchemaVersion;
  notificationId: string;
  partnerEntrySlug: string;
  message: string;
}

export type PartnerPassengerNotificationTestWirePayload =
  WebhookEventPayload<PartnerPassengerNotificationTestWireData>;

// ===========================================================================
// §7 Delivered — the accepted/duplicate partner acknowledgement, and the
// evidence ladder from "we wrote a row" to "the resident opened it."
// ===========================================================================

export const PARTNER_NOTIFICATION_ACK_STATUSES = [
  "accepted",
  "duplicate",
] as const;
export type PartnerNotificationAckStatus =
  (typeof PARTNER_NOTIFICATION_ACK_STATUSES)[number];

/**
 * The validated shape of a successful partner response: HTTPS 200/201/202
 * whose JSON body's `notification_id`/`delivery_id`/`partner_entry_slug`
 * match the request and whose `status` is accepted or duplicate with a
 * non-empty `receiptId`. 204, an empty body, HTML 200, an unknown schema
 * version, a missing receipt, or a mismatched id are all not a success under
 * this contract (see `partner_ack_invalid` below).
 *
 * `receiptId` must come from the partner's real response body. Synthesizing
 * a value such as `receipt-${outboxId}` is forbidden by this contract —
 * `providerMessageRef` on the resulting delivery context must be traceable
 * to this exact field, never fabricated.
 */
export interface PartnerNotificationAcceptedAck {
  notificationId: string;
  deliveryId: string;
  partnerEntrySlug: string;
  status: PartnerNotificationAckStatus;
  receiptId: string;
}

/** §7 evidence ladder. Reaching a level never implies the next one. */
export const PARTNER_NOTIFICATION_DELIVERY_STAGES = [
  "outbox_persisted",
  "partner_accepted",
  "provider_accepted",
  "device_received",
  "opened",
] as const;
export type PartnerNotificationDeliveryStage =
  (typeof PARTNER_NOTIFICATION_DELIVERY_STAGES)[number];

/**
 * First version has no device callback: a producer may only ever reach
 * `partner_accepted` via this transport. `provider_accepted`/
 * `device_received`/`opened` are reserved for a future, separately
 * versioned callback task and must not be set by this version's code paths.
 */
export const PARTNER_NOTIFICATION_DELIVERY_TARGETS = [
  "partner_endpoint",
] as const;
export type PartnerNotificationDeliveryTarget =
  (typeof PARTNER_NOTIFICATION_DELIVERY_TARGETS)[number];

/**
 * First version has no device callback; `unknown` is the only value a
 * producer may set until a future, separately versioned task adds a
 * callback-derived status. Do not add `delivered`/`opened` values
 * speculatively — that decision belongs to the callback task itself.
 */
export const PARTNER_NOTIFICATION_DOWNSTREAM_STATUSES = ["unknown"] as const;
export type PartnerNotificationDownstreamStatus =
  (typeof PARTNER_NOTIFICATION_DOWNSTREAM_STATUSES)[number];

// ===========================================================================
// §9 Typed failure & retry disposition — compatible with the existing outbox
// enum: outbox.status/result stay pending/sending/delivered/failed and
// delivered/provider_not_configured/provider_error. These fields ride
// alongside on the delivery context, never as new outbox/result values.
// ===========================================================================

export const PARTNER_NOTIFICATION_RETRY_DISPOSITIONS = [
  "automatic",
  "configuration_blocked",
  "manual_only",
  "terminal",
  "none",
] as const;
export type PartnerNotificationRetryDisposition =
  (typeof PARTNER_NOTIFICATION_RETRY_DISPOSITIONS)[number];

export const PARTNER_NOTIFICATION_FAILURE_REASONS = [
  "configuration_blocked",
  "endpoint_disabled",
  "route_missing",
  "route_ambiguous",
  "owner_changed",
  "recipient_revoked",
  "provider_transient_error",
  "credential_rejected",
  "endpoint_unavailable",
  "partner_ack_invalid",
  "notification_expired",
  "notification_obsolete",
  "notification_superseded",
] as const;
export type PartnerNotificationFailureReason =
  (typeof PARTNER_NOTIFICATION_FAILURE_REASONS)[number];

/**
 * §9 table, exactly: which retry disposition each failure reason carries.
 * A worker must select on outbox status, nextAttemptAt, retryDisposition and
 * expiresAt together — reading only status would let a generic worker
 * infinitely re-scan configuration_blocked/manual_only/terminal rows.
 */
export const PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS = {
  configuration_blocked: "configuration_blocked",
  endpoint_disabled: "configuration_blocked",
  route_missing: "manual_only",
  route_ambiguous: "manual_only",
  owner_changed: "manual_only",
  recipient_revoked: "terminal",
  provider_transient_error: "automatic",
  credential_rejected: "configuration_blocked",
  endpoint_unavailable: "configuration_blocked",
  partner_ack_invalid: "manual_only",
  notification_expired: "terminal",
  notification_obsolete: "terminal",
  notification_superseded: "terminal",
} as const satisfies Record<
  PartnerNotificationFailureReason,
  PartnerNotificationRetryDisposition
>;

/** Returned by the (not-yet-implemented) single-attempt dispatch façade — §8 point 5. */
export interface PartnerNotificationTypedFailure {
  failureReason: PartnerNotificationFailureReason;
  retryDisposition: PartnerNotificationRetryDisposition;
  suggestedNextAttemptAt: string | null;
  detail?: string;
}

export type PartnerNotificationDispatchOutcome =
  | { kind: "accepted"; ack: PartnerNotificationAcceptedAck }
  | { kind: "failed"; failure: PartnerNotificationTypedFailure };

// ===========================================================================
// §4/§11 Immutable delivery context — one row per outbox row, written before
// the first send attempt. A retry must reuse this exact wire payload, hash
// and event sequence rather than re-resolving the route or regenerating
// content.
// ===========================================================================

export interface PartnerNotificationDeliveryContext {
  outboxId: string;
  deliveryId: string;
  orderId: string;
  entrySlug: string;
  tenantId: string;
  partnerId: string;
  bindingId: string;
  bindingVersion: number;
  webhookId: string;
  endpointFingerprint: string;
  wirePayload: PartnerPassengerNotificationWirePayload;
  wirePayloadHash: string;
  eventSequence: number;
  expiresAt: string;
  deliveryTarget: PartnerNotificationDeliveryTarget;
  /** Null until a completed attempt sets it; never optimistically pre-set. */
  deliveryStage: PartnerNotificationDeliveryStage | null;
  retryDisposition: PartnerNotificationRetryDisposition | null;
  failureReason: PartnerNotificationFailureReason | null;
  receiptId: string | null;
  downstreamStatus: PartnerNotificationDownstreamStatus;
  createdAt: string;
  /** Set only when this transport's own ack validation (§7) has completed, never the attempt's start time or the partner's self-reported time. */
  deliveredAt: string | null;
}

// ===========================================================================
// §8 Platform-fixed dispatch limits (partner_ack_v1 opt-in mode only; an
// ordinary tenant webhook keeps its existing status-only behavior).
// ===========================================================================

export const PARTNER_NOTIFICATION_ATTEMPT_TIMEOUT_MS = 10_000;
export const PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES = 4096;
