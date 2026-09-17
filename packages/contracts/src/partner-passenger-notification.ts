export const PARTNER_PASSENGER_EVENT_TYPES = [
  "assignment_disclosure_ready",
  "assignment_replaced",
  "eta_changed",
  "driver_arrived",
  "receipt_ready",
  "notification_test"
] as const;
export type PartnerPassengerEventType = (typeof PARTNER_PASSENGER_EVENT_TYPES)[number];

export interface PartnerEntryNotificationBinding {
  bindingId: string;
  entrySlug: string;
  tenantId: string;
  partnerId: string;
  webhookId: string;
  version: number;
  state: 'test_pending' | 'ready' | 'disabled';
  purpose: 'passenger_notification';
  eventTypes: PartnerPassengerEventType[];
  schemaVersion: '1.0';
  acknowledgementPolicy: 'durable_partner_acceptance_v1';
  validatedEndpointFingerprint: string | null;
  validatedAt: string | null;
  updatedAt: string;
}

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
  notificationPolicyVersion: 'partner_notification_v1';
  rideRef: string;
  createdAt: string;
}

export const PARTNER_NOTIFICATION_RETRY_DISPOSITIONS = [
  "automatic",
  "configuration_blocked",
  "manual_only",
  "terminal",
  "none"
] as const;
export type PartnerNotificationRetryDisposition = (typeof PARTNER_NOTIFICATION_RETRY_DISPOSITIONS)[number];

export const PARTNER_NOTIFICATION_FAILURE_REASONS = [
  "provider_not_configured",
  "endpoint_disabled",
  "route_missing",
  "route_ambiguous",
  "owner_changed",
  "recipient_revoked",
  "credential_rejected",
  "endpoint_unavailable",
  "partner_ack_invalid",
  "notification_expired",
  "notification_obsolete",
  "notification_superseded",
  "timeout",
  "unknown"
] as const;
export type PartnerNotificationFailureReason = (typeof PARTNER_NOTIFICATION_FAILURE_REASONS)[number];

export interface PartnerNotificationDeliveryContext {
  outboxId: string;
  deliveryId: string;
  orderId: string;
  routeSnapshot: OrderPartnerNotificationRoute;
  bindingSnapshot: PartnerEntryNotificationBinding;
  wirePayloadHash: string;
  eventSequence: number;
  expiresAt: string | null;
  retryDisposition: PartnerNotificationRetryDisposition;
  failureReason: PartnerNotificationFailureReason | null;
  ackEvidence: Record<string, unknown> | null;
  deliveryTarget: 'partner_endpoint' | null;
  deliveryStage: 'partner_accepted' | null;
  receiptId: string | null;
}
