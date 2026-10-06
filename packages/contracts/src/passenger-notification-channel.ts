// Passenger notification channel routing and dormant first-party push
// receiver — PUSH-CHANNEL-SD-20261006
//
// Source of truth: docs/02-architecture/passenger-notification-channel-routing-20261006.md
// and docs/01-decisions/SD-DP-20261006-001-passenger-notification-channel-routing.md
// (fixed baseline dev@446228cbc771a4ced774126a7d4aaddea4db73e6). This module is
// contract-and-numbering only, same precedent as SR-PARTNER-NOTIFY-CON-20260917's
// ./partner-passenger-notification: it defines the shapes the follow-on
// PUSH-FIRST-PARTY-REGISTRY/CHANNEL-ROUTER/FIRST-PARTY-FCM/CHANNEL-PG-QA tasks
// implement against. It does not implement the channel router, the device
// registry service, the FCM transport, or any HTTP endpoint, and does not
// change DI wiring or any existing partner-notification file.
//
// Compatibility boundary (do not violate from this module or any consumer):
//   - Nothing in `./partner-passenger-notification` is renamed, extended, or
//     edited: `PARTNER_NOTIFICATION_FAILURE_REASONS`,
//     `PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS`,
//     `OrderPartnerNotificationRoute`, and the partner delivery-stage/target
//     constants all stay exactly as SR-PARTNER-NOTIFY-CON-20260917 left them.
//     This module only imports their *types* to build a union for the
//     delivery layer (D2/D7 of the design doc).
//   - `ConsumerNotificationOutboxRecord.status`/result enums in
//     `./phase1-p5-s3-multi-taxi` are unchanged. The new first-party failure
//     reasons, retry disposition, delivery target and delivery stage ride
//     alongside on a first-party-specific delivery context, never as new
//     outbox/result enum values.
//   - D4/D5's first-party device registry and order route tables have no
//     caller yet: no first-party passenger identity exists to populate them
//     (SD-DP-20260422-001 is still in force). `PASSENGER_PUSH_FIRST_PARTY_ENABLED`
//     stays false until a later, separately versioned task changes that.

import type {
  OrderPartnerNotificationRoute,
  PartnerNotificationFailureReason,
  PartnerNotificationRetryDisposition,
  PartnerPassengerNotificationExternalEvent,
} from "./partner-passenger-notification";

// ===========================================================================
// D1 — Channel constant. "No channel" is not a member of this union; it is
// the state where neither route snapshot below (D2) exists for an order.
// ===========================================================================

export const PASSENGER_NOTIFICATION_CHANNELS = [
  "partner_webhook",
  "first_party_app",
] as const;
export type PassengerNotificationChannel =
  (typeof PASSENGER_NOTIFICATION_CHANNELS)[number];

// ===========================================================================
// D5 — First-party order notification route. Frozen at order-creation time
// from a server-trusted first-party passenger session, mirroring
// `OrderPartnerNotificationRoute`'s shape but with first-party-specific
// identity fields. No caller exists yet (D8): this is a writer-side shape
// with nothing wired to call it.
// ===========================================================================

export const FIRST_PARTY_NOTIFICATION_ROUTE_POLICY_VERSION =
  "first_party_notification_v1" as const;

/**
 * `passengerSubjectRef` is for internal reconciliation only and must never
 * appear in the outbound wire payload, same boundary as
 * `OrderPartnerNotificationRoute.passengerSubjectRef`. `rideRef` must not be
 * usable as a bearer credential.
 */
export interface OrderFirstPartyNotificationRoute {
  orderId: string;
  tenantId: string;
  drtsPassengerId: string;
  passengerSubjectRef: string;
  appId: string;
  notificationPolicyVersion: typeof FIRST_PARTY_NOTIFICATION_ROUTE_POLICY_VERSION;
  consentVersion: string;
  rideRef: string;
  createdAt: string;
}

/**
 * D2 — the two route snapshots are mutually exclusive per order. A router
 * finding both for the same `orderId` must report `route_ambiguous`
 * (manual_only) and send on neither; this discriminated union exists so a
 * caller can only ever hold one resolved route at a time, never both.
 */
export type PassengerNotificationChannelRoute =
  | { channel: "partner_webhook"; route: OrderPartnerNotificationRoute }
  | { channel: "first_party_app"; route: OrderFirstPartyNotificationRoute };

