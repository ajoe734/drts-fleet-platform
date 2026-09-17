export const PARTNER_PASSENGER_EVENT_TYPES = [
  "passenger.assignment_disclosure_ready.v1",
  "passenger.assignment_replaced.v1",
  "passenger.eta_changed.v1",
  "passenger.driver_arrived.v1",
  "passenger.receipt_ready.v1",
  "passenger.notification_test.v1"
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

export interface PartnerPassengerNotificationRecipient {
  partner_user_ref: string;
}

export interface PartnerPassengerNotificationEta {
  minutes: number;
  as_of: string;
}

export interface PartnerPassengerNotificationNavigation {
  type: 'ride';
  ride_ref: string;
}

export interface PartnerPassengerNotificationData {
  schema_version: '1.0';
  notification_id: string;
  partner_entry_slug: string;
  recipient: PartnerPassengerNotificationRecipient;
  ride_ref: string;
  event_sequence: number;
  assignment_version: string | null;
  expires_at: string;
  message: string;
  navigation: PartnerPassengerNotificationNavigation;
  eta?: PartnerPassengerNotificationEta;
}

export interface PartnerPassengerNotificationWirePayload {
  event: PartnerPassengerEventType;
  delivery_id: string;
  occurred_at: string;
  tenant_id: string;
  data: PartnerPassengerNotificationData;
}

export interface PartnerPassengerNotificationAck {
  notification_id: string;
  delivery_id: string;
  partner_entry_slug: string;
  status: 'accepted' | 'duplicate';
  receipt_id: string;
}
