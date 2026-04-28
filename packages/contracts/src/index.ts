import type { PlatformCode } from "./platform-codes";

export const ORDER_DOMAINS = ["owned", "forwarded"] as const;
export type OrderDomain = (typeof ORDER_DOMAINS)[number];

export const PHASE1_SERVICE_BUCKETS = [
  "standard_taxi",
  "business_dispatch",
] as const;
export type Phase1ServiceBucket = (typeof PHASE1_SERVICE_BUCKETS)[number];

export const FUTURE_SERVICE_BUCKETS = ["av_pilot"] as const;
export type FutureServiceBucket = (typeof FUTURE_SERVICE_BUCKETS)[number];

export const SERVICE_BUCKETS = [
  "standard_taxi",
  "business_dispatch",
  "av_pilot",
] as const;
export type ServiceBucket = (typeof SERVICE_BUCKETS)[number];

export const FORWARDER_ROUTING_SERVICE_BUCKETS = [...SERVICE_BUCKETS] as const;
export type ForwarderRoutingServiceBucket =
  (typeof FORWARDER_ROUTING_SERVICE_BUCKETS)[number];

export const SERVICE_BUCKET_CATALOGS = {
  phase1: PHASE1_SERVICE_BUCKETS,
  future: FUTURE_SERVICE_BUCKETS,
  routing: FORWARDER_ROUTING_SERVICE_BUCKETS,
} as const;

export const DISPATCH_SEMANTICS = [
  "realtime",
  "reservation",
  "queue",
  "forwarder_broadcast",
] as const;
export type DispatchSemantics = (typeof DISPATCH_SEMANTICS)[number];

export const BUSINESS_DISPATCH_SUBTYPES = [
  "credit_card_airport_transfer",
  "enterprise_dispatch",
] as const;
export type BusinessDispatchSubtype =
  (typeof BUSINESS_DISPATCH_SUBTYPES)[number];

export const PARTNER_ENTRY_AUTH_MODES = [
  "tenant_portal_bearer",
  "partner_api_key",
] as const;
export type PartnerEntryAuthMode = (typeof PARTNER_ENTRY_AUTH_MODES)[number];

export const PARTNER_ELIGIBILITY_MODES = [
  "none",
  "bank_card_inline",
  "reference_required",
] as const;
export type PartnerEligibilityMode = (typeof PARTNER_ELIGIBILITY_MODES)[number];

export const PARTNER_ELIGIBILITY_STATUSES = [
  "eligible",
  "ineligible",
  "manual_review",
] as const;
export type PartnerEligibilityStatus =
  (typeof PARTNER_ELIGIBILITY_STATUSES)[number];

export const DRIVER_WORK_STATES = [
  "available",
  "reserved",
  "enroute",
  "arrived",
  "on_trip",
  "paused",
  "suspended",
  "incident_hold",
  "offline",
] as const;
export type DriverWorkState = (typeof DRIVER_WORK_STATES)[number];

export const SUPERVISOR_EXECUTION_MODES = [
  "discussion_planning",
  "supervisor_managed_execution",
] as const;
export type SupervisorExecutionMode =
  (typeof SUPERVISOR_EXECUTION_MODES)[number];

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable: boolean;
    traceId: string;
  };
}

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  tenantId: string | null;
  correlationId: string;
  causationId: string;
  subjectId: string;
  data: T;
}

export interface FoundationModuleStatus {
  name:
    | "identity"
    | "tenant-partner"
    | "regulatory-registry"
    | "product-rule"
    | "audit-notification";
  stage: "planned" | "scaffolded" | "in_progress" | "ready";
  notes: string[];
}

export interface Phase1FoundationManifest {
  phase: "phase1";
  executionMode: SupervisorExecutionMode;
  canonicalHardRules: string[];
  modules: FoundationModuleStatus[];
}

export interface IdentityContext {
  actorType:
    | "system"
    | "platform_admin"
    | "tenant_admin"
    | "ops_user"
    | "driver_user"
    | "partner_api_key";
  actorId: string | null;
  realm: "system" | "platform" | "tenant" | "ops" | "driver" | "partner";
  authMode: "bootstrap_headers" | "jwt_bearer";
  roleFamilies: Array<"platform" | "tenant" | "ops" | "driver" | "partner">;
  roles: string[];
  scopes: string[];
  tenantId: string | null;
  partnerId?: string | null;
  partnerProgramId?: string | null;
  partnerEntrySlug?: string | null;
  supportedExecutionModes: SupervisorExecutionMode[];
}

export interface CreateTenantBootstrapSessionCommand {
  email: string;
  tenantId?: string;
}

export interface TenantPortalProfile {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  roleCode: string;
}

export interface TenantBootstrapSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  profile: TenantPortalProfile;
  identity: IdentityContext;
}

export interface CreatePartnerBootstrapSessionCommand {
  entrySlug: string;
  apiKey: string;
}

export interface PartnerBootstrapSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  partnerEntry: PartnerChannelEntryRecord;
  identity: IdentityContext;
}

export interface TenantPartnerSummary {
  supportedRoots: Array<"tenant" | "partner" | "site" | "call_point">;
  sourceOfTruth: "tenant_partner_service" | "foundation_bootstrap_placeholder";
  notes: string[];
}

