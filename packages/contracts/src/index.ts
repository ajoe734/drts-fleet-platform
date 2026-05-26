import { PLATFORM_CODES } from "./platform-codes";
import type { PlatformCode } from "./platform-codes";
import type {
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "./ui-runtime";

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

export const PARTNER_ENTRY_STATUSES = [
  "active",
  "inactive",
  "revoked",
] as const;
export type PartnerEntryStatus = (typeof PARTNER_ENTRY_STATUSES)[number];

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

export interface ApiPageInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiListData<T> {
  items: T[];
  pageInfo: ApiPageInfo;
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

export type AuthIngressPlane = "control_plane" | "business_plane";

export type AuthBearerHeader = "authorization" | "x-drts-authorization";

export type AuthPrimaryPath =
  | "service_bearer"
  | "control_plane_inner_bearer"
  | "tenant_bootstrap_bearer"
  | "partner_bootstrap_bearer"
  | "driver_device_bearer";

export interface AuthRealmPathRecord {
  realm: IdentityContext["realm"];
  plane: AuthIngressPlane;
  primaryPath: AuthPrimaryPath;
  bearerHeader: AuthBearerHeader;
  defaultIapProtected: boolean;
  tokenIssuancePath: string | null;
  refreshPath: string | null;
  productionNotes: string;
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

export interface RegisterDriverDeviceCommand {
  registrationCode: string;
  deviceId: string;
  deviceLabel?: string | null;
}

export interface RefreshDriverDeviceSessionCommand {
  refreshToken: string;
  deviceId: string;
}

export interface RevokeDriverDeviceBindingCommand {
  bindingId?: string;
  deviceId: string;
}

export interface DriverDeviceProvisioningSession {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  refreshExpiresIn: string;
  driverId: string;
  deviceId: string;
  bindingId: string;
  issuedAt: string;
  identity: IdentityContext;
}

export interface DriverDeviceBindingSummary {
  bindingId: string;
  deviceId: string;
  deviceLabel: string | null;
  status: "active" | "revoked";
  issuedAt: string;
  refreshedAt: string;
  revokedAt: string | null;
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

export const PARTNER_ELIGIBILITY_ADAPTER_KINDS = [
  "none",
  "issuer_card_lookup",
  "issuer_reference_lookup",
] as const;
export type PartnerEligibilityAdapterKind =
  (typeof PARTNER_ELIGIBILITY_ADAPTER_KINDS)[number];

export const PARTNER_ELIGIBILITY_DECISION_SOURCES = [
  "not_required",
  "issuer_realtime",
  "issuer_reference_lookup",
  "manual_fallback",
  "ops_manual_review",
] as const;
export type PartnerEligibilityDecisionSource =
  (typeof PARTNER_ELIGIBILITY_DECISION_SOURCES)[number];

export interface PartnerEligibilityRetryPolicyRecord {
  timeoutMs: number;
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrorCodes: string[];
}

export interface PartnerEligibilityManualFallbackPolicy {
  queue: "ops_console";
  requiredOnTimeout: boolean;
  requiredOnRetryExhausted: boolean;
  requiredOnAmbiguousResponse: boolean;
  requiredAuditFields: Array<"reasonCode" | "requestedBy" | "notes">;
}

export interface PartnerEligibilitySensitiveDataPolicy {
  referenceTokenStorage: "hash_only";
  rawTokenExposure: "never";
  benefitReferencePolicy: "canonical_internal_masked_exports";
  issuerAuthorizationReferencePolicy: "canonical_internal_masked_exports";
  auditExposure: "status_reason_only";
}

export interface PartnerEligibilityIntegrationContractRecord {
  contractId: string;
  adapterCode: string;
  adapterKind: PartnerEligibilityAdapterKind;
  adapterVersion: string;
  eligibilityMode: PartnerEligibilityMode;
  decisionTtlSeconds: number | null;
  retryPolicy: PartnerEligibilityRetryPolicyRecord | null;
  manualFallbackPolicy: PartnerEligibilityManualFallbackPolicy | null;
  sensitiveDataPolicy: PartnerEligibilitySensitiveDataPolicy | null;
  notes: string[];
}

export interface PartnerEligibilityAdapterAttemptRecord {
  attempt: number;
  adapterCode: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: PartnerEligibilityStatus | "error";
  reasonCode: string;
  retryable: boolean;
  timeoutTriggered: boolean;
  upstreamHttpStatus: number | null;
}

export interface PartnerEligibilityManualFallbackRecord {
  required: boolean;
  reasonCode: string | null;
  requestedAt: string | null;
  requestedBy: string | null;
  notes: string | null;
}

export interface PartnerIngressCredentialRecord {
  keyId: string;
  entrySlug: string;
  keyPrefix: string;
  maskedSuffix: string;
  source: "env_bootstrap" | "platform_admin";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  issuedBy: string | null;
  revokedBy: string | null;
  rotationReason: string | null;
  revokeReason: string | null;
}

export interface IssuePartnerIngressCredentialCommand {
  rotationReason?: string | null;
}

export interface RevokePartnerIngressCredentialCommand {
  revokeReason?: string | null;
}

export interface PartnerIngressCredentialIssued {
  credential: PartnerIngressCredentialRecord;
  plaintextKey: string;
  revokedCredentialId: string | null;
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
  eligibilityContract: PartnerEligibilityIntegrationContractRecord | null;
  status: PartnerEntryStatus;
  activeFlag: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
  auditMetadata: PartnerRecordAuditMetadata;
}

export interface CreatePartnerChannelEntryCommand {
  tenantId: string;
  partnerCode: string;
  partnerType: string;
  programId: string;
  programCode?: string | null;
  bankCode?: string | null;
  entrySlug: string;
  displayName: string;
  businessDispatchSubtype: BusinessDispatchSubtype;
  authMode: PartnerEntryAuthMode;
  eligibilityMode: PartnerEligibilityMode;
  entryHost?: string | null;
  entryPath?: string | null;
  themeAccent?: string | null;
  brandingMetadata?: Partial<PartnerEntryBrandingMetadata> | null;
  status?: PartnerEntryStatus;
  activeFlag?: boolean;
}

export interface UpdatePartnerChannelEntryCommand {
  tenantId?: string;
  partnerCode?: string;
  partnerType?: string;
  programId?: string;
  programCode?: string | null;
  bankCode?: string | null;
  displayName?: string;
  businessDispatchSubtype?: BusinessDispatchSubtype;
  authMode?: PartnerEntryAuthMode;
  eligibilityMode?: PartnerEligibilityMode;
  entryHost?: string | null;
  entryPath?: string | null;
  themeAccent?: string | null;
  brandingMetadata?: Partial<PartnerEntryBrandingMetadata> | null;
  status?: PartnerEntryStatus;
  activeFlag?: boolean;
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
  cardProgramCode: string | null;
  businessDispatchSubtype: BusinessDispatchSubtype;
  verificationStatus: PartnerEligibilityStatus;
  decisionSource: PartnerEligibilityDecisionSource;
  verificationReasonCode: string;
  adapterCode: string | null;
  adapterVersion: string | null;
  contractSnapshot: PartnerEligibilityIntegrationContractRecord | null;
  attempts: PartnerEligibilityAdapterAttemptRecord[];
  manualFallback: PartnerEligibilityManualFallbackRecord;
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

export interface PartnerEligibilityReviewQueueItem {
  eligibilityVerificationId: string;
  partnerEntrySlug: string;
  verificationStatus: PartnerEligibilityStatus;
  verificationReasonCode: string;
  decisionSource: PartnerEligibilityDecisionSource;
  attemptCount: number;
  latestAttemptStatus: string | null;
  latestAttemptReasonCode: string | null;
  manualFallback: PartnerEligibilityManualFallbackRecord;
  requestHints: {
    cardLast4: string | null;
    flightNo: string | null;
  };
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type PartnerEligibilityReviewDecision = "approve" | "deny";

export interface ResolvePartnerEligibilityReviewCommand {
  eligibilityVerificationId: string;
  decision: PartnerEligibilityReviewDecision;
  reasonCode: string;
  notes: string | null;
}

export interface PartnerEligibilityReviewResolution {
  eligibilityVerificationId: string;
  previousStatus: PartnerEligibilityStatus;
  resolvedStatus: PartnerEligibilityStatus;
  decision: PartnerEligibilityReviewDecision;
  reasonCode: string;
  notes: string | null;
  resolvedAt: string;
  resolvedBy: string;
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
  pricingAuthority: {
    canonicalQuotedFareSource: QuotedFareSource;
    canonicalPricingRuleVersion: string;
    tenantCanSetQuotedFare: false;
    partnerCanSetQuotedFare: false;
    manualOverrideActorTypes: Array<"platform_admin" | "ops_user">;
    manualOverrideRequiredFields: Array<"actor" | "reason" | "traceId">;
  };
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

export const EVIDENCE_RETENTION_FAMILIES = [
  "call_recording",
  "report_artifact",
  "filing_package",
  "audit_log",
  "webhook_delivery",
  "eligibility_verification",
  "proof_bundle",
] as const;
export type EvidenceRetentionFamily =
  (typeof EVIDENCE_RETENTION_FAMILIES)[number];

export const EVIDENCE_ACCESS_ACTIONS = [
  "list",
  "read",
  "download",
  "export",
] as const;
export type EvidenceAccessAction = (typeof EVIDENCE_ACCESS_ACTIONS)[number];

export const EVIDENCE_ARCHIVE_TIERS = [
  "hot_only",
  "warm_archive",
  "cold_archive",
] as const;
export type EvidenceArchiveTier = (typeof EVIDENCE_ARCHIVE_TIERS)[number];

export interface EvidenceAccessRuleRecord {
  realms: IdentityContext["realm"][];
  actorTypes: IdentityContext["actorType"][];
  requiredScopes: string[];
  tenantScoped: boolean;
}

export interface EvidenceMaskingRuleRecord {
  surface: "api_view" | "download" | "audit_log" | "storage";
  rule: string;
}

export interface EvidenceDownloadControlRecord {
  mode: "none" | "signed_url";
  ttlMinutes: number | null;
  reissueRequired: boolean;
  requiresAuditOnIssue: boolean;
  notes: string[];
}

export interface EvidenceLegalHoldPolicyRecord {
  supported: boolean;
  placementActors: IdentityContext["actorType"][];
  releaseActors: IdentityContext["actorType"][];
  deletionSuppressed: boolean;
  notes: string[];
}

export interface EvidenceRetentionPolicyRecord {
  family: EvidenceRetentionFamily;
  authorityModule: string;
  description: string;
  hotRetentionDays: number;
  archiveAfterDays: number | null;
  archiveRetentionDays: number | null;
  archiveTier: EvidenceArchiveTier;
  accessRules: EvidenceAccessRuleRecord[];
  maskingRules: EvidenceMaskingRuleRecord[];
  downloadControl: EvidenceDownloadControlRecord | null;
  legalHold: EvidenceLegalHoldPolicyRecord;
  deletionException: string;
  auditAction: string;
  notes: string[];
}

export interface EvidenceGovernanceCatalog {
  version: string;
  generatedAt: string;
  policies: EvidenceRetentionPolicyRecord[];
  legalHoldWorkflow: string[];
}

export const EVIDENCE_LEGAL_HOLD_REASON_CODES = [
  "complaint_escalation",
  "regulatory_inquiry",
  "settlement_dispute",
  "internal_investigation",
] as const;
export type EvidenceLegalHoldReasonCode =
  (typeof EVIDENCE_LEGAL_HOLD_REASON_CODES)[number];

export const EVIDENCE_LEGAL_HOLD_STATUSES = ["active", "released"] as const;
export type EvidenceLegalHoldStatus =
  (typeof EVIDENCE_LEGAL_HOLD_STATUSES)[number];

export interface CreateEvidenceLegalHoldCommand {
  family: EvidenceRetentionFamily;
  subjectId: string;
  caseNumber: string;
  reasonCode: EvidenceLegalHoldReasonCode;
  reasonNote?: string | null;
  tenantId?: string | null;
  manifestHash?: string | null;
}

export interface ReleaseEvidenceLegalHoldCommand {
  releaseReason: string;
}

export interface EvidenceLegalHoldRecord {
  holdId: string;
  family: EvidenceRetentionFamily;
  subjectId: string;
  caseNumber: string;
  reasonCode: EvidenceLegalHoldReasonCode;
  reasonNote: string | null;
  tenantId: string | null;
  manifestHash: string | null;
  status: EvidenceLegalHoldStatus;
  placedByActorId: string;
  placedByActorType: IdentityContext["actorType"];
  placedAt: string;
  releasedByActorId: string | null;
  releasedByActorType: IdentityContext["actorType"] | null;
  releasedAt: string | null;
  releaseReason: string | null;
}

export const EVIDENCE_DELETION_EXCEPTION_REASON_CODES = [
  "filing_reference",
  "complaint_reference",
  "settlement_dispute",
  "regulatory_request",
  "webhook_disablement",
  "eligibility_dispute",
  "manual_preservation",
] as const;
export type EvidenceDeletionExceptionReasonCode =
  (typeof EVIDENCE_DELETION_EXCEPTION_REASON_CODES)[number];

export const EVIDENCE_DELETION_EXCEPTION_STATUSES = [
  "active",
  "resolved",
  "expired",
] as const;
export type EvidenceDeletionExceptionStatus =
  (typeof EVIDENCE_DELETION_EXCEPTION_STATUSES)[number];

export interface CreateEvidenceDeletionExceptionCommand {
  family: EvidenceRetentionFamily;
  subjectId: string;
  sourceResourceType: string;
  sourceResourceId: string;
  reviewerActorId: string;
  reviewerActorType?: IdentityContext["actorType"] | null;
  expiresAt: string;
  reasonCode: EvidenceDeletionExceptionReasonCode;
  reasonNote?: string | null;
  tenantId?: string | null;
  manifestHash?: string | null;
}

export interface ResolveEvidenceDeletionExceptionCommand {
  resolutionNote: string;
}

export interface EvidenceDeletionExceptionRecord {
  exceptionId: string;
  family: EvidenceRetentionFamily;
  subjectId: string;
  sourceResourceType: string;
  sourceResourceId: string;
  reviewerActorId: string;
  reviewerActorType: IdentityContext["actorType"] | null;
  expiresAt: string;
  reasonCode: EvidenceDeletionExceptionReasonCode;
  reasonNote: string | null;
  tenantId: string | null;
  manifestHash: string | null;
  status: EvidenceDeletionExceptionStatus;
  requestedByActorId: string;
  requestedByActorType: IdentityContext["actorType"];
  requestedAt: string;
  resolvedByActorId: string | null;
  resolvedByActorType: IdentityContext["actorType"] | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface EvidenceSubjectGovernanceRecord {
  family: EvidenceRetentionFamily;
  subjectId: string;
  tenantId: string | null;
  manifestHash: string | null;
  activeLegalHolds: EvidenceLegalHoldRecord[];
  activeDeletionExceptions: EvidenceDeletionExceptionRecord[];
  deletionSuppressed: boolean;
}

export interface NotificationRecord {
  notificationId: string;
  tenantId: string | null;
  recipientUserId: string | null;
  channel: "ops_notice" | "tenant_sla" | "driver_task" | "tenant_approval";
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

export interface WebhookRetryPolicyRecord {
  maxAttempts: number;
  initialBackoffSeconds: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
  retryableStatusCodes: number[];
}

export const TENANT_WEBHOOK_DISABLE_REASONS = [
  "manual_disable",
  "delivery_failed",
] as const;
export type TenantWebhookDisableReason =
  (typeof TENANT_WEBHOOK_DISABLE_REASONS)[number];

export interface TenantWebhookSecretRotationRecord {
  secretVersion: number;
  rotatedAt: string;
  rotationReason: string | null;
  secretPreview: string;
}

export interface TenantWebhookRuntimeMetadata {
  deliveryCount: number;
  failedDeliveryCount: number;
  lastAttemptAt: string | null;
  lastDeliveredAt: string | null;
  lastValidatedAt: string | null;
  nextAttemptAt: string | null;
  lastSignaturePreview: string | null;
  disabledAt: string | null;
  disableReason: TenantWebhookDisableReason | null;
  retryPolicy: WebhookRetryPolicyRecord;
  secretRotation: {
    currentVersion: number;
    rotatedAt: string;
    rotationCount: number;
    history: TenantWebhookSecretRotationRecord[];
  };
}

export interface CreateTenantWebhookEndpointCommand {
  url: string;
  secret: string;
  events: string[];
}

export const TENANT_WEBHOOK_ENDPOINT_STATUSES = [
  "active",
  "test_pending",
  "disabled",
] as const;
export type TenantWebhookEndpointStatus =
  (typeof TENANT_WEBHOOK_ENDPOINT_STATUSES)[number];

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
  retryPolicy?: WebhookRetryPolicyRecord;
  runtimeMetadata?: TenantWebhookRuntimeMetadata;
  secretHistory?: TenantWebhookSecretRotationRecord[];
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

export const TENANT_PASSENGER_MASTER_ROLES = [
  "passenger",
  "employee",
  "cardholder",
  "vip",
] as const;
export type TenantPassengerMasterRole =
  (typeof TENANT_PASSENGER_MASTER_ROLES)[number];

export const TENANT_PASSENGER_QUALITY_ISSUES = [
  "missing_contact",
  "missing_employee_no",
  "duplicate_employee_no",
] as const;
export type TenantPassengerQualityIssue =
  (typeof TENANT_PASSENGER_QUALITY_ISSUES)[number];

export interface TenantPassengerRecord {
  passengerId: string;
  tenantId: string;
  fullName: string;
  employeeNo: string | null;
  departmentName: string | null;
  mobile: string | null;
  email: string | null;
  roles?: TenantPassengerMasterRole[];
  qualityIssues?: TenantPassengerQualityIssue[];
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
  roles?: TenantPassengerMasterRole[];
  activeFlag?: boolean;
  metadata?: Record<string, unknown>;
}

export const TENANT_ADDRESS_GEOCODE_SOURCES = [
  "none",
  "manual",
  "provider",
] as const;
export type TenantAddressGeocodeSource =
  (typeof TENANT_ADDRESS_GEOCODE_SOURCES)[number];

export const TENANT_ADDRESS_QUALITY_ISSUES = [
  "missing_geocode",
  "duplicate_normalized_address",
] as const;
export type TenantAddressQualityIssue =
  (typeof TENANT_ADDRESS_QUALITY_ISSUES)[number];

export interface TenantAddressRecord {
  addressId: string;
  tenantId: string;
  ownerPassengerId: string | null;
  addressName: string;
  addressText: string;
  normalizedAddressText?: string;
  maskedAddressText?: string;
  sensitiveFlag?: boolean;
  geocodeSource?: TenantAddressGeocodeSource;
  qualityIssues?: TenantAddressQualityIssue[];
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
  sensitiveFlag?: boolean;
  geocodeSource?: TenantAddressGeocodeSource;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
  activeFlag?: boolean;
}

export interface TenantAddressExportViewRecord {
  addressId: string;
  tenantId: string;
  ownerPassengerId: string | null;
  addressName: string;
  maskedAddressText: string | null;
  sensitiveFlag: boolean;
  geocodeSource: TenantAddressGeocodeSource;
  qualityIssues: TenantAddressQualityIssue[];
  tags: string[];
  activeFlag: boolean;
  exportGeneratedAt: string;
}

export interface TenantCostCenterRecord {
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  activeFlag: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTenantCostCentersQuery {
  activeOnly?: boolean;
  ownerUserId?: string;
  search?: string;
}

export interface UpsertTenantCostCenterCommand {
  code: string;
  name: string;
  description?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  activeFlag?: boolean;
}

export interface DisableTenantCostCenterCommand {
  code: string;
  reason?: string | null;
}

export interface TenantCostCenterCoverageSample {
  rawCostCenter: string;
  occurrences: number;
  suggestion: string | null;
}

export interface TenantCostCenterCoverageReport {
  tenantId: string;
  generatedAt: string;
  totalBookings: number;
  resolvedCount: number;
  unresolvedCount: number;
  disabledHits: number;
  unresolvedSamples: TenantCostCenterCoverageSample[];
}

// --- Tenant Approval Rules ---
export const TENANT_PRINCIPAL_KINDS = [
  "tenant_user",
  "tenant_role",
  "cost_center_owner",
  "tenant_finance_admin",
  "tenant_admin",
  "user", // Added from brief
  "role", // Added from brief
] as const;
export type TenantPrincipalKind = (typeof TENANT_PRINCIPAL_KINDS)[number];

export interface TenantPrincipalRef {
  kind: TenantPrincipalKind | "user" | "role";
  userId?: string;
  roleCode?: string;
  costCenterCode?: string;
  displayName?: string | null;
}

export type TenantRuleApproverDescriptor = TenantPrincipalRef;

export interface TenantResolvedApproverRecord {
  descriptor: TenantRuleApproverDescriptor;
  principal: TenantPrincipalRef | null;
  displayName: string | null;
  status: "resolved" | "unresolved";
  reasonCode: string;
}

export const TENANT_APPROVAL_RULE_ACTIONS = [
  "allow",
  "warn",
  "flag_manual_review",
  "require_approval",
  "block",
] as const;
export type TenantApprovalRuleAction =
  (typeof TENANT_APPROVAL_RULE_ACTIONS)[number];

export const TENANT_APPROVAL_MODES = [
  "any_of",
  "all_of_parallel",
  "ordered_chain",
] as const;
export type TenantApprovalMode = (typeof TENANT_APPROVAL_MODES)[number];

export const TENANT_APPROVAL_RULE_CONDITION_FIELDS = [
  "booking.amount_minor",
  "booking.business_dispatch_subtype",
  "booking.vehicle_preference",
  "booking.direction",
  "booking.flight_no_present",
  "booking.reservation_window_start",
  "booking.passenger.role",
  "booking.passenger.id",
  "cost_center.code",
  "cost_center.monthly_quota_remaining_amount_minor",
  "cost_center.monthly_quota_remaining_percent",
  "tenant.monthly_quota_remaining_amount_minor",
  "tenant.monthly_quota_remaining_percent",
] as const;
export type TenantApprovalRuleConditionField =
  (typeof TENANT_APPROVAL_RULE_CONDITION_FIELDS)[number];

export const TENANT_APPROVAL_RULE_CONDITION_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "exists",
  "equals",
  "not_equals",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
] as const;
export type TenantApprovalRuleConditionOperator =
  (typeof TENANT_APPROVAL_RULE_CONDITION_OPERATORS)[number];

export interface TenantApprovalRuleCondition {
  field: TenantApprovalRuleConditionField;
  op?: TenantApprovalRuleConditionOperator;
  operator?: TenantApprovalRuleConditionOperator;
  value?: string | number | boolean | Array<string | number | boolean> | null;
  values?: Array<string | number | boolean>;
}

export type TenantApprovalFallbackPolicy =
  | "auto_reject"
  | "escalate_to_tenant_admin"
  | "manual_ops_review";

export interface TenantApprovalPlan {
  approvalMode: TenantApprovalMode;
  approvers: TenantPrincipalRef[];
  timeoutHours: number;
  fallbackPolicy: TenantApprovalFallbackPolicy;
  escalationTarget: TenantPrincipalRef | null;
}

export interface TenantApprovalWarning {
  source: "rule" | "quota";
  code: string;
  ruleId: string | null;
  message: string;
  messageCode?: string;
}

export interface TenantApprovalEvaluationInputSnapshot {
  costCenterCode: string | null;
  businessDispatchSubtype: string | null;
  reservationWindowStart: string | null;
  reservationWindowEnd?: string | null;
  passengerId: string | null;
  passengerRole: string | null;
  amountMinor: number | null;
  currency: string | null;
  vehiclePreference: string | null;
  direction?: string | null;
  flightNoPresent?: boolean | null;
  flightNo?: string | null;
  partnerEntrySlug?: string | null;
  eligibilityVerificationId?: string | null;
  signoffRequired?: boolean | null;
  expenseProofRequired?: boolean | null;
}

export interface TenantApprovalMatchedRuleResult {
  ruleId: string;
  ruleName: string;
  priority: number;
  action: TenantApprovalRuleAction;
  approvalMode: TenantApprovalMode | null;
  approvers: TenantPrincipalRef[];
  matchedConditions: TenantApprovalRuleCondition[];
  priorityAtEvaluation?: number;
  resolvedApprovers?: TenantResolvedApproverRecord[];
}

export interface TenantApprovalRuleRecord {
  ruleId: string;
  tenantId: string;
  ruleName?: string;
  name?: string;
  description?: string | null;
  priority: number;
  activeFlag: boolean;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  conditions: TenantApprovalRuleCondition[];
  action: TenantApprovalRuleAction;
  approvalMode: TenantApprovalMode | null;
  approvers: TenantPrincipalRef[];
  timeoutHoursOverride?: number | null;
  fallbackPolicyOverride?: TenantApprovalFallbackPolicy | null;
  escalationTarget?: TenantPrincipalRef | null;
  disabledAt?: string | null;
  disabledReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTenantApprovalRulesQuery {
  activeOnly?: boolean;
  search?: string;
  action?: TenantApprovalRuleAction;
}

export interface UpsertTenantApprovalRuleCommand {
  ruleId?: string;
  ruleName?: string;
  name?: string;
  description?: string | null;
  priority: number;
  activeFlag?: boolean;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  conditions: TenantApprovalRuleCondition[];
  action: TenantApprovalRuleAction;
  approvalMode?: TenantApprovalMode | null;
  approvers?: TenantPrincipalRef[];
  timeoutHoursOverride?: number | null;
  fallbackPolicyOverride?: TenantApprovalFallbackPolicy | null;
  escalationTarget?: TenantPrincipalRef | null;
  disabledReason?: string | null;
}

export interface ReorderTenantApprovalRulesCommand {
  orderedRuleIds?: string[];
  ruleIds?: string[];
}

export interface EvaluateTenantApprovalRuleCommand {
  subject?: {
    subjectType: "booking";
    bookingId: string | null;
    draftId: string | null;
    operation: "create" | "update" | "cancel" | "dry_run";
  };
  inputSnapshot?: TenantApprovalEvaluationInputSnapshot;
  quotaImpacts?: TenantBookingQuotaImpactResult[];
  includeInactive?: boolean;
  sampleBooking?: Partial<{
    amountMinor: number | null;
    businessDispatchSubtype: string | null;
    vehiclePreference: string | null;
    direction: string | null;
    flightNoPresent: boolean | null;
    flightNo: string | null;
    reservationWindowStart: string | null;
    passengerRole: string | null;
    passengerId: string | null;
    costCenterCode: string | null;
    costCenterMonthlyQuotaRemainingAmountMinor: number | null;
    costCenterMonthlyQuotaRemainingPercent: number | null;
    tenantMonthlyQuotaRemainingAmountMinor: number | null;
    tenantMonthlyQuotaRemainingPercent: number | null;
  }>;
}

export interface TenantApprovalEvaluationResult {
  evaluationId?: string;
  tenantId?: string;
  evaluatedAt: string;
  subject?: {
    subjectType: "booking";
    bookingId: string | null;
    draftId: string | null;
    operation: "create" | "update" | "cancel" | "dry_run";
  };
  inputSnapshot?: TenantApprovalEvaluationInputSnapshot;
  matchedRules: TenantApprovalMatchedRuleResult[];
  quotaImpacts?: TenantBookingQuotaImpactResult[];
  outcome?: {
    decision: "allow" | "warn" | "require_approval" | "block" | "manual_review";
    approvalRequired: boolean;
    blocked: boolean;
    warnings: TenantApprovalWarning[];
    reasonCodes: string[];
  };
  approvalPlan?: TenantApprovalPlan | null;
  auditSummary?: {
    ruleVersionSnapshot: string;
    quotaSnapshotVersion: string | null;
    costCenterCode: string | null;
  };
  ruleSetVersion?: string;
  finalAction?: TenantApprovalRuleAction;
  hardBlockReasonCodes?: string[];
  warnings?: TenantApprovalWarning[];
}

export const TENANT_APPROVAL_RULE_PRIORITY_STEP = 10;

export type TenantBookingApprovalState =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected"
  | "blocked"
  | "cancelled_by_re_evaluation";

export const TENANT_BOOKING_APPROVAL_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled_by_re_evaluation",
  "timeout_escalated",
] as const;
export type TenantBookingApprovalRequestStatus =
  (typeof TENANT_BOOKING_APPROVAL_REQUEST_STATUSES)[number];

export interface TenantBookingApprovalDecisionRecord {
  decisionId: string;
  approvalRequestId: string;
  actorUserId: string;
  actorRoleCode: string | null;
  decision: "approve" | "reject";
  reasonCode: string | null;
  reasonNote: string | null;
  decidedAt: string;
}

export interface TenantBookingApprovalRequestRecord {
  approvalRequestId: string;
  tenantId: string;
  bookingId: string;
  orderId: string;
  evaluationId: string;
  ruleIds: string[];
  status: TenantBookingApprovalRequestStatus;
  approvalMode: TenantApprovalMode;
  approvers: TenantPrincipalRef[];
  resolvedApproverUserIds: string[];
  previousApprovers: TenantPrincipalRef[];
  decisions: TenantBookingApprovalDecisionRecord[];
  evaluationSnapshot: TenantApprovalEvaluationResult;
  timeoutAt: string;
  escalatedAt: string | null;
  fallbackPolicy: TenantApprovalFallbackPolicy;
  escalationTarget: TenantPrincipalRef | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface OpsPendingApprovalRequestRecord extends TenantBookingApprovalRequestRecord {
  slaBreached: boolean;
  lastNudgedAt: string | null;
  lastNudgedByActorId: string | null;
  lastNudgedByActorType: IdentityContext["actorType"] | null;
  opsSlaAcknowledgedAt: string | null;
  opsSlaAcknowledgedByActorId: string | null;
  opsSlaAcknowledgedByActorType: IdentityContext["actorType"] | null;
}

export interface ListTenantBookingApprovalRequestsQuery {
  status?: TenantBookingApprovalRequestStatus;
  bookingId?: string;
}

export interface ListOpsPendingApprovalRequestsQuery {
  tenantId?: string;
  status?: TenantBookingApprovalRequestStatus;
  expiresBefore?: string;
}

export interface ApproveTenantBookingApprovalRequestCommand {
  reasonNote?: string | null;
}

export interface RejectTenantBookingApprovalRequestCommand {
  reasonCode: string;
  reasonNote?: string | null;
}

export interface EscalateTenantBookingApprovalRequestCommand {
  reasonNote?: string | null;
}

export interface NudgeOpsApprovalRequestCommand {
  reasonNote?: string | null;
}

export interface AcknowledgeOpsApprovalRequestBreachCommand {
  reasonNote?: string | null;
}

// --- Tenant Quotas ---
export type TenantQuotaPeriod = "monthly";
export type TenantQuotaEnforcementMode =
  | "warn_only"
  | "require_approval"
  | "hard_block";

export interface TenantQuotaLimit {
  bookingCountLimit: number | null;
  amountMinorLimit: number | null;
  currency: string;
  enforcementMode: TenantQuotaEnforcementMode;
}

export interface TenantQuotaUsage {
  pendingReservedBookingCount: number;
  confirmedBookingCount: number;
  pendingReservedAmountMinor: number;
  confirmedAmountMinor: number;
  bookingCountRemaining: number | null;
  amountMinorRemaining: number | null;
  remainingPercent: number | null;
}

export interface TenantQuotaLedgerEntry {
  ledgerEntryId: string;
  tenantId: string;
  costCenterCode: string | null;
  periodKey: string;
  dimension: "booking_count" | "amount_minor";
  amount: number;
  entryType: "reserve" | "release" | "consume" | "adjust";
  bookingId: string;
  evaluationId: string;
  createdAt: string;
}

export interface TenantBookingQuotaImpactResult {
  scope: "tenant" | "cost_center";
  costCenterCode: string | null;
  periodKey: string;
  dimension: "booking_count" | "amount_minor";
  remainingBefore: number | null;
  delta: number;
  remainingAfter: number | null;
  limitValue: number | null;
  remainingPercentAfter: number | null;
  enforcementMode: TenantQuotaEnforcementMode;
  triggered: "none" | "warn" | "approval" | "block";
}

export interface TenantQuotaPolicyRecord {
  tenantId: string;
  costCenterCode: string | null;
  period: TenantQuotaPeriod;
  limit: TenantQuotaLimit;
  inheritedFromTenant: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTenantQuotaPolicyCommand {
  costCenterCode?: string | null;
  period: TenantQuotaPeriod;
  limit: TenantQuotaLimit;
}

export interface TenantQuotaSummary {
  tenantId: string;
  period: TenantQuotaPeriod;
  periodKey: string;
  limit: TenantQuotaLimit;
  usage: TenantQuotaUsage;
  refreshedAt: string;
}

export interface TenantCostCenterQuotaSummary {
  tenantId: string;
  costCenterCode: string;
  period: TenantQuotaPeriod;
  periodKey: string;
  limit: TenantQuotaLimit;
  usage: TenantQuotaUsage;
  inheritedFromTenant: boolean;
  refreshedAt: string;
}

export interface TenantBookingQuotaImpactQuery {
  bookingId?: string | null;
  costCenterCode?: string | null;
  costCenter?: string | null;
  estimatedAmountMinor?: number | null;
  amountMinor?: number | null;
  currency?: string;
  reservationWindowStart: string;
  tripStartsAt?: string;
  businessDispatchSubtype?: string | null;
}

export interface TenantBookingQuotaImpactPreview {
  evaluationId: string;
  periodKey: string;
  impacts: TenantBookingQuotaImpactResult[];
  combinedTriggered: "none" | "warn" | "approval" | "block";
}

// --- Tenant User & Roles ---
export type TenantUserRoleStatus = "invited" | "active" | "suspended";

export interface TenantUserRoleRecord {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  roleCode: string;
  status: TenantUserRoleStatus;
  approvalNotificationOptOut: boolean;
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
  approvalNotificationOptOut?: boolean;
}

export interface TenantRoleCatalogRecord {
  roleCode: string;
  displayName: string;
  description: string;
  assignable: boolean;
}

// --- Tenant API Keys ---
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

export const TENANT_API_KEY_ALLOWED_SCOPES = [
  "audit:read",
  "reports:read",
  "reports:write",
  "tenant:read",
  "tenant:write",
  "tenant:billing:read",
  "tenant:billing:write",
  "tenant:sla:read",
  "tenant:sla:write",
  "tenant:webhooks:read",
  "tenant:webhooks:write",
] as const;

export interface TenantApiKeyGovernancePolicy {
  allowedScopes: string[];
  compatibilityAliases: Record<string, string>;
  defaultLifetimeDays: number;
  maxLifetimeDays: number;
  requireExpiry: boolean;
  breakGlassRequiresPlatformApproval: boolean;
  revokeEffect: "immediate";
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

// --- Tenant Webhooks ---
export interface TenantWebhookGovernancePolicy {
  testEventType: string;
  autoDisableAfterConsecutiveFailures: number;
  revalidationRequiredOnCreate: boolean;
  revalidationRequiredOnEndpointMutation: boolean;
  revalidationRequiredOnSecretRotation: boolean;
  deliveryFailureNotificationChannel: NotificationRecord["channel"];
  retryPolicy: WebhookRetryPolicyRecord;
}

export interface TenantIntegrationGovernancePackage {
  tenantId: string;
  generatedAt: string;
  apiKeyPolicy: TenantApiKeyGovernancePolicy;
  webhookPolicy: TenantWebhookGovernancePolicy;
  baselineWebhookEvents: string[];
  baselineNotificationSubscriptions: TenantNotificationSubscription[];
  onboardingChecklist: string[];
}

// --- Orders ---
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
  "dispatch_timeout",
  "no_supply",
  "delayed_queue",
  "exception_hold",
] as const;
export type OwnedOrderStatus = (typeof OWNED_ORDER_STATUSES)[number];

export const DISPATCH_JOB_STATUSES = [
  "matching",
  "reserved",
  "queued",
  "assigned",
  "failed",
  "timed_out",
  "no_supply",
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

export const DISPATCH_QUEUE_FAMILIES = [
  "realtime_ready_queue",
  "reservation_confirmation_queue",
  "redispatch_priority_queue",
  "delayed_retry_queue",
  "exception_hold_queue",
  "recording_gate_queue",
  "manual_review_queue",
] as const;
export type DispatchQueueFamily = (typeof DISPATCH_QUEUE_FAMILIES)[number];

export const DISPATCH_QUEUE_ENTRY_REASONS = [
  "realtime_ready_for_dispatch",
  "reservation_confirmation_window_open",
  "redispatch_retry_required",
  "recording_missing_for_dispatch",
  "dispatch_manual_review_required",
  "dispatch_timeout_retry",
  "no_supply_delayed_retry",
  "no_supply_escalated_to_ops",
  "exception_hold_no_eligible_supply",
  "exception_hold_confirmation_window_expired",
  "exception_hold_driver_rejected_in_window",
  "exception_hold_manual_escalation",
] as const;
export type DispatchQueueEntryReason =
  (typeof DISPATCH_QUEUE_ENTRY_REASONS)[number];

// --- Queue-Entry Policy ---

export const QUEUE_ENTRY_POLICY_MAP: Record<
  DispatchSemantics,
  {
    allowsQueueEntry: boolean;
    requiresSiteCheckIn: boolean;
    requiresVehicleDispatchable: boolean;
  }
> = {
  realtime: {
    allowsQueueEntry: true,
    requiresSiteCheckIn: true,
    requiresVehicleDispatchable: true,
  },
  reservation: {
    allowsQueueEntry: false,
    requiresSiteCheckIn: false,
    requiresVehicleDispatchable: false,
  },
  queue: {
    allowsQueueEntry: true,
    requiresSiteCheckIn: true,
    requiresVehicleDispatchable: true,
  },
  forwarder_broadcast: {
    allowsQueueEntry: false,
    requiresSiteCheckIn: false,
    requiresVehicleDispatchable: false,
  },
} as const;

export const ORDER_SOURCE_DISPATCH_SEMANTICS_MAP: Record<
  OwnedOrderSource,
  DispatchSemantics
> = {
  app: "realtime",
  web: "realtime",
  phone: "realtime",
  portal: "reservation",
  api: "reservation",
  concierge: "realtime",
} as const;

// --- Reservation Hold State Transitions ---

export const RESERVATION_HOLD_VALID_TRANSITIONS: Record<
  ReservationHoldStatus,
  readonly ReservationHoldStatus[]
> = {
  none: ["requested"],
  requested: ["released", "redispatch_queue", "exception_hold"],
  released: [],
  redispatch_queue: ["requested", "released", "exception_hold"],
  exception_hold: ["requested", "released"],
} as const;

// --- Exception-Hold Reason Codes ---

export const EXCEPTION_HOLD_REASON_CODES = [
  "no_eligible_supply",
  "confirmation_window_expired",
  "driver_rejected_in_window",
  "manual_escalation",
] as const;
export type ExceptionHoldReasonCode =
  (typeof EXCEPTION_HOLD_REASON_CODES)[number];

export interface ExceptionHoldCriteria {
  isReservation: boolean;
  isWithinConfirmationWindow: boolean;
  hasEligibleSupply: boolean;
  reasonCode: ExceptionHoldReasonCode;
}

export interface ResolveExceptionHoldCommand {
  resolution: "release_to_dispatch" | "cancel_order";
  operatorId?: string;
  reason: string;
  traceId: string;
}

export const OVERRIDE_REQUEST_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
  "expired",
] as const;
export type OverrideRequestStatus = (typeof OVERRIDE_REQUEST_STATUSES)[number];

export interface RequestExceptionOverrideCommand {
  operatorId?: string;
  reason: string;
  overrideType: "release_to_dispatch" | "cancel_order";
  expiresInMinutes?: number;
}

export interface ApproveExceptionOverrideCommand {
  operatorId?: string;
  approvalNote: string;
}

export interface RejectExceptionOverrideCommand {
  operatorId?: string;
  rejectionReason: string;
}

export interface OverrideRequestRecord {
  overrideRequestId: string;
  orderId: string;
  overrideType: "release_to_dispatch" | "cancel_order";
  status: OverrideRequestStatus;
  requestedBy: {
    actorType: "platform_admin" | "ops_user";
    actorId: string;
  };
  reason: string;
  requestedAt: string;
  expiresAt: string;
  approval: {
    actorType: "platform_admin" | "ops_user";
    actorId: string;
    approvalNote: string;
    approvedAt: string;
  } | null;
  rejection: {
    actorType: "platform_admin" | "ops_user";
    actorId: string;
    rejectionReason: string;
    rejectedAt: string;
  } | null;
  expiredAt: string | null;
}

export interface AddressPayload {
  addressId?: string | null;
  addressName?: string | null;
  address: string;
  normalizedAddress?: string | null;
  maskedAddress?: string | null;
  sensitive?: boolean;
  lat?: number | null;
  lng?: number | null;
}

export interface PassengerProfile {
  passengerId?: string | null;
  name: string;
  phone: string;
  roles?: TenantPassengerMasterRole[];
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
  recordedAt?: string;
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

export const COMPLIANCE_GATE_TYPES = [
  "recording",
  "proof",
  "eligibility",
] as const;
export type ComplianceGateType = (typeof COMPLIANCE_GATE_TYPES)[number];

export const COMPLIANCE_GATE_STATES = [
  "clear",
  "pending",
  "blocked",
  "review_required",
] as const;
export type ComplianceGateState = (typeof COMPLIANCE_GATE_STATES)[number];

export const COMPLIANCE_GATE_EVIDENCE_STATES = [
  "not_required",
  "missing",
  "submitted",
  "verified",
] as const;
export type ComplianceGateEvidenceState =
  (typeof COMPLIANCE_GATE_EVIDENCE_STATES)[number];

export const COMPLIANCE_IMPACT_STAGES = [
  "dispatch",
  "completion",
  "settlement",
] as const;
export type ComplianceImpactStage = (typeof COMPLIANCE_IMPACT_STAGES)[number];

export interface ComplianceStageImpact {
  stage: ComplianceImpactStage;
  effect: "clear" | "blocked" | "review_required";
  reason: string;
}

export interface ComplianceGateRecord {
  gateType: ComplianceGateType;
  title: string;
  state: ComplianceGateState;
  required: boolean;
  blocking: boolean;
  evidenceState: ComplianceGateEvidenceState;
  evidenceRefs: string[];
  missingItems: string[];
  nextAction: string;
  reviewerLabel: string | null;
  overrideAllowed: boolean;
  overrideActors: AuditLogRecord["actorType"][];
  impacts: ComplianceStageImpact[];
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
  passengerId?: string;
  pickupAddressId?: string;
  dropoffAddressId?: string;
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
  /** Canonical tenant cost-center code from the tenant directory. */
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
  quotedFareRuleVersion?: string;
  minPhotoCount?: number;
  expenseProofRequired?: boolean;
}

export interface UpdateTenantBookingCommand {
  businessDispatchSubtype?: BusinessDispatchSubtype;
  passengerId?: string | null;
  pickupAddressId?: string | null;
  dropoffAddressId?: string | null;
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
  /** Canonical tenant cost-center code from the tenant directory. */
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
  quotedFareRuleVersion?: string | null;
  minPhotoCount?: number;
  expenseProofRequired?: boolean;
}

export type QuotedFareSource = "platform_pricing_rule" | "ops_manual_override";

export interface ManualFareOverrideRecord {
  actorType: "platform_admin" | "ops_user";
  actorId: string;
  reason: string;
  traceId: string;
  previousQuotedFare: MoneyAmount | null;
  previousQuotedFareSource: QuotedFareSource;
  overriddenAt: string;
}

export interface ExceptionHoldResolutionRecord {
  resolution: ResolveExceptionHoldCommand["resolution"];
  actorType: "platform_admin" | "ops_user";
  actorId: string;
  reason: string;
  traceId: string;
  resolvedAt: string;
  downstreamReviewerLabels: string[];
  downstreamStages: ComplianceImpactStage[];
}

export interface ExceptionHoldRecord {
  reasonCode: ExceptionHoldReasonCode;
  dispatchJobId: string | null;
  raisedAt: string;
  criteria: ExceptionHoldCriteria;
  overrideAllowed: boolean;
  overrideActors: ("platform_admin" | "ops_user")[];
  resolution: ExceptionHoldResolutionRecord | null;
  overrideRequest: OverrideRequestRecord | null;
}

export interface ApplyManualFareOverrideCommand {
  fare: MoneyAmount;
  reason: string;
  traceId: string;
  quotedFareRuleVersion?: string | null;
}

export interface DispatchOrderCommand {
  mode: "auto";
}

export interface AssignDispatchCommand {
  dispatchJobId: string;
  vehicleId: string;
  driverId: string;
}

export interface ReassignDispatchCommand {
  dispatchJobId: string;
  vehicleId: string;
  driverId: string;
  reasonCode: string;
  reasonNote?: string;
}

export interface RedispatchOrderCommand {
  reasonCode: string;
  reasonNote?: string;
  operatorId?: string;
  escalationTarget?: "ops_supervisor" | "dispatch_manager" | null;
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
  quotedFareSource: QuotedFareSource | null;
  quotedFareRuleVersion: string | null;
  manualFareOverride: ManualFareOverrideRecord | null;
  exceptionHold: ExceptionHoldRecord | null;
  proofRequirements: {
    minPhotoCount: number;
    signoffRequired: boolean;
    expenseProofRequired: boolean;
  };
  approvalState: TenantBookingApprovalState;
  approvalRequestIds: string[];
  complianceGates?: ComplianceGateRecord[];
  complianceFlags: string[];
  cancelledAt: string | null;
  cancelReason: string | null;
  reservationHoldStatus: ReservationHoldStatus;
  reservationHoldId: string | null;
  reservationHoldExpiresAt: string | null;
  queueFamily?: DispatchQueueFamily | null;
  queueEntryReason?: DispatchQueueEntryReason | null;
  dispatchAttemptCount: number;
  lastDispatchFailureReason: string | null;
  noSupplyEscalation: NoSupplyEscalationRecord | null;
  dispatchTimeout: DispatchTimeoutRecord | null;
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
  quotedFare: MoneyAmount | null;
  quotedFareSource: QuotedFareSource | null;
  quotedFareRuleVersion: string | null;
  manualFareOverride: ManualFareOverrideRecord | null;
  approvalState: TenantBookingApprovalState;
  approvalRequestIds: string[];
  complianceGates?: ComplianceGateRecord[];
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
  locationState?: DispatchCandidateLocationState;
  currentLocation?: DriverLocationSnapshot | null;
}

export const DISPATCH_CANDIDATE_LOCATION_STATES = [
  "live",
  "stale",
  "no_location",
] as const;
export type DispatchCandidateLocationState =
  (typeof DISPATCH_CANDIDATE_LOCATION_STATES)[number];

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
  outcome:
    | "candidate_found"
    | "assigned"
    | "reassigned"
    | "rejected"
    | "timed_out"
    | "no_supply"
    | "failed";
  reasonCode: string | null;
  createdAt: string;
}

// --- Redispatch / Reassign Reason Codes ---

export const REDISPATCH_REASON_CODES = [
  "operator_redispatch",
  "driver_rejected",
  "dispatch_timeout",
  "no_supply_available",
  "vehicle_became_unavailable",
  "customer_request",
  "system_redispatch",
] as const;
export type RedispatchReasonCode = (typeof REDISPATCH_REASON_CODES)[number];

export const REASSIGN_REASON_CODES = [
  "operator_reassign",
  "driver_unavailable",
  "vehicle_swap",
  "customer_request",
  "load_balancing",
] as const;
export type ReassignReasonCode = (typeof REASSIGN_REASON_CODES)[number];

// --- No-Supply Escalation ---

export const NO_SUPPLY_ESCALATION_ACTIONS = [
  "retry_dispatch",
  "expand_search_radius",
  "escalate_to_ops",
  "move_to_delayed_queue",
  "cancel_with_notification",
] as const;
export type NoSupplyEscalationAction =
  (typeof NO_SUPPLY_ESCALATION_ACTIONS)[number];

export interface NoSupplyEscalationRecord {
  orderId: string;
  dispatchJobId: string;
  attemptCount: number;
  lastAttemptAt: string;
  escalationAction: NoSupplyEscalationAction;
  escalatedAt: string;
  resolvedAt: string | null;
}

// --- Dispatch Timeout ---

export interface DispatchTimeoutRecord {
  orderId: string;
  dispatchJobId: string;
  timeoutAt: string;
  timeoutReasonCode: "acceptance_timeout" | "matching_timeout";
  previousAssignmentId: string | null;
  escalationAction: NoSupplyEscalationAction;
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
  complianceGates?: ComplianceGateRecord[];
  forwardedStatus?: string | null;
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

export const DRIVER_TASK_VIEW_SOURCES = ["drts", ...PLATFORM_CODES] as const;
export type DriverTaskViewSource = (typeof DRIVER_TASK_VIEW_SOURCES)[number];

export const DRIVER_TASK_ACTIONS = [
  "accept",
  "reject",
  "depart",
  "arrived_pickup",
  "start",
  "complete",
] as const;
export type DriverTaskAction = (typeof DRIVER_TASK_ACTIONS)[number];

export const DRIVER_TASK_ACTION_STATES = [
  "action_required",
  "awaiting_platform",
  "in_progress",
  "blocked",
  "completed",
  "read_only",
] as const;
export type DriverTaskActionState = (typeof DRIVER_TASK_ACTION_STATES)[number];

export const DRIVER_TASK_AUTHORITY_MODES = [
  "drts",
  "external_platform",
] as const;
export type DriverTaskAuthorityMode =
  (typeof DRIVER_TASK_AUTHORITY_MODES)[number];

export interface UnifiedDriverTaskView {
  taskId: string;
  orderId: string;
  orderDomain: OrderDomain;
  sourcePlatform: DriverTaskViewSource;
  platformDisplayName: string;
  externalOrderId: string | null;
  nativeStatus: string | null;
  localStatus: DriverTaskStatus | ForwardedOrderStatus;
  driverActionState: DriverTaskActionState;
  allowedActions: DriverTaskAction[];
  routeLocked: boolean;
  fareAuthority: DriverTaskAuthorityMode;
  settlementAuthority: DriverTaskAuthorityMode;
  driverPayoutAuthority: DriverTaskAuthorityMode;
  requiresManualFallback: boolean;
  requiresReauth: boolean;
  syncIssueSummary: string | null;
  blockingReason: string | null;
  pickupSummary: string | null;
  dropoffSummary: string | null;
  deadlineAt: string | null;
  updatedAt: string;
}

export type OpsDispatchStreamEventType =
  | "order_created"
  | "order_updated"
  | "dispatch_job_updated"
  | "driver_location_updated"
  | "supply_lifecycle_updated";

export interface OpsDispatchOrderCreatedEventData {
  order: OwnedOrderRecord;
}

export interface OpsDispatchOrderUpdatedEventData {
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

export interface OpsDispatchSupplyLifecycleUpdatedEventData {
  vehicleId: string;
  dispatchableFlag: boolean;
  blockedReasons: SupplyDispatchBlockReason[];
  lifecycle: VehicleSupplyLifecycleRecord;
}

export type OpsDispatchStreamEventData =
  | OpsDispatchOrderCreatedEventData
  | OpsDispatchOrderUpdatedEventData
  | OpsDispatchJobUpdatedEventData
  | OpsDispatchDriverLocationUpdatedEventData
  | OpsDispatchSupplyLifecycleUpdatedEventData;

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

export type VehicleContractLifecycleStatus =
  | "missing"
  | "draft"
  | "active"
  | "expired"
  | "terminated";

export type InsurancePolicyLifecycleStatus =
  | "missing"
  | "pending"
  | "active"
  | "expired"
  | "cancelled";

export type DispatchExclusivityLifecycleStatus =
  | "missing"
  | "pending_review"
  | "active"
  | "expired"
  | "revoked"
  | "rejected";

export type SupplyDispatchBlockReason =
  | "manual_hold"
  | "contract_missing"
  | "contract_draft"
  | "contract_expired"
  | "contract_terminated"
  | "insurance_missing"
  | "insurance_pending"
  | "insurance_expired"
  | "insurance_cancelled"
  | "exclusivity_missing"
  | "exclusivity_pending_review"
  | "exclusivity_expired"
  | "exclusivity_revoked"
  | "exclusivity_rejected"
  | "offboarding_pending_debranding";

export type VehicleOffboardingStatus =
  | "none"
  | "scheduled"
  | "debranding_required"
  | "completed";

export type VehicleDebrandingStatus = "not_required" | "pending" | "completed";

export interface SupplyLifecycleTraceRecord {
  entityType:
    | "vehicle"
    | "contract"
    | "insurance_policy"
    | "exclusivity"
    | "offboarding";
  status: string;
  reasonCode: SupplyDispatchBlockReason | null;
  message: string;
  occurredAt: string;
  relatedEntityId: string | null;
}

export interface VehicleSupplyLifecycleRecord {
  contract: {
    contractId: string | null;
    lifecycleStatus: VehicleContractLifecycleStatus;
    startAt: string | null;
    endAt: string | null;
    updatedAt: string | null;
  };
  insurance: {
    policyId: string | null;
    lifecycleStatus: InsurancePolicyLifecycleStatus;
    startAt: string | null;
    endAt: string | null;
    updatedAt: string | null;
  };
  exclusivity: {
    lifecycleStatus: DispatchExclusivityLifecycleStatus;
    declarationStatus: "missing" | "submitted";
    declarationFileId: string | null;
    reviewStatus: "draft" | "pending" | "approved" | "rejected";
    providerName: string | null;
    effectiveStart: string | null;
    effectiveEnd: string | null;
    reviewedAt: string | null;
    updatedAt: string | null;
  };
  dispatch: {
    eligible: boolean;
    blockedReasons: SupplyDispatchBlockReason[];
    evaluatedAt: string;
  };
  offboarding: {
    status: VehicleOffboardingStatus;
    reason: string | null;
    requestedAt: string | null;
    effectiveAt: string | null;
    completedAt: string | null;
    requestedBy: string | null;
    debrandingRequired: boolean;
    debrandingStatus: VehicleDebrandingStatus;
    debrandingDueAt: string | null;
    debrandingCompletedAt: string | null;
    debrandingTicketId: string | null;
    notes: string | null;
  };
  lastTrace: SupplyLifecycleTraceRecord | null;
}

export interface VehicleRegistryRecord {
  vehicleId: string;
  plateNo: string;
  operatingArea: string;
  supportedServiceBuckets: Phase1ServiceBucket[];
  dispatchableFlag: boolean;
  exclusivityApproved: boolean;
  insuranceStatus: "valid" | "expired";
  updatedAt: string;
  supplyLifecycle: VehicleSupplyLifecycleRecord;
}

export interface DriverRegistryRecord {
  driverId: string;
  name: string;
  supportedServiceBuckets: Phase1ServiceBucket[];
  workState: DriverWorkState;
  licensesValid: boolean;
  lifecycleStatus: DriverMasterLifecycleStatus;
  eligibilityBlockedReasons: DriverEligibilityBlockReason[];
  dispatchEligible: boolean;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  suspendedAt: string | null;
  retiredAt: string | null;
  profileUpdatedAt: string | null;
  deviceBindings: DriverDeviceBindingSummary[];
}

export interface UpdateVehicleComplianceCommand {
  dispatchableFlag?: boolean;
  exclusivityApproved?: boolean;
  insuranceStatus?: "valid" | "expired";
}

export interface UpdateDriverWorkStateCommand {
  workState: DriverWorkState;
}

export const DRIVER_MASTER_LIFECYCLE_STATUSES = [
  "draft",
  "active",
  "suspended",
  "retired",
] as const;
export type DriverMasterLifecycleStatus =
  (typeof DRIVER_MASTER_LIFECYCLE_STATUSES)[number];

export const DRIVER_ELIGIBILITY_BLOCK_REASONS = [
  "lifecycle_draft",
  "lifecycle_suspended",
  "lifecycle_retired",
  "licenses_invalid",
  "work_state_reserved",
  "work_state_enroute",
  "work_state_arrived",
  "work_state_on_trip",
  "work_state_paused",
  "work_state_suspended",
  "work_state_incident_hold",
  "work_state_offline",
] as const;
export type DriverEligibilityBlockReason =
  (typeof DRIVER_ELIGIBILITY_BLOCK_REASONS)[number];

export interface CreateDriverMasterCommand {
  driverId?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  emergencyContact?: DriverProfileEmergencyContact | null;
  bankAccount?: DriverProfileBankAccount | null;
  supportedServiceBuckets?: Phase1ServiceBucket[];
  licensesValid?: boolean;
  lifecycleStatus?: DriverMasterLifecycleStatus;
}

export interface UpdateDriverMasterLifecycleCommand {
  lifecycleStatus: DriverMasterLifecycleStatus;
  reason?: string | null;
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
  lifecycleStatus: VehicleContractLifecycleStatus;
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
  lifecycleStatus: InsurancePolicyLifecycleStatus;
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
  lifecycleStatus: DispatchExclusivityLifecycleStatus;
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

export interface RejectExclusivityCommand {
  reviewerId?: string | null;
  reviewedAt?: string;
  reason?: string | null;
}

export interface InitiateVehicleOffboardingCommand {
  reason: string;
  effectiveAt?: string | null;
  requestedBy?: string | null;
  debrandingRequired?: boolean;
  debrandingDueAt?: string | null;
  debrandingTicketId?: string | null;
  notes?: string | null;
}

export interface CompleteVehicleDebrandingCommand {
  completedAt?: string;
  debrandingTicketId?: string | null;
  notes?: string | null;
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

export type CallRecordingState = "ready" | "pending" | "missing";

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
  recordingState: CallRecordingState;
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

export const COMPLAINT_RESOLUTION_CODES = [
  "resolved_with_apology",
  "resolved_with_refund",
  "resolved_with_credit",
  "resolved_with_corrective_action",
  "resolved_driver_warning",
  "resolved_driver_suspension",
  "resolved_no_fault",
  "resolved_duplicate",
  "resolved_withdrawn",
  "resolved_item_returned",
  "resolved_item_not_found",
  "resolved_other",
] as const;
export type ComplaintResolutionCode =
  (typeof COMPLAINT_RESOLUTION_CODES)[number];

export const COMPLAINT_CATEGORY_VALID_RESOLUTIONS: Record<
  ComplaintCategory,
  readonly ComplaintResolutionCode[]
> = {
  late_arrival: [
    "resolved_with_apology",
    "resolved_with_refund",
    "resolved_with_credit",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  no_arrival: [
    "resolved_with_apology",
    "resolved_with_refund",
    "resolved_with_credit",
    "resolved_with_corrective_action",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  driver_service: [
    "resolved_with_apology",
    "resolved_with_refund",
    "resolved_with_credit",
    "resolved_driver_warning",
    "resolved_driver_suspension",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  vehicle_condition: [
    "resolved_with_apology",
    "resolved_with_refund",
    "resolved_with_corrective_action",
    "resolved_driver_warning",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  route_issue: [
    "resolved_with_apology",
    "resolved_with_refund",
    "resolved_with_credit",
    "resolved_with_corrective_action",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  fare_dispute: [
    "resolved_with_refund",
    "resolved_with_credit",
    "resolved_with_corrective_action",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  safety_concern: [
    "resolved_with_apology",
    "resolved_with_corrective_action",
    "resolved_driver_warning",
    "resolved_driver_suspension",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  lost_and_found: [
    "resolved_item_returned",
    "resolved_item_not_found",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
  other: [
    "resolved_with_apology",
    "resolved_with_refund",
    "resolved_with_credit",
    "resolved_with_corrective_action",
    "resolved_no_fault",
    "resolved_duplicate",
    "resolved_withdrawn",
    "resolved_other",
  ],
};

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
  resolutionCode: ComplaintResolutionCode;
  closingNote: string;
}

export interface EscalateComplaintToIncidentCommand {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
}

export interface TransferCallToIncidentCommand {
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  relatedOrderId?: string | null;
  relatedVehicleId?: string | null;
  relatedDriverId?: string | null;
}

export interface LinkComplaintToIncidentCommand {
  incidentId: string;
}

export interface ComplaintCaseRecord {
  caseNo: string;
  caseSource: "phone" | "web" | "app" | "ops";
  relatedOrderId: string | null;
  relatedCallId: string | null;
  relatedIncidentId: string | null;
  category: ComplaintCategory;
  severity: "normal" | "high";
  description: string;
  assigneeId: string | null;
  status: ComplaintCaseStatus;
  slaDueAt: string;
  slaBreach: boolean;
  reopenCount: number;
  resolutionCode: ComplaintResolutionCode | null;
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
    | "sla_recalculated"
    | "case_resolved"
    | "case_closed"
    | "escalated_to_incident"
    | "incident_linked";
  note: string;
  createdAt: string;
}

export interface ComplaintExportViewRecord {
  complaintCase: ComplaintCaseRecord;
  timeline: ComplaintTimelineEntry[];
  exportGeneratedAt: string;
  readyForAudit: boolean;
}

// --- Billing ---
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
  costCenterCode?: string | null;
  costCenterName?: string | null;
  ownerUserId?: string | null;
  activeFlag?: boolean | null;
  legacy_unmapped?: boolean;
  serviceBucket?: Phase1ServiceBucket;
  businessDispatchSubtype?: BusinessDispatchSubtype | null;
  channelKey?: string;
  orderSource?: OwnedOrderSource;
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
  channelKey?: string;
  orderSource?: OwnedOrderSource;
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
  channelKey?: string;
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

// --- Reconciliation ---
export const RECONCILIATION_ISSUE_TYPES = [
  "forwarder_status_mismatch",
  "partner_sponsor_mismatch",
] as const;
export type ReconciliationIssueType =
  (typeof RECONCILIATION_ISSUE_TYPES)[number];

export const RECONCILIATION_ISSUE_STATUSES = [
  "open",
  "assigned",
  "resolved",
  "reopened",
] as const;
export type ReconciliationIssueStatus =
  (typeof RECONCILIATION_ISSUE_STATUSES)[number];

export const RECONCILIATION_ISSUE_RESOLUTION_CODES = [
  "mirror_resynced",
  "sponsor_corrected",
  "external_owner_confirmed",
  "writeoff_approved",
  "duplicate_closed",
  "no_action_required",
  "resolved_other",
] as const;
export type ReconciliationIssueResolutionCode =
  (typeof RECONCILIATION_ISSUE_RESOLUTION_CODES)[number];

export interface ReconciliationIssueCommentRecord {
  commentId: string;
  actorId: string;
  message: string;
  artifactIds: string[];
  createdAt: string;
}

export interface CreateReconciliationIssueCommand {
  issueType: ReconciliationIssueType;
  summary: string;
  openedBy: string;
  assigneeId?: string | null;
  channelKey?: string | null;
  orderId?: string | null;
  tenantId?: string | null;
  partnerId?: string | null;
  partnerProgramId?: string | null;
  sponsorReference?: string | null;
  mirrorOrderId?: string | null;
  externalOrderId?: string | null;
  linkedReconciliationJobId?: string | null;
  comment?: string | null;
  artifactIds?: string[];
}

export interface AssignReconciliationIssueCommand {
  assigneeId: string;
  actorId: string;
  note?: string | null;
}

export interface AddReconciliationIssueCommentCommand {
  actorId: string;
  message: string;
  artifactIds?: string[];
}

export interface ResolveReconciliationIssueCommand {
  actorId: string;
  resolutionCode: ReconciliationIssueResolutionCode;
  resolutionSummary: string;
  artifactIds?: string[];
}

export interface ReopenReconciliationIssueCommand {
  actorId: string;
  reason: string;
  artifactIds?: string[];
}

export interface ReconciliationIssueForwardedFinanceContext {
  platformCode: PlatformCode;
  reconciliationReason: "sync_failed" | "manual_fallback";
  fareAuthority: DriverTaskAuthorityMode;
  settlementAuthority: DriverTaskAuthorityMode;
  driverPayoutAuthority: DriverTaskAuthorityMode;
  localLedgerMode: "shadow_only";
  note: string | null;
}

export interface ReconciliationIssueRecord {
  issueId: string;
  issueType: ReconciliationIssueType;
  source: "finance_manual" | "forwarder_auto";
  status: ReconciliationIssueStatus;
  channelKey: string;
  summary: string;
  ownerId: string | null;
  openedBy: string;
  orderId: string | null;
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  sponsorReference: string | null;
  mirrorOrderId: string | null;
  externalOrderId: string | null;
  linkedReconciliationJobId: string | null;
  linkedInvoiceId: string | null;
  linkedReimbursementBatchId: string | null;
  forwardedFinanceContext: ReconciliationIssueForwardedFinanceContext | null;
  resolutionCode: ReconciliationIssueResolutionCode | null;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  reopenCount: number;
  evidenceArtifactIds: string[];
  comments: ReconciliationIssueCommentRecord[];
  createdAt: string;
  updatedAt: string;
}

// --- Reports ---
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

export interface SettlementMatrixRecord {
  channelKey: string;
  channelLabel: string;
  orderDomain: "owned" | "forwarded";
  orderSources: string[];
  payerType: string;
  sponsorType: string;
  invoiceOwner: string;
  invoicePath: string;
  receiptOwner: string;
  driverPayoutAuthority: string;
  discountFundingSource: string;
  reimbursementRule: string;
  reconciliationPath: string;
  reportingArtifacts: string[];
  localLedgerMode: "full_service" | "shadow_only";
  notes: string;
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
  costCenterCode: string | null;
  costCenterName: string | null;
  ownerUserId: string | null;
  activeFlag: boolean | null;
  legacy_unmapped: boolean;
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
  evidenceGovernance?: EvidenceSubjectGovernanceRecord | null;
  rows?: DispatchRecordingIndexRowRecord[];
  partnerRevenueRows?: PartnerRevenueSummaryRowRecord[];
  settlementMatrix?: SettlementMatrixRecord[];
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
  evidenceGovernance?: EvidenceSubjectGovernanceRecord | null;
}

// --- Forwarder Orders ---
export const FORWARDED_ORDER_STATUSES = [
  "received",
  "broadcasted",
  "accept_pending",
  "confirmed_by_platform",
  "completed_synced",
  "lost_race",
  "cancelled_by_platform",
  "sync_failed",
] as const;
export type ForwardedOrderStatus = (typeof FORWARDED_ORDER_STATUSES)[number];

export const ADAPTER_HEALTH_STATUSES = ["healthy", "degraded", "down"] as const;
export type AdapterHealthStatus = (typeof ADAPTER_HEALTH_STATUSES)[number];

export const ADAPTER_HEALTH_REASONS = [
  "none",
  "platform",
  "auth",
  "webhook",
  "rate_limit",
  "credential",
  "stub",
] as const;
export type AdapterHealthReason = (typeof ADAPTER_HEALTH_REASONS)[number];

export const ADAPTER_CREDENTIAL_STATUSES = [
  "unknown",
  "valid",
  "invalid",
  "expired",
  "not_configured",
  "stub",
] as const;
export type AdapterCredentialStatus =
  (typeof ADAPTER_CREDENTIAL_STATUSES)[number];

export const ADAPTER_AUTH_STATUSES = [
  "unknown",
  "authenticated",
  "reauth_required",
  "invalid",
  "stub",
] as const;
export type AdapterAuthStatus = (typeof ADAPTER_AUTH_STATUSES)[number];

export const ADAPTER_WEBHOOK_STATUSES = [
  "not_applicable",
  "unknown",
  "healthy",
  "failing",
  "not_configured",
  "stub",
] as const;
export type AdapterWebhookStatus = (typeof ADAPTER_WEBHOOK_STATUSES)[number];

export const ADAPTER_RATE_LIMIT_STATUSES = [
  "unknown",
  "ok",
  "limited",
  "cooldown",
  "stub",
] as const;
export type AdapterRateLimitStatus =
  (typeof ADAPTER_RATE_LIMIT_STATUSES)[number];

export const FORWARDER_ADAPTER_MODES = [
  "stub",
  "api",
  "webhook",
  "hybrid",
] as const;
export type ForwarderAdapterMode = (typeof FORWARDER_ADAPTER_MODES)[number];

export const FORWARDER_ADAPTER_PRODUCTION_STATUSES = [
  "stub",
  "configuration_required",
  "production_ready",
] as const;
export type ForwarderAdapterProductionStatus =
  (typeof FORWARDER_ADAPTER_PRODUCTION_STATUSES)[number];

export interface ForwarderAdapterCapabilitySummary {
  mode: ForwarderAdapterMode;
  productionStatus: ForwarderAdapterProductionStatus;
  supportsInboundWebhook: boolean;
  supportsOutboundActions: boolean;
  supportedWebhookEvents: string[];
  notes: string[];
}

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

export interface DriverForwardedOrderAcceptCommand {
  driverId?: string;
}

export interface RelayDriverRejectCommand {
  driverId: string;
  reason?: string | null;
}

export interface DriverForwardedOrderRejectCommand {
  driverId?: string;
  reason?: string | null;
}

export interface SyncForwardedOrderStatusCommand {
  nativeStatus: string;
  payload?: Record<string, unknown>;
}

export interface ReportForwarderSyncFailureCommand {
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  nativeStatus?: string | null;
  manualFallbackReason?: string | null;
  payload?: Record<string, unknown>;
}

export interface EngageForwarderManualFallbackCommand {
  reason: string;
  requestedBy?: string | null;
  notes?: string | null;
}

export interface CompleteForwarderReconciliationCommand {
  nativeStatus: string;
  mismatchCount: number;
  notes?: string | null;
  payload?: Record<string, unknown>;
}

export interface ForwardedOrderFinanceContext {
  fareAuthority: "external_platform";
  settlementAuthority: "external_platform";
  driverPayoutAuthority: "external_platform";
  localLedgerMode: "shadow_only";
}

export interface ForwarderSyncErrorRecord {
  code: string;
  message: string;
  retryable: boolean;
  failedAt: string;
  nativeStatus: string | null;
  payload: Record<string, unknown>;
}

export interface ForwardedOrderManualFallbackRecord {
  required: boolean;
  reason: string | null;
  requestedAt: string | null;
  requestedBy: string | null;
  notes: string | null;
}

export interface ForwardedOrderRecord {
  mirrorOrderId: string;
  platformCode: PlatformCode;
  externalOrderId: string;
  orderDomain: "forwarded";
  dispatchSemantics: "forwarder_broadcast";
  status: ForwardedOrderStatus;
  candidateDriverIds: string[];
  acceptedDriverId: string | null;
  lastNativeStatus: string | null;
  payload: Record<string, unknown>;
  authoritativeSnapshot: Record<string, unknown>;
  financeContext: ForwardedOrderFinanceContext;
  lastSyncError: ForwarderSyncErrorRecord | null;
  manualFallback: ForwardedOrderManualFallbackRecord;
  reconciliationJob: ReconciliationJobRecord | null;
  createdAt: string;
  updatedAt: string;
}

export const FORWARDED_DRIVER_ACTION_OUTCOMES = [
  "accept_pending",
  "confirmed_by_platform",
  "completed_synced",
  "lost_race",
  "cancelled_by_platform",
  "sync_failed",
  "rejected",
] as const;
export type ForwardedDriverActionOutcome =
  (typeof FORWARDED_DRIVER_ACTION_OUTCOMES)[number];

export interface ForwardedDriverActionCorrelationIds {
  mirrorOrderId: string;
  reconciliationJobId: string | null;
}

export interface ForwardedDriverActionResponse {
  action: Extract<DriverTaskAction, "accept" | "reject">;
  outcome: ForwardedDriverActionOutcome;
  driverMessage: string;
  taskView: UnifiedDriverTaskView | null;
  managementCorrelationIds: ForwardedDriverActionCorrelationIds;
}

export interface AdapterHealthRecord {
  platformCode: PlatformCode;
  status: AdapterHealthStatus;
  reason: AdapterHealthReason;
  capabilitySummary: ForwarderAdapterCapabilitySummary;
  credentialStatus: AdapterCredentialStatus;
  authStatus: AdapterAuthStatus;
  webhookStatus: AdapterWebhookStatus;
  rateLimitStatus: AdapterRateLimitStatus;
  lastCheckedAt: string;
  lastError: string | null;
  lastWebhookReceivedAt: string | null;
  lastRateLimitAt: string | null;
  lastAuthFailureAt: string | null;
}

export interface ReconciliationJobRecord {
  reconciliationJobId: string;
  mirrorOrderId: string;
  platformCode: PlatformCode;
  externalOrderId: string;
  reason: "sync_failed" | "manual_fallback";
  status: "queued" | "completed";
  mismatchCount: number;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ForwarderReconciliationIssue {
  reconciliationJob: ReconciliationJobRecord;
  mirrorOrderId: string;
  platformCode: PlatformCode;
  externalOrderId: string;
  status: ForwardedOrderStatus;
  acceptedDriverId: string | null;
  lastSyncError: ForwarderSyncErrorRecord | null;
  financeContext: ForwardedOrderFinanceContext;
  manualFallback: ForwardedOrderManualFallbackRecord;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// W7-001D: Async job accepted responses
//
// These are the canonical accepted responses from POST command endpoints that
// trigger background / async jobs. The HTTP response body carries only the
// allocated job identifier and the initial status ("queued"), allowing the
// caller to poll the GET endpoint for completion.
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

export const INCIDENT_ESCALATION_TARGETS = [
  "ops_supervisor",
  "dispatch_manager",
  "safety_officer",
  "roc_duty",
] as const;
export type IncidentEscalationTarget =
  (typeof INCIDENT_ESCALATION_TARGETS)[number];

export interface UpdateIncidentCommand {
  status?: IncidentStatus;
  assignedTo?: string;
  resolutionNote?: string;
  escalationTarget?: IncidentEscalationTarget | null;
  severity?: IncidentSeverity;
}

export interface CreateIncidentFromDispatchExceptionCommand {
  orderId: string;
  exceptionReasonCode: string;
  exceptionNote?: string;
  severity: IncidentSeverity;
  escalationTarget?: IncidentEscalationTarget;
  reportedBy: string;
}

export interface RecordServiceRecoveryActionCommand {
  actionType:
    | "passenger_recontact"
    | "fare_adjustment"
    | "redispatch_ordered"
    | "voucher_issued"
    | "apology_sent"
    | "driver_reassigned"
    | "other";
  note: string;
  actor: string;
}

export interface ServiceRecoveryActionRecord {
  actionId: string;
  incidentId: string;
  actionType: string;
  note: string;
  actor: string;
  createdAt: string;
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
  escalationTarget: IncidentEscalationTarget | null;
  sourceDispatchExceptionOrderId: string | null;
  occurredAt: string | null;
  location: string | null;
  resolutionNote: string | null;
  serviceRecoveryActions: ServiceRecoveryActionRecord[];
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

export interface MaintenanceListItem extends MaintenanceRecord {
  availableActions: ResourceActionDescriptor[];
}

export interface MaintenanceListResponse {
  items: MaintenanceListItem[];
  availableActions: ResourceActionDescriptor[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
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
  deviceBindings: DriverDeviceBindingSummary[];
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

export const PLATFORM_TENANT_ROLLOUT_STAGES = [
  "sandbox",
  "pilot",
  "production",
] as const;
export type PlatformTenantRolloutStage =
  (typeof PLATFORM_TENANT_ROLLOUT_STAGES)[number];

export const PLATFORM_TENANT_GATE_STATUSES = [
  "pending",
  "ready",
  "approved",
  "blocked",
] as const;
export type PlatformTenantGateStatus =
  (typeof PLATFORM_TENANT_GATE_STATUSES)[number];

export const PLATFORM_TENANT_INTEGRATION_MODES = [
  "none",
  "api_key",
  "api_key_and_webhook",
  "partner_managed",
] as const;
export type PlatformTenantIntegrationMode =
  (typeof PLATFORM_TENANT_INTEGRATION_MODES)[number];

export interface PlatformTenantBootstrapRoleDefault {
  roleCode: string;
  displayName: string;
  required: boolean;
  invitedAt: string | null;
  acknowledgedAt: string | null;
}

export interface PlatformTenantBillingBaseline {
  invoiceTitle: string;
  contactName: string;
  email: string;
}

export interface PlatformTenantBootstrapDefaults {
  roleDefaults: PlatformTenantBootstrapRoleDefault[];
  billingBaseline: PlatformTenantBillingBaseline;
  notificationSubscriptions: TenantNotificationSubscription[];
  webhookEvents: string[];
}

export interface PlatformTenantIntegrationPackage {
  mode: PlatformTenantIntegrationMode;
  apiKeyScopes: string[];
  sandboxBaseUrl: string | null;
  productionBaseUrl: string | null;
}

export interface PlatformTenantRolloutState {
  stage: PlatformTenantRolloutStage;
  sandboxStatus: PlatformTenantGateStatus;
  pilotStatus: PlatformTenantGateStatus;
  productionStatus: PlatformTenantGateStatus;
  cutoverOwner: string | null;
  rollbackOwner: string | null;
  rollbackPrepared: boolean;
  lastPromotedAt: string | null;
  notes: string | null;
}

export interface PlatformAdminTenantRecord {
  id: string;
  code: string;
  name: string;
  status: "draft" | "active" | "paused" | "rollback_hold";
  enabledModules: PlatformTenantModule[];
  quotas: PlatformTenantQuotaSummary;
  bootstrapDefaults: PlatformTenantBootstrapDefaults;
  integrationPackage: PlatformTenantIntegrationPackage;
  rollout: PlatformTenantRolloutState;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantGovernanceSummaryQuery {
  page?: number;
  pageSize?: number;
}

export type PlatformTenantGovernanceAlertFlag =
  | "no_approvers_configured"
  | "quota_above_95_percent"
  | "pending_approval_over_48h";

export interface PlatformTenantGovernanceSummaryRow {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  tenantStatus: PlatformAdminTenantRecord["status"];
  tenantRolloutStage: PlatformTenantRolloutStage;
  costCenterCount: number;
  activeRuleCount: number;
  monthlyQuotaPercentUsed: number;
  pendingApprovalCount: number;
  oldestPendingApprovalAgeHours: number | null;
  alertFlags: PlatformTenantGovernanceAlertFlag[];
}

export type PlatformTenantGovernanceSummaryResponse =
  ApiListData<PlatformTenantGovernanceSummaryRow>;

export interface CreatePlatformTenantCommand {
  name: string;
  code: string;
  status?: "active" | "inactive";
  enabledModules?: PlatformTenantModule[];
  quotas?: Partial<PlatformTenantQuotaSummary>;
  integrationMode?: PlatformTenantIntegrationMode;
  bootstrapAdminEmail?: string;
  sandboxBaseUrl?: string | null;
}

export interface UpdatePlatformTenantOnboardingCommand {
  billingBaseline?: Partial<PlatformTenantBillingBaseline>;
  roleDefaults?: PlatformTenantBootstrapRoleDefault[];
  notificationSubscriptions?: TenantNotificationSubscription[];
  webhookEvents?: string[];
  integrationPackage?: Partial<PlatformTenantIntegrationPackage>;
  rollout?: Partial<Omit<PlatformTenantRolloutState, "stage">>;
}

export interface SetPlatformTenantRolloutStageCommand {
  stage: PlatformTenantRolloutStage;
  notes?: string | null;
}

export interface InviteTenantRoleCommand {
  roleCode: string;
  inviteeEmail?: string;
}

export interface AcknowledgeTenantRoleCommand {
  roleCode: string;
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

export const OPERATIONAL_ALERT_KEYS = [
  "dispatch_lag",
  "recording_backlog",
  "driver_state_lag",
  "webhook_failure_burst",
  "eligibility_review_backlog",
  "adapter_degradation",
] as const;
export type OperationalAlertKey = (typeof OPERATIONAL_ALERT_KEYS)[number];

export const OPERATIONAL_ALERT_STATES = [
  "healthy",
  "warning",
  "critical",
] as const;
export type OperationalAlertState = (typeof OPERATIONAL_ALERT_STATES)[number];

export const OPERATIONAL_ALERT_ROUTES = ["ops", "platform"] as const;
export type OperationalAlertRoute = (typeof OPERATIONAL_ALERT_ROUTES)[number];

export const OPERATIONAL_ALERT_UNITS = ["count", "minutes", "percent"] as const;
export type OperationalAlertUnit = (typeof OPERATIONAL_ALERT_UNITS)[number];

export interface OperationalAlertThresholds {
  warning: number;
  critical: number;
  unit: OperationalAlertUnit;
}

export interface OperationalAlertRecord {
  key: OperationalAlertKey;
  state: OperationalAlertState;
  measuredValue: number;
  thresholds: OperationalAlertThresholds;
  routes: OperationalAlertRoute[];
  observedAt: string;
}

export interface OperationalDispatchMetrics {
  activeOrders: number;
  queueDepth: number;
  laggedOrders: number;
  redispatchOrders: number;
  exceptionHoldOrders: number;
  dispatchFailedOrders: number;
  oldestReadyOrderLagMinutes: number | null;
}

export interface OperationalRecordingMetrics {
  phoneOrders: number;
  linkedOrders: number;
  pendingOrders: number;
  pendingCallSessions: number;
  missingRecordingLinks: number;
  oldestPendingLagMinutes: number | null;
  linkedRatioPercent: number;
}

export interface OperationalDriverStateMetrics {
  totalDrivers: number;
  availableDrivers: number;
  dispatchEligibleDrivers: number;
  offlineDrivers: number;
  staleLocationDrivers: number;
  missingLocationDrivers: number;
  oldestLocationLagMinutes: number | null;
}

export interface OperationalWebhookMetrics {
  totalEndpoints: number;
  activeEndpoints: number;
  disabledEndpoints: number;
  queuedDeliveries: number;
  failedDeliveriesLastHour: number;
  oldestQueuedDeliveryLagMinutes: number | null;
}

export interface OperationalEligibilityMetrics {
  totalReviewQueue: number;
  manualReviewQueue: number;
  manualFallbackQueue: number;
  ineligibleQueue: number;
  recentFailureCount24h: number;
}

export interface OperationalReportingMetrics {
  queuedJobs: number;
  failedJobs: number;
  dispatchRecordingIndexQueuedJobs: number;
}

export interface OperationalAdapterMetrics {
  totalAdapters: number;
  healthyAdapters: number;
  degradedAdapters: number;
  downAdapters: number;
}

export interface OperationalForwarderOpsMetrics {
  totalForwardedOrders: number;
  syncFailedOrders: number;
  acceptPendingOrders: number;
  manualFallbackQueue: number;
  reconciliationQueue: number;
  oldestSyncFailedLagMinutes: number | null;
  oldestAcceptPendingLagMinutes: number | null;
  oldestManualFallbackLagMinutes: number | null;
  oldestReconciliationLagMinutes: number | null;
}

export interface OperationalAdapterDetailRecord {
  platformCode: PlatformCode;
  status: AdapterHealthStatus;
  reason: AdapterHealthReason;
  credentialStatus: AdapterCredentialStatus;
  authStatus: AdapterAuthStatus;
  webhookStatus: AdapterWebhookStatus;
  rateLimitStatus: AdapterRateLimitStatus;
  capabilitySummary: ForwarderAdapterCapabilitySummary;
  lastCheckedAt: string;
  lastError: string | null;
  lastWebhookReceivedAt: string | null;
  lastRateLimitAt: string | null;
  lastAuthFailureAt: string | null;
}

export interface OperationalRoleView {
  route: OperationalAlertRoute;
  alertKeys: OperationalAlertKey[];
  focusAreas: Array<
    | "dispatch"
    | "recording"
    | "driver_state"
    | "webhook"
    | "eligibility"
    | "reporting"
    | "adapters"
    | "forwarder_ops"
  >;
}

export interface OperationalObservabilitySnapshot {
  generatedAt: string;
  alerts: OperationalAlertRecord[];
  dispatch: OperationalDispatchMetrics;
  recording: OperationalRecordingMetrics;
  driverState: OperationalDriverStateMetrics;
  webhook: OperationalWebhookMetrics;
  eligibility: OperationalEligibilityMetrics;
  reporting: OperationalReportingMetrics;
  adapters: OperationalAdapterMetrics;
  forwarderOps: OperationalForwarderOpsMetrics;
  adapterDetails: OperationalAdapterDetailRecord[];
  roleViews: OperationalRoleView[];
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
export * from "./platform-adapter-registry";
export * from "./ui-runtime";
