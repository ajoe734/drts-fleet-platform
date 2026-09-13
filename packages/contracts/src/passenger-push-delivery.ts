/**
 * Passenger Push Delivery — durable claim/lease/fence — SR-RECOVERY-CONTRACTS-20260911
 *
 * Authority: routed via
 * support/unblock/SR-PUSH-001/SR-PUSH-001-UNBLOCK-PLANNING-DECISION.md, which
 * found `MultiTaxiService.deliverPassengerNotification` drops the provider
 * message reference and `MultiTaxiRepository.updateConsumerNotificationOutboxDelivery`
 * updates by id with no claim/fence or receipt columns, and its persistence
 * helper swallows write failure.
 *
 * This module is provider-neutral by design: it does not choose FCM/APNs/any
 * transport, and it does not equate a provider's send acknowledgement with
 * confirmed delivery to a real passenger device — those are two distinct,
 * separately evidenced facts. See `./phase1-p5-s3-multi-taxi` for the
 * pre-existing `ConsumerNotificationOutboxRecord` / `PassengerPushDeliveryOutcome`
 * single-attempt-result types this module's durable claim/receipt layer sits
 * underneath.
 */

// ===========================================================================
// Claim / lease / fence — exactly one worker may hold a live lease at a time
// ===========================================================================

export const PUSH_DELIVERY_CLAIM_STATES = [
  "claimed",
  "released",
  "expired",
] as const;
export type PushDeliveryClaimState =
  (typeof PUSH_DELIVERY_CLAIM_STATES)[number];

export interface PushDeliveryClaim {
  outboxId: string;
  tenantId: string;
  /** Pseudonymous subject reference; never a raw phone number or device token. */
  passengerSubjectRef: string;
  workerId: string;
  claimState: PushDeliveryClaimState;
  /**
   * Monotonically increasing per outboxId. A write carrying a stale
   * fenceToken (superseded by a later claim) must be rejected rather than
   * applied, so a worker that stalls past its lease cannot clobber the
   * worker that reclaimed the row.
   */
  fenceToken: number;
  leaseExpiresAt: string;
  claimedAt: string;
}

export interface ClaimPushDeliveryCommand {
  outboxId: string;
  tenantId: string;
  workerId: string;
  leaseSeconds: number;
}

export interface ReleasePushDeliveryClaimCommand {
  outboxId: string;
  fenceToken: number;
}

// ===========================================================================
// Provider acknowledgement vs. real-device delivery — kept separate
// ===========================================================================

export const PUSH_PROVIDER_ACK_STATES = [
  "provider_acknowledged",
  "provider_rejected",
  "provider_not_configured",
] as const;
export type PushProviderAckState = (typeof PUSH_PROVIDER_ACK_STATES)[number];

/**
 * A provider ack is not proof of on-device delivery. `unknown` is the only
 * valid state until an independent delivery signal (provider delivery
 * webhook, device receipt, etc.) is actually observed — it must never be
 * inferred from `provider_acknowledged` alone.
 */
export const PUSH_DEVICE_DELIVERY_STATES = [
  "unknown",
  "delivered",
  "delivery_failed",
] as const;
export type PushDeviceDeliveryState =
  (typeof PUSH_DEVICE_DELIVERY_STATES)[number];

// ===========================================================================
// Durable receipt — immutable dedupe identity
// ===========================================================================

/**
 * The durable record of one delivery attempt. `dedupeKey` is fixed at
 * creation (derived from outboxId + fenceToken, not client-suppliable) so a
 * retried claim/send never produces two receipts for the same logical
 * attempt.
 */
export interface PushDeliveryReceipt {
  receiptId: string;
  outboxId: string;
  tenantId: string;
  passengerSubjectRef: string;
  dedupeKey: string;
  fenceToken: number;
  providerName: string | null;
  providerAckState: PushProviderAckState;
  providerMessageRef: string | null;
  deviceDeliveryState: PushDeviceDeliveryState;
  ackedAt: string | null;
  createdAt: string;
}

// ===========================================================================
// Recording an outcome — persistence failure after ack is its own outcome
// ===========================================================================

export const PUSH_DELIVERY_RECORD_OUTCOMES = [
  "recorded",
  /**
   * The provider ack (or rejection) was observed but durably persisting the
   * receipt failed. This is distinct from `provider_error`: the provider
   * step may have succeeded while the persistence step's result is unknown.
   * Callers must not fabricate `recorded` in this case, and must not resolve
   * `deviceDeliveryState` beyond `unknown`.
   */
  "persistence_unknown",
] as const;
export type PushDeliveryRecordOutcome =
  (typeof PUSH_DELIVERY_RECORD_OUTCOMES)[number];

export interface RecordPushDeliveryReceiptCommand {
  outboxId: string;
  fenceToken: number;
  providerName: string | null;
  providerAckState: PushProviderAckState;
  providerMessageRef: string | null;
}

export interface RecordPushDeliveryReceiptResult {
  outcome: PushDeliveryRecordOutcome;
  /** Present only when outcome is "recorded". */
  receipt: PushDeliveryReceipt | null;
}

export const PUSH_DELIVERY_ERROR_CODES = [
  "PUSH_DELIVERY_CLAIM_NOT_HELD",
  "PUSH_DELIVERY_FENCE_STALE",
  "PUSH_DELIVERY_TENANT_MISMATCH",
  "PUSH_DELIVERY_SUBJECT_MISMATCH",
] as const;
export type PushDeliveryErrorCode =
  (typeof PUSH_DELIVERY_ERROR_CODES)[number];