export interface PartnerRecordAuditMetadata {
  source: string | null;
  requestId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface PartnerEntryBrandingMetadata {
  displayName: string;
  themeAccent: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export interface PartnerChannelEntryRecord {
  partnerId: string;
  partnerCode: string;
  partnerType: string;
  programId: string;
  programCode: string | null;
  tenantId: string;
  bankCode: string | null;
  entrySlug: string;
  displayName: string;
  businessDispatchSubtype: BusinessDispatchSubtype;
  authMode: PartnerEntryAuthMode;
  eligibilityMode: PartnerEligibilityMode;
  entryHost: string | null;
  entryPath: string | null;
  themeAccent: string | null;
  brandingMetadata: PartnerEntryBrandingMetadata | null;
  status: "active" | "inactive";
  activeFlag: boolean;
  createdAt: string;
  updatedAt: string;
  auditMetadata: PartnerRecordAuditMetadata;
}

export interface VerifyPartnerEligibilityCommand {
  entrySlug: string;
  referenceToken?: string;
  cardLast4?: string;
  cardholderName?: string;
  benefitReference?: string;
  flightNo?: string;
}

export interface PartnerEligibilityVerificationRecord {
  eligibilityVerificationId: string;
  tenantId: string;
  partnerId: string;
  partnerProgramId: string;
  partnerProgramCode: string | null;
  partnerEntrySlug: string;
  bankCode: string | null;
  businessDispatchSubtype: BusinessDispatchSubtype;
  verificationStatus: PartnerEligibilityStatus;
  verificationReasonCode: string;
  referenceTokenHash: string | null;
  benefitReference: string | null;
  issuerAuthorizationRef: string | null;
  requestMetadata: {
    cardLast4: string | null;
    cardholderName: string | null;
    flightNo: string | null;
    requestId: string | null;
  };
  verifiedAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  auditMetadata: PartnerRecordAuditMetadata;
}

export interface RegulatoryRegistrySummary {
  entities: Array<
    | "vehicle"
    | "vehicle_reg_profile"
    | "driver"
    | "driver_reg_profile"
    | "qualification_profile"
  >;
  bootstrapSources: string[];
  notes: string[];
}

export interface ProductRuleCatalog {
  phase1ServiceBuckets: Phase1ServiceBucket[];
  futureServiceBuckets: FutureServiceBucket[];
  dispatchSemantics: DispatchSemantics[];
  businessDispatchSubtypes: BusinessDispatchSubtype[];
  orderDomains: OrderDomain[];
}

export interface AuditLogRecord {
  auditId: string;
  actorId: string | null;
  actorType:
    | "system"
    | "platform_admin"
    | "tenant_admin"
    | "ops_user"
    | "partner_api_key";
  tenantId: string | null;
  moduleName: string;
  actionName: string;
  resourceType: string;
  resourceId: string | null;
  oldValuesSummary?: Record<string, unknown>;
  newValuesSummary?: Record<string, unknown>;
  requestId: string;
  createdAt: string;
}

export interface NotificationRecord {
  notificationId: string;
  tenantId: string | null;
  channel: "ops_notice" | "tenant_sla" | "driver_task";
  title: string;
  message: string;
  status: "unread" | "read";
  createdAt: string;
  readAt: string | null;
}

export interface MarkNotificationsReadCommand {
  notificationIds: string[];
}

export interface TenantNotificationSubscription {
  eventType: string;
  channel: "email" | "webhook" | "ops_console";
  enabled: boolean;
}

export interface UpdateTenantNotificationsCommand {
  subscriptions: TenantNotificationSubscription[];
}

export interface TenantNotificationPreferences {
  tenantId: string;
  subscriptions: TenantNotificationSubscription[];
  updatedAt: string;
}

export interface CreateTenantWebhookEndpointCommand {
  url: string;
  secret: string;
  events: string[];
}

export type TenantWebhookEndpointStatus = "active" | "test_pending";

export interface TenantWebhookEndpoint {
  webhookId: string;
  tenantId: string;
  url: string;
  events: string[];
  status: TenantWebhookEndpointStatus;
  secretVersion: number;
  secretPreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTenantWebhookEndpointCommand {
  url?: string;
  events?: string[];
  status?: TenantWebhookEndpointStatus;
}

export interface SendTestWebhookCommand {
  webhookId: string;
}

export interface WebhookDeliveryRecord {
  deliveryId: string;
  webhookId: string;
  tenantId: string;
  eventType: string;
  attempt: number;
  status: "queued" | "delivered" | "delivery_failed";
  httpStatus: number | null;
  signature: string;
  createdAt: string;
}

export interface UpdateTenantSlaProfileCommand {
  waitThresholdMin?: number;
  arrivalThresholdMin?: number;
  completionThresholdMin?: number;
}

export interface TenantSlaProfile {
  tenantId: string;
  waitThresholdMin: number;
  arrivalThresholdMin: number;
  completionThresholdMin: number;
  updatedAt: string;
}

export interface TenantPassengerRecord {
  passengerId: string;
  tenantId: string;
  fullName: string;
  employeeNo: string | null;
  departmentName: string | null;
  mobile: string | null;
  email: string | null;
  activeFlag: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTenantPassengerCommand {
  passengerId?: string;
  fullName: string;
  employeeNo?: string | null;
  departmentName?: string | null;
  mobile?: string | null;
  email?: string | null;
  activeFlag?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TenantAddressRecord {
  addressId: string;
  tenantId: string;
  ownerPassengerId: string | null;
  addressName: string;
  addressText: string;
  lat: number | null;
  lng: number | null;
  tags: string[];
  activeFlag: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTenantAddressCommand {
  addressId?: string;
  ownerPassengerId?: string | null;
  addressName: string;
  addressText: string;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
  activeFlag?: boolean;
}

export type TenantUserRoleStatus = "invited" | "active" | "suspended";

export interface TenantUserRoleRecord {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  roleCode: string;
  status: TenantUserRoleStatus;
  invitedAt: string;
  updatedAt: string;
}

export interface CreateTenantUserCommand {
  email: string;
  displayName: string;
  roleCode: string;
}

export interface UpdateTenantRoleCommand {
  roleCode: string;
  status?: TenantUserRoleStatus;
}

export interface TenantRoleCatalogRecord {
  roleCode: string;
  displayName: string;
  description: string;
  assignable: boolean;
}

export interface TenantApiKeyRecord {
  apiKeyId: string;
  tenantId: string;
  keyName: string;
  keyPrefix: string;
  maskedSuffix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface IssueTenantApiKeyCommand {
  keyName: string;
  scopes: string[];
  expiresAt?: string | null;
}

export interface RotateTenantApiKeyCommand {
  keyName?: string;
  scopes?: string[];
  expiresAt?: string | null;
}

export interface TenantApiKeyIssued {
  apiKey: TenantApiKeyRecord;
  plaintextKey: string;
  revokedApiKeyId: string | null;
}

export const OWNED_ORDER_SOURCES = [
  "app",
  "web",
  "phone",
  "portal",
  "api",
  "concierge",
] as const;
export type OwnedOrderSource = (typeof OWNED_ORDER_SOURCES)[number];

export const OWNED_ORDER_STATUSES = [
  "created",
  "recording_pending",
  "ready_for_dispatch",
  "preassigned",
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "completed",
  "cancelled",
  "redispatch_required",
  "dispatch_failed",
  "exception_hold",
] as const;
export type OwnedOrderStatus = (typeof OWNED_ORDER_STATUSES)[number];

export const DISPATCH_JOB_STATUSES = [
  "matching",
  "reserved",
  "queued",
  "assigned",
  "failed",
  "redispatch_required",
  "closed",
] as const;
export type DispatchJobStatus = (typeof DISPATCH_JOB_STATUSES)[number];

export const DISPATCH_ASSIGNMENT_STATUSES = [
  "assigned",
  "accepted",
  "rejected",
  "cancelled",
  "completed",
] as const;
export type DispatchAssignmentStatus =
  (typeof DISPATCH_ASSIGNMENT_STATUSES)[number];

export const DRIVER_TASK_STATUSES = [
  "pending_acceptance",
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
  "completed",
  "rejected",
  "cancelled",
] as const;
export type DriverTaskStatus = (typeof DRIVER_TASK_STATUSES)[number];

export const BOOKING_TYPES = ["oneway", "roundtrip", "recurring"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export const BOOKING_STATUSES = ["active", "completed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const QUEUE_ENTRY_STATUSES = ["checked_in", "checked_out"] as const;
export type QueueEntryStatus = (typeof QUEUE_ENTRY_STATUSES)[number];

export const RESERVATION_HOLD_STATUSES = [
  "none",
  "requested",
  "released",
  "redispatch_queue",
  "exception_hold",
] as const;
export type ReservationHoldStatus = (typeof RESERVATION_HOLD_STATUSES)[number];

export interface AddressPayload {
  address: string;
  lat?: number | null;
  lng?: number | null;
}

export interface PassengerProfile {
  name: string;
  phone: string;
}

export interface MoneyAmount {
  currency: string;
  amountMinor: number;
}

export interface EtaSnapshot {
  etaMinutes: number;
  calculatedAt: string;
}

export interface DriverLocationHeartbeatCommand {
  driverId: string;
  lat: number;
  lng: number;
  accuracyM?: number;
}

export interface DriverLocationSnapshot {
  driverId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  recordedAt: string;
  updatedAt: string;
}

export interface DriverEtaResponse {
  driverId: string;
  etaMinutes: number;
  calculatedAt: string;
  driverLocation: DriverLocationSnapshot;
  destination: {
    lat: number;
    lng: number;
  };
}

export interface ServicePreferences {
  accessible: boolean;
  childSeat: boolean;
  luggageCount: number;
}

export interface CompletionExpenseItem {
  type: string;
  amountMinor: number;
  attachmentId: string;
}

export interface CompletionProofBundle {
  photos: string[];
  signatureId?: string | null;
  expenseItems?: CompletionExpenseItem[];
}

export interface CreateOwnedOrderCommand {
  pickup: AddressPayload;
  dropoff: AddressPayload;
  passenger: PassengerProfile;
  rideType?: "immediate";
  servicePreferences?: Partial<ServicePreferences>;
  paymentMethod?: "cash" | "card";
}

export interface CreateCallCenterOrderCommand {
  callId: string;
  agentId: string;
  recordingId?: string | null;
  pickup: AddressPayload;
  dropoff: AddressPayload;
  passenger: PassengerProfile;
  notes?: string;
}

export interface CreateTenantBookingCommand {
  businessDispatchSubtype: BusinessDispatchSubtype;
  partnerEntrySlug?: string;
  eligibilityVerificationId?: string;
  pickup: AddressPayload;
  dropoff: AddressPayload;
  reservationWindowStart: string;
  reservationWindowEnd: string;
  passenger: PassengerProfile;
  bookedBy?: {
    name: string;
    email: string;
  };
  onsiteContact?: {
    name: string;
    phone: string;
  };
  costCenter?: string;
  vehiclePreference?: string;
  signoffRequired?: boolean;
  benefitReference?: string;
  direction?: "pickup" | "dropoff";
  flightNo?: string;
  terminal?: string;
  luggageCount?: number;
  notes?: string;
  quotedFare?: MoneyAmount;
  minPhotoCount?: number;
  expenseProofRequired?: boolean;
}

export interface UpdateTenantBookingCommand {
  businessDispatchSubtype?: BusinessDispatchSubtype;
  pickup?: AddressPayload;
  dropoff?: AddressPayload;
  reservationWindowStart?: string;
  reservationWindowEnd?: string;
  passenger?: PassengerProfile;
  bookedBy?: {
    name: string;
    email: string;
  };
  onsiteContact?: {
    name: string;
    phone: string;
  };
  costCenter?: string | null;
  vehiclePreference?: string | null;
  signoffRequired?: boolean;
  benefitReference?: string | null;
  direction?: "pickup" | "dropoff";
  flightNo?: string | null;
  terminal?: string | null;
  luggageCount?: number | null;
  notes?: string | null;
  quotedFare?: MoneyAmount | null;
  minPhotoCount?: number;
  expenseProofRequired?: boolean;
}

export interface DispatchOrderCommand {
  mode: "auto";
}

export interface AssignDispatchCommand {
  dispatchJobId: string;
  vehicleId: string;
  driverId: string;
}

export interface RedispatchOrderCommand {
  reasonCode: string;
}

export interface CancelOwnedOrderCommand {
  reason?: string;
}

export interface QueueCheckInCommand {
  vehicleId: string;
  siteId: string;
}

export interface QueueCheckOutCommand {
  vehicleId: string;
  siteId: string;
}

export interface DriverAcceptTaskCommand {
  acceptedAt: string;
}

export interface DriverRejectTaskCommand {
  reasonCode: string;
  reasonNote?: string;
}

export interface DriverDepartTaskCommand {
  departedAt: string;
  currentLocation?: {
    lat: number;
    lng: number;
  };
}

export interface DriverArrivedPickupCommand {
  arrivedAt: string;
}

export interface DriverStartTaskCommand {
  startedAt: string;
}

export interface DriverCompleteTaskCommand {
  completedAt: string;
  actualDistanceKm: number;
  actualDurationSec: number;
  fare?: MoneyAmount;
  proof?: CompletionProofBundle;
}

export interface OwnedOrderRecord {
  orderId: string;
  orderNo: string;
  orderSource: OwnedOrderSource;
  orderDomain: "owned";
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  partnerEntrySlug: string | null;
  eligibilityVerificationId: string | null;
  issuerAuthorizationRef: string | null;
  serviceBucket: Phase1ServiceBucket;
  dispatchSemantics: DispatchSemantics;
  businessDispatchSubtype: BusinessDispatchSubtype | null;
  status: OwnedOrderStatus;
  pickup: AddressPayload;
  dropoff: AddressPayload;
  passenger: PassengerProfile;
  bookingId: string | null;
  bookingType: BookingType | null;
  etaSnapshot: EtaSnapshot | null;
  callId: string | null;
  recordingId: string | null;
  reservationWindowStart: string | null;
  reservationWindowEnd: string | null;
  recurrenceRule: string | null;
  modifiableUntil: string | null;
  cancelableUntil: string | null;
  bookedBy: {
    name: string;
    email: string;
  } | null;
  onsiteContact: {
    name: string;
    phone: string;
  } | null;
  costCenter: string | null;
  vehiclePreference: string | null;
  benefitReference: string | null;
  direction: "pickup" | "dropoff" | null;
  flightNo: string | null;
  terminal: string | null;
  luggageCount: number | null;
  notes: string | null;
  fixedPrice: boolean;
  quotedFare: MoneyAmount | null;
  proofRequirements: {
    minPhotoCount: number;
    signoffRequired: boolean;
    expenseProofRequired: boolean;
  };
  complianceFlags: string[];
  cancelledAt: string | null;
  cancelReason: string | null;
  reservationHoldStatus: ReservationHoldStatus;
  reservationHoldId: string | null;
  reservationHoldExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingRecord {
  bookingId: string;
  orderId: string;
  tenantId: string;
  partnerId: string | null;
  partnerProgramId: string | null;
  partnerEntrySlug: string | null;
  eligibilityVerificationId: string | null;
  issuerAuthorizationRef: string | null;
  status: BookingStatus;
  serviceBucket: "business_dispatch";
  businessDispatchSubtype: BusinessDispatchSubtype;
  bookingType: BookingType;
  reservationWindowStart: string;
  reservationWindowEnd: string;
  recurrenceRule: string | null;
  modifiableUntil: string | null;
  cancelableUntil: string | null;
  pickup: AddressPayload;
  dropoff: AddressPayload;
  passenger: PassengerProfile;
  bookedBy: {
    name: string;
    email: string;
  } | null;
  onsiteContact: {
    name: string;
    phone: string;
  } | null;
  costCenter: string | null;
  vehiclePreference: string | null;
  benefitReference: string | null;
  direction: "pickup" | "dropoff" | null;
  flightNo: string | null;
  terminal: string | null;
  luggageCount: number | null;
  notes: string | null;
  orderStatus: OwnedOrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchCandidate {
  vehicleId: string;
  driverId: string;
  operatingArea: string;
  serviceBuckets: Phase1ServiceBucket[];
  etaMinutes: number;
}

export interface DispatchJobRecord {
  dispatchJobId: string;
  orderId: string;
  status: DispatchJobStatus;
  mode: "auto";
  latestEtaMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchAttemptRecord {
  attemptId: string;
  dispatchJobId: string;
  orderId: string;
  sequence: number;
  outcome: "candidate_found" | "assigned" | "rejected" | "failed";
  reasonCode: string | null;
  createdAt: string;
}

export interface DispatchAssignmentRecord {
  assignmentId: string;
  dispatchJobId: string;
  orderId: string;
  taskId: string;
  vehicleId: string;
  driverId: string;
  assignmentType: "metered" | "fixed_price";
  status: DispatchAssignmentStatus;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectReasonCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaypointRecord {
  sequence: number;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  arrivedAt: string | null;
  departedAt: string | null;
}

export interface DriverTaskRecord {
  taskId: string;
  orderId: string;
  dispatchJobId: string;
  assignmentId: string;
  driverId: string;
  vehicleId: string;
  sourcePlatform: string | null;
  routeProvided: boolean;
  waypoints: WaypointRecord[];
  status: DriverTaskStatus;
  acceptedAt: string | null;
  departedAt: string | null;
  arrivedPickupAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  actualDistanceKm: number | null;
  actualDurationSec: number | null;
  fare: MoneyAmount | null;
  proof: CompletionProofBundle | null;
}

export type DriverTaskStreamEventType =
  | "task_assigned"
  | "task_updated"
  | "task_cancelled";

export interface DriverTaskStreamEventData {
  task: DriverTaskRecord;
}

export interface DriverTaskStreamEventEnvelope extends DomainEventEnvelope<DriverTaskStreamEventData> {
  eventType: DriverTaskStreamEventType;
}

export type OpsDispatchStreamEventType =
  | "order_created"
  | "dispatch_job_updated"
  | "driver_location_updated";

export interface OpsDispatchOrderCreatedEventData {
  order: OwnedOrderRecord;
}

export interface OpsDispatchJobUpdatedEventData {
  orderId: string;
  dispatchJob: DispatchJobRecord;
}

export interface OpsDispatchDriverLocationUpdatedEventData {
  driverId: string;
  lat: number;
  lng: number;
  recordedAt: string;
}

export type OpsDispatchStreamEventData =
  | OpsDispatchOrderCreatedEventData
  | OpsDispatchJobUpdatedEventData
  | OpsDispatchDriverLocationUpdatedEventData;

export interface OpsDispatchStreamEventEnvelope extends DomainEventEnvelope<OpsDispatchStreamEventData> {
  eventType: OpsDispatchStreamEventType;
}

export interface DispatchTraceLogRecord {
  traceId: string;
  orderId: string;
  eventType: string;
  message: string;
  createdAt: string;
  details?: Record<string, unknown>;
}

export interface QueueEntryRecord {
  queueEntryId: string;
  vehicleId: string;
  siteId: string;
  status: QueueEntryStatus;
  position: number;
  checkedInAt: string;
  checkedOutAt: string | null;
}

export interface VehicleRegistryRecord {
  vehicleId: string;
  plateNo: string;
  operatingArea: string;
  supportedServiceBuckets: Phase1ServiceBucket[];
  dispatchableFlag: boolean;
  exclusivityApproved: boolean;
  insuranceStatus: "valid" | "expired";
}

export interface DriverRegistryRecord {
  driverId: string;
  name: string;
  supportedServiceBuckets: Phase1ServiceBucket[];
  workState: DriverWorkState;
  licensesValid: boolean;
}

export interface UpdateVehicleComplianceCommand {
  dispatchableFlag?: boolean;
  exclusivityApproved?: boolean;
  insuranceStatus?: "valid" | "expired";
}

export interface UpdateDriverWorkStateCommand {
  workState: DriverWorkState;
}

export interface VehicleContractRecord {
  contractId: string;
  vehicleId: string;
  partnerId: string;
  partnerType: string;
  contractType: string;
  operatingAreaId: string | null;
  serviceScope: string;
  startAt: string;
  endAt: string;
  status: "draft" | "active" | "terminated";
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleContractCommand {
  vehicleId: string;
  partnerId: string;
  partnerType: string;
  contractType: string;
  operatingAreaId?: string | null;
  serviceScope: string;
  startAt: string;
  endAt: string;
}

export interface ActivateVehicleContractCommand {
  approvedBy?: string | null;
  approvedAt?: string;
}

export interface InsurancePolicyRecord {
  policyId: string;
  vehicleId: string;
  policyNo: string;
  insuranceType: string;
  insurerName: string;
  coverageAmount: number;
  startAt: string;
  endAt: string;
  status: "pending" | "active" | "expired" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface CreateInsurancePolicyCommand {
  vehicleId: string;
  policyNo: string;
  insuranceType: string;
  insurerName: string;
  coverageAmount: number;
  startAt: string;
  endAt: string;
}

export interface ActivateInsurancePolicyCommand {
  activatedAt?: string;
}

export interface DispatchExclusivityRecord {
  vehicleId: string;
  declarationStatus: "missing" | "submitted";
  declarationFileId: string | null;
  reviewStatus: "draft" | "pending" | "approved" | "rejected";
  reviewerId: string | null;
  reviewedAt: string | null;
  exclusiveProviderName: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  terminationReason: string | null;
  updatedAt: string;
}

export interface SubmitExclusivityReviewCommand {
  declarationFileId?: string | null;
  exclusiveProviderName?: string | null;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
}

export interface ApproveExclusivityCommand {
  reviewerId?: string | null;
  reviewedAt?: string;
}

export type PublicInfoVersionStatus = "draft" | "published" | "retired";

export interface PublicInfoVersionRecord {
  versionId: string;
  title: string;
  callPhone: string | null;
  complaintPhone: string | null;
  callRateText: string | null;
  fareText: string | null;
  paymentMethodText: string | null;
  status: PublicInfoVersionStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// platform presence contracts
export * from "./platform-presence";
// platform earnings contracts
export * from "./platform-earnings";

export interface CreatePublicInfoVersionCommand {
  title: string;
  callPhone?: string | null;
  complaintPhone?: string | null;
  callRateText?: string | null;
  fareText?: string | null;
  paymentMethodText?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface PublishPublicInfoVersionCommand {
  publishedBy?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface RetirePublicInfoVersionCommand {
  retiredBy?: string | null;
  effectiveTo?: string | null;
}

export interface PlacardVersionRecord {
  placardVersionId: string;
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId: string | null;
  artifactManifestHash: string | null;
  artifactDownloadUrl: string | null;
  artifactExpiresAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  downloadMetadata?: ControlledDownloadRecord | null;
}

export interface GeneratePlacardVersionCommand {
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId?: string | null;
  publishedAt?: string | null;
}

export interface PublishPlacardVersionCommand {
  publishedAt?: string | null;
}

export const CALL_TYPES = [
  "booking",
  "complaint",
  "callback",
  "lost_and_found",
  "general_inquiry",
] as const;
export type CallType = (typeof CALL_TYPES)[number];

export const CALL_SESSION_STATUSES = ["active", "closed"] as const;
export type CallSessionStatus = (typeof CALL_SESSION_STATUSES)[number];

export const CALLBACK_TASK_STATUSES = ["pending", "completed"] as const;
export type CallbackTaskStatus = (typeof CALLBACK_TASK_STATUSES)[number];

export interface OpenCallSessionCommand {
  callType: CallType;
  callerPhone: string;
  agentId?: string;
  agentIdentityAnnounced?: boolean;
}

export interface CloseCallSessionCommand {
  endedAt?: string;
}

export interface AnnounceCallAgentIdentityCommand {
  agentId?: string;
  announcedAt?: string;
}

export interface AttachCallRecordingCommand {
  recordingId: string;
  providerRecordingRef?: string;
  recordingUrl?: string;
  startedAt?: string;
  endedAt?: string;
  agentId?: string;
}

export interface QuoteCallEtaCommand {
  etaMinutes: number;
  quotedAt?: string;
}

export interface LinkCallOrderCommand {
  orderId: string;
}

export interface CreateCallbackTaskCommand {
  dueAt: string;
  note?: string | null;
}

export interface CompleteCallbackTaskCommand {
  note?: string | null;
  completedAt?: string;
}

export interface CallbackTaskRecord {
  callbackTaskId: string;
  callId: string;
  callerPhone: string;
  agentId: string | null;
  linkedOrderId: string | null;
  linkedCaseNo: string | null;
  dueAt: string;
  note: string | null;
  status: CallbackTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CallSessionRecord {
  callId: string;
  callType: CallType;
  callerPhone: string;
  agentId: string | null;
  agentIdentityAnnounced: boolean;
  agentIdentityAnnouncedAt: string | null;
  status: CallSessionStatus;
  startedAt: string;
  endedAt: string | null;
  recordingId: string | null;
  providerRecordingRef: string | null;
  recordingUrl: string | null;
  linkedOrderId: string | null;
  linkedCaseNo: string | null;
  lastEtaQuotedMinutes: number | null;
  lastEtaQuotedAt: string | null;
  callbackTask: CallbackTaskRecord | null;
  flags: string[];
}

export const COMPLAINT_CATEGORIES = [
  "late_arrival",
  "no_arrival",
  "driver_service",
  "vehicle_condition",
  "route_issue",
  "fare_dispute",
  "safety_concern",
  "lost_and_found",
  "other",
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_CASE_STATUSES = [
  "new",
  "assigned",
  "under_investigation",
  "resolved",
  "closed",
  "reopened",
] as const;
export type ComplaintCaseStatus = (typeof COMPLAINT_CASE_STATUSES)[number];

export interface CreateComplaintCaseCommand {
  caseSource: "phone" | "web" | "app" | "ops";
  relatedOrderId?: string | null;
  relatedCallId?: string | null;
  category: ComplaintCategory;
  severity: "normal" | "high";
  description: string;
}

export interface TransferCallToComplaintCommand {
  relatedOrderId?: string | null;
  category: ComplaintCategory;
  severity: "normal" | "high";
  description: string;
}

export interface AssignComplaintCaseCommand {
  assigneeId: string;
  note?: string | null;
}

export interface AddComplaintCaseNoteCommand {
  note: string;
}

export interface ReopenComplaintCaseCommand {
  reason: string;
}

export interface ResolveComplaintCaseCommand {
  resolutionCode: string;
  closingNote: string;
}

export interface ComplaintCaseRecord {
  caseNo: string;
  caseSource: "phone" | "web" | "app" | "ops";
  relatedOrderId: string | null;
  relatedCallId: string | null;
  category: ComplaintCategory;
  severity: "normal" | "high";
  description: string;
  assigneeId: string | null;
  status: ComplaintCaseStatus;
  slaDueAt: string;
  slaBreach: boolean;
  resolutionCode: string | null;
  closingNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintTimelineEntry {
  entryId: string;
  caseNo: string;
  action:
    | "case_created"
    | "case_assigned"
    | "case_note_added"
    | "case_reopened"
    | "sla_breached"
    | "case_resolved"
    | "case_closed";
  note: string;
  createdAt: string;
}

export interface ComplaintExportViewRecord {
  complaintCase: ComplaintCaseRecord;
  timeline: ComplaintTimelineEntry[];
  exportGeneratedAt: string;
  readyForAudit: boolean;
}

export const BILLING_DOCUMENT_STATUSES = ["draft", "issued", "paid"] as const;
export type BillingDocumentStatus = (typeof BILLING_DOCUMENT_STATUSES)[number];

export const DRIVER_PAYOUT_STATUSES = ["pending", "paid"] as const;
export type DriverPayoutStatus = (typeof DRIVER_PAYOUT_STATUSES)[number];

export interface UpdateTenantBillingProfileCommand {
  invoiceTitle: string;
  taxId?: string;
  address?: string;
  contactName?: string;
  email: string;
}

export interface TenantBillingProfile {
  tenantId: string;
  invoiceTitle: string;
  taxId: string | null;
  address: string | null;
  contactName: string | null;
  email: string;
  updatedAt: string;
}

export interface InvoiceLineRecord {
  lineId: string;
  orderId: string;
  description: string;
  amount: MoneyAmount;
  serviceBucket?: Phase1ServiceBucket;
  businessDispatchSubtype?: BusinessDispatchSubtype | null;
  partnerId?: string | null;
  partnerProgramId?: string | null;
  partnerEntrySlug?: string | null;
  eligibilityVerificationId?: string | null;
  issuerAuthorizationRef?: string | null;
  benefitReference?: string | null;
}

export interface GenerateTenantInvoiceCommand {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
}

export interface TenantInvoiceRecord {
  invoiceId: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  amount: MoneyAmount;
  status: BillingDocumentStatus;
  artifactUrl: string | null;
  pricingVersionSnapshot: string;
  lines: InvoiceLineRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface IssuePassengerReceiptCommand {
  orderId: string;
}

export interface PassengerReceiptRecord {
  receiptId: string;
  orderId: string;
  amount: MoneyAmount;
  artifactUrl: string | null;
  issuedAt: string;
}

export interface PublishDriverFeePlanCommand {
  planName: string;
  version: string;
  serviceFeeBps: number;
  reimbursementMode: "platform_funded" | "mixed";
}

export interface DriverFeePlanRecord {
  feePlanId: string;
  planName: string;
  version: string;
  serviceFeeBps: number;
  reimbursementMode: "platform_funded" | "mixed";
  status: "published";
  publishedAt: string;
}

export interface GenerateDriverStatementCommand {
  periodMonth: string;
  driverId?: string;
}

export interface DriverStatementLineRecord {
  lineId: string;
  orderId: string;
  grossEarning: MoneyAmount;
  serviceFee: MoneyAmount;
  subsidy: MoneyAmount;
  netAmount: MoneyAmount;
  reimbursementRequired: boolean;
}

export interface DriverStatementRecord {
  statementId: string;
  driverId: string;
  periodMonth: string;
  receiptNo: string;
  payoutStatus: DriverPayoutStatus;
  grossEarning: MoneyAmount;
  serviceFee: MoneyAmount;
  subsidy: MoneyAmount;
  netAmount: MoneyAmount;
  feePlanVersion: string;
  lines: DriverStatementLineRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ReimbursementItemRecord {
  itemId: string;
  orderId: string;
  amount: MoneyAmount;
  reason: string;
}

export interface ReimbursementBatchRecord {
  batchId: string;
  driverId: string;
  statementId: string;
  periodMonth: string;
  status: DriverPayoutStatus;
  totalAmount: MoneyAmount;
  remittanceProofId: string | null;
  items: ReimbursementItemRecord[];
  approvedAt: string | null;
  paidAt: string | null;
}

export interface ApproveReimbursementBatchCommand {
  statementId: string;
}

export interface MarkReimbursementPaidCommand {
  remittanceProofId?: string;
  paidAt?: string;
}

export const REPORT_OUTPUT_FORMATS = ["csv", "xlsx", "pdf", "zip"] as const;
export type ReportOutputFormat = (typeof REPORT_OUTPUT_FORMATS)[number];

export const REGULATORY_REPORT_JOB_TYPES = [
  "vehicle_roster",
  "driver_roster",
  "contract_roster",
  "insurance_roster",
  "vehicle_monthly_delta",
  "six_month_statistics",
  "fare_version_history",
  "complaint_case_detail",
  "dispatch_recording_index",
] as const;

export const OPERATIONAL_REPORT_JOB_TYPES = [
  "trip_summary",
  "monthly_trip_report",
  "revenue_summary",
  "incident_register",
  "maintenance_overview",
] as const;

export const REPORT_JOB_TYPES = [
  ...OPERATIONAL_REPORT_JOB_TYPES,
  ...REGULATORY_REPORT_JOB_TYPES,
] as const;
export type ReportJobType = (typeof REPORT_JOB_TYPES)[number];

export const REPORT_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "expired",
] as const;
export type ReportJobStatus = (typeof REPORT_JOB_STATUSES)[number];

export interface CreateReportJobCommand {
  jobType: string;
  format: ReportOutputFormat;
  filters?: Record<string, unknown>;
  recipients?: string[];
}

export interface ReportArtifactRecord {
  artifactId: string;
  artifactType: "report" | "filing";
  downloadUrl: string;
  expiresAt: string;
  manifestHash: string;
  immutable: boolean;
}

export interface ControlledDownloadRecord {
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

export interface ReportJobRecord {
  jobId: string;
  jobType: string;
  format: ReportOutputFormat;
  status: ReportJobStatus;
  filters: Record<string, unknown>;
  artifact: ReportArtifactRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchRecordingIndexRowRecord {
  orderId: string;
  orderNo: string;
  callId: string | null;
  recordingId: string | null;
  missingRecording: boolean;
  exportedAt: string;
}

export interface PartnerRevenueSummaryRowRecord {
  orderId: string;
  orderNo: string;
  tenantId: string | null;
  partnerId: string;
  partnerProgramId: string | null;
  partnerEntrySlug: string;
  eligibilityVerificationId: string | null;
  issuerAuthorizationRef: string | null;
  benefitReference: string | null;
  businessDispatchSubtype: BusinessDispatchSubtype;
  status: OwnedOrderStatus;
  amount: MoneyAmount;
  completedAt: string | null;
  exportedAt: string;
}

export interface ReportJobDetailRecord extends ReportJobRecord {
  artifact:
    | (ReportArtifactRecord & {
        downloadMetadata: ControlledDownloadRecord;
      })
    | null;
  rows?: DispatchRecordingIndexRowRecord[];
  partnerRevenueRows?: PartnerRevenueSummaryRowRecord[];
}

export const FILING_PACKAGE_TYPES = [
  "filing",
  "monthly_report",
  "audit_request",
] as const;
export type FilingPackageType = (typeof FILING_PACKAGE_TYPES)[number];

export const FILING_PACKAGE_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;
export type FilingPackageStatus = (typeof FILING_PACKAGE_STATUSES)[number];

export interface GenerateFilingPackageCommand {
  packageType: FilingPackageType;
  scope?: Record<string, unknown>;
  period?: Record<string, unknown>;
}

export interface PackageItemRecord {
  itemId: string;
  packageId: string;
  itemType: string;
  artifactId: string;
  manifestHash: string;
}

export interface FilingPackageManifestEntryRecord {
  itemId: string;
  itemType: string;
  artifactId: string;
  manifestHash: string;
}

export interface FilingPackageManifestRecord {
  manifestId: string;
  generatedAt: string;
  entryCount: number;
  entries: FilingPackageManifestEntryRecord[];
  checksum: string;
  immutable: true;
}

export interface FilingPackageRecord {
  packageId: string;
  packageType: FilingPackageType;
  status: FilingPackageStatus;
  artifactZipUrl: string | null;
  artifactPdfUrl: string | null;
  manifestHash: string | null;
  items: PackageItemRecord[];
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FilingPackageListRecord extends FilingPackageRecord {
  immutable?: boolean;
}

export interface FilingPackageDownloadRecord {
  zip: ControlledDownloadRecord;
  pdf: ControlledDownloadRecord;
}

export interface FilingPackageDetailRecord extends FilingPackageRecord {
  immutable: true;
  manifest: FilingPackageManifestRecord | null;
  downloadMetadata: FilingPackageDownloadRecord | null;
}

export const FORWARDED_ORDER_STATUSES = [
  "received",
  "broadcasted",
  "accept_pending",
  "confirmed_by_platform",
  "lost_race",
  "cancelled_by_platform",
  "sync_failed",
] as const;
export type ForwardedOrderStatus = (typeof FORWARDED_ORDER_STATUSES)[number];

export const ADAPTER_HEALTH_STATUSES = ["healthy", "degraded", "down"] as const;
export type AdapterHealthStatus = (typeof ADAPTER_HEALTH_STATUSES)[number];

export interface IngestExternalOrderCommand {
  platformCode: PlatformCode;
  externalOrderId: string;
  payload?: Record<string, unknown>;
}

export interface BroadcastForwardedOrderCommand {
  candidateDriverIds: string[];
}

export interface RelayDriverAcceptCommand {
  driverId: string;
}

export interface SyncForwardedOrderStatusCommand {
  nativeStatus: string;
  payload?: Record<string, unknown>;
}

export interface ForwardedOrderRecord {
  mirrorOrderId: string;
  platformCode: PlatformCode;
  externalOrderId: string;
  status: ForwardedOrderStatus;
  candidateDriverIds: string[];
  acceptedDriverId: string | null;
  lastNativeStatus: string | null;
  payload: Record<string, unknown>;
  authoritativeSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdapterHealthRecord {
  platformCode: PlatformCode;
  status: AdapterHealthStatus;
  lastCheckedAt: string;
  lastError: string | null;
}

export interface ReconciliationJobRecord {
  reconciliationJobId: string;
  platformCode: PlatformCode;
  status: "queued" | "completed";
  mismatchCount: number;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// W7-001D: Async job accepted responses
//
// These are the canonical accepted responses from POST command endpoints that
// trigger background / async jobs. The HTTP response body carries only the
// allocated job identifier and the initial status ("queued"), allowing the
// caller to poll the GET endpoint for completion.
//
// Wire format (after SnakeCaseInterceptor): job_id / package_id / status
// ---------------------------------------------------------------------------

export interface ReportJobAccepted {
  jobId: string;
  status: "queued";
}

export interface FilingPackageAccepted {
  packageId: string;
  status: "queued";
}

// ---------------------------------------------------------------------------
// W7-001D: Canonical webhook event payload (wire contract)
//
// Webhook deliveries use this envelope on the wire (already snake_case because
// they are published directly by the webhook runtime, not via the API layer).
// ---------------------------------------------------------------------------

export interface WebhookEventPayload<T = Record<string, unknown>> {
  event: string;
  deliveryId: string;
  occurredAt: string;
  tenantId: string;
  data: T;
}

// ---------------------------------------------------------------------------
// W7-001D: Download artifact wire contract
//
// Signed download responses carry these fields.  The SnakeCaseInterceptor
// converts camelCase TypeScript keys to snake_case for the HTTP wire.
// ---------------------------------------------------------------------------

export interface SignedDownloadResponse {
  downloadUrl: string;
  expiresAt: string;
  manifestHash: string;
  keyId: string;
  signatureVersion: number;
}

// ---------------------------------------------------------------------------
// W7-001D: Async job status poll response (wire contract)
//
// Polled via GET /reports/jobs/:jobId and GET /filing-packages/:packageId.
// The full record types (ReportJobRecord, FilingPackageRecord) are the
// canonical TypeScript types; these will be serialised to snake_case over wire.
// ---------------------------------------------------------------------------

export const ASYNC_JOB_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "expired",
] as const;
export type AsyncJobTerminalStatus =
  (typeof ASYNC_JOB_TERMINAL_STATUSES)[number];

// ---------------------------------------------------------------------------
// W8-001A: Feature flags for client integration rollout
//
// GET /api/admin/flags        -> FeatureFlagSummary
// GET /api/admin/flags/:key   -> FeatureFlag
// PATCH /api/admin/flags/:key -> FeatureFlag
// GET /api/admin/flags/:key/enabled -> { key: string; enabled: boolean }
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  tenantId?: string;
  updatedAt: string;
}

export interface FeatureFlagSummary {
  flags: FeatureFlag[];
  notes: string[];
}

export interface FeatureFlagTenantOverrideCommand {
  enabled: boolean;
  description?: string;
}

// ---------------------------------------------------------------------------
// W8-001E: Ops and driver domain completion
//
// Incident, maintenance, shift/attendance, and driver settings contracts.
// ---------------------------------------------------------------------------

export const INCIDENT_STATUSES = [
  "open",
  "investigating",
  "resolved",
  "closed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_CATEGORIES = [
  "safety",
  "vehicle_damage",
  "passenger_injury",
  "driver_injury",
  "property_damage",
  "weather",
  "traffic",
  "operational",
  "other",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export interface CreateIncidentCommand {
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  relatedOrderId?: string;
  relatedVehicleId?: string;
  relatedDriverId?: string;
  reportedBy: string;
  occurredAt?: string;
  location?: string;
}

export interface UpdateIncidentCommand {
  status?: IncidentStatus;
  assignedTo?: string;
  resolutionNote?: string;
}

export interface IncidentRecord {
  incidentId: string;
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  relatedOrderId: string | null;
  relatedVehicleId: string | null;
  relatedDriverId: string | null;
  relatedComplaintCaseNo: string | null;
  reportedBy: string;
  assignedTo: string | null;
  occurredAt: string | null;
  location: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentTimelineEntry {
  entryId: string;
  incidentId: string;
  action: string;
  note: string;
  actor: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export const MAINTENANCE_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "overdue",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_TYPES = [
  "scheduled_service",
  "repair",
  "inspection",
  "recall",
  "tire_replacement",
  "oil_change",
  "brake_service",
  "other",
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export interface CreateMaintenanceRecordCommand {
  vehicleId: string;
  type: MaintenanceType;
  description: string;
  scheduledAt?: string;
  completedAt?: string;
  technician?: string;
  cost?: number;
  notes?: string;
}

export interface UpdateMaintenanceRecordCommand {
  status?: MaintenanceStatus;
  completedAt?: string;
  technician?: string;
  cost?: number;
  notes?: string;
}

export interface MaintenanceRecord {
  maintenanceId: string;
  vehicleId: string;
  type: MaintenanceType;
  description: string;
  status: MaintenanceStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  technician: string | null;
  cost: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Shift & Attendance
// ---------------------------------------------------------------------------

export const SHIFT_STATUSES = ["active", "completed", "abandoned"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export interface ClockInCommand {
  driverId: string;
  vehicleId?: string;
  location?: string;
  odometer?: number;
}

export interface ClockOutCommand {
  driverId: string;
  location?: string;
  odometer?: number;
  notes?: string;
}

export interface ShiftRecord {
  shiftId: string;
  driverId: string;
  vehicleId: string | null;
  status: ShiftStatus;
  clockedInAt: string;
  clockedOutAt: string | null;
  startLocation: string | null;
  endLocation: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  notes: string | null;
  totalHours: number | null;
  updatedAt?: string;
}

export interface AttendanceRecord {
  attendanceId: string;
  driverId: string;
  shiftId: string;
  date: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  totalHours: number | null;
  status: "present" | "partial" | "absent";
}

// ---------------------------------------------------------------------------
// Driver Settings / Profile
// ---------------------------------------------------------------------------

export interface DriverSettings {
  driverId: string;
  language: string;
  notificationsEnabled: boolean;
  autoAcceptEnabled: boolean;
  maxAcceptRadius: number | null;
  preferredAreas: string[];
  updatedAt: string;
}

export interface UpdateDriverSettingsCommand {
  language?: string;
  notificationsEnabled?: boolean;
  autoAcceptEnabled?: boolean;
  maxAcceptRadius?: number | null;
  preferredAreas?: string[];
}

export interface DriverProfileEmergencyContact {
  name: string;
  phone: string;
  relationship: string | null;
}

export interface DriverProfileBankAccount {
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
}

export interface DriverProfileRecord {
  driverId: string;
  name: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  emergencyContact: DriverProfileEmergencyContact | null;
  bankAccount: DriverProfileBankAccount | null;
  updatedAt: string;
}

export interface CreateDriverProfileCommand {
  name: string;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  emergencyContact?: DriverProfileEmergencyContact | null;
  bankAccount?: DriverProfileBankAccount | null;
}

export interface UpdateDriverProfileCommand {
  name?: string;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  emergencyContact?: DriverProfileEmergencyContact | null;
  bankAccount?: DriverProfileBankAccount | null;
}

// ---------------------------------------------------------------------------
// Platform Admin — Control-Plane Authority Types
// ---------------------------------------------------------------------------

export const PLATFORM_TENANT_MODULES = [
  "enterprise_dispatch",
  "billing",
  "reporting",
  "webhooks",
] as const;
export type PlatformTenantModule = (typeof PLATFORM_TENANT_MODULES)[number];

export interface PlatformTenantQuotaSummary {
  activeDrivers: number;
  monthlyBookings: number;
  monthlyApiCalls: number;
}

export interface PlatformAdminTenantRecord {
  id: string;
  code: string;
  name: string;
  status: "draft" | "active" | "paused";
  enabledModules: PlatformTenantModule[];
  quotas: PlatformTenantQuotaSummary;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformTenantCommand {
  name: string;
  code: string;
  status?: "active" | "inactive";
  enabledModules?: PlatformTenantModule[];
  quotas?: Partial<PlatformTenantQuotaSummary>;
}

export interface UpdatePlatformTenantSettingsCommand {
  name?: string;
  enabledModules?: PlatformTenantModule[];
  quotas?: Partial<PlatformTenantQuotaSummary>;
}

export type PlatformAdminUserRole =
  | "superadmin"
  | "admin"
  | "operator"
  | "viewer";
export type PlatformAdminUserStatus = "active" | "suspended" | "invited";

export interface PlatformAdminUserRecord {
  userId: string;
  email: string;
  displayName: string;
  roleCode: PlatformAdminUserRole;
  status: PlatformAdminUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformAdminUserCommand {
  email: string;
  displayName: string;
  roleCode: PlatformAdminUserRole;
}

export interface UpdatePlatformAdminUserRoleCommand {
  roleCode: PlatformAdminUserRole;
  status?: PlatformAdminUserStatus;
}

export type PlatformNoticeSeverity = "info" | "warning" | "critical";
export type PlatformNoticeStatus = "active" | "resolved" | "scheduled";

export interface PlatformNoticeRecord {
  noticeId: string;
  title: string;
  body: string;
  severity: PlatformNoticeSeverity;
  status: PlatformNoticeStatus;
  targetAudience: "all" | "tenants" | "ops" | "drivers";
  scheduledAt: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformNoticeCommand {
  title: string;
  body: string;
  severity: PlatformNoticeSeverity;
  targetAudience: "all" | "tenants" | "ops" | "drivers";
  scheduledAt?: string | null;
}

export interface PlatformMaintenanceModeRecord {
  enabled: boolean;
  reason: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface SetPlatformMaintenanceModeCommand {
  enabled: boolean;
  reason?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}

export interface PlatformPricingRuleRecord {
  ruleId: string;
  ruleName: string;
  version: string;
  serviceFeeBps: number;
  reimbursementMode: "platform_funded" | "mixed";
  applicableTo: "all" | string;
  status: "active" | "draft" | "archived";
  effectiveFrom: string;
  effectiveTo: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlatformPricingRuleCommand {
  ruleName: string;
  version: string;
  serviceFeeBps: number;
  reimbursementMode: "platform_funded" | "mixed";
  applicableTo: "all" | string;
  effectiveFrom?: string | null;
  notes?: string | null;
}

export interface PublishPlatformPricingRuleCommand {
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  publishedBy?: string | null;
}

export interface SetTenantStatusCommand {
  status: "active" | "paused";
  reason?: string;
}

export * from "./platform-codes";