// ===========================================================================
// D4 — First-party device registry. Parallel to, and independent from, the
// existing single-device `PassengerDeviceResolver` in
// apps/api/src/modules/multi-taxi/passenger-push.adapter.ts (Web Push,
// retained unmodified). Mirrors the audit shape of
// `iam.driver_device_bindings` (infra/migrations/V0078__driver_device_session_persistence.sql):
// a server-issued id, a hashed token for lookups, and a status-driven
// lifecycle. Raw tokens are never logged and never returned by any API —
// only `deviceId` or the first 8 characters of `tokenSha256` may appear in a
// log line.
// ===========================================================================

export const PASSENGER_PUSH_DEVICE_PLATFORMS = ["ios", "android"] as const;
export type PassengerPushDevicePlatform =
  (typeof PASSENGER_PUSH_DEVICE_PLATFORMS)[number];

/** Fixed for v1; leaves room for a future provider without a union change at every call site. */
export const PASSENGER_PUSH_DEVICE_PROVIDERS = ["fcm_v1"] as const;
export type PassengerPushDeviceProvider =
  (typeof PASSENGER_PUSH_DEVICE_PROVIDERS)[number];

export const PASSENGER_PUSH_DEVICE_STATUSES = [
  "active",
  "revoked",
  "invalid",
] as const;
export type PassengerPushDeviceStatus =
  (typeof PASSENGER_PUSH_DEVICE_STATUSES)[number];

/**
 * Lifecycle rules (D4): re-registering an existing `tokenSha256` under a new
 * `drtsPassengerId` revokes the prior binding rather than overwriting it in
 * place; a token rotation creates a new `deviceId` with the old one revoked
 * (content-identity immutable, same precedent as the remittance-proof
 * content fields); logout revokes; a provider-reported invalid token sets
 * `invalid`; 60 days without `lastSeenAt` makes a device unusable for
 * selection without deleting it; a passenger exceeding 10 active devices
 * revokes the least-recently-seen one.
 */
export interface PassengerPushDeviceRecord {
  deviceId: string;
  drtsPassengerId: string;
  platform: PassengerPushDevicePlatform;
  provider: PassengerPushDeviceProvider;
  appId: string;
  appVersion: string;
  /** First 8 characters only are safe to log; the full value must never appear in a log line. */
  tokenSha256: string;
  status: PassengerPushDeviceStatus;
  statusReason: string | null;
  notificationConsentVersion: string;
  registeredAt: string;
  lastSeenAt: string | null;
  invalidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resolves every `active` device for a passenger (a passenger may have
 * several logged-in devices at once) — distinct from, and not a replacement
 * for, the existing single-device `PassengerDeviceResolver.resolveDevice()`
 * used by the Web Push adapter path.
 */
export interface FirstPartyPassengerPushDeviceResolver {
  resolveActiveDevices(
    drtsPassengerId: string,
  ): Promise<PassengerPushDeviceRecord[]> | PassengerPushDeviceRecord[];
}

/**
 * D4 — future HTTP registration contract, not implemented this wave: no
 * first-party passenger session exists yet to authorize it
 * (SD-DP-20260422-001). Recorded here so `PUSH-FIRST-PARTY-REGISTRY-20261006`
 * has a pinned shape to implement against once a first-party session exists.
 */
export interface RegisterPassengerPushDeviceCommand {
  platform: PassengerPushDevicePlatform;
  provider: PassengerPushDeviceProvider;
  appId: string;
  appVersion: string;
  token: string;
  notificationConsentVersion: string;
}

// ===========================================================================
// D6 — First-party delivery semantics: target, evidence-ladder stage, and
// the fixed retry-policy snapshot. Mirrors
// `PARTNER_NOTIFICATION_DELIVERY_TARGETS`/`_STAGES` in
// `./partner-passenger-notification`, but as its own independent constant —
// the two channels are different transports with their own evidence ladder
// and policy *parameters*. This is not a second claim/fence/retry-timer
// owner: per D7, `ops.consumer_notification_outbox` stays the sole
// claim/fence/retry-timer owner for both channels; only the parameter
// values (evidence stages, maxAttempts/backoff) differ by channel.
// ===========================================================================

/**
 * First version has no APNs-direct path and no multicast (FCM HTTP v1 sends
 * one request per device token). `first_party_device` is the only target —
 * reserved as a union for symmetry with the partner contract, not because a
 * second first-party target is expected soon.
 */
export const FIRST_PARTY_PUSH_DELIVERY_TARGETS = [
  "first_party_device",
] as const;
export type FirstPartyPushDeliveryTarget =
  (typeof FIRST_PARTY_PUSH_DELIVERY_TARGETS)[number];

/**
 * Evidence ladder for the first-party transport. There is no
 * `partner_accepted` rung (no partner intermediary); `provider_accepted`
 * means FCM returned 200 with a message name. First version's code paths may
 * only ever write `outbox_persisted` or `provider_accepted` —
 * `device_received`/`opened` are reserved for a future, separately
 * versioned device-callback task and must not be written speculatively,
 * same boundary as the partner contract's own reserved rungs.
 */
export const FIRST_PARTY_PUSH_DELIVERY_STAGES = [
  "outbox_persisted",
  "provider_accepted",
  "device_received",
  "opened",
] as const;
export type FirstPartyPushDeliveryStage =
  (typeof FIRST_PARTY_PUSH_DELIVERY_STAGES)[number];

/**
 * D6 fixed retry-policy *parameter* snapshot — independent of the partner
 * channel's own endpoint-approved policy values (`01_system_sa_sd.md` §8).
 * This is only a different set of numbers (maxAttempts/backoff) a worker
 * looks up per channel; both channels' actual scheduling, claiming and
 * timing still run through the single outbox-owned claim/fence (D7) — this
 * constant must never be used to drive a second, channel-specific timer.
 */
export const FIRST_PARTY_PUSH_RETRY_POLICY = {
  maxAttempts: 5,
  initialDelaySeconds: 30,
  backoffMultiplier: 2,
  maxDelaySeconds: 600,
} as const;

// ===========================================================================
// D3/D6 — New failure reasons this wave introduces, and their retry
// disposition. `retryDisposition` values are drawn from the same union the
// partner contract already defines (automatic/configuration_blocked/
// manual_only/terminal/none) — that union is generic dispatch vocabulary,
// not partner-specific, so it is reused by type reference rather than
// redeclared.
// ===========================================================================

export const FIRST_PARTY_PUSH_FAILURE_REASONS = [
  /** D3 — no partner_webhook and no first_party_app route snapshot exists for this order. By design, not a fault. */
  "no_notification_channel",
  /** D6 — every device for the passenger is `invalid`/absent, or none was ever registered. */
  "no_active_device",
  /** D6 — FCM 401 / unexpected 403 / THIRD_PARTY_AUTH_ERROR; distinct from a per-device token rejection. */
  "credential_rejected",
  /** D6 — `PASSENGER_PUSH_FIRST_PARTY_ENABLED` is false, or `PASSENGER_PUSH_FCM_PROJECT_ID` is missing. */
  "configuration_blocked",
  /** D6 — FCM QUOTA_EXCEEDED(429)/UNAVAILABLE(503)/INTERNAL(500)/timeout. */
  "provider_transient_error",
] as const;
export type FirstPartyPushFailureReason =
  (typeof FIRST_PARTY_PUSH_FAILURE_REASONS)[number];

/**
 * D3/D6 table, exactly: which retry disposition each new failure reason
 * carries. `no_notification_channel` is `none` — distinct from `terminal`:
 * it is never meant to be delivered in the first place, so it must not be
 * surfaced as a stalled delivery or counted in a failure alert (D3).
 */
export const FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS = {
  no_notification_channel: "none",
  no_active_device: "terminal",
  credential_rejected: "configuration_blocked",
  configuration_blocked: "configuration_blocked",
  provider_transient_error: "automatic",
} as const satisfies Record<
  FirstPartyPushFailureReason,
  PartnerNotificationRetryDisposition
>;

/**
 * Union consumed by the delivery layer (D7): a single outbox row's
 * `failureReason` may be either the existing partner reason or one of this
 * wave's new reasons, depending on which channel it routed to. Neither
 * member set is renamed or extended by this declaration.
 */
export type PassengerNotificationFailureReason =
  | PartnerNotificationFailureReason
  | FirstPartyPushFailureReason;

// ===========================================================================
// D6 — First-party wire payload. `data` is an explicit allowlist, never a
// spread of `outbox.payload`, same boundary as the partner contract's §6.
// Reuses `PartnerPassengerNotificationExternalEvent` by reference — the
// *external*, dot-versioned wire name (`passenger.<event>.v1`), the same one
// the partner webhook envelope already carries at its `event` field — not
// the internal `PartnerPassengerEventType` identifier (e.g. `driver_arrived`).
// D6's payload section is explicit that `data.event` reuses this
// `passenger.<event>.v1` naming, so this module must not redeclare it as the
// internal name.
// ===========================================================================

export interface FirstPartyPushNotificationText {
  title: string;
  body: string;
}

/**
 * First-version prohibited fields mirror `01_system_sa_sd.md` §6: no phone,
 * name, address, origin/destination, GPS, plate, driver name, payment data,
 * or any token/credential.
 *
 * Unlike `PartnerPassengerNotificationWireData` — a typed, pre-serialization
 * DTO that a generic `partnerNotificationWireBytes()` snake_cases and sorts
 * at send time, because the partner webhook body is arbitrary JSON — this
 * type is the literal shape of FCM HTTP v1's `Message.data` field: a
 * string-to-string map with no generic serializer available (see
 * https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#Message).
 * FCM rejects a non-string value in `data` outright, so this module pins the
 * already-snake_case, already-stringified shape directly rather than a
 * camelCase/typed intermediate — `event_sequence` is a decimal string, not a
 * number. `FirstPartyPushMessage.data` and
 * `FirstPartyPushDeliveryContext.wireMessage`/`wireMessageHash` (D6) freeze
 * exactly this shape; a retry re-sends these same bytes unchanged. Producing
 * this value from an order's event data is the eventual FCM transport's job
 * (`PUSH-FIRST-PARTY-FCM-20261006`, out of this module's scope) — this
 * contract only pins what that transport must produce and what the context
 * must store.
 */
export interface FirstPartyPushWireData {
  notification_id: string;
  event: PartnerPassengerNotificationExternalEvent;
  ride_ref: string;
  event_sequence: string;
  expires_at: string;
}

export interface FirstPartyPushMessage {
  notification: FirstPartyPushNotificationText;
  data: FirstPartyPushWireData;
}

// ===========================================================================
// D6/D8 — Immutable first-party delivery context, one row per outbox row,
// written before the first send attempt — mirrors
// `PartnerNotificationDeliveryContext`'s "write once, retry reuses it"
// shape, grouped under the second reserved migration number
// (schema-allocation.json `passenger_push_channel_allocations`).
// ===========================================================================

export interface FirstPartyPushDeliveryContext {
  outboxId: string;
  orderId: string;
  tenantId: string;
  /** Snapshot of the devices targeted at first-attempt time; a retry only re-sends to still-`active` entries from this list. */
  targetDevices: Array<{ deviceId: string; tokenSha256: string }>;
  wireMessage: FirstPartyPushMessage;
  wireMessageHash: string;
  eventSequence: number;
  expiresAt: string;
  deliveryTarget: FirstPartyPushDeliveryTarget;
  /** Null until a completed attempt sets it; never optimistically pre-set. */
  deliveryStage: FirstPartyPushDeliveryStage | null;
  retryDisposition: PartnerNotificationRetryDisposition | null;
  failureReason: FirstPartyPushFailureReason | null;
  /** The FCM message name from a real 200 response; never a synthesized value. */
  receiptId: string | null;
  createdAt: string;
  /** Set only when this transport's own ack validation completes, never the attempt's start time. */
  deliveredAt: string | null;
}

// ===========================================================================
// D6 — Platform-fixed dispatch limits for the first-party transport, kept
// independent of the partner contract's own `PARTNER_NOTIFICATION_*` limits.
// ===========================================================================

export const PASSENGER_PUSH_FIRST_PARTY_ENABLED_DEFAULT = false as const;
export const FIRST_PARTY_PUSH_MAX_ACTIVE_DEVICES_PER_PASSENGER = 10;
export const FIRST_PARTY_PUSH_DEVICE_STALE_AFTER_DAYS = 60;
