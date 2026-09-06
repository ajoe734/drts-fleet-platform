import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  AcknowledgeOpsApprovalRequestBreachCommand,
  AcceptTenantInvitationCommand,
  AcceptTenantInvitationResult,
  ActionReceipt,
  AuditLogRecord,
  ApproveTenantBookingApprovalRequestCommand,
  CreatePartnerChannelEntryCommand,
  CreatePartnerBootstrapSessionCommand,
  CreateReferralEmbedHandoffArtifactCommand,
  CreatePartnerIngressHandoffCommand,
  PartnerEntryBrandingMetadata,
  CreateTenantUserCommand,
  CanonicalIdentityInvitationRecord,
  EscalateTenantBookingApprovalRequestCommand,
  IdentityContext,
  CreateTenantWebhookEndpointCommand,
  DeleteTenantWebhookEndpointCommand,
  EmptyStateEnvelope,
  IssueTenantApiKeyCommand,
  IssuePartnerIngressCredentialCommand,
  IntegrationCredentialSignals,
  IntegrationCredentialStatus,
  IssuerContractExceptionRecord,
  IssuerContractPeriodAttainment,
  IssuerContractSlaMetric,
  IssuerContractSlaTarget,
  IssuerContractStatus,
  IssuerContractStatusRecord,
  PartnerEligibilityAdapterAttemptRecord,
  PartnerChannelEntryRecord,
  PartnerEntryStatus,
  PartnerEligibilityDecisionSource,
  PartnerEligibilityIntegrationContractRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressCredentialRecord,
  PartnerEligibilityManualFallbackPolicy,
  PartnerEligibilityManualFallbackRecord,
  PartnerEligibilityRetryPolicyRecord,
  PartnerEligibilitySensitiveDataPolicy,
  PartnerEligibilityReviewQueueItem,
  PartnerEligibilityReviewResolution,
  PartnerEligibilityVerificationRecord,
  RecordReferralEmbedConsentCommand,
  ReferralEmbedConsentBundle,
  ReferralEmbedHandoffArtifact,
  ReferralEmbedSession,
  ResolvePartnerEligibilityReviewCommand,
  ResourceActionDescriptor,
  RevokePartnerIngressCredentialCommand,
  RotateTenantApiKeyCommand,
  SendTestWebhookCommand,
  DisableTenantCostCenterCommand,
  EvaluateTenantApprovalRuleCommand,
  ListOpsPendingApprovalRequestsQuery,
  ListTenantBookingApprovalRequestsQuery,
  NudgeOpsApprovalRequestCommand,
  OpsPendingApprovalRequestRecord,
  ListTenantCostCentersQuery,
  ListTenantApprovalRulesQuery,
  RejectTenantBookingApprovalRequestCommand,
  TenantAddressExportViewRecord,
  TenantAddressGeocodeSource,
  TenantAddressQualityIssue,
  TenantAddressRecord,
  TenantBookingApprovalDecisionRecord,
  TenantBookingApprovalRequestRecord,
  TenantApprovalEvaluationResult,
  TenantApprovalRuleRecord,
  TenantBookingSummary,
  TenantCostCenterQuotaWarning,
  TenantDashboardSummary,
  TenantApiKeyGovernancePolicy,
  TenantApiKeyIssued,
  TenantApiKeyRecord,
  OwnedOrderRecord,
  RecalculateTenantSlaBookingsCommand,
  ReorderTenantApprovalRulesCommand,
  TenantBookingQuotaImpactPreview,
  TenantBookingQuotaImpactQuery,
  TenantBookingQuotaImpactResult,
  TenantCostCenterRecord,
  TenantCostCenterCoverageReport,
  TenantCostCenterCoverageSample,
  TenantCostCenterQuotaSummary,
  TenantNotificationPreferences,
  TenantPassengerMasterRole,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
  TenantIntegrationGovernancePackage,
  TenantInvitationView,
  TenantOrderListQuery,
  TenantProgramUsageRecord,
  TenantQuotaLedgerEntry,
  TenantQuotaLimit,
  TenantQuotaPolicyRecord,
  TenantQuotaSummary,
  TenantRoleCatalogRecord,
  TenantServiceProgramRecord,
  TenantSlaProfile,
  TenantSlaProfileView,
  TenantUserRoleRecord,
  TenantWebhookDisableReason,
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  TenantWebhookGovernancePolicy,
  TenantWebhookRuntimeMetadata,
  TenantWebhookSecretRotationRecord,
  UpdatePartnerChannelEntryCommand,
  UpdateTenantWebhookEndpointCommand,
  UpdateTenantNotificationsCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpsertTenantAddressCommand,
  UpsertTenantApprovalRuleCommand,
  UpsertTenantCostCenterCommand,
  UpsertTenantPassengerCommand,
  UpsertTenantQuotaPolicyCommand,
  VerifyPartnerEligibilityCommand,
  WebhookEventPayload,
  WebhookDeliveryRecord,
  WebhookRetryPolicyRecord,
  UiRefreshMetadata,
  ReferralRevenueShareRule,
} from "@drts/contracts";
import {
  PLATFORM_CURRENCY,
  REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
  REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES,
  PARTNER_REFERRAL_CHANNEL_KEY,
} from "@drts/contracts";

/** Seed referral revenue-share rules (mirrors the WP0 referral scaffold seed). */
const REFERRAL_REVENUE_SHARE_RULE_SEED: readonly ReferralRevenueShareRule[] =
  Object.freeze([
    Object.freeze({
      ruleId: "referral-rule-342de003-aed1-4f55-8dd2-bbd7738a2731",
      partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
      partnerEntrySlug: "yuhe-residence",
      rateType: "percent" as const,
      value: 15,
      currency: "TWD",
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
      settlementDirection: REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
      channelKey: PARTNER_REFERRAL_CHANNEL_KEY,
      createdAt: "2026-08-01T05:25:58.237Z",
      updatedAt: "2026-08-01T05:25:58.237Z",
    }),
    Object.freeze({
      ruleId: "referral-rule-demo-001",
      partnerId: "partner-referral-demo-001",
      partnerEntrySlug: "referral-demo-community",
      rateType: "percent" as const,
      value: 15,
      currency: PLATFORM_CURRENCY,
      effectiveFrom: "2026-06-01T00:00:00.000Z",
      effectiveUntil: null,
      settlementDirection: REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
      channelKey: PARTNER_REFERRAL_CHANNEL_KEY,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }),
  ]);

/** Admin upsert payload for a referral revenue-share rule (CRC-BE-006). */
export interface UpsertReferralRevenueShareRuleCommand {
  partnerEntrySlug: string;
  partnerId?: string;
  rateType: "percent" | "per_trip";
  value: number;
  currency?: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
}

import { ApiRequestError } from "../../common/api-envelope";
import type { CreateSecurityEventInput } from "../../common/audit/security-event-sanitizer";
import { generateDeterministicUuid } from "../../common/durable-identity";
import type { BillingSettlementService } from "../billing-settlement/billing-settlement.service";
import {
  assertEvidenceAccess,
  buildEvidenceAccessAuditSummary,
} from "../../common/evidence-governance";
import {
  maskOpaqueToken,
  maskAddress,
  maskEmail,
  maskName,
  maskPhone,
  previewOpaqueValue,
} from "../../common/sensitive-data-policy";
import {
  AuditNotificationService,
  type ApprovalNotificationRecipient,
} from "../audit-notification/audit-notification.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import type { ApprovalNotificationTemplateKey } from "../audit-notification/templates/approval-notification.templates";
import {
  BANK_CARD_INLINE_ELIGIBILITY_ADAPTER_CODE,
  BankCardInlineEligibilityAdapter,
} from "./bank-card-inline-eligibility.adapter";
import {
  PARTNER_ELIGIBILITY_ADAPTERS,
  PartnerEligibilityAdapterError,
  type PartnerEligibilityAdapterInput,
  type PartnerEligibilityAdapterInterface,
  type PartnerEligibilityAdapterResult,
} from "./partner-eligibility-adapter.interface";
import {
  REFERENCE_TOKEN_ELIGIBILITY_ADAPTER_CODE,
  ReferenceTokenEligibilityAdapter,
} from "./reference-token-eligibility.adapter";
import { IdentityRepository } from "../identity/identity.repository";
import { PartnerUserIdentityLinkRepository } from "./partner-user-identity-link.repository";
import {
  ReferralEmbedHandoffRepository,
  type PersistReferralEmbedHandoffCommand,
} from "./referral-embed-handoff.repository";
import {
  TenantPartnerRepository,
  type IdentityGovernanceChanges,
  type PersistTenantPartnerChanges,
  type StoredPartnerIngressCredentialRecord,
  type StoredTenantApiKeyRecord,
  type TenantPartnerState,
  type TenantPartnerQueryExecutor,
  type TenantQuotaMonthlySnapshotRecord,
  type StoredWebhookDeliveryRecord,
  type StoredWebhookEndpointRecord,
} from "./tenant-partner.repository";
import {
  APPROVAL_REEVALUATION_FIELDS,
  computeApprovalRequestStatus,
  hasActorDecidedApprovalRequest,
  resolveApprovalApproverUserIds,
  shouldReevaluateTenantBookingApproval,
  type ApprovalApproverFallbackRecord,
} from "./tenant-approval-workflow";
import {
  applyLedgerEntryToUsage,
  buildQuotaImpact,
  createEmptyTenantQuotaUsage,
  materializeUsage,
  toTenantQuotaPeriodKey,
} from "./tenant-quota-ledger";
import {
  WebhookDispatchService,
  type WebhookRetryPolicy,
} from "./webhook-dispatch.service";
import { evaluateTenantApprovalRules } from "./tenant-approval-rule-evaluator";
import { TenantInvitationDeliveryService } from "./tenant-invitation-delivery.service";
import type {
  PartnerReferralDashboardRecord,
  PartnerReferralRevenuePeriodRecord,
  PartnerReferralUsagePeriodRecord,
} from "./partner-referral-portal.types";
import type { ReferralStatementRecord } from "../billing-settlement/referral-statement.types";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

const DEMO_TENANT_ID = "tenant-demo-001";
const DEFAULT_TENANT_SERVICE_PROGRAM_ID = "tenant-program-enterprise-dispatch";

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

function cloneReferralRevenueShareRuleSeed(): ReferralRevenueShareRule[] {
  return REFERRAL_REVENUE_SHARE_RULE_SEED.map((rule) => ({ ...rule }));
}

function createInitialReferralRevenueShareRules(): ReferralRevenueShareRule[] {
  return isStrictAuthEnvironment() ? [] : cloneReferralRevenueShareRuleSeed();
}

type WebhookSecretRotationRecord = TenantWebhookSecretRotationRecord;

type WebhookRuntimeMetadata = TenantWebhookRuntimeMetadata & {
  retryPolicy: WebhookRetryPolicy;
  disableReason: TenantWebhookDisableReason | null;
};

type StoredWebhookSecretMaterial = WebhookSecretRotationRecord & {
  createdAt: string;
  secretValue: string;
  ownerRef: string | null;
  ownerName: string | null;
  ownerType: string | null;
  purpose: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedWorkload: string | null;
  status: IntegrationCredentialStatus;
  overlapEndsAt: string | null;
  autoRevokedAt: string | null;
  supersededByVersion: number | null;
  revokedAt: string | null;
  signals: IntegrationCredentialSignals;
};

/**
 * What a rotation history entry is allowed to publish. `createdAt` is carried
 * beyond the shared contract because tenant reads have always exposed it.
 */
type PublishedWebhookSecretRotationRecord = WebhookSecretRotationRecord & {
  createdAt: string;
};

type StoredWebhookEndpoint = TenantWebhookEndpoint & {
  secretValue: string;
  secretCredentials?: StoredWebhookSecretMaterial[];
  retryPolicy: WebhookRetryPolicy;
  runtimeMetadata: WebhookRuntimeMetadata;
  secretHistory: WebhookSecretRotationRecord[];
};

type StoredWebhookDelivery = WebhookDeliveryRecord & {
  attemptedAt: string;
  nextAttemptAt: string | null;
  signatureHeader: string;
  signatureVersion: number;
  secretVersion: number;
  retryPolicySnapshot: WebhookRetryPolicy;
  rawBody: Record<string, unknown>;
};

type RotateWebhookSecretCommand = {
  webhookId: string;
  secret: string;
  rotationReason?: string;
  ownerRef?: string | null;
  ownerName?: string | null;
  ownerType?: string | null;
  purpose?: string | null;
  expiresAt?: string | null;
  overlapDays?: number | null;
};

type PartnerIngressCredentialSeed = {
  entrySlug: string;
  keyId: string;
  apiKeyHash: string;
};

export const PARTNER_INGRESS_CREDENTIAL_SEEDS = Symbol(
  "PARTNER_INGRESS_CREDENTIAL_SEEDS",
);

type PartnerIngressCredentialBootstrap = {
  entrySlug: string;
  keyId: string;
  envVarName: string;
};

type PartnerIngressResolution = {
  partnerEntry: PartnerChannelEntryRecord;
  identity: IdentityContext;
};

type PartnerIngressHandoffResolution = PartnerIngressResolution & {
  drtsPassengerId: string;
};

type ReferralEmbedHandoffResolution = PartnerIngressHandoffResolution & {
  entryHost: string;
  consentRequired: boolean;
  consentBundleVersion: string | null;
  consentGrantedAt: string | null;
};

type PartnerEligibilityIdentity = Pick<
  IdentityContext,
  | "actorType"
  | "actorId"
  | "realm"
  | "tenantId"
  | "partnerId"
  | "partnerProgramId"
  | "partnerEntrySlug"
> & {
  requestId?: string | null;
};

type PartnerEligibilityExecutionResult = {
  result: PartnerEligibilityAdapterResult | null;
  fallbackReasonCode: string;
  attempts: PartnerEligibilityAdapterAttemptRecord[];
  adapterCode: string;
  adapterVersion: string;
};

type OrderFeedProvider = () => OwnedOrderRecord[];

type MaybePromise<T> = T | Promise<T>;

type TenantGovernanceMetricUnit =
  | "count"
  | "hours"
  | "milliseconds"
  | "percent";

type TenantGovernanceMetricSample = {
  name: string;
  labels: Record<string, string>;
  value: number;
  unit: TenantGovernanceMetricUnit;
};

type TenantGovernanceMetricsSnapshot = {
  generatedAt: string;
  namespace: "tenant_governance";
  samples: TenantGovernanceMetricSample[];
};

type TenantGovernanceMutationSnapshot = {
  approvalRequests: TenantBookingApprovalRequestRecord[];
  approvalDecisions: TenantBookingApprovalDecisionRecord[];
  quotaLedger: TenantQuotaLedgerEntry[];
  quotaMonthlySnapshots: TenantQuotaMonthlySnapshotRecord[];
};

const DEFAULT_WEBHOOK_RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 5,
  initialBackoffSeconds: 30,
  backoffMultiplier: 2,
  maxBackoffSeconds: 900,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

const PARTNER_ELIGIBILITY_DECISION_TTL_SECONDS = 30 * 60;
const TENANT_GOVERNANCE_METRIC_NAMESPACE = "tenant_governance";
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
const APPROVAL_NOTIFICATION_POLL_INTERVAL_MS = 60 * 1000;
const APPROVAL_NOTIFICATION_TIMEOUT_LEAD_MS = 12 * 60 * 60 * 1000;
const OPS_APPROVAL_REQUEST_NUDGE_ACTION =
  "booking.approval_request.nudged_by_ops";
const OPS_APPROVAL_REQUEST_SLA_ACK_ACTION =
  "booking.approval_request.sla_breach_acknowledged_by_ops";
const OPS_APPROVAL_QUEUE_ACTOR_TYPES = new Set<AuditLogRecord["actorType"]>([
  "ops_user",
  "platform_admin",
]);

const DEFAULT_PARTNER_ELIGIBILITY_RETRY_POLICY: PartnerEligibilityRetryPolicyRecord =
  {
    timeoutMs: 3_000,
    maxAttempts: 3,
    initialBackoffMs: 250,
    backoffMultiplier: 2,
    maxBackoffMs: 1_000,
    retryableErrorCodes: [
      "ISSUER_TIMEOUT",
      "ISSUER_RATE_LIMIT",
      "ISSUER_UNAVAILABLE",
      "ISSUER_5XX",
    ],
  };

const DEFAULT_PARTNER_ELIGIBILITY_MANUAL_FALLBACK_POLICY: PartnerEligibilityManualFallbackPolicy =
  {
    queue: "ops_console",
    requiredOnTimeout: true,
    requiredOnRetryExhausted: true,
    requiredOnAmbiguousResponse: true,
    requiredAuditFields: ["reasonCode", "requestedBy", "notes"],
  };

const DEFAULT_PARTNER_ELIGIBILITY_SENSITIVE_DATA_POLICY: PartnerEligibilitySensitiveDataPolicy =
  {
    referenceTokenStorage: "hash_only",
    rawTokenExposure: "never",
    benefitReferencePolicy: "canonical_internal_masked_exports",
    issuerAuthorizationReferencePolicy: "canonical_internal_masked_exports",
    auditExposure: "status_reason_only",
  };

const DEFAULT_TENANT_API_KEY_LIFETIME_DAYS = 60;
const MAX_TENANT_API_KEY_LIFETIME_DAYS = 90;
const DEFAULT_CREDENTIAL_ROTATION_OVERLAP_DAYS = 7;
const MAX_CREDENTIAL_ROTATION_OVERLAP_DAYS = 7;
const CREDENTIAL_APPROACHING_EXPIRY_THRESHOLD_DAYS = 14;
const CREDENTIAL_DORMANT_THRESHOLD_DAYS = 30;
const DEFAULT_PARTNER_INGRESS_CREDENTIAL_LIFETIME_DAYS = 90;
const MAX_PARTNER_INGRESS_CREDENTIAL_LIFETIME_DAYS = 90;
const DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS = 90;
const MAX_WEBHOOK_SECRET_LIFETIME_DAYS = 90;
const REFERRAL_EMBED_HANDOFF_EXPIRES_IN_SECONDS = 120;

const CANONICAL_TENANT_API_KEY_SCOPES = new Set<string>([
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
]);

const TENANT_API_KEY_SCOPE_ALIASES: Record<string, string> = {
  "tenant:bookings:write": "tenant:write",
  "tenant:reports:read": "reports:read",
};

const DEFAULT_TENANT_WEBHOOK_EVENTS = [
  "booking.created",
  "booking.updated",
  "dispatch.assigned",
  "invoice.issued",
];

const TENANT_INTEGRATION_HANDOFF_CHECKLIST = [
  "Confirm the tenant integration owner and rollback owner before issuing production credentials.",
  "Issue a scoped sandbox API key with an explicit expiry within the rotation window.",
  "Configure the tenant webhook endpoint and verify the initial secret preview with the consumer owner.",
  "Run a tenant.webhook.test delivery and wait for the endpoint to return to active status before cutover.",
  "Review delivery logs and authority notification feed for repeated failures or auto-disable events.",
  "Record the planned rotation date and the revocation procedure in the tenant cutover packet.",
];

const PASSENGER_SEED: TenantPassengerRecord[] = [
  {
    passengerId: "passenger-demo-001",
    tenantId: DEMO_TENANT_ID,
    fullName: "王小美",
    employeeNo: "E1001",
    departmentName: "總務部",
    mobile: "0911-000-001",
    email: "xiaomei.wang@acme.example",
    activeFlag: true,
    metadata: {
      preferredLanguage: "zh-TW",
    },
    roles: ["passenger", "employee"],
    qualityIssues: [],
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  },
  {
    passengerId: "passenger-demo-002",
    tenantId: DEMO_TENANT_ID,
    fullName: "陳大文",
    employeeNo: "E1002",
    departmentName: "業務部",
    mobile: "0911-000-002",
    email: "dawen.chen@acme.example",
    activeFlag: true,
    metadata: {
      costCenter: "sales",
    },
    roles: ["passenger"],
    qualityIssues: [],
    createdAt: "2026-04-10T00:05:00.000Z",
    updatedAt: "2026-04-10T00:05:00.000Z",
  },
];

const ADDRESS_SEED: TenantAddressRecord[] = [
  {
    addressId: "address-demo-001",
    tenantId: DEMO_TENANT_ID,
    ownerPassengerId: "passenger-demo-001",
    addressName: "Acme HQ",
    addressText: "台北市信義區市府路 1 號",
    normalizedAddressText: "台北市信義區市府路1號",
    maskedAddressText: "台北市信義區...",
    sensitiveFlag: false,
    geocodeSource: "provider",
    qualityIssues: [],
    lat: 25.0375,
    lng: 121.5637,
    tags: ["office"],
    activeFlag: true,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  },
];

const COST_CENTER_SEED: TenantCostCenterRecord[] = [
  {
    tenantId: DEMO_TENANT_ID,
    code: "CC-FIN-04",
    name: "財務處",
    description: "財務與季度稽核差旅",
    ownerUserId: "tenant-user-demo-003",
    ownerName: "財務管理員",
    activeFlag: true,
    disabledAt: null,
    disabledReason: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
  },
  {
    tenantId: DEMO_TENANT_ID,
    code: "CC-OPS-02",
    name: "營運處",
    description: "營運調度與站點巡檢",
    ownerUserId: "tenant-user-demo-002",
    ownerName: "營運管理員",
    activeFlag: true,
    disabledAt: null,
    disabledReason: null,
    createdAt: "2026-04-10T00:05:00.000Z",
    updatedAt: "2026-04-10T00:05:00.000Z",
  },
  {
    tenantId: DEMO_TENANT_ID,
    code: "CC-EXEC-01",
    name: "高階主管",
    description: "總經理室與高階接待",
    ownerUserId: null,
    ownerName: "CEO Office",
    activeFlag: true,
    disabledAt: null,
    disabledReason: null,
    createdAt: "2026-04-10T00:10:00.000Z",
    updatedAt: "2026-04-10T00:10:00.000Z",
  },
];

const USER_ROLE_SEED: TenantUserRoleRecord[] = [
  {
    userId: "tenant-user-demo-001",
    tenantId: DEMO_TENANT_ID,
    email: "admin@acme.example",
    displayName: "Acme Tenant Admin",
    roleCode: "tenant_admin",
    status: "active",
    approvalNotificationOptOut: false,
    invitedAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    subjectId: "sub_oidc_admin_acme",
    subject: "sub_oidc_admin_acme",
  },
  {
    userId: "tenant-user-demo-002",
    tenantId: DEMO_TENANT_ID,
    email: "ops@acme.example",
    displayName: "Acme Tenant Ops",
    roleCode: "tenant_ops_admin",
    status: "active",
    approvalNotificationOptOut: false,
    invitedAt: "2026-04-10T00:10:00.000Z",
    updatedAt: "2026-04-10T00:10:00.000Z",
    subjectId: "sub_oidc_ops_acme",
    subject: "sub_oidc_ops_acme",
  },
  {
    userId: "tenant-user-demo-003",
    tenantId: DEMO_TENANT_ID,
    email: "finance@acme.example",
    displayName: "Acme Tenant Finance",
    roleCode: "tenant_finance_admin",
    status: "active",
    approvalNotificationOptOut: false,
    invitedAt: "2026-04-10T00:20:00.000Z",
    updatedAt: "2026-04-10T00:20:00.000Z",
    subjectId: "sub_oidc_finance_acme",
    subject: "sub_oidc_finance_acme",
  },
  {
    userId: "tenant-user-demo-004",
    tenantId: DEMO_TENANT_ID,
    email: "viewer@acme.example",
    displayName: "Acme Tenant Viewer",
    roleCode: "tenant_viewer",
    status: "active",
    approvalNotificationOptOut: false,
    invitedAt: "2026-04-10T00:30:00.000Z",
    updatedAt: "2026-04-10T00:30:00.000Z",
    subjectId: "sub_oidc_viewer_acme",
    subject: "sub_oidc_viewer_acme",
  },
  {
    userId: "tenant-user-demo-invited",
    tenantId: DEMO_TENANT_ID,
    email: "invited@acme.example",
    displayName: "Acme Tenant Invited User",
    roleCode: "tenant_viewer",
    status: "invited",
    approvalNotificationOptOut: false,
    invitedAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    subjectId: "sub_invited",
    subject: "sub_invited",
  },
  {
    userId: "tenant-user-demo-suspended",
    tenantId: DEMO_TENANT_ID,
    email: "suspended@acme.example",
    displayName: "Acme Tenant Suspended User",
    roleCode: "tenant_viewer",
    status: "suspended",
    approvalNotificationOptOut: false,
    invitedAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    subjectId: "sub_suspended",
    subject: "sub_suspended",
  },
];

const TENANT_ROLE_CATALOG: TenantRoleCatalogRecord[] = [
  {
    roleCode: "tenant_admin",
    displayName: "Tenant Admin",
    description:
      "Full tenant-administration access across booking, billing, reporting, webhook, and user-management surfaces.",
    assignable: true,
  },
  {
    roleCode: "tenant_ops_admin",
    displayName: "Tenant Ops Admin",
    description:
      "Operational management access for booking, passenger directory, address book, and webhook workflows.",
    assignable: true,
  },
  {
    roleCode: "tenant_finance_admin",
    displayName: "Tenant Finance Admin",
    description:
      "Finance and reporting access for billing profiles, invoices, exports, and audit follow-up.",
    assignable: true,
  },
  {
    roleCode: "tenant_viewer",
    displayName: "Tenant Viewer",
    description:
      "Read-only access for tenant portal views without write or user-management authority.",
    assignable: true,
  },
];

const API_KEY_SEED: StoredTenantApiKeyRecord[] = [
  {
    apiKeyId: "tenant-api-key-demo-001",
    tenantId: DEMO_TENANT_ID,
    keyName: "Acme Integration Key",
    keyPrefix: "acme_live_",
    maskedSuffix: "****demo",
    scopes: ["tenant:write", "reports:read"],
    lastUsedAt: null,
    expiresAt: "2027-04-10T00:00:00.000Z",
    revokedAt: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    keyHash: "sha256:demo-acme-key",
  },
];

const PARTNER_ENTRY_SEED: PartnerChannelEntryRecord[] = [
  {
    partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
    partnerCode: "yuhe",
    partnerType: "referral_channel",
    programId: "program-referral-community",
    programCode: "REFERRAL_COMMUNITY",
    tenantId: DEMO_TENANT_ID,
    bankCode: null,
    entrySlug: "yuhe-residence",
    displayName: "御和物業",
    businessDispatchSubtype: "enterprise_dispatch",
    authMode: "partner_api_key",
    eligibilityMode: "none",
    entryHost: "app.yuhe-living.com.tw",
    entryPath: "/embed/yuhe-residence",
    themeAccent: "#0F766E",
    brandingMetadata: {
      displayName: "御和物業",
      themeAccent: "#0F766E",
      supportEmail: null,
      supportPhone: "0800-911-200",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-08-01T05:25:49.951Z",
    updatedAt: "2026-08-01T05:25:49.951Z",
    auditMetadata: {
      source: "platform_admin_console",
      requestId: "codex-yuhe-formal-20260801-create",
      createdBy: "platform_admin",
      updatedBy: "platform_admin",
    },
  },
  {
    partnerId: "partner-bank-demo-001",
    partnerCode: "bank_demo_alpha",
    partnerType: "bank_partner",
    programId: "program-airport-alpha",
    programCode: "AIRPORT_ALPHA",
    tenantId: DEMO_TENANT_ID,
    bankCode: "BANK_DEMO_ALPHA",
    entrySlug: "bank-demo-alpha-airport",
    displayName: "Bank Demo Alpha Airport Transfer",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "bank_card_inline",
    entryHost: null,
    entryPath: "/partner/bank-demo-alpha-airport",
    themeAccent: "#0b7285",
    brandingMetadata: {
      displayName: "Bank Demo Alpha Airport Transfer",
      themeAccent: "#0b7285",
      supportEmail: "alpha-airport@bank-demo.example",
      supportPhone: "0800-000-111",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    updatedAt: "2026-04-10T00:00:00.000Z",
    auditMetadata: {
      source: "seed_bootstrap",
      requestId: null,
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-bank-demo-002",
    partnerCode: "bank_demo_beta",
    partnerType: "bank_partner",
    programId: "program-airport-beta",
    programCode: "AIRPORT_BETA",
    tenantId: DEMO_TENANT_ID,
    bankCode: "BANK_DEMO_BETA",
    entrySlug: "bank-demo-beta-airport",
    displayName: "Bank Demo Beta Airport Transfer",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "reference_required",
    entryHost: null,
    entryPath: "/partner/bank-demo-beta-airport",
    themeAccent: "#5f3dc4",
    brandingMetadata: {
      displayName: "Bank Demo Beta Airport Transfer",
      themeAccent: "#5f3dc4",
      supportEmail: "beta-airport@bank-demo.example",
      supportPhone: "0800-000-222",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-04-10T00:10:00.000Z",
    updatedAt: "2026-04-10T00:10:00.000Z",
    auditMetadata: {
      source: "seed_bootstrap",
      requestId: null,
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-referral-demo-001",
    partnerCode: "referral_demo_community",
    partnerType: "referral_channel",
    programId: "program-referral-community",
    programCode: "REFERRAL_COMMUNITY",
    tenantId: DEMO_TENANT_ID,
    bankCode: null,
    entrySlug: "referral-demo-community",
    displayName: "Referral Demo Community Channel",
    businessDispatchSubtype: "enterprise_dispatch",
    authMode: "partner_api_key",
    eligibilityMode: "none",
    entryHost: "yuhe-residence.example",
    entryPath: "/partner/referral-demo-community",
    themeAccent: "#0f766e",
    brandingMetadata: {
      displayName: "Referral Demo Community Channel",
      themeAccent: "#0f766e",
      supportEmail: "community-referral@partner-demo.example",
      supportPhone: "0800-000-333",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    auditMetadata: {
      source: "seed_bootstrap",
      requestId: null,
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-ctbc-card-001",
    partnerCode: "ctbc",
    partnerType: "bank_partner",
    programId: "program-ctbc-world-elite",
    programCode: "WORLD_ELITE",
    tenantId: DEMO_TENANT_ID,
    bankCode: "CTBC",
    entrySlug: "ctbc",
    displayName: "CTBC World Elite",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "bank_card_inline",
    entryHost: "ride.ctbc.com.tw",
    entryPath: "/ctbc/program/site",
    themeAccent: "#0B2D5C",
    brandingMetadata: {
      displayName: "CTBC World Elite",
      themeAccent: "#0B2D5C",
      supportEmail: "world-elite@ctbc.example",
      supportPhone: "0800-024-365",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    auditMetadata: {
      source: "dev_seed_partner_booking_surface",
      requestId: "seed-partner-booking-ctbc",
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-cathay-card-001",
    partnerCode: "cathay",
    partnerType: "bank_partner",
    programId: "program-cathay-cube-world",
    programCode: "CUBE_WORLD",
    tenantId: DEMO_TENANT_ID,
    bankCode: "CATHAY",
    entrySlug: "cathay",
    displayName: "Cathay CUBE World",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "bank_card_inline",
    entryHost: "ride.cathaybk.com.tw",
    entryPath: "/cathay/program/site",
    themeAccent: "#0A3621",
    brandingMetadata: {
      displayName: "Cathay CUBE World",
      themeAccent: "#0A3621",
      supportEmail: "cube-world@cathay.example",
      supportPhone: "0800-818-001",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    auditMetadata: {
      source: "dev_seed_partner_booking_surface",
      requestId: "seed-partner-booking-cathay",
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-taishin-card-001",
    partnerCode: "taishin",
    partnerType: "bank_partner",
    programId: "program-taishin-infinite",
    programCode: "TAISHIN_INFINITE",
    tenantId: DEMO_TENANT_ID,
    bankCode: "TAISHIN",
    entrySlug: "taishin",
    displayName: "Taishin Infinite",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "bank_card_inline",
    entryHost: "ride.taishinbank.com.tw",
    entryPath: "/taishin/program/site",
    themeAccent: "#7C2241",
    brandingMetadata: {
      displayName: "Taishin Infinite",
      themeAccent: "#7C2241",
      supportEmail: "infinite@taishin.example",
      supportPhone: "0800-023-123",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-07-27T00:05:00.000Z",
    updatedAt: "2026-07-27T00:05:00.000Z",
    auditMetadata: {
      source: "dev_seed_partner_booking_surface",
      requestId: "seed-partner-booking-taishin",
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-dbs-card-001",
    partnerCode: "dbs",
    partnerType: "bank_partner",
    programId: "program-dbs-insignia",
    programCode: "DBS_INSIGNIA",
    tenantId: DEMO_TENANT_ID,
    bankCode: "DBS",
    entrySlug: "dbs",
    displayName: "DBS Insignia",
    businessDispatchSubtype: "credit_card_airport_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "bank_card_inline",
    entryHost: "ride.dbs.com.tw",
    entryPath: "/dbs/program/site",
    themeAccent: "#9B1B22",
    brandingMetadata: {
      displayName: "DBS Insignia",
      themeAccent: "#9B1B22",
      supportEmail: "insignia@dbs.example",
      supportPhone: "0800-808-889",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-07-27T00:10:00.000Z",
    updatedAt: "2026-07-27T00:10:00.000Z",
    auditMetadata: {
      source: "dev_seed_partner_booking_surface",
      requestId: "seed-partner-booking-dbs",
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-fubon-claim-001",
    partnerCode: "fubon",
    partnerType: "bank_partner",
    programId: "program-fubon-claim-mobility",
    programCode: "CLAIM_MOBILITY",
    tenantId: DEMO_TENANT_ID,
    bankCode: "FUBON",
    entrySlug: "fubon",
    displayName: "Fubon Claim Mobility",
    businessDispatchSubtype: "insurance_replacement_vehicle",
    authMode: "partner_api_key",
    eligibilityMode: "reference_required",
    entryHost: "claim.fubon-ins.com.tw",
    entryPath: "/fubon/program/site",
    themeAccent: "#0E6E50",
    brandingMetadata: {
      displayName: "Fubon Claim Mobility",
      themeAccent: "#0E6E50",
      supportEmail: "claim-mobility@fubon.example",
      supportPhone: "0800-073-588",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-06-16T00:05:00.000Z",
    updatedAt: "2026-06-16T00:05:00.000Z",
    auditMetadata: {
      source: "dev_seed_partner_booking_surface",
      requestId: "seed-partner-booking-fubon",
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
  {
    partnerId: "partner-lion-travel-001",
    partnerCode: "lion",
    partnerType: "bank_partner",
    programId: "program-lion-group-transfer",
    programCode: "GROUP_TRANSFER",
    tenantId: DEMO_TENANT_ID,
    bankCode: "LION",
    entrySlug: "lion",
    displayName: "Lion Group Transfer",
    businessDispatchSubtype: "travel_agency_transfer",
    authMode: "partner_api_key",
    eligibilityMode: "reference_required",
    entryHost: "booking.lion-travel.com.tw",
    entryPath: "/lion/program/site",
    themeAccent: "#B0420E",
    brandingMetadata: {
      displayName: "Lion Group Transfer",
      themeAccent: "#B0420E",
      supportEmail: "group-transfer@liontravel.example",
      supportPhone: "0800-090-068",
    },
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: "2026-06-16T00:10:00.000Z",
    updatedAt: "2026-06-16T00:10:00.000Z",
    auditMetadata: {
      source: "dev_seed_partner_booking_surface",
      requestId: "seed-partner-booking-lion",
      createdBy: "system:seed",
      updatedBy: "system:seed",
    },
  },
];

const PARTNER_INGRESS_CREDENTIAL_BOOTSTRAPS: readonly PartnerIngressCredentialBootstrap[] =
  [
    {
      entrySlug: "bank-demo-alpha-airport",
      keyId: "partner-key-alpha-demo",
      envVarName: "PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT",
    },
    {
      entrySlug: "bank-demo-beta-airport",
      keyId: "partner-key-beta-demo",
      envVarName: "PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT",
    },
    {
      entrySlug: "ctbc",
      keyId: "partner-key-ctbc-dev",
      envVarName: "PARTNER_INGRESS_KEY_CTBC",
    },
    {
      entrySlug: "cathay",
      keyId: "partner-key-cathay-dev",
      envVarName: "PARTNER_INGRESS_KEY_CATHAY",
    },
    {
      entrySlug: "yuhe-residence",
      keyId: "partner-key-yuhe-residence-dev",
      envVarName: "PARTNER_INGRESS_KEY_YUHE_RESIDENCE",
    },
    {
      entrySlug: "taishin",
      keyId: "partner-key-taishin-dev",
      envVarName: "PARTNER_INGRESS_KEY_TAISHIN",
    },
    {
      entrySlug: "dbs",
      keyId: "partner-key-dbs-dev",
      envVarName: "PARTNER_INGRESS_KEY_DBS",
    },
  ];

function hashPartnerApiKeyValue(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function resolvePartnerIngressCredentialsFromEnv(): readonly PartnerIngressCredentialSeed[] {
  return PARTNER_INGRESS_CREDENTIAL_BOOTSTRAPS.flatMap((bootstrap) => {
    const plaintextApiKey = process.env[bootstrap.envVarName]?.trim();
    if (!plaintextApiKey) {
      return [];
    }

    return [
      {
        entrySlug: bootstrap.entrySlug,
        keyId: bootstrap.keyId,
        apiKeyHash: hashPartnerApiKeyValue(plaintextApiKey),
      },
    ];
  });
}

function createBootstrapPartnerIngressCredential(
  seed: PartnerIngressCredentialSeed,
): StoredPartnerIngressCredentialRecord {
  return {
    keyId: seed.keyId,
    entrySlug: seed.entrySlug,
    keyPrefix: "env_bootstrap",
    maskedSuffix: "configured",
    source: "env_bootstrap",
    createdAt: "2026-04-10T00:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    issuedBy: "system:env_bootstrap",
    revokedBy: null,
    rotationReason: null,
    revokeReason: null,
    keyHash: seed.apiKeyHash,
  };
}

export type TenantQuotaAuditEntryInput = Omit<
  AuditLogRecord,
  "auditId" | "createdAt" | "requestId"
>;

export type TenantQuotaConsumptionCommitResult = {
  tenantId: string;
  ledgerEntries: TenantQuotaLedgerEntry[];
  updatedSnapshots: TenantQuotaMonthlySnapshotRecord[];
  auditEntries: TenantQuotaAuditEntryInput[];
};

@Injectable()
export class TenantPartnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantPartnerService.name);

  private notificationPreferences = new Map<
    string,
    TenantNotificationPreferences
  >([
    [DEMO_TENANT_ID, this.createDefaultNotificationPreferences(DEMO_TENANT_ID)],
  ]);

  private webhookEndpoints: StoredWebhookEndpoint[] = [];

  private webhookDeliveries: StoredWebhookDelivery[] = [];

  private slaProfiles = new Map<string, TenantSlaProfile>([
    [DEMO_TENANT_ID, this.createDefaultSlaProfile(DEMO_TENANT_ID)],
  ]);

  private passengers = PASSENGER_SEED.map((passenger) =>
    this.clonePassenger(passenger),
  );

  private addresses = ADDRESS_SEED.map((address) => this.cloneAddress(address));

  private costCenters = COST_CENTER_SEED.map((costCenter) =>
    this.cloneCostCenter(costCenter),
  );

  private approvalRules: TenantApprovalRuleRecord[] = [];

  private approvalRuleVersions = new Map<string, number>();

  private approvalRequests: TenantBookingApprovalRequestRecord[] = [];

  private approvalDecisions: TenantBookingApprovalDecisionRecord[] = [];

  private quotaPolicies = new Map<string, TenantQuotaPolicyRecord>();

  private quotaLedger: TenantQuotaLedgerEntry[] = [];

  private quotaMonthlySnapshots = new Map<
    string,
    TenantQuotaMonthlySnapshotRecord
  >();

  private quotaReservationLocks = new Map<string, Promise<void>>();

  private orderFeedProvider: OrderFeedProvider = () => [];

  private userRoles = USER_ROLE_SEED.map((userRole) =>
    this.cloneUserRole(userRole),
  );

  private apiKeys = API_KEY_SEED.map((apiKey) =>
    this.cloneStoredApiKey(apiKey),
  );

  private partnerEntries = PARTNER_ENTRY_SEED.map((entry) =>
    this.clonePartnerEntry(entry),
  );

  private partnerIngressCredentials: StoredPartnerIngressCredentialRecord[] =
    [];

  private partnerEligibilityVerifications = new Map<
    string,
    PartnerEligibilityVerificationRecord
  >();

  private readonly retryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private approvalNotificationPollTimer: ReturnType<typeof setInterval> | null =
    null;

  private approvalNotificationPollInFlight = false;

  private readonly securityEventsService: SecurityEventsService | undefined;

  private readonly identityRepository: IdentityRepository | undefined;

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly tenantPartnerRepository?: TenantPartnerRepository,
    @Optional()
    private readonly webhookDispatchService: WebhookDispatchService = new WebhookDispatchService(),
    @Optional()
    @Inject(PARTNER_INGRESS_CREDENTIAL_SEEDS)
    private readonly partnerIngressCredentialSeeds: readonly PartnerIngressCredentialSeed[] = resolvePartnerIngressCredentialsFromEnv(),
    @Optional()
    @Inject(PARTNER_ELIGIBILITY_ADAPTERS)
    private readonly eligibilityAdapters: readonly PartnerEligibilityAdapterInterface[] = [
      new BankCardInlineEligibilityAdapter(),
      new ReferenceTokenEligibilityAdapter(),
    ],
    @Optional()
    private readonly partnerUserIdentityLinkRepository: PartnerUserIdentityLinkRepository = new PartnerUserIdentityLinkRepository(),
    @Optional()
    private readonly referralEmbedHandoffRepository: ReferralEmbedHandoffRepository = new ReferralEmbedHandoffRepository(),
    @Optional()
    @Inject(SecurityEventsService)
    securityEventsService?: SecurityEventsService | IdentityRepository,
    @Optional()
    @Inject(IdentityRepository)
    identityRepository?: IdentityRepository,
    @Optional()
    private readonly tenantInvitationDelivery: TenantInvitationDeliveryService = new TenantInvitationDeliveryService(),
  ) {
    this.securityEventsService =
      securityEventsService instanceof SecurityEventsService
        ? securityEventsService
        : undefined;
    this.identityRepository =
      identityRepository ??
      (securityEventsService instanceof IdentityRepository
        ? securityEventsService
        : undefined);
    if (isStrictAuthEnvironment()) {
      this.clearDemoSeedState();
    }
    this.partnerIngressCredentials = this.partnerIngressCredentialSeeds.map(
      (seed) => createBootstrapPartnerIngressCredential(seed),
    );
    if (isStrictAuthEnvironment()) {
      this.partnerIngressCredentials = [];
    }
    this.startApprovalNotificationPolling();
  }

  async onModuleInit() {
    if (!this.tenantPartnerRepository) {
      return;
    }

    try {
      const persistedState = await this.tenantPartnerRepository.loadState();
      const notificationPreferences =
        persistedState.notificationPreferences ?? [];
      const slaProfiles = persistedState.slaProfiles ?? [];
      const webhookEndpoints = persistedState.webhookEndpoints ?? [];
      const webhookDeliveries = persistedState.webhookDeliveries ?? [];
      const partnerEntries = persistedState.partnerEntries ?? [];
      const partnerIngressCredentials =
        persistedState.partnerIngressCredentials ?? [];
      const partnerEligibilityVerifications =
        persistedState.partnerEligibilityVerifications ?? [];
      const approvalRules = persistedState.approvalRules ?? [];
      const approvalRequests = persistedState.approvalRequests ?? [];
      const approvalDecisions = persistedState.approvalDecisions ?? [];
      const passengers = persistedState.passengers ?? [];
      const addresses = persistedState.addresses ?? [];
      const costCenters = persistedState.costCenters ?? [];
      const quotaPolicies = persistedState.quotaPolicies ?? [];
      const quotaLedger = persistedState.quotaLedger ?? [];
      const quotaMonthlySnapshots = persistedState.quotaMonthlySnapshots ?? [];
      const userRoles = persistedState.userRoles ?? [];
      const apiKeys = persistedState.apiKeys ?? [];
      const persistedStateSnapshot: TenantPartnerState = {
        notificationPreferences,
        webhookEndpoints,
        webhookDeliveries,
        slaProfiles,
        partnerEntries,
        partnerIngressCredentials,
        partnerEligibilityVerifications,
        approvalRules,
        approvalRequests,
        approvalDecisions,
        passengers,
        addresses,
        costCenters,
        quotaPolicies,
        quotaLedger,
        quotaMonthlySnapshots,
        userRoles,
        apiKeys,
      };
      const sanitizedState = this.sanitizePersistedState(
        persistedStateSnapshot,
      );
      const hasPersistedState = this.hasPersistedState(persistedStateSnapshot);
      const strictSanitizeChanges = this.buildStrictSanitizeChanges(
        persistedStateSnapshot,
        sanitizedState,
      );

      if (!hasPersistedState) {
        this.persistChanges(
          {
            notificationPreferences: Array.from(
              this.notificationPreferences.values(),
              (preferences) => this.cloneNotificationPreferences(preferences),
            ),
            slaProfiles: Array.from(this.slaProfiles.values(), (profile) =>
              this.cloneSlaProfile(profile),
            ),
            partnerEntries: this.partnerEntries.map((entry) =>
              this.clonePartnerEntry(entry),
            ),
            partnerIngressCredentials: this.partnerIngressCredentials.map(
              (credential) =>
                this.cloneStoredPartnerIngressCredential(credential),
            ),
            passengers: this.passengers.map((passenger) =>
              this.clonePassenger(passenger),
            ),
            addresses: this.addresses.map((address) =>
              this.cloneAddress(address),
            ),
            costCenters: this.costCenters.map((costCenter) =>
              this.cloneCostCenter(costCenter),
            ),
            userRoles: this.userRoles.map((userRole) =>
              this.cloneUserRole(userRole),
            ),
            apiKeys: this.apiKeys.map((apiKey) =>
              this.cloneStoredApiKey(apiKey),
            ),
          },
          "module init bootstrap",
        );
        this.syncIdentityTenantUserRoles("module init bootstrap");
        return;
      }

      this.notificationPreferences = new Map(
        sanitizedState.notificationPreferences.map((preferences) => [
          preferences.tenantId,
          this.cloneNotificationPreferences(preferences),
        ]),
      );
      this.slaProfiles = new Map(
        sanitizedState.slaProfiles.map((profile) => [
          profile.tenantId,
          this.cloneSlaProfile(profile),
        ]),
      );
      this.partnerEntries =
        sanitizedState.partnerEntries.length > 0
          ? sanitizedState.partnerEntries.map((entry) =>
              this.clonePartnerEntry(entry),
            )
          : isStrictAuthEnvironment()
            ? []
            : PARTNER_ENTRY_SEED.map((entry) => this.clonePartnerEntry(entry));
      this.reconcilePartnerEntrySeeds();
      this.partnerIngressCredentials =
        sanitizedState.partnerIngressCredentials.length > 0
          ? sanitizedState.partnerIngressCredentials.map((credential) =>
              this.cloneStoredPartnerIngressCredential(credential),
            )
          : isStrictAuthEnvironment()
            ? []
            : this.partnerIngressCredentialSeeds.map((seed) =>
                createBootstrapPartnerIngressCredential(seed),
              );
      this.reconcilePartnerIngressCredentialSeeds();
      this.normalizePartnerEntryAuthModes();
      if (
        isStrictAuthEnvironment() &&
        this.didSanitizePersistedState(persistedStateSnapshot, sanitizedState)
      ) {
        this.persistChanges(
          strictSanitizeChanges,
          "module init strict auth sanitize",
        );
      }
      this.partnerEligibilityVerifications = new Map(
        sanitizedState.partnerEligibilityVerifications.map((verification) => [
          verification.eligibilityVerificationId,
          this.clonePartnerEligibilityVerification(verification),
        ]),
      );
      this.approvalRules = sanitizedState.approvalRules.map((rule) =>
        this.cloneApprovalRule(rule),
      );
      this.approvalRuleVersions = sanitizedState.approvalRules.reduce(
        (versions, rule) => {
          versions.set(
            rule.tenantId,
            Math.max(versions.get(rule.tenantId) ?? 0, 1),
          );
          return versions;
        },
        new Map<string, number>(),
      );
      this.approvalDecisions = sanitizedState.approvalDecisions.map(
        (decision) => this.cloneApprovalDecision(decision),
      );
      this.approvalRequests = sanitizedState.approvalRequests.map((request) =>
        this.cloneApprovalRequest(
          this.mergeApprovalRequestDecisions(
            request,
            this.approvalDecisions.filter(
              (decision) =>
                decision.approvalRequestId === request.approvalRequestId,
            ),
          ),
        ),
      );
      this.webhookEndpoints = sanitizedState.webhookEndpoints.map((endpoint) =>
        this.cloneStoredWebhookEndpoint(endpoint),
      );
      this.webhookDeliveries = sanitizedState.webhookDeliveries.map(
        (delivery) => this.cloneStoredWebhookDelivery(delivery),
      );
      this.passengers = sanitizedState.passengers.map((passenger) =>
        this.clonePassenger(passenger),
      );
      this.addresses = sanitizedState.addresses.map((address) =>
        this.cloneAddress(address),
      );
      this.costCenters =
        sanitizedState.costCenters.length > 0
          ? sanitizedState.costCenters.map((costCenter) =>
              this.cloneCostCenter(costCenter),
            )
          : isStrictAuthEnvironment()
            ? []
            : COST_CENTER_SEED.map((costCenter) =>
                this.cloneCostCenter(costCenter),
              );
      this.quotaPolicies = new Map(
        sanitizedState.quotaPolicies.map((policy) => [
          this.buildQuotaPolicyKey(
            policy.tenantId,
            policy.costCenterCode,
            policy.period,
          ),
          this.cloneQuotaPolicy(policy),
        ]),
      );
      this.quotaLedger = sanitizedState.quotaLedger.map((entry) =>
        this.cloneQuotaLedgerEntry(entry),
      );
      this.quotaMonthlySnapshots = new Map(
        sanitizedState.quotaMonthlySnapshots.map((snapshot) => [
          this.buildQuotaSnapshotKey(
            snapshot.tenantId,
            snapshot.costCenterCode,
            snapshot.period,
            snapshot.periodKey,
          ),
          this.cloneQuotaMonthlySnapshot(snapshot),
        ]),
      );
      this.userRoles =
        sanitizedState.userRoles.length > 0
          ? sanitizedState.userRoles.map((userRole) =>
              this.cloneUserRole(userRole),
            )
          : isStrictAuthEnvironment()
            ? []
            : USER_ROLE_SEED.map((userRole) => this.cloneUserRole(userRole));
      this.apiKeys = sanitizedState.apiKeys.map((apiKey) =>
        this.cloneStoredApiKey(apiKey),
      );
      this.syncIdentityTenantUserRoles("module init rehydrate");
      if (
        sanitizedState.partnerEntries.length === 0 &&
        !isStrictAuthEnvironment()
      ) {
        this.persistChanges(
          {
            partnerEntries: this.partnerEntries.map((entry) =>
              this.clonePartnerEntry(entry),
            ),
          },
          "module init partner entry bootstrap",
        );
      }
      if (
        sanitizedState.partnerIngressCredentials.length === 0 &&
        !isStrictAuthEnvironment()
      ) {
        this.persistChanges(
          {
            partnerIngressCredentials: this.partnerIngressCredentials.map(
              (credential) =>
                this.cloneStoredPartnerIngressCredential(credential),
            ),
          },
          "module init partner ingress credential bootstrap",
        );
      }
      if (
        sanitizedState.costCenters.length === 0 &&
        !isStrictAuthEnvironment()
      ) {
        this.persistChanges(
          {
            costCenters: this.costCenters.map((costCenter) =>
              this.cloneCostCenter(costCenter),
            ),
          },
          "module init tenant cost-center bootstrap",
        );
      }
      if (sanitizedState.userRoles.length === 0 && !isStrictAuthEnvironment()) {
        this.persistChanges(
          {
            userRoles: this.userRoles.map((userRole) =>
              this.cloneUserRole(userRole),
            ),
          },
          "module init tenant user bootstrap",
        );
      }
      this.schedulePersistedWebhookRetries();
      void this.pollPendingApprovalTimeoutNotifications();
    } catch (error) {
      this.tenantPartnerRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  registerOrderFeedProvider(provider: OrderFeedProvider) {
    this.orderFeedProvider = provider;
  }

  isPersistenceEnabled() {
    return this.tenantPartnerRepository?.isEnabled() ?? false;
  }

  async getTenantDashboardSummary(
    tenantId: string,
    billingSettlementService?: Pick<
      BillingSettlementService,
      "getTenantPayableSummary" | "listTenantInvoices"
    >,
  ): Promise<TenantDashboardSummary> {
    const tenantOrders = this.listTenantScopedOrders(tenantId);
    const resolvedOrderPeriodMonth = this.resolveTenantBusinessPeriodMonth(
      tenantId,
      tenantOrders,
      billingSettlementService?.listTenantInvoices(tenantId) ?? [],
    );
    const payableSummary = billingSettlementService
      ? await billingSettlementService.getTenantPayableSummary(
          tenantId,
          resolvedOrderPeriodMonth,
        )
      : null;
    const periodMonth = payableSummary?.periodMonth ?? resolvedOrderPeriodMonth;
    const invoices =
      billingSettlementService?.listTenantInvoices(tenantId) ?? [];

    return {
      tenantId,
      periodMonth,
      bookingCount: tenantOrders.length,
      completedTripCount: tenantOrders.filter(
        (order) => order.status === "completed",
      ).length,
      cancelledTripCount: tenantOrders.filter(
        (order) => order.status === "cancelled",
      ).length,
      noShowTripCount: 0,
      pendingApprovalCount: this.approvalRequests.filter(
        (request) =>
          request.tenantId === tenantId && request.status === "pending",
      ).length,
      pendingExceptionCount: tenantOrders.filter(
        (order) => order.exceptionHold && !order.exceptionHold.resolution,
      ).length,
      estimatedPayableAmountMinor: payableSummary?.payableAmountMinor ?? 0,
      issuedInvoiceAmountMinor: invoices
        .filter((invoice) =>
          ["issued", "paid", "overdue"].includes(
            this.deriveInvoiceStatus(invoice),
          ),
        )
        .reduce((sum, invoice) => sum + invoice.amount.amountMinor, 0),
      unpaidInvoiceAmountMinor: invoices
        .filter((invoice) =>
          ["issued", "overdue"].includes(this.deriveInvoiceStatus(invoice)),
        )
        .reduce((sum, invoice) => sum + invoice.amount.amountMinor, 0),
      costCenterWarnings: this.listTenantCostCenterWarnings(tenantId),
      upcomingBookings: tenantOrders
        .filter((order) => this.isUpcomingOrder(order))
        .sort((left, right) =>
          (left.reservationWindowStart ?? left.createdAt).localeCompare(
            right.reservationWindowStart ?? right.createdAt,
          ),
        )
        .slice(0, 5)
        .map((order) => this.toTenantBookingSummary(order)),
    };
  }

  listTenantOrders(
    tenantId: string,
    query: TenantOrderListQuery = {},
    billingSettlementService?: Pick<
      BillingSettlementService,
      "listTenantInvoices"
    >,
  ) {
    return this.filterTenantOrders(
      this.listTenantScopedOrders(tenantId),
      query,
      this.buildInvoiceStatusByOrder(billingSettlementService, tenantId),
    );
  }

  getTenantOrder(tenantId: string, orderId: string) {
    return this.cloneOwnedOrder(
      this.listTenantScopedOrders(tenantId).find(
        (order) => order.orderId === orderId,
      ) ?? this.requireOrderForTenant(tenantId, orderId),
    );
  }

  listTenantTrips(
    tenantId: string,
    query: TenantOrderListQuery = {},
    billingSettlementService?: Pick<
      BillingSettlementService,
      "listTenantInvoices"
    >,
  ) {
    return this.filterTenantOrders(
      this.listTenantScopedOrders(tenantId).filter(
        (order) => order.bookingId !== null,
      ),
      query,
      this.buildInvoiceStatusByOrder(billingSettlementService, tenantId),
    );
  }

  listTenantServicePrograms(tenantId: string): TenantServiceProgramRecord[] {
    const partnerPrograms = this.partnerEntries
      .filter((entry) => entry.tenantId === tenantId)
      .map(
        (entry): TenantServiceProgramRecord => ({
          programId: entry.programId,
          tenantId,
          programType: entry.businessDispatchSubtype,
          displayName: entry.displayName,
          active:
            entry.activeFlag && entry.status === "active" && !entry.revokedAt,
          billingMode: "partner_settlement",
          pricingPlanId: `pricing-plan:${entry.programId}`,
          eligibilityRuleId:
            entry.eligibilityMode === "none"
              ? null
              : `eligibility-rule:${entry.programId}`,
          serviceRuleSetId: `service-rule-set:${entry.programId}`,
          allowedServiceProducts: [entry.businessDispatchSubtype],
        }),
      );

    const defaultProgram: TenantServiceProgramRecord = {
      programId: DEFAULT_TENANT_SERVICE_PROGRAM_ID,
      tenantId,
      programType: "enterprise_dispatch",
      displayName:
        tenantId === DEMO_TENANT_ID
          ? "Enterprise Dispatch"
          : `Enterprise Dispatch (${tenantId})`,
      active: true,
      billingMode: "monthly_invoice",
      pricingPlanId: "pricing-plan:enterprise-dispatch-default",
      eligibilityRuleId: null,
      serviceRuleSetId: "service-rule-set:enterprise-dispatch-default",
      allowedServiceProducts: ["enterprise_dispatch"],
    };

    return [defaultProgram, ...partnerPrograms].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }

  getTenantServiceProgram(tenantId: string, programId: string) {
    const program = this.listTenantServicePrograms(tenantId).find(
      (candidate) => candidate.programId === programId,
    );
    if (!program) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Tenant service program not found.",
        {
          tenantId,
          programId,
        },
      );
    }

    return {
      ...program,
      allowedServiceProducts: [...program.allowedServiceProducts],
    };
  }

  listTenantContracts(tenantId: string): IssuerContractStatusRecord[] {
    return this.partnerEntries
      .filter(
        (entry) =>
          entry.tenantId === tenantId &&
          entry.businessDispatchSubtype === "credit_card_airport_transfer",
      )
      .map((entry) => this.buildIssuerContractStatusRecord(tenantId, entry))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  getTenantContract(tenantId: string, contractId: string) {
    const contract = this.listTenantContracts(tenantId).find(
      (candidate) => candidate.contractId === contractId,
    );
    if (!contract) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Tenant contract not found.",
        {
          tenantId,
          contractId,
        },
      );
    }

    return this.cloneIssuerContractStatusRecord(contract);
  }

  onModuleDestroy() {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    if (this.approvalNotificationPollTimer) {
      clearInterval(this.approvalNotificationPollTimer);
      this.approvalNotificationPollTimer = null;
    }
  }

  getNotificationPreferences(tenantId: string) {
    return this.cloneNotificationPreferences(
      this.getOrCreateNotificationPreferences(tenantId),
    );
  }

  getIntegrationGovernancePackage(
    tenantId: string,
    identity?: IdentityContext | null,
  ): TenantIntegrationGovernancePackage {
    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      availableActions: this.buildWebhookManagementActions(identity),
      apiKeyPolicy: this.buildTenantApiKeyGovernancePolicy(),
      webhookPolicy: this.buildTenantWebhookGovernancePolicy(),
      baselineWebhookEvents: [...DEFAULT_TENANT_WEBHOOK_EVENTS],
      baselineNotificationSubscriptions:
        this.createDefaultNotificationPreferences(tenantId).subscriptions,
      onboardingChecklist: [...TENANT_INTEGRATION_HANDOFF_CHECKLIST],
    };
  }

  updateNotificationPreferences(
    tenantId: string,
    command: UpdateTenantNotificationsCommand,
    requestId?: string,
  ) {
    const notificationPreferences: TenantNotificationPreferences = {
      tenantId,
      subscriptions: command.subscriptions.map((subscription) => ({
        ...subscription,
      })),
      updatedAt: new Date().toISOString(),
    };
    this.notificationPreferences.set(
      tenantId,
      this.cloneNotificationPreferences(notificationPreferences),
    );
    this.persistChanges(
      {
        notificationPreferences: [
          this.cloneNotificationPreferences(notificationPreferences),
        ],
      },
      "update_notification_preferences",
    );

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "update_notification_subscription",
        resourceType: "tenant_notifications",
        resourceId: tenantId,
        newValuesSummary: {
          subscriptions: notificationPreferences.subscriptions,
        },
      },
      requestId,
    );

    return {
      status: "updated",
    };
  }

  listTenantNotifications(tenantId: string) {
    return this.auditNotificationService
      .listNotifications()
      .filter((notification) => notification.tenantId === tenantId);
  }

  listPassengers(tenantId: string) {
    return this.passengers
      .filter((passenger) => passenger.tenantId === tenantId)
      .map((passenger) => this.clonePassenger(passenger));
  }

  getPassengerMasterRecord(tenantId: string, passengerId: string) {
    const normalizedPassengerId = passengerId.trim();
    const passenger = this.passengers.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.passengerId === normalizedPassengerId,
    );
    if (!passenger) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_NOT_FOUND",
        "The tenant passenger could not be found.",
        {
          passengerId: normalizedPassengerId,
        },
      );
    }

    return this.clonePassenger(passenger);
  }

  upsertPassenger(
    tenantId: string,
    command: UpsertTenantPassengerCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.fullName, "fullName");

    const passengerId = command.passengerId?.trim() || null;
    if (passengerId) {
      const passengerOwnedByOtherTenant = this.passengers.some(
        (passenger) =>
          passenger.passengerId === passengerId &&
          passenger.tenantId !== tenantId,
      );
      if (passengerOwnedByOtherTenant) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "PASSENGER_NOT_FOUND",
          "The tenant passenger could not be found.",
          {
            passengerId,
          },
        );
      }
    }

    const now = new Date().toISOString();
    const existing = passengerId
      ? (this.passengers.find(
          (passenger) =>
            passenger.tenantId === tenantId &&
            passenger.passengerId === passengerId,
        ) ?? null)
      : null;

    const passenger: TenantPassengerRecord = existing
      ? {
          ...existing,
          fullName: command.fullName.trim(),
          employeeNo: this.normalizeNullableText(
            command.employeeNo ?? existing.employeeNo,
          ),
          departmentName: this.normalizeNullableText(
            command.departmentName ?? existing.departmentName,
          ),
          mobile: this.normalizeNullableText(command.mobile ?? existing.mobile),
          email: this.normalizeNullableText(command.email ?? existing.email),
          roles: this.normalizePassengerRoles(command.roles ?? existing.roles),
          activeFlag: command.activeFlag ?? existing.activeFlag,
          metadata: {
            ...existing.metadata,
            ...(command.metadata ?? {}),
          },
          updatedAt: now,
        }
      : {
          passengerId: passengerId || `passenger_${randomUUID()}`,
          tenantId,
          fullName: command.fullName.trim(),
          employeeNo: this.normalizeNullableText(command.employeeNo),
          departmentName: this.normalizeNullableText(command.departmentName),
          mobile: this.normalizeNullableText(command.mobile),
          email: this.normalizeNullableText(command.email),
          roles: this.normalizePassengerRoles(command.roles),
          activeFlag: command.activeFlag ?? true,
          metadata: {
            ...(command.metadata ?? {}),
          },
          createdAt: now,
          updatedAt: now,
        };
    passenger.qualityIssues = this.buildPassengerQualityIssues(
      tenantId,
      passenger,
    );

    this.passengers = [
      this.clonePassenger(passenger),
      ...this.passengers.filter(
        (candidate) => candidate.passengerId !== passenger.passengerId,
      ),
    ];
    this.persistChanges(
      {
        passengers: [this.clonePassenger(passenger)],
      },
      "upsert_passenger",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "upsert_passenger",
        resourceType: "tenant_passenger",
        resourceId: passenger.passengerId,
        newValuesSummary: this.buildPassengerAuditSummary(passenger),
      },
      requestId,
    );

    return this.clonePassenger(passenger);
  }

  listAddresses(tenantId: string) {
    return this.addresses
      .filter((address) => address.tenantId === tenantId)
      .map((address) => this.cloneAddress(address));
  }

  listAddressExportView(tenantId: string): TenantAddressExportViewRecord[] {
    const generatedAt = new Date().toISOString();
    return this.addresses
      .filter((address) => address.tenantId === tenantId)
      .map((address) => ({
        addressId: address.addressId,
        tenantId: address.tenantId,
        ownerPassengerId: address.ownerPassengerId,
        addressName: address.addressName,
        maskedAddressText:
          address.maskedAddressText ?? maskAddress(address.addressText),
        sensitiveFlag: address.sensitiveFlag ?? false,
        geocodeSource: address.geocodeSource ?? "none",
        qualityIssues: [...(address.qualityIssues ?? [])],
        tags: [...address.tags],
        activeFlag: address.activeFlag,
        exportGeneratedAt: generatedAt,
      }));
  }

  getAddressMasterRecord(tenantId: string, addressId: string) {
    const normalizedAddressId = addressId.trim();
    const address = this.addresses.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.addressId === normalizedAddressId,
    );
    if (!address) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ADDRESS_NOT_FOUND",
        "The tenant address could not be found.",
        {
          addressId: normalizedAddressId,
        },
      );
    }

    return this.cloneAddress(address);
  }

  upsertAddress(
    tenantId: string,
    command: UpsertTenantAddressCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.addressName, "addressName");
    this.assertNonBlank(command.addressText, "addressText");

    const addressId = command.addressId?.trim() || null;
    if (addressId) {
      const addressOwnedByOtherTenant = this.addresses.some(
        (address) =>
          address.addressId === addressId && address.tenantId !== tenantId,
      );
      if (addressOwnedByOtherTenant) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "ADDRESS_NOT_FOUND",
          "The tenant address could not be found.",
          {
            addressId,
          },
        );
      }
    }

    const ownerPassengerId = command.ownerPassengerId ?? null;
    if (
      ownerPassengerId !== null &&
      !this.passengers.some(
        (passenger) =>
          passenger.tenantId === tenantId &&
          passenger.passengerId === ownerPassengerId,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_NOT_FOUND",
        "The owner passenger could not be found.",
        {
          ownerPassengerId,
        },
      );
    }

    const now = new Date().toISOString();
    const existing = addressId
      ? (this.addresses.find(
          (address) =>
            address.tenantId === tenantId && address.addressId === addressId,
        ) ?? null)
      : null;
    const normalizedTags = this.normalizeAddressTags(
      command.tags ?? existing?.tags,
    );
    const sensitiveFlag =
      (command.sensitiveFlag ?? existing?.sensitiveFlag ?? false) ||
      normalizedTags.includes("sensitive");
    if (sensitiveFlag && !normalizedTags.includes("sensitive")) {
      normalizedTags.push("sensitive");
    }
    const lat = command.lat ?? existing?.lat ?? null;
    const lng = command.lng ?? existing?.lng ?? null;
    const normalizedAddressText = this.normalizeAddressText(
      command.addressText,
    );
    const maskedAddressText =
      maskAddress(command.addressText) ??
      `${command.addressText.trim().slice(0, 3)}...`;
    const geocodeSource = this.resolveAddressGeocodeSource(
      command.geocodeSource ?? existing?.geocodeSource,
      lat,
      lng,
    );

    const address: TenantAddressRecord = existing
      ? {
          ...existing,
          ownerPassengerId,
          addressName: command.addressName.trim(),
          addressText: command.addressText.trim(),
          normalizedAddressText,
          maskedAddressText,
          sensitiveFlag,
          geocodeSource,
          lat,
          lng,
          tags: normalizedTags,
          activeFlag: command.activeFlag ?? existing.activeFlag,
          updatedAt: now,
        }
      : {
          addressId: addressId || `address_${randomUUID()}`,
          tenantId,
          ownerPassengerId,
          addressName: command.addressName.trim(),
          addressText: command.addressText.trim(),
          normalizedAddressText,
          maskedAddressText,
          sensitiveFlag,
          geocodeSource,
          lat,
          lng,
          tags: normalizedTags,
          activeFlag: command.activeFlag ?? true,
          createdAt: now,
          updatedAt: now,
        };
    address.qualityIssues = this.buildAddressQualityIssues(tenantId, address);

    this.addresses = [
      this.cloneAddress(address),
      ...this.addresses.filter(
        (candidate) => candidate.addressId !== address.addressId,
      ),
    ];
    this.persistChanges(
      {
        addresses: [this.cloneAddress(address)],
      },
      "upsert_address",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "upsert_address",
        resourceType: "tenant_address",
        resourceId: address.addressId,
        newValuesSummary: this.buildAddressAuditSummary(address),
      },
      requestId,
    );

    return this.cloneAddress(address);
  }

  listCostCenters(tenantId: string, query: ListTenantCostCentersQuery = {}) {
    const search = this.normalizeNullableText(query.search)?.toLowerCase();
    const ownerUserId = this.normalizeNullableText(query.ownerUserId);

    return this.costCenters
      .filter((costCenter) => costCenter.tenantId === tenantId)
      .filter((costCenter) => {
        if (query.activeOnly && !costCenter.activeFlag) {
          return false;
        }
        if (ownerUserId && costCenter.ownerUserId !== ownerUserId) {
          return false;
        }
        if (!search) {
          return true;
        }
        return [costCenter.code, costCenter.name, costCenter.description]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(search));
      })
      .map((costCenter) => this.cloneCostCenter(costCenter));
  }

  getCostCenter(tenantId: string, code: string) {
    const normalizedCode = this.normalizeCostCenterCode(code);
    const costCenter = this.costCenters.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.code === normalizedCode,
    );

    if (!costCenter) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "COST_CENTER_NOT_FOUND",
        "The tenant cost center could not be found.",
        {
          code: normalizedCode,
        },
      );
    }

    return this.cloneCostCenter(costCenter);
  }

  findCostCenter(tenantId: string, code: string) {
    return this.findCostCenterRecord(tenantId, code);
  }

  listQuotaPolicies(tenantId: string) {
    return [...this.quotaPolicies.values()]
      .filter((policy) => policy.tenantId === tenantId)
      .sort((left, right) => {
        const leftScope = left.costCenterCode ?? "";
        const rightScope = right.costCenterCode ?? "";
        if (leftScope !== rightScope) {
          return leftScope.localeCompare(rightScope);
        }
        return left.period.localeCompare(right.period);
      })
      .map((policy) => this.cloneQuotaPolicy(policy));
  }

  getTenantQuotaSummary(
    tenantId: string,
    reservationWindowStart = new Date().toISOString(),
  ): TenantQuotaSummary {
    const periodKey = this.requireQuotaPeriodKey(reservationWindowStart);
    const policy = this.resolveQuotaPolicy(tenantId, null);
    const snapshot = this.getOrCreateQuotaSnapshot(
      tenantId,
      null,
      periodKey,
      policy.limit,
    );

    return {
      tenantId,
      period: policy.period,
      periodKey,
      limit: { ...policy.limit },
      usage: { ...snapshot.usage },
      refreshedAt: snapshot.refreshedAt,
    };
  }

  listTenantProgramUsage(tenantId: string): TenantProgramUsageRecord[] {
    const programEntries = this.partnerEntries
      .filter(
        (entry) =>
          entry.tenantId === tenantId &&
          entry.businessDispatchSubtype === "credit_card_airport_transfer",
      )
      .sort((left, right) =>
        (left.programCode ?? left.programId).localeCompare(
          right.programCode ?? right.programId,
        ),
      );

    if (programEntries.length === 0) {
      return [];
    }

    const currentPeriodKey = this.getTenantQuotaSummary(tenantId).periodKey;
    const programById = new Map(
      programEntries.map((entry) => [entry.programId, entry]),
    );
    const orderByBookingId = new Map(
      this.listTenantScopedOrders(tenantId)
        .filter((order) => order.bookingId !== null)
        .map((order) => [order.bookingId as string, order]),
    );
    const usageByProgramPeriod = new Map<
      string,
      {
        programId: string;
        period: string;
        activeBookingIds: Set<string>;
      }
    >();

    for (const entry of this.quotaLedger) {
      if (
        entry.tenantId !== tenantId ||
        entry.costCenterCode !== null ||
        entry.dimension !== "booking_count"
      ) {
        continue;
      }

      const order = orderByBookingId.get(entry.bookingId);
      if (!order?.partnerProgramId) {
        continue;
      }

      const program = programById.get(order.partnerProgramId);
      if (!program) {
        continue;
      }

      const key = `${program.programId}:${entry.periodKey}`;
      const bucket =
        usageByProgramPeriod.get(key) ??
        (() => {
          const created = {
            programId: program.programId,
            period: entry.periodKey,
            activeBookingIds: new Set<string>(),
          };
          usageByProgramPeriod.set(key, created);
          return created;
        })();

      if (entry.entryType === "reserve" || entry.entryType === "adjust") {
        bucket.activeBookingIds.add(entry.bookingId);
      } else if (entry.entryType === "release") {
        bucket.activeBookingIds.delete(entry.bookingId);
      }
    }

    const periods = new Set<string>([currentPeriodKey]);
    for (const usage of usageByProgramPeriod.values()) {
      periods.add(usage.period);
    }

    const tenantPolicy = this.resolveQuotaPolicy(tenantId, null);
    const snapshotByPeriod = new Map<
      string,
      ReturnType<TenantPartnerService["getOrCreateQuotaSnapshot"]>
    >();
    for (const period of periods) {
      snapshotByPeriod.set(
        period,
        this.getOrCreateQuotaSnapshot(
          tenantId,
          null,
          period,
          tenantPolicy.limit,
        ),
      );
    }

    const items: TenantProgramUsageRecord[] = [];
    for (const program of programEntries) {
      for (const period of periods) {
        const usage = usageByProgramPeriod.get(
          `${program.programId}:${period}`,
        );
        if (!usage && period !== currentPeriodKey) {
          continue;
        }

        const periodSnapshot = snapshotByPeriod.get(period);
        const quotaLimit = periodSnapshot?.limit.bookingCountLimit ?? null;
        const tripsConsumed = usage?.activeBookingIds.size ?? 0;
        const programCode = program.programCode ?? program.programId;
        const cardholdersServed =
          usage === undefined
            ? 0
            : new Set(
                [...usage.activeBookingIds]
                  .map((bookingId) => orderByBookingId.get(bookingId))
                  .filter(
                    (order): order is OwnedOrderRecord => order !== undefined,
                  )
                  .map((order) => order.passenger.passengerId),
              ).size;
        items.push({
          programId: program.programId,
          programCode,
          period,
          cardholdersServed,
          tripsConsumed,
          quotaTotal: quotaLimit,
          quotaRemaining: periodSnapshot?.usage.bookingCountRemaining ?? null,
        });
      }
    }

    return items.sort((left, right) => {
      if (left.programCode !== right.programCode) {
        return left.programCode.localeCompare(right.programCode);
      }
      return left.period.localeCompare(right.period);
    });
  }

  getCostCenterQuotaSummary(
    tenantId: string,
    code: string,
    reservationWindowStart = new Date().toISOString(),
  ): TenantCostCenterQuotaSummary {
    const costCenter = this.getCostCenter(tenantId, code);
    const periodKey = this.requireQuotaPeriodKey(reservationWindowStart);
    const policy = this.resolveQuotaPolicy(tenantId, costCenter.code);
    const snapshot = this.getOrCreateQuotaSnapshot(
      tenantId,
      costCenter.code,
      periodKey,
      policy.limit,
    );

    return {
      tenantId,
      costCenterCode: costCenter.code,
      period: policy.period,
      periodKey,
      limit: { ...policy.limit },
      usage: { ...snapshot.usage },
      inheritedFromTenant: policy.inheritedFromTenant,
      refreshedAt: snapshot.refreshedAt,
    };
  }

  upsertTenantQuotaPolicy(
    tenantId: string,
    command: UpsertTenantQuotaPolicyCommand,
    requestId?: string,
  ) {
    const now = new Date().toISOString();
    const costCenterCode = command.costCenterCode
      ? this.getCostCenter(tenantId, command.costCenterCode).code
      : null;
    const existing = this.quotaPolicies.get(
      this.buildQuotaPolicyKey(tenantId, costCenterCode, command.period),
    );

    const record: TenantQuotaPolicyRecord = {
      tenantId,
      costCenterCode,
      period: command.period,
      limit: this.normalizeQuotaLimit(command.limit),
      inheritedFromTenant: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.quotaPolicies.set(
      this.buildQuotaPolicyKey(tenantId, costCenterCode, command.period),
      this.cloneQuotaPolicy(record),
    );
    this.persistChanges(
      {
        quotaPolicies: [this.cloneQuotaPolicy(record)],
      },
      "upsert tenant quota policy",
    );
    this.auditNotificationService.recordAuditLog({
      actorId: null,
      actorType: "system",
      tenantId,
      moduleName: "tenant-partner",
      actionName: "tenant.quota_policy.updated",
      resourceType: "tenant_quota_policy",
      resourceId: costCenterCode ?? tenantId,
      newValuesSummary: {
        costCenterCode,
        period: command.period,
        enforcementMode: record.limit.enforcementMode,
      },
      ...(requestId ? { requestId } : {}),
    });

    return this.cloneQuotaPolicy(record);
  }

  previewBookingQuotaImpact(
    tenantId: string,
    query: TenantBookingQuotaImpactQuery,
  ): TenantBookingQuotaImpactPreview {
    const normalized = this.normalizeQuotaImpactQuery(tenantId, query);
    return this.buildQuotaImpactPreview(tenantId, normalized);
  }

  listTenantQuotaLedger(
    tenantId: string,
    query: {
      periodKey?: string;
      costCenterCode?: string | null;
      bookingId?: string | null;
    } = {},
  ) {
    const normalizedCostCenterCode = query.costCenterCode
      ? this.normalizeCostCenterCode(query.costCenterCode)
      : null;
    return this.quotaLedger
      .filter((entry) => entry.tenantId === tenantId)
      .filter((entry) =>
        query.periodKey ? entry.periodKey === query.periodKey : true,
      )
      .filter((entry) =>
        normalizedCostCenterCode === null
          ? true
          : entry.costCenterCode === normalizedCostCenterCode,
      )
      .filter((entry) =>
        query.bookingId ? entry.bookingId === query.bookingId : true,
      )
      .map((entry) => this.cloneQuotaLedgerEntry(entry));
  }

  reserveTenantQuota(
    tx: TenantPartnerQueryExecutor | null,
    input: {
      tenantId: string;
      bookingId: string;
      evaluationId: string;
      reservationWindowStart: string;
      costCenterCode?: string | null;
      estimatedAmountMinor?: number | null;
      currency?: string;
    },
  ): Promise<{
    ledgerEntries: TenantQuotaLedgerEntry[];
    impacts: TenantBookingQuotaImpactResult[];
  }>;
  reserveTenantQuota(input: {
    tenantId: string;
    bookingId: string;
    evaluationId: string;
    reservationWindowStart: string;
    costCenterCode?: string | null;
    estimatedAmountMinor?: number | null;
    currency?: string;
  }): Promise<{
    ledgerEntries: TenantQuotaLedgerEntry[];
    impacts: TenantBookingQuotaImpactResult[];
  }>;
  async reserveTenantQuota(
    txOrInput:
      | TenantPartnerQueryExecutor
      | {
          tenantId: string;
          bookingId: string;
          evaluationId: string;
          reservationWindowStart: string;
          costCenterCode?: string | null;
          estimatedAmountMinor?: number | null;
          currency?: string;
        }
      | null,
    maybeInput?: {
      tenantId: string;
      bookingId: string;
      evaluationId: string;
      reservationWindowStart: string;
      costCenterCode?: string | null;
      estimatedAmountMinor?: number | null;
      currency?: string;
    },
  ) {
    const tx = maybeInput
      ? (txOrInput as TenantPartnerQueryExecutor | null)
      : null;
    const input = maybeInput ?? (txOrInput as NonNullable<typeof maybeInput>);
    const normalized = this.normalizeQuotaImpactQuery(input.tenantId, {
      bookingId: input.bookingId,
      costCenterCode: input.costCenterCode ?? null,
      estimatedAmountMinor: input.estimatedAmountMinor ?? null,
      ...(input.currency ? { currency: input.currency } : {}),
      reservationWindowStart: input.reservationWindowStart,
    });

    if (this.tenantPartnerRepository?.isEnabled()) {
      return this.reserveTenantQuotaWithDatabase(tx, input, normalized);
    }

    return this.reserveTenantQuotaInMemory(input, normalized);
  }

  consumeTenantQuota(
    tx: TenantPartnerQueryExecutor | null,
    input: {
      tenantId: string;
      bookingId: string;
    },
  ):
    | { ledgerEntries: TenantQuotaLedgerEntry[] }
    | Promise<{ ledgerEntries: TenantQuotaLedgerEntry[] }>;
  consumeTenantQuota(input: {
    tenantId: string;
    bookingId: string;
  }):
    | { ledgerEntries: TenantQuotaLedgerEntry[] }
    | Promise<{ ledgerEntries: TenantQuotaLedgerEntry[] }>;
  consumeTenantQuota(
    txOrInput:
      | TenantPartnerQueryExecutor
      | {
          tenantId: string;
          bookingId: string;
        }
      | null,
    maybeInput?: {
      tenantId: string;
      bookingId: string;
    },
  ) {
    const tx = maybeInput
      ? (txOrInput as TenantPartnerQueryExecutor | null)
      : null;
    const input = maybeInput ?? (txOrInput as NonNullable<typeof maybeInput>);

    if (this.tenantPartnerRepository?.isEnabled()) {
      if (tx) {
        return this.prepareTenantQuotaConsumption(tx, input).then(
          (committed) => ({
            ledgerEntries: committed.ledgerEntries.map((entry) =>
              this.cloneQuotaLedgerEntry(entry),
            ),
          }),
        );
      }

      return this.consumeTenantQuotaWithDatabase(input);
    }

    return this.consumeTenantQuotaInMemory(input);
  }

  listApprovalRules(
    tenantId: string,
    query: ListTenantApprovalRulesQuery = {},
  ) {
    const search = this.normalizeNullableText(query.search)?.toLowerCase();
    return this.approvalRules
      .filter((rule) => rule.tenantId === tenantId)
      .filter((rule) => (query.activeOnly ? rule.activeFlag : true))
      .filter((rule) => (query.action ? rule.action === query.action : true))
      .filter((rule) => {
        if (!search) {
          return true;
        }
        return (rule.ruleName ?? rule.name ?? "")
          .toLowerCase()
          .includes(search);
      })
      .sort((left, right) => left.priority - right.priority)
      .map((rule) => this.cloneApprovalRule(rule));
  }

  getApprovalRule(tenantId: string, ruleId: string) {
    return this.cloneApprovalRule(this.requireApprovalRule(tenantId, ruleId));
  }

  upsertApprovalRule(
    tenantId: string,
    command: UpsertTenantApprovalRuleCommand,
    requestId?: string,
  ) {
    const now = new Date().toISOString();
    const ruleName = this.requireNonBlank(
      command.ruleName ?? command.name ?? "",
      "ruleName",
    );
    const existing = command.ruleId
      ? (this.approvalRules.find(
          (rule) =>
            rule.tenantId === tenantId && rule.ruleId === command.ruleId,
        ) ?? null)
      : null;

    const record: TenantApprovalRuleRecord = {
      ruleId: existing?.ruleId ?? `rule-${randomUUID()}`,
      tenantId,
      ruleName,
      name: ruleName,
      description: this.normalizeNullableText(command.description),
      priority: Math.trunc(command.priority),
      activeFlag: command.activeFlag ?? existing?.activeFlag ?? true,
      effectiveFrom: command.effectiveFrom ?? existing?.effectiveFrom ?? null,
      effectiveUntil:
        command.effectiveUntil ?? existing?.effectiveUntil ?? null,
      conditions: (command.conditions ?? []).map((condition) => ({
        ...condition,
        ...(Array.isArray(condition.values)
          ? { values: [...condition.values] }
          : {}),
        ...(Array.isArray(condition.value)
          ? { value: [...condition.value] }
          : {}),
      })),
      action: command.action,
      approvalMode:
        command.action === "require_approval" ||
        command.action === "flag_manual_review"
          ? (command.approvalMode ?? existing?.approvalMode ?? "any_of")
          : null,
      approvers:
        command.action === "require_approval" ||
        command.action === "flag_manual_review"
          ? (command.approvers ?? existing?.approvers ?? []).map(
              (approver) => ({
                ...approver,
              }),
            )
          : [],
      timeoutHoursOverride:
        command.timeoutHoursOverride ?? existing?.timeoutHoursOverride ?? null,
      fallbackPolicyOverride:
        command.fallbackPolicyOverride ??
        existing?.fallbackPolicyOverride ??
        null,
      escalationTarget:
        command.action === "require_approval" ||
        command.action === "flag_manual_review"
          ? command.escalationTarget
            ? { ...command.escalationTarget }
            : existing?.escalationTarget
              ? { ...existing.escalationTarget }
              : null
          : null,
      disabledAt:
        command.activeFlag === false ? (existing?.disabledAt ?? now) : null,
      disabledReason:
        command.activeFlag === false
          ? (command.disabledReason ??
            existing?.disabledReason ??
            "disabled_via_upsert")
          : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.approvalRules = [
      record,
      ...this.approvalRules.filter((rule) => rule.ruleId !== record.ruleId),
    ];
    this.bumpApprovalRuleVersion(tenantId);
    this.persistChanges(
      { approvalRules: [this.cloneApprovalRule(record)] },
      "tenant approval rule upsert",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: existing
          ? "tenant.approval_rule.updated"
          : "tenant.approval_rule.created",
        resourceType: "tenant_approval_rule",
        resourceId: record.ruleId,
        newValuesSummary: this.buildApprovalRuleAuditSummary(record),
      },
      requestId,
    );
    return this.cloneApprovalRule(record);
  }

  reorderApprovalRules(
    tenantId: string,
    command: ReorderTenantApprovalRulesCommand,
    requestId?: string,
  ) {
    const orderedRuleIds = command.orderedRuleIds ?? command.ruleIds ?? [];
    const tenantRules = this.listApprovalRules(tenantId);
    if (orderedRuleIds.length !== tenantRules.length) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_APPROVAL_RULE_REORDER_INCOMPLETE",
        "orderedRuleIds must contain the full tenant rule list.",
      );
    }
    if (new Set(orderedRuleIds).size !== orderedRuleIds.length) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_APPROVAL_RULE_REORDER_DUPLICATE_IDS",
        "orderedRuleIds must not contain duplicate values.",
      );
    }

    const byId = new Map(tenantRules.map((rule) => [rule.ruleId, rule]));
    const now = new Date().toISOString();
    const reordered = orderedRuleIds.map((ruleId, index) => {
      const rule = byId.get(ruleId);
      if (!rule) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "TENANT_APPROVAL_RULE_NOT_FOUND",
          "orderedRuleIds contains an unknown ruleId.",
          { ruleId },
        );
      }
      return {
        ...rule,
        priority: (index + 1) * 10,
        updatedAt: now,
      };
    });

    this.approvalRules = [
      ...this.approvalRules.filter((rule) => rule.tenantId !== tenantId),
      ...reordered,
    ];
    this.bumpApprovalRuleVersion(tenantId);
    this.persistChanges(
      { approvalRules: reordered.map((rule) => this.cloneApprovalRule(rule)) },
      "tenant approval rule reorder",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "tenant.approval_rule.reordered",
        resourceType: "tenant_approval_rule_set",
        resourceId: tenantId,
        newValuesSummary: { orderedRuleIds },
      },
      requestId,
    );
    return reordered.map((rule) => this.cloneApprovalRule(rule));
  }

  disableApprovalRule(tenantId: string, ruleId: string, requestId?: string) {
    const existing = this.requireApprovalRule(tenantId, ruleId);
    const disabled: TenantApprovalRuleRecord = {
      ...existing,
      activeFlag: false,
      disabledAt: existing.disabledAt ?? new Date().toISOString(),
      disabledReason: existing.disabledReason ?? "disabled_by_tenant_admin",
      updatedAt: new Date().toISOString(),
    };
    this.approvalRules = this.approvalRules.map((rule) =>
      rule.ruleId === ruleId ? disabled : rule,
    );
    this.bumpApprovalRuleVersion(tenantId);
    this.persistChanges(
      { approvalRules: [this.cloneApprovalRule(disabled)] },
      "tenant approval rule disable",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "tenant.approval_rule.disabled",
        resourceType: "tenant_approval_rule",
        resourceId: ruleId,
        newValuesSummary: this.buildApprovalRuleAuditSummary(disabled),
      },
      requestId,
    );
    return this.cloneApprovalRule(disabled);
  }

  evaluateApprovalRules(
    tenantId: string,
    command: EvaluateTenantApprovalRuleCommand,
    requestId?: string,
  ): TenantApprovalEvaluationResult {
    const evaluationStartedAtMs = Date.now();
    const inputSnapshot = command.inputSnapshot ?? {
      costCenterCode: command.sampleBooking?.costCenterCode ?? null,
      businessDispatchSubtype:
        command.sampleBooking?.businessDispatchSubtype ?? null,
      reservationWindowStart:
        command.sampleBooking?.reservationWindowStart ?? null,
      passengerId: command.sampleBooking?.passengerId ?? null,
      passengerRole: command.sampleBooking?.passengerRole ?? null,
      amountMinor: command.sampleBooking?.amountMinor ?? null,
      currency: null,
      vehiclePreference: command.sampleBooking?.vehiclePreference ?? null,
      direction: command.sampleBooking?.direction ?? null,
      flightNoPresent: command.sampleBooking?.flightNoPresent ?? null,
      flightNo: command.sampleBooking?.flightNo ?? null,
    };
    const evaluationSubject = command.subject ?? {
      subjectType: "booking" as const,
      bookingId: null,
      draftId: null,
      operation: "dry_run" as const,
    };
    const result = evaluateTenantApprovalRules({
      tenantId,
      subject: evaluationSubject,
      inputSnapshot,
      rules: this.listApprovalRules(tenantId, {
        activeOnly: command.includeInactive ? false : true,
      }),
      quotaImpacts: command.quotaImpacts ?? [],
      ruleVersionSnapshot: this.getApprovalRuleVersionSnapshot(tenantId),
      tenantDefaultTimeoutHours: 24,
      tenantDefaultFallbackPolicy: "escalate_to_tenant_admin",
    });
    const evaluationLatencyMs = Math.max(0, Date.now() - evaluationStartedAtMs);
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "booking.approval_rules.evaluated",
        resourceType: "tenant_approval_rule_set",
        resourceId: tenantId,
        newValuesSummary: {
          subject: result.subject,
          decision: result.outcome?.decision ?? null,
          matchedRuleIds: result.matchedRules.map((rule) => rule.ruleId),
          matchedRuleCount: result.matchedRules.length,
          evaluationLatencyMs,
          approvalRequired: result.outcome?.approvalRequired ?? false,
        },
      },
      requestId,
    );
    const resolvedSubject = result.subject ?? evaluationSubject;
    const bookingResourceId =
      resolvedSubject.bookingId ?? resolvedSubject.draftId;
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "booking.governance.evaluated",
        resourceType: bookingResourceId
          ? "booking"
          : "tenant_approval_rule_set",
        resourceId: bookingResourceId ?? tenantId,
        newValuesSummary: {
          subject: result.subject,
          decision: result.outcome?.decision ?? null,
          matchedRuleIds: result.matchedRules.map((rule) => rule.ruleId),
          matchedRuleCount: result.matchedRules.length,
          evaluationLatencyMs,
          approvalRequired: result.outcome?.approvalRequired ?? false,
        },
      },
      requestId,
    );
    if (bookingResourceId && inputSnapshot.costCenterCode) {
      this.recordTenantAudit(
        {
          actorId: null,
          actorType: "tenant_admin",
          tenantId,
          moduleName: "tenant-partner",
          actionName: "booking.cost_center.assigned",
          resourceType: "booking",
          resourceId: bookingResourceId,
          newValuesSummary: {
            costCenterCode: inputSnapshot.costCenterCode,
            operation: resolvedSubject.operation,
            evaluationId: result.evaluationId,
          },
        },
        requestId,
      );
    }
    return result;
  }

  listApprovalReevaluationFields() {
    return [...APPROVAL_REEVALUATION_FIELDS];
  }

  needsApprovalReevaluation(
    previousSnapshot: Parameters<
      typeof shouldReevaluateTenantBookingApproval
    >[0],
    nextSnapshot: Parameters<typeof shouldReevaluateTenantBookingApproval>[1],
  ) {
    return shouldReevaluateTenantBookingApproval(
      previousSnapshot,
      nextSnapshot,
    );
  }

  listApprovalRequests(
    tenantId: string,
    query: ListTenantBookingApprovalRequestsQuery = {},
  ) {
    return this.approvalRequests
      .filter((request) => request.tenantId === tenantId)
      .filter((request) =>
        query.status ? request.status === query.status : true,
      )
      .filter((request) =>
        query.bookingId ? request.bookingId === query.bookingId : true,
      )
      .map((request) => this.cloneApprovalRequest(request));
  }

  createGovernanceMutationSnapshot(): TenantGovernanceMutationSnapshot {
    return {
      approvalRequests: this.approvalRequests.map((request) =>
        this.cloneApprovalRequest(request),
      ),
      approvalDecisions: this.approvalDecisions.map((decision) =>
        this.cloneApprovalDecision(decision),
      ),
      quotaLedger: this.quotaLedger.map((entry) =>
        this.cloneQuotaLedgerEntry(entry),
      ),
      quotaMonthlySnapshots: Array.from(
        this.quotaMonthlySnapshots.values(),
      ).map((snapshot) => this.cloneQuotaMonthlySnapshot(snapshot)),
    };
  }

  restoreGovernanceMutationSnapshot(
    snapshot: TenantGovernanceMutationSnapshot,
  ) {
    this.approvalRequests = snapshot.approvalRequests.map((request) =>
      this.cloneApprovalRequest(request),
    );
    this.approvalDecisions = snapshot.approvalDecisions.map((decision) =>
      this.cloneApprovalDecision(decision),
    );
    this.quotaLedger = snapshot.quotaLedger.map((entry) =>
      this.cloneQuotaLedgerEntry(entry),
    );
    this.quotaMonthlySnapshots = new Map(
      snapshot.quotaMonthlySnapshots.map((quotaSnapshot) => [
        this.buildQuotaSnapshotKey(
          quotaSnapshot.tenantId,
          quotaSnapshot.costCenterCode,
          quotaSnapshot.period,
          quotaSnapshot.periodKey,
        ),
        this.cloneQuotaMonthlySnapshot(quotaSnapshot),
      ]),
    );
  }

  listOpsPendingApprovalRequests(
    query: ListOpsPendingApprovalRequestsQuery = {},
    _requestId?: string,
    identity?: IdentityContext | null,
  ) {
    this.requireOpsApprovalQueueIdentity(identity ?? null);

    return this.approvalRequests
      .filter((request) =>
        query.tenantId ? request.tenantId === query.tenantId : true,
      )
      .filter((request) =>
        query.status
          ? request.status === query.status
          : request.status === "pending",
      )
      .filter((request) =>
        query.expiresBefore ? request.timeoutAt <= query.expiresBefore : true,
      )
      .map((request) => this.buildOpsPendingApprovalRequestRecord(request));
  }

  getApprovalRequest(tenantId: string, approvalRequestId: string) {
    return this.cloneApprovalRequest(
      this.requireApprovalRequest(tenantId, approvalRequestId),
    );
  }

  listPendingApprovalRequestsForBooking(tenantId: string, bookingId: string) {
    return this.approvalRequests
      .filter(
        (request) =>
          request.tenantId === tenantId &&
          request.bookingId === bookingId &&
          request.status === "pending",
      )
      .map((request) => this.cloneApprovalRequest(request));
  }

  createBookingApprovalRequest(params: {
    tx?: TenantPartnerQueryExecutor | null;
    tenantId: string;
    bookingId: string;
    orderId: string;
    evaluationSnapshot: TenantApprovalEvaluationResult;
    requestId?: string;
  }) {
    if (
      !params.evaluationSnapshot.outcome?.approvalRequired ||
      !params.evaluationSnapshot.approvalPlan
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "APPROVAL_NOT_REQUIRED",
        "The booking evaluation does not require approval.",
        {
          bookingId: params.bookingId,
          evaluationId: params.evaluationSnapshot.evaluationId ?? null,
        },
      );
    }

    const now = new Date().toISOString();
    const escalationTarget = params.evaluationSnapshot.approvalPlan
      .escalationTarget ?? {
      kind: "tenant_admin" as const,
      displayName: "Tenant Admin",
    };
    const resolution = resolveApprovalApproverUserIds(
      {
        approvers: params.evaluationSnapshot.approvalPlan.approvers,
        escalationTarget,
        bookingCostCenterCode:
          params.evaluationSnapshot.inputSnapshot?.costCenterCode ?? null,
      },
      {
        hasUser: (userId) =>
          this.findActiveTenantUser(params.tenantId, userId) !== null,
        listUserIdsByRole: (roleCode) =>
          this.listActiveTenantUsersByRole(params.tenantId, roleCode).map(
            (userRole) => userRole.userId,
          ),
        getCostCenterOwnerUserId: (costCenterCode) =>
          this.getActiveCostCenterOwnerUserId(params.tenantId, costCenterCode),
      },
    );
    if (resolution.resolvedApproverUserIds.length === 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "APPROVAL_NO_RESOLVABLE_APPROVERS",
        "The approval request has no resolvable approvers.",
        {
          bookingId: params.bookingId,
          orderId: params.orderId,
          evaluationId: params.evaluationSnapshot.evaluationId ?? null,
          approvers: params.evaluationSnapshot.approvalPlan.approvers,
        },
      );
    }

    const request: TenantBookingApprovalRequestRecord = {
      approvalRequestId: `approval-request-${randomUUID()}`,
      tenantId: params.tenantId,
      bookingId: params.bookingId,
      orderId: params.orderId,
      evaluationId:
        params.evaluationSnapshot.evaluationId ??
        `approval-eval-${randomUUID()}`,
      ruleIds: params.evaluationSnapshot.matchedRules.map(
        (rule) => rule.ruleId,
      ),
      status: "pending",
      approvalMode: params.evaluationSnapshot.approvalPlan.approvalMode,
      approvers: params.evaluationSnapshot.approvalPlan.approvers.map(
        (approver) => this.clonePrincipalRef(approver),
      ),
      resolvedApproverUserIds: [...resolution.resolvedApproverUserIds],
      previousApprovers: [],
      decisions: [],
      evaluationSnapshot: this.cloneTenantApprovalEvaluationResult(
        params.evaluationSnapshot,
      ),
      timeoutAt: new Date(
        Date.parse(now) +
          params.evaluationSnapshot.approvalPlan.timeoutHours * 60 * 60 * 1000,
      ).toISOString(),
      escalatedAt: null,
      fallbackPolicy: params.evaluationSnapshot.approvalPlan.fallbackPolicy,
      escalationTarget: this.clonePrincipalRef(escalationTarget),
      createdAt: now,
      resolvedAt: null,
    };

    this.approvalRequests = [
      this.cloneApprovalRequest(request),
      ...this.approvalRequests.filter(
        (candidate) =>
          candidate.approvalRequestId !== request.approvalRequestId,
      ),
    ];
    const persisted = this.persistApprovalWorkflow({
      tx: params.tx ?? null,
      approvalRequests: [request],
      context: "create booking approval request",
    });
    const onSuccess = async () => {
      this.recordApprovalFallbackAudits(
        params.tenantId,
        params.bookingId,
        resolution.fallbackRecords,
        params.requestId,
      );
      this.recordTenantAudit(
        {
          actorId: null,
          actorType: "tenant_admin",
          tenantId: params.tenantId,
          moduleName: "tenant-partner",
          actionName: "booking.approval_request.created",
          resourceType: "booking",
          resourceId: request.bookingId,
          newValuesSummary: {
            approvalRequestId: request.approvalRequestId,
            bookingId: request.bookingId,
            orderId: request.orderId,
            evaluationId: request.evaluationId,
            approvalMode: request.approvalMode,
            resolvedApproverUserIds: request.resolvedApproverUserIds,
            timeoutAt: request.timeoutAt,
            fallbackPolicy: request.fallbackPolicy,
          },
        },
        params.requestId,
      );
      await this.dispatchApprovalNotifications(
        "new_request",
        request,
        params.requestId ? { requestId: params.requestId } : undefined,
      );
      void this.pollPendingApprovalTimeoutNotifications();
      return this.cloneApprovalRequest(request);
    };

    if (persisted instanceof Promise) {
      return persisted.then(onSuccess);
    }
    return onSuccess();
  }

  cancelApprovalRequestsForReevaluation(params: {
    tx?: TenantPartnerQueryExecutor | null;
    tenantId: string;
    bookingId: string;
    requestId?: string;
  }) {
    const now = new Date().toISOString();
    const cancelled = this.approvalRequests
      .filter(
        (request) =>
          request.tenantId === params.tenantId &&
          request.bookingId === params.bookingId &&
          request.status === "pending",
      )
      .map((request) => ({
        ...request,
        status: "cancelled_by_re_evaluation" as const,
        resolvedAt: now,
      }));

    if (cancelled.length === 0) {
      return [];
    }

    const cancelledIds = new Set(
      cancelled.map((request) => request.approvalRequestId),
    );
    this.approvalRequests = [
      ...cancelled.map((request) => this.cloneApprovalRequest(request)),
      ...this.approvalRequests.filter(
        (request) => !cancelledIds.has(request.approvalRequestId),
      ),
    ];
    const persisted = this.persistApprovalWorkflow({
      tx: params.tx ?? null,
      approvalRequests: cancelled,
      context: "cancel approval requests for reevaluation",
    });
    return this.afterPersistence(persisted, () => {
      cancelled.forEach((request) =>
        this.recordTenantAudit(
          {
            actorId: null,
            actorType: "tenant_admin",
            tenantId: params.tenantId,
            moduleName: "tenant-partner",
            actionName: "booking.approval_request.cancelled_by_re_evaluation",
            resourceType: "tenant_approval_request",
            resourceId: request.approvalRequestId,
            newValuesSummary: {
              bookingId: request.bookingId,
              orderId: request.orderId,
              evaluationId: request.evaluationId,
            },
          },
          params.requestId,
        ),
      );
      return cancelled.map((request) => this.cloneApprovalRequest(request));
    });
  }

  async approveApprovalRequest(input: {
    tenantId: string;
    approvalRequestId: string;
    actorUserId: string;
    actorRoleCode?: string | null;
    command: ApproveTenantBookingApprovalRequestCommand;
    requestId?: string;
  }) {
    return this.recordApprovalDecision({
      tenantId: input.tenantId,
      approvalRequestId: input.approvalRequestId,
      actorUserId: input.actorUserId,
      actorRoleCode: input.actorRoleCode ?? null,
      decision: "approve",
      reasonCode: null,
      reasonNote: this.normalizeNullableText(input.command.reasonNote),
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
  }

  async rejectApprovalRequest(input: {
    tenantId: string;
    approvalRequestId: string;
    actorUserId: string;
    actorRoleCode?: string | null;
    command: RejectTenantBookingApprovalRequestCommand;
    requestId?: string;
  }) {
    return this.recordApprovalDecision({
      tenantId: input.tenantId,
      approvalRequestId: input.approvalRequestId,
      actorUserId: input.actorUserId,
      actorRoleCode: input.actorRoleCode ?? null,
      decision: "reject",
      reasonCode: this.requireNonBlank(input.command.reasonCode, "reasonCode"),
      reasonNote: this.normalizeNullableText(input.command.reasonNote),
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
  }

  async escalateApprovalRequest(input: {
    tenantId: string;
    approvalRequestId: string;
    actorUserId: string;
    actorRoleCode?: string | null;
    command: EscalateTenantBookingApprovalRequestCommand;
    requestId?: string;
  }) {
    const actor = this.findActiveTenantUser(input.tenantId, input.actorUserId);
    const actorRoleCode = input.actorRoleCode ?? actor?.roleCode ?? null;
    if (actorRoleCode !== "tenant_admin") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "APPROVAL_NOT_AUTHORIZED",
        "Only tenant_admin can escalate approval requests.",
        {
          approvalRequestId: input.approvalRequestId,
          actorUserId: input.actorUserId,
        },
      );
    }
    return this.escalateApprovalRequestInternal({
      tenantId: input.tenantId,
      approvalRequestId: input.approvalRequestId,
      actorUserId: input.actorUserId,
      reasonNote: this.normalizeNullableText(input.command.reasonNote),
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
  }

  async nudgeOpsApprovalRequest(
    approvalRequestId: string,
    command: NudgeOpsApprovalRequestCommand,
    identity: IdentityContext | null,
    requestId?: string,
  ) {
    const actor = this.requireOpsApprovalQueueIdentity(identity);
    const request = this.requirePendingApprovalRequestById(approvalRequestId);
    this.recordTenantAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: request.tenantId,
        moduleName: "tenant-partner",
        actionName: OPS_APPROVAL_REQUEST_NUDGE_ACTION,
        resourceType: "tenant_approval_request",
        resourceId: request.approvalRequestId,
        newValuesSummary: {
          bookingId: request.bookingId,
          orderId: request.orderId,
          reasonNote: this.normalizeNullableText(command.reasonNote),
        },
      },
      requestId,
    );
    return this.buildOpsPendingApprovalRequestRecord(request);
  }

  async acknowledgeOpsApprovalRequestBreach(
    approvalRequestId: string,
    command: AcknowledgeOpsApprovalRequestBreachCommand,
    identity: IdentityContext | null,
    requestId?: string,
  ) {
    const actor = this.requireOpsApprovalQueueIdentity(identity);
    const request = this.requirePendingApprovalRequestById(approvalRequestId);
    this.recordTenantAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: request.tenantId,
        moduleName: "tenant-partner",
        actionName: OPS_APPROVAL_REQUEST_SLA_ACK_ACTION,
        resourceType: "tenant_approval_request",
        resourceId: request.approvalRequestId,
        newValuesSummary: {
          bookingId: request.bookingId,
          orderId: request.orderId,
          reasonNote: this.normalizeNullableText(command.reasonNote),
        },
      },
      requestId,
    );
    return this.buildOpsPendingApprovalRequestRecord(request);
  }

  async approveOpsApprovalRequest(
    approvalRequestId: string,
    command: ApproveTenantBookingApprovalRequestCommand,
    identity: IdentityContext | null,
    requestId?: string,
  ) {
    const actor = this.requireOpsApprovalQueueIdentity(identity);
    return this.recordOpsApprovalDecision({
      approvalRequestId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      actorRoleCode: this.resolveOpsApprovalQueueRoleCode(identity),
      decision: "approve",
      reasonCode: null,
      reasonNote: this.normalizeNullableText(command.reasonNote),
      ...(requestId ? { requestId } : {}),
    });
  }

  async rejectOpsApprovalRequest(
    approvalRequestId: string,
    command: RejectTenantBookingApprovalRequestCommand,
    identity: IdentityContext | null,
    requestId?: string,
  ) {
    const actor = this.requireOpsApprovalQueueIdentity(identity);
    return this.recordOpsApprovalDecision({
      approvalRequestId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      actorRoleCode: this.resolveOpsApprovalQueueRoleCode(identity),
      decision: "reject",
      reasonCode: this.requireNonBlank(command.reasonCode, "reasonCode"),
      reasonNote: this.normalizeNullableText(command.reasonNote),
      ...(requestId ? { requestId } : {}),
    });
  }

  async escalateOpsApprovalRequest(
    approvalRequestId: string,
    command: EscalateTenantBookingApprovalRequestCommand,
    identity: IdentityContext | null,
    requestId?: string,
  ) {
    const actor = this.requireOpsApprovalQueueIdentity(identity);
    const request = this.requirePendingApprovalRequestById(approvalRequestId);
    return this.buildOpsPendingApprovalRequestRecord(
      await this.escalateApprovalRequestInternal({
        tenantId: request.tenantId,
        approvalRequestId,
        actorUserId: actor.actorId,
        actorType: actor.actorType,
        reasonNote: this.normalizeNullableText(command.reasonNote),
        ...(requestId ? { requestId } : {}),
      }),
    );
  }

  summarizeCostCenterCoverage(
    tenantId: string,
    requestId?: string,
  ): TenantCostCenterCoverageReport {
    const generatedAt = new Date().toISOString();
    const tenantOrders = this.orderFeedProvider().filter(
      (order) =>
        order.tenantId === tenantId &&
        order.serviceBucket === "business_dispatch" &&
        this.normalizeNullableText(order.costCenter) !== null,
    );
    const directory = this.costCenters.filter(
      (candidate) => candidate.tenantId === tenantId,
    );
    const directoryByCode = new Map(
      directory.map((costCenter) => [costCenter.code, costCenter]),
    );
    const unresolvedSamples = new Map<string, TenantCostCenterCoverageSample>();
    let resolvedCount = 0;
    let unresolvedCount = 0;
    let disabledHits = 0;

    for (const order of tenantOrders) {
      const rawCostCenter = this.normalizeNullableText(order.costCenter);
      if (rawCostCenter === null) {
        continue;
      }

      const normalizedCode = rawCostCenter.toUpperCase();
      const matched = directoryByCode.get(normalizedCode) ?? null;

      if (matched) {
        if (matched.activeFlag) {
          resolvedCount += 1;
        } else {
          unresolvedCount += 1;
          disabledHits += 1;
          this.recordCoverageSample(
            unresolvedSamples,
            rawCostCenter,
            matched.code,
          );
        }
        continue;
      }

      unresolvedCount += 1;
      this.recordCoverageSample(
        unresolvedSamples,
        rawCostCenter,
        this.suggestCoverageCostCenter(rawCostCenter, directory),
      );
    }

    const report: TenantCostCenterCoverageReport = {
      tenantId,
      generatedAt,
      totalBookings: tenantOrders.length,
      resolvedCount,
      unresolvedCount,
      disabledHits,
      unresolvedSamples: Array.from(unresolvedSamples.values()).sort(
        (left, right) =>
          right.occurrences - left.occurrences ||
          left.rawCostCenter.localeCompare(right.rawCostCenter),
      ),
    };

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "list_cost_center_coverage",
        resourceType: "tenant_cost_center_coverage_report",
        resourceId: tenantId,
        newValuesSummary: {
          totalBookings: report.totalBookings,
          resolvedCount: report.resolvedCount,
          unresolvedCount: report.unresolvedCount,
          disabledHits: report.disabledHits,
        },
      },
      requestId,
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "tenant.cost_center.coverage_listed",
        resourceType: "tenant_cost_center_coverage_report",
        resourceId: tenantId,
        newValuesSummary: {
          totalBookings: report.totalBookings,
          resolvedCount: report.resolvedCount,
          unresolvedCount: report.unresolvedCount,
          disabledHits: report.disabledHits,
        },
      },
      requestId,
    );

    return report;
  }

  private listTenantScopedOrders(tenantId: string) {
    return this.orderFeedProvider()
      .filter(
        (order) =>
          order.tenantId === tenantId &&
          order.serviceBucket === "business_dispatch",
      )
      .map((order) => this.cloneOwnedOrder(order));
  }

  private filterTenantOrders(
    orders: OwnedOrderRecord[],
    query: TenantOrderListQuery,
    invoiceStatuses: Map<string, string>,
  ) {
    return orders.filter((order) => {
      const from = query.from?.trim();
      const to = query.to?.trim();
      const effectiveDate = order.reservationWindowStart ?? order.createdAt;
      if (from && effectiveDate < from) {
        return false;
      }
      if (to && effectiveDate > to) {
        return false;
      }
      if (
        query.serviceProduct &&
        (order.businessDispatchSubtype ?? "enterprise_dispatch") !==
          query.serviceProduct
      ) {
        return false;
      }
      if (query.status && order.status !== query.status.trim()) {
        return false;
      }
      if (
        query.costCenterCode &&
        (order.costCenter ?? "").toUpperCase() !==
          query.costCenterCode.trim().toUpperCase()
      ) {
        return false;
      }
      if (
        query.tenantServiceProgramId &&
        this.resolveTenantServiceProgramId(order) !==
          query.tenantServiceProgramId.trim()
      ) {
        return false;
      }
      if (
        query.riderId &&
        order.passenger.passengerId !== query.riderId.trim()
      ) {
        return false;
      }
      if (
        query.sourcePlatform &&
        order.orderSource !== query.sourcePlatform.trim()
      ) {
        return false;
      }
      if (
        query.invoiceStatus &&
        (invoiceStatuses.get(order.orderId) ?? "draft") !==
          query.invoiceStatus.trim()
      ) {
        return false;
      }
      return true;
    });
  }

  private resolveTenantBusinessPeriodMonth(
    tenantId: string,
    tenantOrders: readonly OwnedOrderRecord[],
    invoices: readonly {
      periodStart: string;
      amount: { amountMinor: number };
      status: string;
      periodEnd: string;
    }[],
  ) {
    const orderMonths = tenantOrders.map((order) =>
      (order.reservationWindowStart ?? order.createdAt).slice(0, 7),
    );
    const approvalMonths = this.approvalRequests
      .filter((request) => request.tenantId === tenantId)
      .map((request) => request.createdAt.slice(0, 7));
    const invoiceMonths = invoices.map((invoice) =>
      invoice.periodStart.slice(0, 7),
    );

    return (
      [...orderMonths, ...approvalMonths, ...invoiceMonths].sort().at(-1) ??
      new Date().toISOString().slice(0, 7)
    );
  }

  private buildInvoiceStatusByOrder(
    billingSettlementService:
      | Pick<BillingSettlementService, "listTenantInvoices">
      | undefined,
    tenantId: string,
  ) {
    const statusByOrder = new Map<string, string>();
    if (!billingSettlementService) {
      return statusByOrder;
    }

    for (const invoice of billingSettlementService.listTenantInvoices(
      tenantId,
    )) {
      const status = this.deriveInvoiceStatus(invoice);
      for (const line of invoice.lines) {
        statusByOrder.set(line.orderId, status);
      }
    }

    return statusByOrder;
  }

  private deriveInvoiceStatus(invoice: { status: string; periodEnd: string }) {
    if (invoice.status === "paid") {
      return "paid";
    }
    if (
      invoice.status === "issued" &&
      Date.parse(invoice.periodEnd) + 30 * 24 * 60 * 60 * 1000 < Date.now()
    ) {
      return "overdue";
    }
    return invoice.status === "issued" ? "issued" : "draft";
  }

  private listTenantCostCenterWarnings(
    tenantId: string,
  ): TenantCostCenterQuotaWarning[] {
    return this.costCenters
      .filter(
        (costCenter) =>
          costCenter.tenantId === tenantId && costCenter.activeFlag,
      )
      .map((costCenter) => {
        const summary = this.getCostCenterQuotaSummary(
          tenantId,
          costCenter.code,
        );
        const remainingPercent = summary.usage.remainingPercent;
        const warningLevel =
          remainingPercent !== null && remainingPercent <= 10
            ? "critical"
            : "warning";
        return {
          tenantId,
          costCenterCode: costCenter.code,
          costCenterName: costCenter.name,
          periodKey: summary.periodKey,
          remainingBookingCount: summary.usage.bookingCountRemaining,
          remainingAmountMinor: summary.usage.amountMinorRemaining,
          remainingPercent,
          enforcementMode: summary.limit.enforcementMode,
          warningLevel,
        } satisfies TenantCostCenterQuotaWarning;
      })
      .filter(
        (warning) =>
          warning.remainingPercent !== null && warning.remainingPercent <= 20,
      );
  }

  private isUpcomingOrder(order: OwnedOrderRecord) {
    const effectiveStart = order.reservationWindowStart;
    if (!effectiveStart) {
      return false;
    }

    return Date.parse(effectiveStart) >= Date.now();
  }

  private toTenantBookingSummary(
    order: OwnedOrderRecord,
  ): TenantBookingSummary {
    return {
      bookingId: order.bookingId ?? order.orderId,
      orderId: order.orderId,
      serviceProduct: order.businessDispatchSubtype ?? "enterprise_dispatch",
      status: order.status,
      reservationWindowStart: order.reservationWindowStart,
      reservationWindowEnd: order.reservationWindowEnd,
      passengerName: order.passenger.name,
      pickupAddress: order.pickup.address,
      dropoffAddress: order.dropoff.address,
      costCenterCode: order.costCenter,
      tenantServiceProgramId: this.resolveTenantServiceProgramId(order),
    };
  }

  private buildIssuerContractStatusRecord(
    tenantId: string,
    entry: PartnerChannelEntryRecord,
  ): IssuerContractStatusRecord {
    const orders = this.listTenantScopedOrders(tenantId).filter(
      (order) =>
        order.partnerProgramId === entry.programId &&
        order.businessDispatchSubtype === entry.businessDispatchSubtype,
    );
    const period = this.resolveIssuerContractPeriod(orders);
    const periodOrders = orders.filter((order) =>
      this.isOrderInBusinessPeriod(order, period),
    );
    const slaTargets = this.buildIssuerContractSlaTargets(tenantId);
    const periodAttainment = this.buildIssuerContractPeriodAttainment(
      period,
      periodOrders,
      slaTargets,
    );
    const exceptions = periodOrders
      .filter(
        (order) =>
          order.exceptionHold !== null || order.dispatchTimeout !== null,
      )
      .map((order, index) =>
        this.buildIssuerContractExceptionRecord(order, index),
      );
    const status = this.deriveIssuerContractStatus(entry, periodAttainment);

    return {
      contractId: this.buildIssuerContractId(entry.programId),
      tenantId,
      programId: entry.programId,
      programCode: entry.programCode ?? entry.programId,
      displayName: entry.displayName,
      term: {
        startsAt: entry.createdAt,
        endsAt: entry.revokedAt,
        billingCycle: "monthly",
        serviceProduct: entry.businessDispatchSubtype,
        issuerTenantId: tenantId,
      },
      slaTargets,
      periodAttainment,
      exceptions,
      status,
    };
  }

  private buildIssuerContractSlaTargets(
    tenantId: string,
  ): IssuerContractSlaTarget[] {
    const profile = this.getOrCreateSlaProfile(tenantId);
    return [
      {
        metric: "pickup_punctuality",
        thresholdPercent: this.toSlaPercent(profile.waitThresholdMin, 20, 92),
        comparator: "gte",
        window: "current_period",
      },
      {
        metric: "completion_rate",
        thresholdPercent: this.toSlaPercent(
          profile.completionThresholdMin,
          60,
          98,
        ),
        comparator: "gte",
        window: "current_period",
      },
    ];
  }

  private buildIssuerContractPeriodAttainment(
    period: string,
    orders: OwnedOrderRecord[],
    slaTargets: IssuerContractSlaTarget[],
  ): IssuerContractPeriodAttainment {
    const totalTrips = orders.length;
    const completedTrips = orders.filter(
      (order) => order.status === "completed",
    ).length;
    const pickupPunctualityNumerator = orders.filter(
      (order) => !this.orderHasSlaPickupException(order),
    ).length;
    const pickupPunctualityPercent =
      totalTrips === 0
        ? null
        : this.toWholePercent(pickupPunctualityNumerator, totalTrips);
    const completionRatePercent =
      totalTrips === 0 ? null : this.toWholePercent(completedTrips, totalTrips);
    const metrics = {
      pickup_punctuality: pickupPunctualityPercent,
      completion_rate: completionRatePercent,
    } satisfies Record<IssuerContractSlaMetric, number | null>;

    return {
      period,
      evaluatedAt: new Date().toISOString(),
      completedTrips,
      totalTrips,
      pickupPunctualityPercent,
      completionRatePercent,
      breachedTargets: slaTargets.flatMap((target) => {
        const value = metrics[target.metric];
        if (value === null || value >= target.thresholdPercent) {
          return [];
        }
        return [target.metric];
      }),
    };
  }

  private buildIssuerContractExceptionRecord(
    order: OwnedOrderRecord,
    index: number,
  ): IssuerContractExceptionRecord {
    const reasonCode =
      order.exceptionHold?.reasonCode ??
      order.dispatchTimeout?.timeoutReasonCode ??
      "sla_exception";
    return {
      exceptionId: `${order.orderId}:exception:${index + 1}`,
      orderId: order.orderId,
      occurredAt:
        order.dispatchTimeout?.timeoutAt ??
        order.exceptionHold?.raisedAt ??
        order.updatedAt,
      reasonCode,
      summary: this.describeIssuerContractException(order, reasonCode),
      status:
        order.exceptionHold?.resolution || order.status === "completed"
          ? "resolved"
          : "open",
      benefitReferenceMasked: maskOpaqueToken(order.benefitReference, 8, 4),
      issuerAuthorizationRefMasked: maskOpaqueToken(
        order.issuerAuthorizationRef,
        8,
        4,
      ),
    };
  }

  private deriveIssuerContractStatus(
    entry: PartnerChannelEntryRecord,
    periodAttainment: IssuerContractPeriodAttainment,
  ): IssuerContractStatus {
    if (!entry.activeFlag || entry.status !== "active" || entry.revokedAt) {
      return "inactive";
    }
    if (periodAttainment.breachedTargets.length > 0) {
      return "breached";
    }
    if (periodAttainment.totalTrips === 0) {
      return "at_risk";
    }
    return "active";
  }

  private buildIssuerContractId(programId: string) {
    return `issuer-contract:${programId}`;
  }

  private resolveIssuerContractPeriod(orders: OwnedOrderRecord[]) {
    const latestTimestamp =
      orders
        .map(
          (order) =>
            order.reservationWindowStart ?? order.updatedAt ?? order.createdAt,
        )
        .sort()
        .at(-1) ?? new Date().toISOString();
    return latestTimestamp.slice(0, 7);
  }

  private isOrderInBusinessPeriod(order: OwnedOrderRecord, period: string) {
    const timestamp =
      order.reservationWindowStart ?? order.updatedAt ?? order.createdAt;
    return timestamp.slice(0, 7) === period;
  }

  private orderHasSlaPickupException(order: OwnedOrderRecord) {
    return (
      order.dispatchTimeout !== null ||
      order.exceptionHold?.reasonCode === "confirmation_window_expired" ||
      order.exceptionHold?.reasonCode === "driver_rejected_in_window" ||
      order.exceptionHold?.reasonCode === "no_eligible_supply"
    );
  }

  private describeIssuerContractException(
    order: OwnedOrderRecord,
    reasonCode: string,
  ) {
    switch (reasonCode) {
      case "confirmation_window_expired":
        return `Order ${order.orderNo} missed the confirmation window.`;
      case "driver_rejected_in_window":
        return `Order ${order.orderNo} was rejected within the confirmation window.`;
      case "no_eligible_supply":
        return `Order ${order.orderNo} could not find eligible supply in time.`;
      case "acceptance_timeout":
      case "matching_timeout":
        return `Order ${order.orderNo} exceeded dispatch timeout thresholds.`;
      default:
        return `Order ${order.orderNo} requires manual SLA review.`;
    }
  }

  private toSlaPercent(value: number, divisor: number, fallback: number) {
    if (value <= 0) {
      return fallback;
    }

    return Math.max(1, Math.min(100, 100 - Math.round(value / divisor)));
  }

  private toWholePercent(numerator: number, denominator: number) {
    if (denominator <= 0) {
      return 0;
    }

    return Math.round((numerator / denominator) * 100);
  }

  private cloneIssuerContractStatusRecord(
    record: IssuerContractStatusRecord,
  ): IssuerContractStatusRecord {
    return {
      ...record,
      term: { ...record.term },
      slaTargets: record.slaTargets.map((target) => ({ ...target })),
      periodAttainment: {
        ...record.periodAttainment,
        breachedTargets: [...record.periodAttainment.breachedTargets],
      },
      exceptions: record.exceptions.map((exception) => ({ ...exception })),
    };
  }

  private resolveTenantServiceProgramId(order: OwnedOrderRecord) {
    return order.partnerProgramId ?? DEFAULT_TENANT_SERVICE_PROGRAM_ID;
  }

  private requireOrderForTenant(tenantId: string, orderId: string) {
    const order = this.listTenantScopedOrders(tenantId).find(
      (candidate) => candidate.orderId === orderId,
    );
    if (!order) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Tenant order not found.",
        {
          tenantId,
          orderId,
        },
      );
    }
    return order;
  }

  private cloneOwnedOrder(order: OwnedOrderRecord): OwnedOrderRecord {
    return JSON.parse(JSON.stringify(order)) as OwnedOrderRecord;
  }

  upsertCostCenter(
    tenantId: string,
    command: UpsertTenantCostCenterCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.code, "code");
    this.assertNonBlank(command.name, "name");

    const code = this.normalizeCostCenterCode(command.code);
    const existing = this.costCenters.find(
      (candidate) => candidate.tenantId === tenantId && candidate.code === code,
    );

    const hasOwnerUserId = Object.prototype.hasOwnProperty.call(
      command,
      "ownerUserId",
    );
    const hasOwnerName = Object.prototype.hasOwnProperty.call(
      command,
      "ownerName",
    );
    const normalizedOwnerUserId = hasOwnerUserId
      ? this.normalizeNullableText(command.ownerUserId)
      : (existing?.ownerUserId ?? null);
    const ownerUser =
      normalizedOwnerUserId === null
        ? null
        : this.requireTenantUser(tenantId, normalizedOwnerUserId);
    const ownerName = hasOwnerName
      ? this.normalizeNullableText(command.ownerName)
      : hasOwnerUserId
        ? (ownerUser?.displayName ?? null)
        : (existing?.ownerName ?? null);

    const now = new Date().toISOString();
    const activeFlag = command.activeFlag ?? existing?.activeFlag ?? true;
    const disabledAt = activeFlag ? null : (existing?.disabledAt ?? now);
    const disabledReason = activeFlag
      ? null
      : (existing?.disabledReason ?? "disabled_via_upsert");

    const costCenter: TenantCostCenterRecord = existing
      ? {
          ...existing,
          code,
          name: command.name.trim(),
          description: this.normalizeNullableText(
            command.description ?? existing.description,
          ),
          ownerUserId: normalizedOwnerUserId,
          ownerName,
          activeFlag,
          disabledAt,
          disabledReason,
          updatedAt: now,
        }
      : {
          tenantId,
          code,
          name: command.name.trim(),
          description: this.normalizeNullableText(command.description),
          ownerUserId: normalizedOwnerUserId,
          ownerName,
          activeFlag,
          disabledAt,
          disabledReason,
          createdAt: now,
          updatedAt: now,
        };

    this.costCenters = [
      this.cloneCostCenter(costCenter),
      ...this.costCenters.filter(
        (candidate) =>
          !(
            candidate.tenantId === tenantId &&
            candidate.code === costCenter.code
          ),
      ),
    ];
    this.persistChanges(
      {
        costCenters: [this.cloneCostCenter(costCenter)],
      },
      "upsert_cost_center",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "upsert_cost_center",
        resourceType: "tenant_cost_center",
        resourceId: costCenter.code,
        newValuesSummary: this.buildCostCenterAuditSummary(costCenter),
      },
      requestId,
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: existing
          ? "tenant.cost_center.updated"
          : "tenant.cost_center.created",
        resourceType: "tenant_cost_center",
        resourceId: costCenter.code,
        newValuesSummary: this.buildCostCenterAuditSummary(costCenter),
      },
      requestId,
    );

    return this.cloneCostCenter(costCenter);
  }

  disableCostCenter(
    tenantId: string,
    command: DisableTenantCostCenterCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.code, "code");
    const existing = this.getCostCenter(tenantId, command.code);
    const now = new Date().toISOString();
    const costCenter: TenantCostCenterRecord = {
      ...existing,
      activeFlag: false,
      disabledAt: now,
      disabledReason:
        this.normalizeNullableText(command.reason) ??
        "disabled_by_tenant_admin",
      updatedAt: now,
    };

    this.costCenters = [
      this.cloneCostCenter(costCenter),
      ...this.costCenters.filter(
        (candidate) =>
          !(
            candidate.tenantId === tenantId &&
            candidate.code === costCenter.code
          ),
      ),
    ];
    this.persistChanges(
      {
        costCenters: [this.cloneCostCenter(costCenter)],
      },
      "disable_cost_center",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "disable_cost_center",
        resourceType: "tenant_cost_center",
        resourceId: costCenter.code,
        newValuesSummary: this.buildCostCenterAuditSummary(costCenter),
      },
      requestId,
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "tenant.cost_center.disabled",
        resourceType: "tenant_cost_center",
        resourceId: costCenter.code,
        newValuesSummary: this.buildCostCenterAuditSummary(costCenter),
      },
      requestId,
    );

    return this.cloneCostCenter(costCenter);
  }

  validateBookingCostCenter(
    tenantId: string,
    rawCode: string | null | undefined,
  ): { value: string | null; matchedDirectory: boolean } {
    const trimmed = this.normalizeNullableText(rawCode);
    if (trimmed === null) {
      return { value: null, matchedDirectory: false };
    }
    const tenantDirectory = this.costCenters.filter(
      (candidate) => candidate.tenantId === tenantId,
    );
    // Grandfather tenants that have not yet seeded a cost-center directory:
    // booking continues to accept the legacy free-text value so existing flows
    // do not break before the tenant_admin onboards cost centers.
    if (tenantDirectory.length === 0) {
      return { value: trimmed, matchedDirectory: false };
    }
    const normalized = trimmed.toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(normalized)) {
      this.recordCostCenterValidationRejectedAudit(
        tenantId,
        "BOOKING_COST_CENTER_INVALID",
        {
          costCenter: trimmed,
        },
      );
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "BOOKING_COST_CENTER_INVALID",
        "costCenter must reference a tenant cost-center code (uppercase letters, numbers, or hyphens).",
        {
          costCenter: trimmed,
        },
      );
    }
    const match = tenantDirectory.find(
      (candidate) => candidate.code === normalized,
    );
    if (!match) {
      this.recordCostCenterValidationRejectedAudit(
        tenantId,
        "BOOKING_COST_CENTER_UNKNOWN",
        {
          costCenter: trimmed,
          normalized,
        },
      );
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "BOOKING_COST_CENTER_UNKNOWN",
        "costCenter does not match any tenant cost-center directory entry.",
        {
          costCenter: trimmed,
          normalized,
        },
      );
    }
    if (!match.activeFlag) {
      this.recordCostCenterValidationRejectedAudit(
        tenantId,
        "BOOKING_COST_CENTER_DISABLED",
        {
          costCenter: normalized,
        },
      );
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "BOOKING_COST_CENTER_DISABLED",
        "costCenter references a disabled tenant cost-center.",
        {
          costCenter: normalized,
        },
      );
    }
    return { value: normalized, matchedDirectory: true };
  }

  listTenantUsers(tenantId: string) {
    return this.userRoles
      .filter((userRole) => userRole.tenantId === tenantId)
      .map((userRole) => this.cloneUserRole(userRole));
  }

  getDefaultTenantId() {
    if (isStrictAuthEnvironment()) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "DEFAULT_TENANT_FORBIDDEN",
        "Default tenant authority is disabled in strict auth environments.",
      );
    }
    return DEMO_TENANT_ID;
  }

  listTenantRoles() {
    return TENANT_ROLE_CATALOG.map((role) => ({ ...role }));
  }

  findTenantUserByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }

    const userRole = this.userRoles.find(
      (candidate) => candidate.email === normalizedEmail,
    );
    return userRole ? this.cloneUserRole(userRole) : null;
  }

  findTenantUserBySubject(subjectId: string) {
    const trimmed = subjectId.trim();
    if (!trimmed) {
      return null;
    }

    const userRole = this.userRoles.find(
      (candidate) =>
        (candidate as any).subjectId === trimmed ||
        (candidate as any).subject === trimmed,
    );
    return userRole ? this.cloneUserRole(userRole) : null;
  }

  bindTenantUserSubject(
    tenantId: string | null | undefined,
    userId: string,
    subjectId: string,
  ) {
    const targetUser = userId?.trim();
    const trimmedSubject = subjectId?.trim();
    if (!targetUser || !trimmedSubject) {
      return null;
    }

    const targetTenant = tenantId?.trim();
    const userRole = this.userRoles.find(
      (candidate) =>
        (!targetTenant || candidate.tenantId === targetTenant) &&
        candidate.userId === targetUser,
    );
    if (!userRole) {
      return null;
    }

    const previousUserRoles = this.userRoles.map((entry) =>
      this.cloneUserRole(entry),
    );

    (userRole as any).subjectId = trimmedSubject;
    (userRole as any).subject = trimmedSubject;

    try {
      this.persistChanges(
        {
          userRoles: this.userRoles.map((entry) => this.cloneUserRole(entry)),
        },
        `bind subject ${trimmedSubject} to user ${targetUser}`,
      );
    } catch {
      this.userRoles = previousUserRoles;
      throw new ApiRequestError(
        500,
        "PERSISTENCE_FAILED",
        "Failed to persist subject binding.",
      );
    }

    this.syncIdentityTenantUserRoles(`bind subject ${trimmedSubject}`);
    return this.cloneUserRole(userRole);
  }

  findTenantUser(tenantId: string, userId: string) {
    const userRole = this.userRoles.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.userId === userId,
    );
    return userRole ? this.cloneUserRole(userRole) : null;
  }

  listPartnerEntries(entrySlug?: string) {
    const slug = entrySlug?.trim();
    return this.partnerEntries
      .filter(
        (entry) =>
          entry.activeFlag &&
          entry.status === "active" &&
          (!slug || entry.entrySlug === slug || entry.partnerId === slug),
      )
      .map((entry) => this.clonePartnerEntry(entry));
  }

  listPlatformPartnerEntries() {
    return this.partnerEntries.map((entry) => this.clonePartnerEntry(entry));
  }

  // ── Referral revenue-share rate config (CRC-BE-006) ──────────────────────
  private referralRevenueShareRules: ReferralRevenueShareRule[] =
    createInitialReferralRevenueShareRules();

  listReferralRevenueShareRules(
    entrySlug?: string,
  ): ReferralRevenueShareRule[] {
    const slug = entrySlug?.trim();
    return this.referralRevenueShareRules
      .filter((rule) => !slug || rule.partnerEntrySlug === slug)
      .map((rule) => ({ ...rule }));
  }

  upsertReferralRevenueShareRule(
    command: UpsertReferralRevenueShareRuleCommand,
    requestId?: string,
  ): ReferralRevenueShareRule {
    const partnerEntrySlug = this.requireNonBlank(
      command.partnerEntrySlug,
      "partnerEntrySlug",
    );
    if (command.rateType !== "percent" && command.rateType !== "per_trip") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "rateType must be 'percent' or 'per_trip'.",
        { rateType: command.rateType },
      );
    }
    if (
      typeof command.value !== "number" ||
      Number.isNaN(command.value) ||
      command.value < 0
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "value must be a number >= 0.",
        { value: command.value },
      );
    }

    const now = new Date().toISOString();
    const existing = this.referralRevenueShareRules.find(
      (rule) => rule.partnerEntrySlug === partnerEntrySlug,
    );
    const record: ReferralRevenueShareRule = {
      ruleId: existing?.ruleId ?? `referral-rule-${randomUUID()}`,
      partnerId:
        this.normalizeNullableText(command.partnerId ?? null) ??
        existing?.partnerId ??
        `partner_${partnerEntrySlug}`,
      partnerEntrySlug,
      rateType: command.rateType,
      value: command.value,
      currency:
        this.normalizeNullableText(command.currency ?? null) ??
        existing?.currency ??
        PLATFORM_CURRENCY,
      effectiveFrom:
        this.normalizeNullableText(command.effectiveFrom ?? null) ??
        existing?.effectiveFrom ??
        now,
      effectiveUntil:
        command.effectiveUntil === undefined
          ? (existing?.effectiveUntil ?? null)
          : this.normalizeNullableText(command.effectiveUntil),
      settlementDirection: REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER,
      channelKey: PARTNER_REFERRAL_CHANNEL_KEY,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      this.referralRevenueShareRules = this.referralRevenueShareRules.map(
        (rule) => (rule.ruleId === record.ruleId ? record : rule),
      );
    } else {
      this.referralRevenueShareRules.push(record);
    }

    this.auditNotificationService.recordAuditLog({
      actorId: null,
      actorType: "system",
      tenantId: null,
      moduleName: "tenant-partner",
      actionName: existing
        ? "referral.revenue_share_rule.updated"
        : "referral.revenue_share_rule.created",
      resourceType: "referral_revenue_share_rule",
      resourceId: partnerEntrySlug,
      newValuesSummary: {
        partnerEntrySlug,
        rateType: record.rateType,
        value: record.value,
        currency: record.currency,
        effectiveFrom: record.effectiveFrom,
        effectiveUntil: record.effectiveUntil,
      },
      ...(requestId ? { requestId } : {}),
    });

    return { ...record };
  }

  listPlatformPartnerIngressCredentials(entrySlug: string) {
    this.requirePlatformPartnerEntry(entrySlug);
    return this.partnerIngressCredentials
      .filter((credential) => credential.entrySlug === entrySlug)
      .map((credential) => {
        this.reconcileStoredPartnerIngressCredential(credential);
        return credential;
      })
      .sort((left, right) => {
        if (left.revokedAt && !right.revokedAt) {
          return 1;
        }
        if (!left.revokedAt && right.revokedAt) {
          return -1;
        }
        return right.createdAt.localeCompare(left.createdAt);
      })
      .map((credential) => this.toPartnerIngressCredentialResponse(credential));
  }

  async resolvePartnerEligibilityReviewQueue(
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    if (this.tenantPartnerRepository?.isEnabled()) {
      const persistedRecords =
        await this.tenantPartnerRepository.listPartnerEligibilityReviewQueue();
      for (const [id, verification] of this.partnerEligibilityVerifications) {
        if (verification.verificationStatus !== "eligible") {
          this.partnerEligibilityVerifications.delete(id);
        }
      }
      for (const verification of persistedRecords) {
        this.partnerEligibilityVerifications.set(
          verification.eligibilityVerificationId,
          this.clonePartnerEligibilityVerification(verification),
        );
      }
    }
    return this.listPartnerEligibilityReviewQueue(requestId, identity);
  }

  listPartnerEligibilityReviewQueue(
    requestId?: string,
    identity?: IdentityContext | null,
  ): PartnerEligibilityReviewQueueItem[] {
    const records = [...this.partnerEligibilityVerifications.values()]
      .filter((verification) => verification.verificationStatus !== "eligible")
      .sort((left, right) => {
        if (left.verificationStatus !== right.verificationStatus) {
          return left.verificationStatus === "manual_review" ? -1 : 1;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });

    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "ops_user",
        tenantId: null,
        moduleName: "tenant-partner",
        actionName: "list_partner_eligibility_review_queue",
        resourceType: "partner_eligibility",
        resourceId: null,
        newValuesSummary: {
          queueSize: records.length,
          manualReviewCount: records.filter(
            (item) => item.verificationStatus === "manual_review",
          ).length,
          deniedCount: records.filter(
            (item) => item.verificationStatus === "ineligible",
          ).length,
        },
      },
      requestId,
    );

    return records.map((record) => this.toReviewQueueItem(record));
  }

  private toReviewQueueItem(
    record: PartnerEligibilityVerificationRecord,
  ): PartnerEligibilityReviewQueueItem {
    const lastAttempt =
      record.attempts.length > 0
        ? record.attempts[record.attempts.length - 1]
        : null;

    return {
      eligibilityVerificationId: record.eligibilityVerificationId,
      partnerEntrySlug: record.partnerEntrySlug,
      verificationStatus: record.verificationStatus,
      verificationReasonCode: record.verificationReasonCode,
      decisionSource: record.decisionSource,
      attemptCount: record.attempts.length,
      latestAttemptStatus: lastAttempt?.status ?? null,
      latestAttemptReasonCode: lastAttempt?.reasonCode ?? null,
      manualFallback: { ...record.manualFallback },
      requestHints: {
        cardLast4: record.requestMetadata.cardLast4,
        flightNo: record.requestMetadata.flightNo,
      },
      verifiedAt: record.verifiedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  getPartnerEntry(entrySlug: string) {
    return this.clonePartnerEntry(this.requirePublicPartnerEntry(entrySlug));
  }

  async getPartnerReferralDashboard(
    identity: IdentityContext | null,
    billingSettlementService: BillingSettlementService,
    periodMonth?: string,
    requestId?: string,
  ): Promise<PartnerReferralDashboardRecord> {
    const entry = this.requirePartnerReferralPortalEntry(identity, requestId);
    const statements = await billingSettlementService.listReferralStatements(
      entry.entrySlug,
    );
    const period =
      periodMonth?.trim() ||
      statements[0]?.period ||
      new Date().toISOString().slice(0, 7);
    const statement = billingSettlementService.getReferralStatement(
      entry.entrySlug,
      period,
    );

    return {
      partnerEntrySlug: entry.entrySlug,
      period,
      activeUserCount: statement.totals.activeRiderCount,
      tripCount: statement.totals.tripCount,
      gmv: { ...statement.totals.gmv },
      estimatedShareAmount: { ...statement.totals.shareTotal },
      statementId: statement.statementId,
      statementStatus: statement.status,
      latestStatementPeriod: statements[0]?.period ?? null,
      pendingStatementCount: statements.filter(
        (candidate) => candidate.status !== "paid",
      ).length,
    };
  }

  async listPartnerReferralUsage(
    identity: IdentityContext | null,
    billingSettlementService: BillingSettlementService,
    requestId?: string,
  ): Promise<PartnerReferralUsagePeriodRecord[]> {
    const entry = this.requirePartnerReferralPortalEntry(identity, requestId);
    const statements = await billingSettlementService.listReferralStatements(
      entry.entrySlug,
    );
    return statements.map((statement) =>
      this.toPartnerReferralUsage(statement),
    );
  }

  async listPartnerReferralRevenue(
    identity: IdentityContext | null,
    billingSettlementService: BillingSettlementService,
    requestId?: string,
  ): Promise<PartnerReferralRevenuePeriodRecord[]> {
    const entry = this.requirePartnerReferralPortalEntry(identity, requestId);
    const statements = await billingSettlementService.listReferralStatements(
      entry.entrySlug,
    );
    return statements.map((statement) =>
      this.toPartnerReferralRevenue(statement),
    );
  }

  async listPartnerReferralStatements(
    identity: IdentityContext | null,
    billingSettlementService: BillingSettlementService,
    requestId?: string,
  ): Promise<ReferralStatementRecord[]> {
    const entry = this.requirePartnerReferralPortalEntry(identity, requestId);
    return billingSettlementService.listReferralStatements(entry.entrySlug);
  }

  getPartnerReferralStatement(
    identity: IdentityContext | null,
    billingSettlementService: BillingSettlementService,
    periodMonth: string,
    requestId?: string,
  ): ReferralStatementRecord {
    const entry = this.requirePartnerReferralPortalEntry(identity, requestId);
    return billingSettlementService.getReferralStatement(
      entry.entrySlug,
      periodMonth,
    );
  }

  createPlatformPartnerEntry(
    command: CreatePartnerChannelEntryCommand,
    requestId?: string,
  ) {
    const now = new Date().toISOString();
    const tenantId = this.requireNonBlank(command.tenantId, "tenantId");
    const partnerCode = this.normalizePartnerCode(command.partnerCode);
    const programId = this.requireNonBlank(command.programId, "programId");
    const entrySlug = this.normalizeEntrySlug(command.entrySlug);

    if (this.partnerEntries.some((entry) => entry.entrySlug === entrySlug)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_ENTRY_CONFLICT",
        "A partner entry with this slug already exists.",
        {
          entrySlug,
        },
      );
    }

    const record: PartnerChannelEntryRecord = {
      partnerId: `partner_${randomUUID()}`,
      partnerCode,
      partnerType: this.requireNonBlank(command.partnerType, "partnerType"),
      programId,
      programCode: this.normalizeNullableText(command.programCode),
      tenantId,
      bankCode: this.normalizeNullableText(command.bankCode),
      entrySlug,
      displayName: this.requireNonBlank(command.displayName, "displayName"),
      businessDispatchSubtype: command.businessDispatchSubtype,
      authMode: command.authMode,
      eligibilityMode: command.eligibilityMode,
      entryHost: this.normalizeNullableText(command.entryHost),
      entryPath: this.normalizeNullableText(command.entryPath),
      themeAccent: this.normalizeNullableText(command.themeAccent),
      brandingMetadata: this.buildBrandingMetadata(
        command.displayName,
        command.themeAccent,
        command.brandingMetadata ?? null,
      ),
      eligibilityContract: null,
      status: command.status ?? "active",
      activeFlag:
        command.activeFlag ?? (command.status ?? "active") === "active",
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
      auditMetadata: {
        source: "platform_admin_console",
        requestId: this.normalizeNullableText(requestId),
        createdBy: "platform_admin",
        updatedBy: "platform_admin",
      },
    };

    this.partnerEntries = [
      this.clonePartnerEntry(record),
      ...this.partnerEntries.filter((entry) => entry.entrySlug !== entrySlug),
    ];
    this.persistChanges(
      {
        partnerEntries: [this.clonePartnerEntry(record)],
      },
      "create_platform_partner_entry",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "create_partner_entry",
        resourceType: "partner_entry",
        resourceId: record.entrySlug,
        newValuesSummary: this.clonePartnerEntry(record) as unknown as Record<
          string,
          unknown
        >,
      },
      requestId,
    );

    return this.clonePartnerEntry(record);
  }

  updatePlatformPartnerEntry(
    entrySlug: string,
    command: UpdatePartnerChannelEntryCommand,
    requestId?: string,
  ) {
    const entry = this.requirePlatformPartnerEntry(entrySlug);
    const before = this.clonePartnerEntry(entry);
    const lifecycleStatus = this.resolveLifecycleStatus(command.status);
    const lifecycleActiveFlag =
      command.activeFlag !== undefined ? command.activeFlag : undefined;

    if (
      entry.status === "revoked" &&
      ((lifecycleStatus && lifecycleStatus !== "revoked") ||
        lifecycleActiveFlag === true)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_ENTRY_REVOKED",
        "Revoked partner entries cannot be reactivated or re-opened.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }

    if (typeof command.tenantId === "string") {
      entry.tenantId = this.requireNonBlank(command.tenantId, "tenantId");
    }
    if (typeof command.partnerCode === "string") {
      entry.partnerCode = this.normalizePartnerCode(command.partnerCode);
    }
    if (typeof command.partnerType === "string") {
      entry.partnerType = this.requireNonBlank(
        command.partnerType,
        "partnerType",
      );
    }
    if (typeof command.programId === "string") {
      entry.programId = this.requireNonBlank(command.programId, "programId");
    }
    if (command.programCode !== undefined) {
      entry.programCode = this.normalizeNullableText(command.programCode);
    }
    if (command.bankCode !== undefined) {
      entry.bankCode = this.normalizeNullableText(command.bankCode);
    }
    if (typeof command.displayName === "string") {
      entry.displayName = this.requireNonBlank(
        command.displayName,
        "displayName",
      );
    }
    if (command.businessDispatchSubtype) {
      entry.businessDispatchSubtype = command.businessDispatchSubtype;
    }
    if (command.authMode) {
      entry.authMode = command.authMode;
    }
    if (command.eligibilityMode) {
      entry.eligibilityMode = command.eligibilityMode;
    }
    if (command.entryHost !== undefined) {
      entry.entryHost = this.normalizeNullableText(command.entryHost);
    }
    if (command.entryPath !== undefined) {
      entry.entryPath = this.normalizeNullableText(command.entryPath);
    }
    if (command.themeAccent !== undefined) {
      entry.themeAccent = this.normalizeNullableText(command.themeAccent);
    }
    if (lifecycleStatus) {
      entry.status = lifecycleStatus;
      entry.activeFlag = lifecycleStatus === "active";
      if (lifecycleStatus !== "revoked") {
        entry.revokedAt = null;
        entry.revokedBy = null;
        entry.revokeReason = null;
      }
    }
    if (lifecycleActiveFlag !== undefined) {
      entry.activeFlag = lifecycleActiveFlag;
      entry.status = lifecycleActiveFlag ? "active" : "inactive";
      if (lifecycleActiveFlag) {
        entry.revokedAt = null;
        entry.revokedBy = null;
        entry.revokeReason = null;
      }
    }

    entry.brandingMetadata = this.buildBrandingMetadata(
      entry.displayName,
      entry.themeAccent,
      command.brandingMetadata,
      entry.brandingMetadata,
    );
    entry.updatedAt = new Date().toISOString();
    entry.auditMetadata = {
      ...entry.auditMetadata,
      source: "platform_admin_console",
      requestId: this.normalizeNullableText(requestId),
      updatedBy: "platform_admin",
    };

    this.persistChanges(
      {
        partnerEntries: [this.clonePartnerEntry(entry)],
      },
      "update_platform_partner_entry",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: entry.tenantId,
        moduleName: "tenant-partner",
        actionName: "update_partner_entry",
        resourceType: "partner_entry",
        resourceId: entry.entrySlug,
        oldValuesSummary: before as unknown as Record<string, unknown>,
        newValuesSummary: this.clonePartnerEntry(entry) as unknown as Record<
          string,
          unknown
        >,
      },
      requestId,
    );

    return this.clonePartnerEntry(entry);
  }

  setPlatformPartnerEntryStatus(
    entrySlug: string,
    status: "active" | "inactive",
    requestId?: string,
  ) {
    return this.updatePlatformPartnerEntry(
      entrySlug,
      {
        status,
      },
      requestId,
    );
  }

  revokePlatformPartnerEntry(entrySlug: string, requestId?: string) {
    const entry = this.requirePlatformPartnerEntry(entrySlug);
    const before = this.clonePartnerEntry(entry);
    const revokedAt = new Date().toISOString();

    entry.status = "revoked";
    entry.activeFlag = false;
    entry.revokedAt = revokedAt;
    entry.revokedBy = "platform_admin";
    entry.revokeReason = "partner_entry_revoked";
    entry.updatedAt = revokedAt;
    entry.auditMetadata = {
      ...entry.auditMetadata,
      source: "platform_admin_console",
      requestId: this.normalizeNullableText(requestId),
      updatedBy: "platform_admin",
    };

    let revokedCredentialCount = 0;
    this.partnerIngressCredentials = this.partnerIngressCredentials.map(
      (credential) => {
        if (
          credential.entrySlug !== entry.entrySlug ||
          credential.revokedAt !== null
        ) {
          return credential;
        }
        revokedCredentialCount += 1;
        return {
          ...credential,
          revokedAt,
          revokedBy: "platform_admin",
          revokeReason: "partner_entry_revoked",
        };
      },
    );

    this.persistChanges(
      {
        partnerEntries: [this.clonePartnerEntry(entry)],
        partnerIngressCredentials: this.partnerIngressCredentials
          .filter((credential) => credential.entrySlug === entry.entrySlug)
          .map((credential) =>
            this.cloneStoredPartnerIngressCredential(credential),
          ),
      },
      "revoke_platform_partner_entry",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: entry.tenantId,
        moduleName: "tenant-partner",
        actionName: "revoke_partner_entry",
        resourceType: "partner_entry",
        resourceId: entry.entrySlug,
        oldValuesSummary: before as unknown as Record<string, unknown>,
        newValuesSummary: {
          ...(this.clonePartnerEntry(entry) as unknown as Record<
            string,
            unknown
          >),
          revokedCredentialCount,
        },
      },
      requestId,
    );

    return this.clonePartnerEntry(entry);
  }

  issuePlatformPartnerIngressCredential(
    entrySlug: string,
    command: IssuePartnerIngressCredentialCommand,
    requestId?: string,
  ): PartnerIngressCredentialIssued {
    const entry = this.requirePlatformPartnerEntry(entrySlug);
    if (entry.status === "revoked") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_ENTRY_REVOKED",
        "Revoked partner entries cannot receive new credentials.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }

    const issued = this.buildIssuedPartnerIngressCredential(
      entry.entrySlug,
      command.rotationReason ?? null,
      {
        ownerRef: command.ownerRef ?? null,
        ownerName: command.ownerName ?? null,
        ownerType: command.ownerType ?? null,
        purpose: command.purpose ?? null,
        scopes: command.scopes ?? undefined,
        expiresAt: command.expiresAt ?? null,
      },
    );
    const rotatedAt = issued.credential.createdAt;
    const overlapEndsAt = this.resolveCredentialOverlapEndsAt(
      rotatedAt,
      command.overlapDays,
    );
    let revokedCredentialId: string | null = null;
    let preservedOverlap = false;
    // A rotation pass touches every live credential on the entry, not only the
    // new key and the one held open for overlap. On a second rotation the
    // remaining historical credentials are retired here too, so they all have
    // to reach the snapshot or they come back live on the next reload.
    const mutatedCredentialIds = new Set<string>([
      issued.storedCredential.keyId,
    ]);
    this.partnerIngressCredentials = this.partnerIngressCredentials.map(
      (credential) => {
        if (credential.entrySlug !== entry.entrySlug || credential.revokedAt) {
          return credential;
        }

        mutatedCredentialIds.add(credential.keyId);
        this.reconcileStoredPartnerIngressCredential(credential, rotatedAt);
        if (
          !preservedOverlap &&
          (credential.status === "active" ||
            credential.status === "overlap_active")
        ) {
          preservedOverlap = true;
          revokedCredentialId = credential.keyId;
          credential.overlapEndsAt = overlapEndsAt;
          credential.supersededByKeyId = issued.storedCredential.keyId;
          credential.autoRevokedAt = null;
          credential.status = "overlap_active";
          credential.revokedAt = null;
          credential.revokeReason = null;
          credential.signals = this.buildCredentialSignals(
            credential.lastUsedAt,
            credential.expiresAt ?? null,
            null,
            rotatedAt,
          );
          return this.cloneStoredPartnerIngressCredential(credential);
        }

        credential.revokedAt = rotatedAt;
        credential.revokedBy = "platform_admin";
        credential.revokeReason =
          command.rotationReason ?? "credential_rotated";
        credential.status = "revoked";
        credential.overlapEndsAt = null;
        return this.cloneStoredPartnerIngressCredential(credential);
      },
    );
    this.partnerIngressCredentials = [
      issued.storedCredential,
      ...this.partnerIngressCredentials,
    ];
    const persistedCredentials = this.partnerIngressCredentials.filter(
      (credential) => mutatedCredentialIds.has(credential.keyId),
    );

    this.persistChanges(
      {
        partnerIngressCredentials: persistedCredentials.map((credential) =>
          this.cloneStoredPartnerIngressCredential(credential),
        ),
      },
      "issue_platform_partner_ingress_credential",
    );

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: entry.tenantId,
        moduleName: "tenant-partner",
        actionName: revokedCredentialId
          ? "rotate_partner_ingress_credential"
          : "issue_partner_ingress_credential",
        resourceType: "partner_ingress_credential",
        resourceId: issued.credential.keyId,
        newValuesSummary: {
          ...issued.credential,
          revokedCredentialId,
        },
      },
      requestId,
    );

    return {
      credential: issued.credential,
      plaintextKey: issued.plaintextKey,
      revokedCredentialId,
      overlapEndsAt: revokedCredentialId ? overlapEndsAt : null,
    };
  }

  revokePlatformPartnerIngressCredential(
    entrySlug: string,
    keyId: string,
    command: RevokePartnerIngressCredentialCommand,
    requestId?: string,
  ) {
    const entry = this.requirePlatformPartnerEntry(entrySlug);
    const credential = this.requirePartnerIngressCredential(
      entry.entrySlug,
      keyId,
    );
    this.reconcileStoredPartnerIngressCredential(credential);
    if (credential.revokedAt) {
      return this.toPartnerIngressCredentialResponse(credential);
    }

    const revokedAt = new Date().toISOString();
    credential.revokedAt = revokedAt;
    credential.revokedBy = "platform_admin";
    credential.revokeReason =
      this.normalizeNullableText(command.revokeReason) ?? "manual_revoke";
    credential.status = "revoked";
    credential.overlapEndsAt = null;

    this.persistChanges(
      {
        partnerIngressCredentials: [
          this.cloneStoredPartnerIngressCredential(credential),
        ],
      },
      "revoke_platform_partner_ingress_credential",
    );

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: entry.tenantId,
        moduleName: "tenant-partner",
        actionName: "revoke_partner_ingress_credential",
        resourceType: "partner_ingress_credential",
        resourceId: credential.keyId,
        newValuesSummary: this.toPartnerIngressCredentialResponse(
          credential,
        ) as unknown as Record<string, unknown>,
      },
      requestId,
    );

    return this.toPartnerIngressCredentialResponse(credential);
  }

  authenticatePartnerBootstrap(
    command: CreatePartnerBootstrapSessionCommand,
    requestId?: string,
  ): PartnerIngressResolution {
    const normalizedEntrySlug = command.entrySlug?.trim();
    if (!normalizedEntrySlug) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_ENTRY_REQUIRED",
        "entrySlug is required.",
        {},
      );
    }

    const entry = this.requireAccessiblePartnerEntry(
      normalizedEntrySlug,
      requestId,
      "authenticate",
    );

    const apiKey = command.apiKey?.trim();
    if (!apiKey) {
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "api_key_missing",
      });
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "PARTNER_API_KEY_REQUIRED",
        "apiKey is required for partner bootstrap authentication.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }

    const matchingCredential = this.findPartnerIngressCredentialByApiKey(
      entry.entrySlug,
      apiKey,
    );
    if (!matchingCredential) {
      const activeCredential = this.resolvePartnerIngressCredential(
        entry.entrySlug,
      );
      if (!activeCredential) {
        this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
          reason: "credential_not_configured",
        });
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "PARTNER_AUTH_NOT_CONFIGURED",
          "Partner ingress authentication is not configured for this entry.",
          {
            entrySlug: entry.entrySlug,
          },
        );
      }
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "api_key_invalid",
        keyId: activeCredential.keyId,
      });
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "PARTNER_API_KEY_INVALID",
        "Partner API key is invalid for this entry.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }

    if (matchingCredential.status === "expired") {
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "api_key_expired",
        keyId: matchingCredential.keyId,
      });
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "PARTNER_API_KEY_EXPIRED",
        "Partner API key expired for this entry.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }
    if (matchingCredential.revokedAt) {
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "api_key_revoked",
        keyId: matchingCredential.keyId,
      });
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "PARTNER_API_KEY_REVOKED",
        "Partner API key is revoked for this entry.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }

    const identity: IdentityContext = {
      actorType: "partner_api_key",
      actorId: matchingCredential.keyId,
      realm: "partner",
      authMode: "bootstrap_headers",
      roleFamilies: ["partner"],
      roles: ["partner_ingress"],
      scopes: [...(matchingCredential.scopes ?? [])],
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerEntrySlug: entry.entrySlug,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    this.recordPartnerIngressAttempt(entry, requestId, "accepted", {
      keyId: matchingCredential.keyId,
    });
    const previousLastUsedAt = matchingCredential.lastUsedAt;
    matchingCredential.lastUsedAt = new Date().toISOString();
    matchingCredential.lastUsedWorkload = "partner_bootstrap";
    matchingCredential.signals = this.buildCredentialSignals(
      matchingCredential.lastUsedAt,
      matchingCredential.expiresAt ?? null,
      matchingCredential.autoRevokedAt ?? null,
      matchingCredential.lastUsedAt,
    );
    this.maybeRecordDormantCredentialUse({
      tenantId: entry.tenantId,
      channel: "ops_notice",
      title: "Dormant partner credential used",
      message: `Partner credential ${matchingCredential.keyId} for ${entry.entrySlug} was used after dormancy.`,
      previousLastUsedAt,
      createdAt: matchingCredential.createdAt,
    });
    this.persistChanges(
      {
        partnerIngressCredentials: [
          this.cloneStoredPartnerIngressCredential(matchingCredential),
        ],
      },
      "authenticate_partner_bootstrap",
    );

    return {
      partnerEntry: this.clonePartnerEntry(entry),
      identity,
    };
  }

  private authenticatePartnerBootstrapWithResolvedCredential(
    entrySlug: string,
    requestId?: string,
  ): PartnerIngressResolution {
    const entry = this.requireAccessiblePartnerEntry(
      entrySlug,
      requestId,
      "authenticate",
    );
    const credential = this.resolvePartnerIngressCredential(entry.entrySlug);
    if (!credential) {
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "credential_not_configured",
      });
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_AUTH_NOT_CONFIGURED",
        "Partner ingress authentication is not configured for this entry.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }

    const identity: IdentityContext = {
      actorType: "partner_api_key",
      actorId: credential.keyId,
      realm: "partner",
      authMode: "bootstrap_headers",
      roleFamilies: ["partner"],
      roles: ["partner_ingress"],
      scopes: [...(credential.scopes ?? [])],
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerEntrySlug: entry.entrySlug,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    this.recordPartnerIngressAttempt(entry, requestId, "accepted", {
      keyId: credential.keyId,
      authSource: "internal_resolved_credential",
    });
    const previousLastUsedAt = credential.lastUsedAt;
    credential.lastUsedAt = new Date().toISOString();
    credential.lastUsedWorkload = "internal_resolved_credential";
    credential.signals = this.buildCredentialSignals(
      credential.lastUsedAt,
      credential.expiresAt ?? null,
      credential.autoRevokedAt ?? null,
      credential.lastUsedAt,
    );
    this.maybeRecordDormantCredentialUse({
      tenantId: entry.tenantId,
      channel: "ops_notice",
      title: "Dormant partner credential used",
      message: `Partner credential ${credential.keyId} for ${entry.entrySlug} was used after dormancy.`,
      previousLastUsedAt,
      createdAt: credential.createdAt,
    });
    this.persistChanges(
      {
        partnerIngressCredentials: [
          this.cloneStoredPartnerIngressCredential(credential),
        ],
      },
      "authenticate_partner_bootstrap_internal",
    );

    return {
      partnerEntry: this.clonePartnerEntry(entry),
      identity,
    };
  }

  async issuePartnerIngressHandoff(
    command: CreatePartnerIngressHandoffCommand,
    requestId?: string,
    options?: {
      allowInternalBootstrap?: boolean;
    },
  ): Promise<PartnerIngressHandoffResolution> {
    const bootstrap = command.apiKey?.trim()
      ? this.authenticatePartnerBootstrap(
          {
            entrySlug: command.entrySlug,
            apiKey: command.apiKey,
          },
          requestId,
        )
      : options?.allowInternalBootstrap
        ? this.authenticatePartnerBootstrapWithResolvedCredential(
            command.entrySlug,
            requestId,
          )
        : this.authenticatePartnerBootstrap(
            {
              entrySlug: command.entrySlug,
              apiKey: command.apiKey ?? "",
            },
            requestId,
          );
    const partnerUserRef = command.partnerUserRef?.trim();
    if (!partnerUserRef) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_USER_REF_REQUIRED",
        "partnerUserRef is required for partner ingress handoff.",
        {},
      );
    }

    const now = new Date().toISOString();
    const link = await this.partnerUserIdentityLinkRepository.resolveOrCreate({
      entrySlug: bootstrap.partnerEntry.entrySlug,
      partnerUserRef,
      consentScope: command.consentScope ?? "passenger_identity_link",
      now,
    });
    const observed =
      (await this.partnerUserIdentityLinkRepository.touchLastSeen(
        bootstrap.partnerEntry.entrySlug,
        partnerUserRef,
        now,
      )) ?? link;

    if (observed.status !== "active") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_USER_IDENTITY_REVOKED",
        "The partner user identity link is no longer active.",
        {
          entrySlug: bootstrap.partnerEntry.entrySlug,
          partnerUserRef,
        },
      );
    }

    return {
      partnerEntry: bootstrap.partnerEntry,
      drtsPassengerId: observed.drtsPassengerId,
      identity: {
        actorType: "referral_passenger",
        actorId: observed.drtsPassengerId,
        realm: "partner",
        authMode: "bootstrap_headers",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [
          "partner:handoff",
          "partner:eligibility:read",
          "partner:eligibility:write",
          "partner:book",
        ],
        tenantId: bootstrap.identity.tenantId,
        partnerId: bootstrap.identity.partnerId ?? null,
        partnerProgramId: bootstrap.identity.partnerProgramId ?? null,
        partnerEntrySlug: bootstrap.partnerEntry.entrySlug,
        supportedExecutionModes: [
          "discussion_planning",
          "supervisor_managed_execution",
        ],
      },
    };
  }

  async issueReferralEmbedHandoffArtifact(
    command: CreateReferralEmbedHandoffArtifactCommand,
    requestId?: string,
    options?: {
      allowInternalBootstrap?: boolean;
    },
  ): Promise<ReferralEmbedHandoffArtifact> {
    const resolved = await this.resolveReferralEmbedHandoff(
      command,
      requestId,
      options,
    );
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + REFERRAL_EMBED_HANDOFF_EXPIRES_IN_SECONDS * 1000,
    );
    const artifact = randomBytes(24).toString("base64url");
    const persistence: PersistReferralEmbedHandoffCommand = {
      artifact,
      entrySlug: resolved.partnerEntry.entrySlug,
      entryHost: resolved.entryHost,
      partnerUserRef: command.partnerUserRef.trim(),
      drtsPassengerId: resolved.drtsPassengerId,
      tenantId: resolved.identity.tenantId,
      partnerId: resolved.identity.partnerId ?? null,
      partnerProgramId: resolved.identity.partnerProgramId ?? null,
      consentRequired: resolved.consentRequired,
      consentBundleVersion: resolved.consentBundleVersion,
      consentGrantedAt: resolved.consentGrantedAt,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const record = await this.referralEmbedHandoffRepository.issue(persistence);
    return {
      handoffId: record.handoffId,
      artifact,
      tokenType: "SingleUse",
      expiresIn: "120s",
      expiresAt: record.expiresAt,
      partnerEntrySlug: record.entrySlug,
      entryHost: record.entryHost,
      drtsPassengerId: record.drtsPassengerId,
      consentRequired: record.consentRequired,
      consentBundleVersion: record.consentBundleVersion,
    };
  }

  async consumeReferralEmbedHandoffArtifact(command: {
    artifact: string;
    entrySlug: string;
    entryHost: string;
  }): Promise<ReferralEmbedSession> {
    const result = await this.referralEmbedHandoffRepository.consume(command);
    if (result.outcome === "consumed") {
      return result.session;
    }
    if (result.outcome === "replayed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_HANDOFF_REPLAYED",
        "The referral handoff artifact has already been consumed.",
      );
    }
    if (result.outcome === "expired") {
      throw new ApiRequestError(
        HttpStatus.GONE,
        "REFERRAL_HANDOFF_EXPIRED",
        "The referral handoff artifact has expired.",
      );
    }
    if (result.outcome === "wrong_host") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_HANDOFF_HOST_MISMATCH",
        "The referral handoff artifact is not valid for this entry host.",
      );
    }
    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "REFERRAL_HANDOFF_NOT_FOUND",
      "The referral handoff artifact is invalid.",
    );
  }

  async recordReferralEmbedConsent(
    command: RecordReferralEmbedConsentCommand,
  ): Promise<ReferralEmbedSession> {
    this.assertExactReferralEmbedConsentBundle(command.consentBundle);
    const result =
      await this.referralEmbedHandoffRepository.recordConsent(command);
    if (result.outcome === "recorded" || result.outcome === "replayed") {
      return result.session;
    }
    if (result.outcome === "wrong_host") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_HANDOFF_HOST_MISMATCH",
        "The referral embed consent can only be recorded for the original entry host.",
      );
    }
    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "REFERRAL_HANDOFF_NOT_FOUND",
      "The referral embed handoff no longer exists.",
    );
  }

  private async resolveReferralEmbedHandoff(
    command: CreateReferralEmbedHandoffArtifactCommand,
    requestId?: string,
    options?: {
      allowInternalBootstrap?: boolean;
    },
  ): Promise<ReferralEmbedHandoffResolution> {
    const handoff = await this.issuePartnerIngressHandoff(
      Object.assign(
        {
          entrySlug: command.entrySlug,
          partnerUserRef: command.partnerUserRef,
          consentScope: "passenger_identity_link" as const,
        },
        command.apiKey?.trim() ? { apiKey: command.apiKey } : null,
      ),
      requestId,
      options,
    );
    const entryHost = command.entryHost?.trim().toLowerCase();
    if (!entryHost) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ENTRY_HOST_REQUIRED",
        "entryHost is required for referral embed handoff issuance.",
      );
    }
    if (handoff.partnerEntry.entryHost?.trim().toLowerCase() !== entryHost) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "ENTRY_HOST_MISMATCH",
        "entryHost must match the configured partner entry host exactly.",
        {
          entrySlug: handoff.partnerEntry.entrySlug,
          expectedEntryHost: handoff.partnerEntry.entryHost,
          receivedEntryHost: entryHost,
        },
      );
    }

    const consentBundle = command.consentBundle ?? null;
    if (consentBundle) {
      this.assertExactReferralEmbedConsentBundle(consentBundle);
    }

    return {
      ...handoff,
      entryHost,
      consentRequired: !consentBundle,
      consentBundleVersion: consentBundle?.bundleVersion ?? null,
      consentGrantedAt: consentBundle?.grantedAt ?? null,
    };
  }

  private assertExactReferralEmbedConsentBundle(
    consentBundle: ReferralEmbedConsentBundle,
  ) {
    const grantedScopes = [...consentBundle.grantedScopes].sort();
    const requiredScopes = [...REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES].sort();
    if (JSON.stringify(grantedScopes) !== JSON.stringify(requiredScopes)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REFERRAL_CONSENT_SCOPE_MISMATCH",
        "The referral embed consent bundle must include the exact required scopes.",
        {
          requiredScopes,
          grantedScopes,
        },
      );
    }
    if (!consentBundle.bundleVersion?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REFERRAL_CONSENT_VERSION_REQUIRED",
        "The referral embed consent bundle version is required.",
      );
    }
  }

  async verifyPartnerEligibility(
    command: VerifyPartnerEligibilityCommand,
    requestId?: string,
    identity?: PartnerEligibilityIdentity | null,
  ) {
    const entry = this.requireAccessiblePartnerEntry(
      command.entrySlug,
      requestId,
      "eligibility",
    );
    this.assertPartnerEligibilityIdentity(identity, entry, requestId);
    const verifiedAt = new Date().toISOString();
    const normalizedBenefitReference = this.normalizeNullableText(
      command.benefitReference,
    );
    const referenceToken = this.normalizeNullableText(command.referenceToken);
    const referenceTokenHash = referenceToken
      ? this.hashReferenceToken(referenceToken)
      : null;
    const contract = this.buildPartnerEligibilityContract(entry);

    this.assertPartnerEligibilityCommand(entry, command);

    let verificationStatus: PartnerEligibilityVerificationRecord["verificationStatus"] =
      "eligible";
    let verificationReasonCode = "ELIGIBILITY_NOT_REQUIRED";
    let decisionSource: PartnerEligibilityDecisionSource = "not_required";
    let cardProgramCode = entry.programCode ?? entry.bankCode ?? null;
    let benefitReference = normalizedBenefitReference;
    let issuerAuthorizationRef: string | null = null;
    let adapterCode: string | null = contract?.adapterCode ?? null;
    let adapterVersion: string | null = contract?.adapterVersion ?? null;
    let attempts: PartnerEligibilityAdapterAttemptRecord[] = [];
    let manualFallback: PartnerEligibilityManualFallbackRecord = {
      required: false,
      reasonCode: null,
      requestedAt: null,
      requestedBy: null,
      notes: null,
    };
    let expiresAt: string | null = null;

    if (entry.eligibilityMode !== "none" && contract) {
      const execution = await this.executePartnerEligibilityContract(
        entry,
        contract,
        command,
        requestId,
      );
      attempts = execution.attempts;
      adapterCode = execution.adapterCode;
      adapterVersion = execution.adapterVersion;

      if (execution.result) {
        verificationStatus = execution.result.verificationStatus;
        verificationReasonCode = execution.result.verificationReasonCode;
        decisionSource = execution.result.decisionSource;
        cardProgramCode = execution.result.cardProgramCode;
        benefitReference =
          execution.result.benefitReference ?? normalizedBenefitReference;
        issuerAuthorizationRef = execution.result.issuerAuthorizationRef;
        expiresAt = this.resolveEligibilityExpiry(
          verifiedAt,
          execution.result.expiresInSeconds,
          verificationStatus,
        );
        if (verificationStatus === "manual_review") {
          manualFallback = this.createPartnerEligibilityManualFallback(
            execution.result.verificationReasonCode,
            verifiedAt,
          );
        }
      } else {
        verificationStatus = "manual_review";
        verificationReasonCode = execution.fallbackReasonCode;
        decisionSource = "manual_fallback";
        benefitReference = normalizedBenefitReference;
        issuerAuthorizationRef = null;
        expiresAt = null;
        manualFallback = this.createPartnerEligibilityManualFallback(
          execution.fallbackReasonCode,
          verifiedAt,
        );
      }
    }

    const verification: PartnerEligibilityVerificationRecord = {
      eligibilityVerificationId: `elig_${randomUUID()}`,
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerProgramCode: entry.programCode,
      partnerEntrySlug: entry.entrySlug,
      bankCode: entry.bankCode,
      cardProgramCode,
      businessDispatchSubtype: entry.businessDispatchSubtype,
      verificationStatus,
      decisionSource,
      verificationReasonCode,
      adapterCode,
      adapterVersion,
      contractSnapshot: contract
        ? this.clonePartnerEligibilityContract(contract)
        : null,
      attempts: attempts.map((attempt) => ({ ...attempt })),
      manualFallback: { ...manualFallback },
      referenceTokenHash,
      benefitReference,
      issuerAuthorizationRef,
      requestMetadata: {
        cardLast4: this.normalizeNullableText(command.cardLast4),
        cardholderName: this.normalizeNullableText(command.cardholderName),
        flightNo: this.normalizeNullableText(command.flightNo),
        requestId: this.normalizeNullableText(requestId),
      },
      verifiedAt,
      expiresAt,
      createdAt: verifiedAt,
      updatedAt: verifiedAt,
      auditMetadata: {
        source: "partner_eligibility_verification",
        requestId: this.normalizeNullableText(requestId),
        createdBy: `partner:${entry.partnerId}`,
        updatedBy: `partner:${entry.partnerId}`,
      },
    };

    this.partnerEligibilityVerifications.set(
      verification.eligibilityVerificationId,
      this.clonePartnerEligibilityVerification(verification),
    );
    await this.persistChangesRequired(
      {
        partnerEligibilityVerifications: [
          this.clonePartnerEligibilityVerification(verification),
        ],
      },
      "verify_partner_eligibility",
    );

    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          identity?.actorType === "partner_api_key" ||
          identity?.actorType === "partner_user" ||
          identity?.actorType === "referral_passenger"
            ? identity.actorType
            : "system",
        tenantId: entry.tenantId,
        moduleName: "tenant-partner",
        actionName: "verify_partner_eligibility",
        resourceType: "partner_eligibility",
        resourceId: verification.eligibilityVerificationId,
        newValuesSummary: {
          partnerId: verification.partnerId,
          partnerProgramId: verification.partnerProgramId,
          partnerEntrySlug: verification.partnerEntrySlug,
          verificationStatus: verification.verificationStatus,
          verificationReasonCode: verification.verificationReasonCode,
        },
      },
      requestId,
    );

    return this.clonePartnerEligibilityVerification(verification);
  }

  async resolvePartnerEligibilityVerification(
    eligibilityVerificationId: string,
    requestId?: string,
    identity?: PartnerEligibilityIdentity | null,
  ) {
    const verification = await this.loadPartnerEligibilityVerification(
      eligibilityVerificationId,
    );
    return this.readPartnerEligibilityVerification(
      verification,
      eligibilityVerificationId,
      requestId,
      identity,
    );
  }

  async hydratePartnerEligibilityVerification(
    eligibilityVerificationId: string,
    identity?: PartnerEligibilityIdentity | null,
  ) {
    const verification = await this.loadPartnerEligibilityVerification(
      eligibilityVerificationId,
    );
    if (!verification) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_ELIGIBILITY_NOT_FOUND",
        "The partner eligibility verification record could not be found.",
        {
          eligibilityVerificationId,
        },
      );
    }
    this.assertPartnerEligibilityVerificationIdentity(
      identity,
      verification,
      eligibilityVerificationId,
    );
  }

  private async loadPartnerEligibilityVerification(
    eligibilityVerificationId: string,
  ) {
    let verification = this.partnerEligibilityVerifications.get(
      eligibilityVerificationId,
    );
    if (this.tenantPartnerRepository?.isEnabled()) {
      const persistedVerification =
        (await this.tenantPartnerRepository.findPartnerEligibilityVerification(
          eligibilityVerificationId,
        )) ?? undefined;
      if (
        persistedVerification &&
        (!verification ||
          Date.parse(persistedVerification.updatedAt) >=
            Date.parse(verification.updatedAt))
      ) {
        verification = persistedVerification;
        this.partnerEligibilityVerifications.set(
          eligibilityVerificationId,
          this.clonePartnerEligibilityVerification(verification),
        );
      }
    }
    return verification;
  }

  getPartnerEligibilityVerification(
    eligibilityVerificationId: string,
    requestId?: string,
    identity?: PartnerEligibilityIdentity | null,
  ) {
    const verification = this.partnerEligibilityVerifications.get(
      eligibilityVerificationId,
    );
    return this.readPartnerEligibilityVerification(
      verification,
      eligibilityVerificationId,
      requestId,
      identity,
    );
  }

  private readPartnerEligibilityVerification(
    verification: PartnerEligibilityVerificationRecord | undefined,
    eligibilityVerificationId: string,
    requestId?: string,
    identity?: PartnerEligibilityIdentity | null,
  ) {
    if (!verification) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_ELIGIBILITY_NOT_FOUND",
        "The partner eligibility verification record could not be found.",
        {
          eligibilityVerificationId,
        },
      );
    }

    this.assertPartnerEligibilityVerificationIdentity(
      identity,
      verification,
      eligibilityVerificationId,
    );

    const policy = assertEvidenceAccess({
      family: "eligibility_verification",
      identity: identity as IdentityContext | null | undefined,
      tenantId: verification.tenantId,
    });
    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: verification.tenantId,
        moduleName: "tenant-partner",
        actionName: policy.auditAction,
        resourceType: "partner_eligibility",
        resourceId: eligibilityVerificationId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "read", {
          partnerEntrySlug: verification.partnerEntrySlug,
          verificationStatus: verification.verificationStatus,
        }),
      },
      requestId,
    );

    return this.clonePartnerEligibilityVerification(verification);
  }

  async resolvePartnerEligibilityReview(
    command: ResolvePartnerEligibilityReviewCommand,
    requestId?: string,
    identity?: IdentityContext | null,
  ): Promise<PartnerEligibilityReviewResolution> {
    const verification = await this.loadPartnerEligibilityVerification(
      command.eligibilityVerificationId,
    );
    if (!verification) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_ELIGIBILITY_NOT_FOUND",
        "The partner eligibility verification record could not be found.",
        {
          eligibilityVerificationId: command.eligibilityVerificationId,
        },
      );
    }

    if (
      verification.verificationStatus !== "manual_review" &&
      verification.verificationStatus !== "ineligible"
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ELIGIBILITY_ALREADY_RESOLVED",
        "This eligibility verification has already been resolved.",
        {
          eligibilityVerificationId: command.eligibilityVerificationId,
          currentStatus: verification.verificationStatus,
        },
      );
    }

    const now = new Date().toISOString();
    const previousStatus = verification.verificationStatus;
    if (previousStatus === "ineligible" && command.decision === "approve") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ELIGIBILITY_OVERRIDE_REQUIRED",
        "Ineligible verifications require a separate approved override workflow.",
        {
          eligibilityVerificationId: command.eligibilityVerificationId,
          currentStatus: previousStatus,
        },
      );
    }
    const resolvedStatus: PartnerEligibilityVerificationRecord["verificationStatus"] =
      command.decision === "approve" ? "eligible" : "ineligible";
    const resolvedBy = identity?.actorId ?? "ops_reviewer";

    const resolvedVerification: PartnerEligibilityVerificationRecord = {
      ...verification,
      verificationStatus: resolvedStatus,
      verificationReasonCode: command.reasonCode,
      decisionSource: "ops_manual_review",
      updatedAt: now,
      manualFallback: {
        ...verification.manualFallback,
        notes: command.notes,
      },
      auditMetadata: {
        ...verification.auditMetadata,
        updatedBy: resolvedBy,
      },
    };

    if (this.tenantPartnerRepository?.isEnabled()) {
      const updated =
        await this.tenantPartnerRepository.compareAndSetPartnerEligibilityVerification(
          resolvedVerification,
          verification.updatedAt,
        );
      if (!updated) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "ELIGIBILITY_REVIEW_CONFLICT",
          "Eligibility verification changed while the review was being resolved.",
          {
            eligibilityVerificationId: command.eligibilityVerificationId,
          },
        );
      }
    } else {
      await this.persistChangesRequired(
        {
          partnerEligibilityVerifications: [
            this.clonePartnerEligibilityVerification(resolvedVerification),
          ],
        },
        "resolve_partner_eligibility_review",
      );
    }
    this.partnerEligibilityVerifications.set(
      command.eligibilityVerificationId,
      this.clonePartnerEligibilityVerification(resolvedVerification),
    );

    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "ops_user",
        tenantId: verification.tenantId,
        moduleName: "tenant-partner",
        actionName: "resolve_partner_eligibility_review",
        resourceType: "partner_eligibility",
        resourceId: command.eligibilityVerificationId,
        newValuesSummary: {
          previousStatus,
          resolvedStatus,
          decision: command.decision,
          reasonCode: command.reasonCode,
          partnerEntrySlug: verification.partnerEntrySlug,
        },
      },
      requestId,
    );

    return {
      eligibilityVerificationId: command.eligibilityVerificationId,
      previousStatus,
      resolvedStatus,
      decision: command.decision,
      reasonCode: command.reasonCode,
      notes: command.notes,
      resolvedAt: now,
      resolvedBy,
    };
  }

  private assertPartnerEligibilityCommand(
    entry: PartnerChannelEntryRecord,
    command: VerifyPartnerEligibilityCommand,
  ) {
    if (entry.eligibilityMode === "reference_required") {
      const referenceToken = this.normalizeNullableText(command.referenceToken);
      if (!referenceToken) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "REFERENCE_TOKEN_REQUIRED",
          "referenceToken is required for this partner entry.",
          {
            entrySlug: entry.entrySlug,
          },
        );
      }
      return;
    }

    if (entry.eligibilityMode !== "bank_card_inline") {
      return;
    }

    const cardLast4 = command.cardLast4?.trim();
    if (!cardLast4 || !/^[0-9]{4}$/.test(cardLast4)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CARD_LAST4_REQUIRED",
        "cardLast4 must be a four-digit string for inline card eligibility verification.",
        {
          entrySlug: entry.entrySlug,
        },
      );
    }
  }

  private async executePartnerEligibilityContract(
    entry: PartnerChannelEntryRecord,
    contract: PartnerEligibilityIntegrationContractRecord,
    command: VerifyPartnerEligibilityCommand,
    requestId?: string,
  ): Promise<PartnerEligibilityExecutionResult> {
    const adapter = this.requirePartnerEligibilityAdapter(contract, entry);
    const attempts: PartnerEligibilityAdapterAttemptRecord[] = [];
    const retryPolicy = contract.retryPolicy;

    for (
      let attempt = 1;
      attempt <= (retryPolicy?.maxAttempts ?? 1);
      attempt += 1
    ) {
      const startedAt = new Date().toISOString();
      const startedAtMs = Date.now();
      try {
        const result = await this.invokePartnerEligibilityAdapterWithTimeout(
          adapter,
          {
            entry,
            contract,
            command,
            ...(requestId ? { requestId } : {}),
          },
          retryPolicy?.timeoutMs ?? 0,
        );
        attempts.push({
          attempt,
          adapterCode: adapter.adapterCode,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          status: result.verificationStatus,
          reasonCode: result.verificationReasonCode,
          retryable: false,
          timeoutTriggered: false,
          upstreamHttpStatus: result.upstreamHttpStatus,
        });
        return {
          result,
          fallbackReasonCode: result.verificationReasonCode,
          attempts,
          adapterCode: adapter.adapterCode,
          adapterVersion: adapter.adapterVersion,
        };
      } catch (error) {
        const adapterError =
          this.normalizePartnerEligibilityAdapterError(error);
        attempts.push({
          attempt,
          adapterCode: adapter.adapterCode,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          status: "error",
          reasonCode: adapterError.code,
          retryable: adapterError.retryable,
          timeoutTriggered: adapterError.timedOut,
          upstreamHttpStatus: adapterError.upstreamHttpStatus,
        });
        if (
          !adapterError.retryable ||
          attempt >= (retryPolicy?.maxAttempts ?? 1)
        ) {
          return {
            result: null,
            fallbackReasonCode:
              adapterError.manualFallbackReasonCode ??
              (adapterError.timedOut
                ? "ISSUER_TIMEOUT_REVIEW_REQUIRED"
                : "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED"),
            attempts,
            adapterCode: adapter.adapterCode,
            adapterVersion: adapter.adapterVersion,
          };
        }
        if (retryPolicy) {
          await this.sleep(
            this.computePartnerEligibilityRetryDelayMs(retryPolicy, attempt),
          );
        }
      }
    }

    return {
      result: null,
      fallbackReasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
      attempts,
      adapterCode: adapter.adapterCode,
      adapterVersion: adapter.adapterVersion,
    };
  }

  private requirePartnerEligibilityAdapter(
    contract: PartnerEligibilityIntegrationContractRecord,
    entry: PartnerChannelEntryRecord,
  ) {
    const adapter = this.eligibilityAdapters.find((candidate) =>
      candidate.supports(contract, entry),
    );
    if (adapter) {
      return adapter;
    }

    throw new ApiRequestError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "PARTNER_ELIGIBILITY_ADAPTER_UNAVAILABLE",
      "The configured partner eligibility adapter is unavailable.",
      {
        entrySlug: entry.entrySlug,
        adapterCode: contract.adapterCode,
      },
    );
  }

  private async invokePartnerEligibilityAdapterWithTimeout(
    adapter: PartnerEligibilityAdapterInterface,
    input: PartnerEligibilityAdapterInput,
    timeoutMs: number,
  ) {
    if (timeoutMs <= 0) {
      return adapter.verify(input);
    }

    return await new Promise<PartnerEligibilityAdapterResult>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new PartnerEligibilityAdapterError(
              "ISSUER_TIMEOUT",
              "Issuer eligibility adapter timed out before producing a result.",
              {
                retryable: true,
                timedOut: true,
                upstreamHttpStatus: 504,
                manualFallbackReasonCode: "ISSUER_TIMEOUT_REVIEW_REQUIRED",
              },
            ),
          );
        }, timeoutMs);

        void adapter
          .verify(input)
          .then((result) => {
            clearTimeout(timer);
            resolve(result);
          })
          .catch((error: unknown) => {
            clearTimeout(timer);
            reject(error);
          });
      },
    );
  }

  private normalizePartnerEligibilityAdapterError(error: unknown) {
    if (error instanceof PartnerEligibilityAdapterError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new PartnerEligibilityAdapterError("ISSUER_UNAVAILABLE", message, {
      retryable: true,
      upstreamHttpStatus: 503,
      manualFallbackReasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
    });
  }

  private computePartnerEligibilityRetryDelayMs(
    retryPolicy: PartnerEligibilityRetryPolicyRecord,
    attempt: number,
  ) {
    const calculatedDelay =
      retryPolicy.initialBackoffMs *
      retryPolicy.backoffMultiplier ** Math.max(0, attempt - 1);
    return Math.min(retryPolicy.maxBackoffMs, Math.round(calculatedDelay));
  }

  private async sleep(delayMs: number) {
    if (delayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private createPartnerEligibilityManualFallback(
    reasonCode: string,
    requestedAt: string,
  ): PartnerEligibilityManualFallbackRecord {
    return {
      required: true,
      reasonCode,
      requestedAt,
      requestedBy: "system:auto_fallback",
      notes: null,
    };
  }

  private resolveEligibilityExpiry(
    verifiedAt: string,
    expiresInSeconds: number | null,
    status: PartnerEligibilityVerificationRecord["verificationStatus"],
  ) {
    if (status !== "eligible" || !expiresInSeconds || expiresInSeconds <= 0) {
      return null;
    }

    return new Date(
      Date.parse(verifiedAt) + expiresInSeconds * 1_000,
    ).toISOString();
  }

  private inferPartnerEligibilityDecisionSource(
    status: PartnerEligibilityVerificationRecord["verificationStatus"],
    eligibilityMode: PartnerChannelEntryRecord["eligibilityMode"],
  ): PartnerEligibilityDecisionSource {
    if (status === "manual_review") {
      return "manual_fallback";
    }
    if (eligibilityMode === "reference_required") {
      return "issuer_reference_lookup";
    }
    if (eligibilityMode === "bank_card_inline") {
      return "issuer_realtime";
    }
    return "not_required";
  }

  private buildPartnerEligibilityContract(
    entry: PartnerChannelEntryRecord,
  ): PartnerEligibilityIntegrationContractRecord | null {
    if (entry.eligibilityMode === "none") {
      return null;
    }

    if (entry.eligibilityMode === "bank_card_inline") {
      return {
        contractId: "partner-eligibility-bank-card-inline-v1",
        adapterCode: BANK_CARD_INLINE_ELIGIBILITY_ADAPTER_CODE,
        adapterKind: "issuer_card_lookup",
        adapterVersion: "v1",
        eligibilityMode: entry.eligibilityMode,
        decisionTtlSeconds: PARTNER_ELIGIBILITY_DECISION_TTL_SECONDS,
        retryPolicy: { ...DEFAULT_PARTNER_ELIGIBILITY_RETRY_POLICY },
        manualFallbackPolicy: {
          ...DEFAULT_PARTNER_ELIGIBILITY_MANUAL_FALLBACK_POLICY,
          requiredAuditFields: [
            ...DEFAULT_PARTNER_ELIGIBILITY_MANUAL_FALLBACK_POLICY.requiredAuditFields,
          ],
        },
        sensitiveDataPolicy: {
          ...DEFAULT_PARTNER_ELIGIBILITY_SENSITIVE_DATA_POLICY,
        },
        notes: [
          "Inline issuer lookup remains sandbox-backed until external bank evidence is available.",
          "Timeouts and retry exhaustion auto-route to ops_console manual review with audit.",
        ],
      };
    }

    return {
      contractId: "partner-eligibility-reference-required-v1",
      adapterCode: REFERENCE_TOKEN_ELIGIBILITY_ADAPTER_CODE,
      adapterKind: "issuer_reference_lookup",
      adapterVersion: "v1",
      eligibilityMode: entry.eligibilityMode,
      decisionTtlSeconds: PARTNER_ELIGIBILITY_DECISION_TTL_SECONDS,
      retryPolicy: { ...DEFAULT_PARTNER_ELIGIBILITY_RETRY_POLICY },
      manualFallbackPolicy: {
        ...DEFAULT_PARTNER_ELIGIBILITY_MANUAL_FALLBACK_POLICY,
        requiredAuditFields: [
          ...DEFAULT_PARTNER_ELIGIBILITY_MANUAL_FALLBACK_POLICY.requiredAuditFields,
        ],
      },
      sensitiveDataPolicy: {
        ...DEFAULT_PARTNER_ELIGIBILITY_SENSITIVE_DATA_POLICY,
      },
      notes: [
        "Reference-token verification stores the token hash only and derives non-secret benefit references.",
        "Timeouts and retry exhaustion auto-route to ops_console manual review with audit.",
      ],
    };
  }

  createTenantUser(
    tenantId: string,
    command: CreateTenantUserCommand,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    this.assertTenantMutationScope(tenantId, identity);
    this.assertNonBlank(command.email, "email");
    this.assertNonBlank(command.displayName, "displayName");
    this.assertNonBlank(command.roleCode, "roleCode");
    this.assertSupportedTenantRoleCode(command.roleCode);

    const normalizedEmail = command.email.trim().toLowerCase();
    if (
      this.userRoles.some(
        (userRole) =>
          userRole.tenantId === tenantId && userRole.email === normalizedEmail,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_USER_EXISTS",
        "A tenant user with this email already exists.",
        {
          email: normalizedEmail,
        },
      );
    }

    const securityActor = this.requireSecurityEventActor(identity, tenantId);
    const previousUserRoles = this.userRoles.map((userRole) =>
      this.cloneUserRole(userRole),
    );
    const now = new Date().toISOString();
    const userRole: TenantUserRoleRecord = {
      userId: `tenant_user_${randomUUID()}`,
      tenantId,
      email: normalizedEmail,
      displayName: command.displayName.trim(),
      roleCode: command.roleCode.trim(),
      status: "invited",
      approvalNotificationOptOut: false,
      invitedAt: now,
      updatedAt: now,
    };

    this.userRoles = [this.cloneUserRole(userRole), ...this.userRoles];
    const persisted = this.persistIdentityGovernanceMutation({
      changes: {
        userRoles: [this.cloneUserRole(userRole)],
      },
      context: "create_tenant_user",
      rollback: () => {
        this.userRoles = previousUserRoles.map((entry) =>
          this.cloneUserRole(entry),
        );
      },
      event: securityActor
        ? {
            actorId: securityActor.actorId,
            actorType: securityActor.actorType,
            subjectId: userRole.email,
            realm: securityActor.realm,
            tenantId,
            partnerId: null,
            eventType: "tenant_user.invited",
            eventFamily: "invitation",
            outcome: "success",
            severity: "medium",
            targetType: "tenant_user_role",
            targetId: userRole.userId,
            sessionId: null,
            tokenId: null,
            authMethods: [securityActor.authMode],
            sourceIp: null,
            userAgent: null,
            requestId: requestId ?? null,
            traceId: null,
            reasonCode: null,
            approvalId: null,
            beforeSummary: null,
            afterSummary: this.buildTenantUserAuditSummary(userRole),
            maskedContext: {
              email: userRole.email,
            },
          }
        : null,
    });

    return this.afterPersistence(persisted, async () => {
      const identitySnapshot = await this.syncIdentityTenantUserRole(
        userRole,
        "create_tenant_user",
      );
      await this.issueTenantInvitation(
        userRole,
        identitySnapshot?.membership.membershipId ?? null,
        securityActor?.actorId ?? null,
        "initial",
      );
      this.recordTenantAudit(
        {
          actorId: null,
          actorType: "tenant_admin",
          tenantId,
          moduleName: "tenant-partner",
          actionName: "create_tenant_user",
          resourceType: "tenant_user_role",
          resourceId: userRole.userId,
          newValuesSummary: this.buildTenantUserAuditSummary(userRole),
        },
        requestId,
      );

      return this.cloneUserRole(userRole);
    });
  }

  async resendTenantInvitation(
    tenantId: string,
    userId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ): Promise<TenantInvitationView> {
    const userRole = this.requireTenantUser(tenantId, userId);
    if (userRole.status !== "invited") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_INVITATION_NOT_PENDING",
        "Only an invited tenant user can receive a replacement invitation.",
        { tenantId, userId },
      );
    }
    const securityActor = this.requireSecurityEventActor(identity, tenantId);
    const identitySnapshot = await this.syncIdentityTenantUserRole(
      userRole,
      "resend_tenant_invitation",
    );
    const current = identitySnapshot
      ? await this.identityRepository?.findInvitationByMembershipId(
          identitySnapshot.membership.membershipId,
        )
      : null;
    if (current && !current.acceptedAt && !current.revokedAt) {
      await this.identityRepository?.upsertInvitationRecord({
        ...current,
        revokedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    const invitation = await this.issueTenantInvitation(
      userRole,
      identitySnapshot?.membership.membershipId ?? null,
      securityActor?.actorId ?? null,
      "resend",
    );
    if (!invitation) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "IDENTITY_AUTHORITY_UNAVAILABLE",
        "Tenant invitation delivery requires the identity authority.",
        { tenantId, userId },
      );
    }
    this.recordTenantAudit(
      {
        actorId: securityActor?.actorId ?? null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "resend_tenant_invitation",
        resourceType: "tenant_user_role",
        resourceId: userId,
        newValuesSummary: this.buildTenantUserAuditSummary(userRole),
      },
      requestId,
    );
    return this.toTenantInvitationView(invitation);
  }

  async revokeTenantInvitation(
    tenantId: string,
    userId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ): Promise<TenantInvitationView> {
    const userRole = this.requireTenantUser(tenantId, userId);
    const securityActor = this.requireSecurityEventActor(identity, tenantId);
    const identitySnapshot = await this.syncIdentityTenantUserRole(
      userRole,
      "revoke_tenant_invitation",
    );
    const invitation = identitySnapshot
      ? await this.identityRepository?.findPendingInvitationByMembershipId(
          identitySnapshot.membership.membershipId,
        )
      : null;
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_INVITATION_NOT_PENDING",
        "There is no pending invitation to revoke.",
        { tenantId, userId },
      );
    }
    const revokedAt = new Date().toISOString();
    const revoked = await this.identityRepository!.upsertInvitationRecord({
      ...invitation,
      revokedAt,
      updatedAt: revokedAt,
    });
    this.recordTenantAudit(
      {
        actorId: securityActor?.actorId ?? null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "revoke_tenant_invitation",
        resourceType: "tenant_user_role",
        resourceId: userId,
        newValuesSummary: this.buildTenantUserAuditSummary(userRole),
      },
      requestId,
    );
    return this.toTenantInvitationView(revoked);
  }

  async acceptTenantInvitation(
    command: AcceptTenantInvitationCommand,
    requestId?: string,
  ): Promise<AcceptTenantInvitationResult> {
    this.assertNonBlank(command.invitationToken, "invitationToken");
    const invitation = await this.identityRepository?.consumeInvitationToken(
      createHash("sha256").update(command.invitationToken).digest("hex"),
    );
    if (!invitation) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "TENANT_INVITATION_ACCEPTANCE_DENIED",
        "The invitation cannot be accepted.",
        {},
      );
    }
    const userRole = this.userRoles.find(
      (candidate) =>
        candidate.tenantId === invitation.tenantId &&
        candidate.email === invitation.email,
    );
    if (!userRole || userRole.status !== "invited") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "TENANT_INVITATION_ACCEPTANCE_DENIED",
        "The invitation cannot be accepted.",
        {},
      );
    }
    const before = this.cloneUserRole(userRole);
    userRole.status = "active";
    userRole.updatedAt = new Date().toISOString();
    try {
      await this.persistChangesRequired(
        { userRoles: [this.cloneUserRole(userRole)] },
        "accept_tenant_invitation",
      );
      await this.syncIdentityTenantUserRole(
        userRole,
        "accept_tenant_invitation",
      );
      await this.identityRepository?.activateTenantInvitation(
        invitation.invitationId,
      );
    } catch (error) {
      Object.assign(userRole, before);
      throw error;
    }
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: userRole.tenantId,
        moduleName: "tenant-partner",
        actionName: "accept_tenant_invitation",
        resourceType: "tenant_user_role",
        resourceId: userRole.userId,
        newValuesSummary: this.buildTenantUserAuditSummary(userRole),
      },
      requestId,
    );
    return {
      user: this.cloneUserRole(userRole),
      invitation: this.toTenantInvitationView(invitation),
      accepted: true,
    };
  }

  updateTenantUserRole(
    tenantId: string,
    userId: string,
    command: UpdateTenantRoleCommand,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    this.assertTenantMutationScope(tenantId, identity);
    this.assertNonBlank(command.roleCode, "roleCode");
    this.assertSupportedTenantRoleCode(command.roleCode);

    const userRole = this.requireTenantUser(tenantId, userId);
    const targetRoleCode = command.roleCode.trim();
    const targetStatus = command.status ?? userRole.status;

    if (identity) {
      const callerActorId = identity.actorId?.trim();
      if (
        callerActorId &&
        (callerActorId === userId ||
          callerActorId === userRole.userId ||
          callerActorId.toLowerCase() === userRole.email.toLowerCase())
      ) {
        const getRoleRank = (role: string) => {
          const normalized = role.trim().toLowerCase();
          if (
            normalized === "admin" ||
            normalized === "tenant_admin" ||
            normalized === "tc_admin"
          ) {
            return 4;
          }
          if (
            normalized === "approver" ||
            normalized === "tenant_approver" ||
            normalized === "tenant_ops_admin" ||
            normalized === "ops_admin" ||
            normalized === "operator" ||
            normalized === "tc_operator" ||
            normalized === "tenant_finance_admin" ||
            normalized === "finance_admin" ||
            normalized === "finance" ||
            normalized === "tc_finance"
          ) {
            return 3;
          }
          if (normalized === "requester" || normalized === "tenant_requester") {
            return 2;
          }
          if (
            normalized === "viewer" ||
            normalized === "tenant_viewer" ||
            normalized === "tc_viewer"
          ) {
            return 1;
          }
          return 0;
        };

        const currentRank = getRoleRank(userRole.roleCode);
        const targetRank = getRoleRank(targetRoleCode);

        if (targetRank > currentRank) {
          throw new ApiRequestError(
            403,
            "SELF_ELEVATION_FORBIDDEN",
            "Self-elevation of roles is forbidden.",
            {
              tenantId,
              userId,
              currentRole: userRole.roleCode,
              targetRole: targetRoleCode,
            },
          );
        }
      }
    }

    // Canonical identity callers receive the proof-aware denial before the
    // legacy compatibility guard below.  Legacy calls preserve their existing
    // error contract while the authority-backed path cannot mask a self-change
    // as merely a last-admin transition.
    if (identity) {
      this.assertTenantUserRoleChangeIsSafe({
        tenantId,
        userRole,
        nextRoleCode: targetRoleCode,
        nextStatus: targetStatus,
        identity,
      });
    }

    const isCurrentlyActiveAdmin =
      (userRole.roleCode === "admin" || userRole.roleCode === "tenant_admin") &&
      userRole.status === "active";

    const willBeActiveAdmin =
      (targetRoleCode === "admin" || targetRoleCode === "tenant_admin") &&
      targetStatus === "active";

    if (isCurrentlyActiveAdmin && !willBeActiveAdmin) {
      const activeAdminCount = this.userRoles.filter(
        (u) =>
          u.tenantId === tenantId &&
          (u.roleCode === "admin" || u.roleCode === "tenant_admin") &&
          u.status === "active",
      ).length;

      if (activeAdminCount <= 1) {
        throw new ApiRequestError(
          400,
          "CANNOT_REMOVE_LAST_ADMIN",
          "Cannot remove or demote the last active administrator for this tenant.",
          { tenantId, userId, activeAdminCount },
        );
      }
    }

    const before = this.cloneUserRole(userRole);
    const securityActor = this.requireSecurityEventActor(identity, tenantId);
    const nextRoleCode = command.roleCode.trim();
    const nextStatus = command.status ?? userRole.status;
    const previousUserRoles = this.userRoles.map((entry) =>
      this.cloneUserRole(entry),
    );
    userRole.roleCode = nextRoleCode;
    userRole.status = nextStatus;
    userRole.approvalNotificationOptOut =
      command.approvalNotificationOptOut ?? userRole.approvalNotificationOptOut;
    userRole.updatedAt = new Date().toISOString();

    const persisted = this.persistIdentityGovernanceMutation({
      changes: {
        userRoles: [this.cloneUserRole(userRole)],
      },
      context: "update_tenant_role",
      rollback: () => {
        this.userRoles = previousUserRoles.map((entry) =>
          this.cloneUserRole(entry),
        );
      },
      event: securityActor
        ? {
            actorId: securityActor.actorId,
            actorType: securityActor.actorType,
            subjectId: userRole.email,
            realm: securityActor.realm,
            tenantId,
            partnerId: null,
            eventType: "tenant_user.role_updated",
            eventFamily: "role",
            outcome: "success",
            severity: "high",
            targetType: "tenant_user_role",
            targetId: userRole.userId,
            sessionId: null,
            tokenId: null,
            authMethods: [securityActor.authMode],
            sourceIp: null,
            userAgent: null,
            requestId: requestId ?? null,
            traceId: null,
            reasonCode: null,
            approvalId: null,
            beforeSummary: this.buildTenantUserAuditSummary(before),
            afterSummary: this.buildTenantUserAuditSummary(userRole),
            maskedContext: {
              email: userRole.email,
            },
          }
        : null,
    });

    return this.afterPersistence(persisted, async () => {
      const identitySnapshot = await this.syncIdentityTenantUserRole(
        userRole,
        "update_tenant_role",
      );
      if (
        userRole.status !== "invited" &&
        identitySnapshot?.invitation &&
        !identitySnapshot.invitation.acceptedAt &&
        !identitySnapshot.invitation.revokedAt
      ) {
        const revokedAt = new Date().toISOString();
        await this.identityRepository?.upsertInvitationRecord({
          ...identitySnapshot.invitation,
          revokedAt,
          updatedAt: revokedAt,
        });
      }
      if (
        before.roleCode !== userRole.roleCode ||
        before.status !== userRole.status
      ) {
        await this.revokeTenantUserSessions(
          userRole,
          identitySnapshot?.principal.principalId ?? null,
          before.status !== "active" || userRole.status !== "active"
            ? "TENANT_ACCOUNT_STATUS_CHANGED"
            : "TENANT_ROLE_CHANGED",
          securityActor?.actorId,
        );
      }
      this.recordTenantAudit(
        {
          actorId: null,
          actorType: "tenant_admin",
          tenantId,
          moduleName: "tenant-partner",
          actionName: "update_tenant_role",
          resourceType: "tenant_user_role",
          resourceId: userRole.userId,
          newValuesSummary: this.buildTenantUserAuditSummary(userRole),
        },
        requestId,
      );

      return this.cloneUserRole(userRole);
    });
  }

  listApiKeys(tenantId: string) {
    return this.apiKeys
      .filter((apiKey) => apiKey.tenantId === tenantId)
      .map((apiKey) => {
        this.reconcileStoredApiKey(apiKey);
        return apiKey;
      })
      .map((apiKey) => this.toApiKeyResponse(apiKey));
  }

  issueApiKey(
    tenantId: string,
    command: IssueTenantApiKeyCommand,
    requestId?: string,
    identity?: IdentityContext | null,
  ): MaybePromise<TenantApiKeyIssued> {
    this.assertTenantMutationScope(tenantId, identity);
    this.assertNonBlank(command.keyName, "keyName");

    const securityActor = this.requireSecurityEventActor(identity, tenantId);
    const previousApiKeys = this.apiKeys.map((apiKey) =>
      this.cloneStoredApiKey(apiKey),
    );
    const issued = this.buildIssuedApiKey(
      tenantId,
      {
        keyName: command.keyName,
        scopes: command.scopes,
        ownerRef: command.ownerRef ?? securityActor?.actorId ?? null,
        ownerName: command.ownerName ?? securityActor?.actorId ?? null,
        ownerType: command.ownerType ?? securityActor?.actorType ?? "unknown",
        purpose: command.purpose ?? null,
        expiresAt: command.expiresAt ?? null,
      },
      null,
    );
    this.apiKeys = [
      this.cloneStoredApiKey(issued.storedApiKey),
      ...this.apiKeys,
    ];
    const persisted = this.persistIdentityGovernanceMutation({
      changes: {
        apiKeys: [this.cloneStoredApiKey(issued.storedApiKey)],
      },
      context: "issue_api_key",
      rollback: () => {
        this.apiKeys = previousApiKeys.map((apiKey) =>
          this.cloneStoredApiKey(apiKey),
        );
      },
      event: securityActor
        ? {
            actorId: securityActor.actorId,
            actorType: securityActor.actorType,
            subjectId: securityActor.actorId,
            realm: securityActor.realm,
            tenantId,
            partnerId: null,
            eventType: "tenant_api_key.issued",
            eventFamily: "credential",
            outcome: "success",
            severity: "high",
            targetType: "tenant_api_key",
            targetId: issued.storedApiKey.apiKeyId,
            sessionId: null,
            tokenId: issued.plaintextKey,
            authMethods: [securityActor.authMode],
            sourceIp: null,
            userAgent: null,
            requestId: requestId ?? null,
            traceId: null,
            reasonCode: null,
            approvalId: null,
            beforeSummary: null,
            afterSummary: this.toApiKeyResponse(issued.storedApiKey),
            maskedContext: {
              plaintextKey: issued.plaintextKey,
            },
          }
        : null,
    });

    return this.afterPersistence(persisted, () => {
      this.recordTenantAudit(
        {
          actorId: null,
          actorType: "tenant_admin",
          tenantId,
          moduleName: "tenant-partner",
          actionName: "issue_api_key",
          resourceType: "tenant_api_key",
          resourceId: issued.storedApiKey.apiKeyId,
          newValuesSummary: this.toApiKeyResponse(issued.storedApiKey),
        },
        requestId,
      );

      return {
        apiKey: this.toApiKeyResponse(issued.storedApiKey),
        plaintextKey: issued.plaintextKey,
        revokedApiKeyId: null,
        overlapEndsAt: null,
      };
    });
  }

  rotateApiKey(
    tenantId: string,
    apiKeyId: string,
    command: RotateTenantApiKeyCommand,
    requestId?: string,
    identity?: IdentityContext | null,
  ): MaybePromise<TenantApiKeyIssued> {
    this.assertTenantMutationScope(tenantId, identity);
    const currentApiKey = this.requireApiKey(tenantId, apiKeyId);
    // Rotation reopens a signing window on the outgoing key, so a credential
    // that is already revoked, auto-revoked, or expired must never be rotated
    // back into service.
    if (
      currentApiKey.status !== "active" &&
      currentApiKey.status !== "overlap_active"
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TENANT_API_KEY_NOT_ROTATABLE",
        "Only a live tenant API key can be rotated.",
        {
          apiKeyId: currentApiKey.apiKeyId,
          status: currentApiKey.status,
        },
      );
    }
    const before = this.cloneStoredApiKey(currentApiKey);
    const securityActor = this.requireSecurityEventActor(identity, tenantId);
    const previousApiKeys = this.apiKeys.map((apiKey) =>
      this.cloneStoredApiKey(apiKey),
    );
    const rotatedAt = new Date().toISOString();
    const overlapEndsAt = this.resolveCredentialOverlapEndsAt(
      rotatedAt,
      command.overlapDays,
    );

    const issued = this.buildIssuedApiKey(
      tenantId,
      {
        keyName: command.keyName ?? currentApiKey.keyName,
        scopes:
          command.scopes && command.scopes.length > 0
            ? command.scopes
            : currentApiKey.scopes,
        ownerRef:
          command.ownerRef ??
          currentApiKey.ownerRef ??
          securityActor?.actorId ??
          null,
        ownerName:
          command.ownerName ??
          currentApiKey.ownerName ??
          securityActor?.actorId ??
          null,
        ownerType:
          command.ownerType ??
          currentApiKey.ownerType ??
          securityActor?.actorType ??
          "unknown",
        purpose: command.purpose ?? currentApiKey.purpose ?? null,
        expiresAt:
          command.expiresAt !== undefined
            ? command.expiresAt
            : currentApiKey.expiresAt,
      },
      currentApiKey,
    );
    currentApiKey.overlapEndsAt = overlapEndsAt;
    currentApiKey.supersededByApiKeyId = issued.storedApiKey.apiKeyId;
    currentApiKey.autoRevokedAt = null;
    currentApiKey.status = "overlap_active";
    currentApiKey.revokedAt = null;
    currentApiKey.signals = this.buildCredentialSignals(
      currentApiKey.lastUsedAt,
      currentApiKey.expiresAt ?? null,
      currentApiKey.autoRevokedAt ?? null,
      rotatedAt,
    );
    const retiredApiKeys = this.apiKeys
      .filter(
        (apiKey) =>
          apiKey.tenantId === tenantId &&
          apiKey.apiKeyId !== currentApiKey.apiKeyId &&
          apiKey.revokedAt === null,
      )
      .map((apiKey) => {
        apiKey.revokedAt = rotatedAt;
        apiKey.autoRevokedAt = null;
        apiKey.overlapEndsAt = null;
        apiKey.status = "revoked";
        apiKey.revokeReason = "credential_rotated";
        return this.cloneStoredApiKey(apiKey);
      });

    this.apiKeys = [
      this.cloneStoredApiKey(issued.storedApiKey),
      this.cloneStoredApiKey(currentApiKey),
      ...retiredApiKeys,
      ...this.apiKeys.filter(
        (apiKey) =>
          apiKey.apiKeyId !== currentApiKey.apiKeyId &&
          !retiredApiKeys.some(
            (retiredApiKey) => retiredApiKey.apiKeyId === apiKey.apiKeyId,
          ),
      ),
    ];
    const persisted = this.persistIdentityGovernanceMutation({
      changes: {
        apiKeys: [
          this.cloneStoredApiKey(currentApiKey),
          this.cloneStoredApiKey(issued.storedApiKey),
          ...retiredApiKeys,
        ],
      },
      context: "rotate_api_key",
      rollback: () => {
        this.apiKeys = previousApiKeys.map((apiKey) =>
          this.cloneStoredApiKey(apiKey),
        );
      },
      event: securityActor
        ? {
            actorId: securityActor.actorId,
            actorType: securityActor.actorType,
            subjectId: securityActor.actorId,
            realm: securityActor.realm,
            tenantId,
            partnerId: null,
            eventType: "tenant_api_key.rotated",
            eventFamily: "credential",
            outcome: "success",
            severity: "high",
            targetType: "tenant_api_key",
            targetId: issued.storedApiKey.apiKeyId,
            sessionId: null,
            tokenId: issued.plaintextKey,
            authMethods: [securityActor.authMode],
            sourceIp: null,
            userAgent: null,
            requestId: requestId ?? null,
            traceId: null,
            reasonCode: null,
            approvalId: null,
            beforeSummary: this.toApiKeyResponse(before),
            afterSummary: this.toApiKeyResponse(issued.storedApiKey),
            maskedContext: {
              plaintextKey: issued.plaintextKey,
              revokedApiKeyId: currentApiKey.apiKeyId,
            },
          }
        : null,
    });

    return this.afterPersistence(persisted, () => {
      this.recordTenantAudit(
        {
          actorId: null,
          actorType: "tenant_admin",
          tenantId,
          moduleName: "tenant-partner",
          actionName: "rotate_api_key",
          resourceType: "tenant_api_key",
          resourceId: issued.storedApiKey.apiKeyId,
          oldValuesSummary: this.toApiKeyResponse(before),
          newValuesSummary: this.toApiKeyResponse(issued.storedApiKey),
        },
        requestId,
      );

      return {
        apiKey: this.toApiKeyResponse(issued.storedApiKey),
        plaintextKey: issued.plaintextKey,
        revokedApiKeyId: currentApiKey.apiKeyId,
        overlapEndsAt,
      };
    });
  }

  listWebhookEndpoints(tenantId: string, identity?: IdentityContext | null) {
    return this.webhookEndpoints
      .filter((endpoint) => endpoint.tenantId === tenantId)
      .map((endpoint) => {
        this.reconcileStoredWebhookEndpoint(endpoint);
        return endpoint;
      })
      .map((endpoint) => this.toWebhookResponse(endpoint, identity));
  }

  summarizeWebhookDeliveryHealth(referenceDate = new Date()) {
    const referenceTimestamp = referenceDate.getTime();
    const oneHourAgoTimestamp = referenceTimestamp - 60 * 60 * 1000;
    const queuedDeliveryLagMinutes = this.webhookDeliveries
      .filter((delivery) => delivery.status === "queued")
      .map((delivery) =>
        Math.max(
          0,
          Math.round(
            (referenceTimestamp - new Date(delivery.createdAt).getTime()) /
              60_000,
          ),
        ),
      );

    return {
      totalEndpoints: this.webhookEndpoints.length,
      activeEndpoints: this.webhookEndpoints.filter(
        (endpoint) => endpoint.status === "active",
      ).length,
      disabledEndpoints: this.webhookEndpoints.filter(
        (endpoint) => endpoint.status === "disabled",
      ).length,
      queuedDeliveries: this.webhookDeliveries.filter(
        (delivery) => delivery.status === "queued",
      ).length,
      failedDeliveriesLastHour: this.webhookDeliveries.filter(
        (delivery) =>
          delivery.status === "delivery_failed" &&
          new Date(delivery.createdAt).getTime() >= oneHourAgoTimestamp,
      ).length,
      oldestQueuedDeliveryLagMinutes:
        queuedDeliveryLagMinutes.length > 0
          ? Math.max(...queuedDeliveryLagMinutes)
          : null,
    };
  }

  deleteWebhookEndpoint(
    tenantId: string,
    webhookId: string,
    command?: DeleteTenantWebhookEndpointCommand,
    requestId?: string,
  ) {
    const removed = this.webhookEndpoints.find(
      (endpoint) =>
        endpoint.tenantId === tenantId && endpoint.webhookId === webhookId,
    );
    if (!removed) {
      return null;
    }

    for (const delivery of this.webhookDeliveries) {
      if (
        delivery.tenantId === tenantId &&
        delivery.webhookId === removed.webhookId
      ) {
        this.clearWebhookRetry(delivery.deliveryId);
      }
    }

    this.webhookEndpoints = this.webhookEndpoints.filter(
      (endpoint) => endpoint.webhookId !== removed.webhookId,
    );
    this.persistChanges(
      {
        webhookEndpoints: [this.cloneStoredWebhookEndpoint(removed)],
      },
      "delete_webhook_endpoint",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "delete_webhook_endpoint",
        resourceType: "webhook_endpoint",
        resourceId: removed.webhookId,
        oldValuesSummary: this.toWebhookResponse(removed),
        newValuesSummary: {
          deleted: true,
          reason: command?.reason?.trim() || null,
        },
      },
      requestId,
    );
    return { status: "deleted", webhookId };
  }

  createWebhookEndpoint(
    tenantId: string,
    command: CreateTenantWebhookEndpointCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.url, "url");
    this.assertNonBlank(command.secret, "secret");
    const normalizedEvents = this.normalizeWebhookEvents(command.events);
    const normalizedUrl = command.url.trim();

    const now = new Date().toISOString();
    const webhookId = `wh_${randomUUID()}`;
    const owner = this.resolveCredentialOwner(command, {
      ownerRef: null,
      ownerName: "Tenant webhook integration owner",
      ownerType: "tenant_admin",
    });
    const secretPreview = this.secretPreview(command.secret);
    const secretExpiresAt = this.resolveWebhookSecretExpiry(
      command.expiresAt ?? null,
      now,
    );
    const initialSecret: StoredWebhookSecretMaterial = {
      createdAt: now,
      secretVersion: 1,
      rotatedAt: now,
      rotationReason: "initial_secret",
      secretPreview,
      secretValue: command.secret,
      ownerRef: owner.ownerRef,
      ownerName: owner.ownerName,
      ownerType: owner.ownerType,
      purpose: this.resolveCredentialPurpose(
        command.purpose,
        "tenant webhook signing secret",
      ),
      expiresAt: secretExpiresAt,
      lastUsedAt: null,
      lastUsedWorkload: null,
      status: "active",
      overlapEndsAt: null,
      autoRevokedAt: null,
      supersededByVersion: null,
      revokedAt: null,
      signals: this.buildCredentialSignals(null, secretExpiresAt, null, now),
    };
    const webhookEndpoint: StoredWebhookEndpoint = {
      webhookId,
      tenantId,
      url: normalizedUrl,
      events: normalizedEvents,
      status: "test_pending",
      ownerRef: owner.ownerRef,
      ownerName: owner.ownerName,
      ownerType: owner.ownerType,
      purpose: initialSecret.purpose,
      resourceScope: `tenant:${tenantId}:webhook:${webhookId}`,
      secretVersion: 1,
      secretPreview,
      secretExpiresAt: initialSecret.expiresAt,
      secretLastUsedAt: null,
      secretLastUsedWorkload: null,
      credentialStatus: "active",
      rotationOverlapEndsAt: null,
      credentialSignals: this.toCredentialSignals(initialSecret.signals),
      secretValue: command.secret,
      secretCredentials: [{ ...initialSecret }],
      retryPolicy: this.toWebhookRetryPolicy(DEFAULT_WEBHOOK_RETRY_POLICY),
      runtimeMetadata: {
        deliveryCount: 0,
        failedDeliveryCount: 0,
        lastAttemptAt: null,
        lastDeliveredAt: null,
        lastValidatedAt: null,
        nextAttemptAt: null,
        lastSignaturePreview: null,
        disabledAt: null,
        disableReason: null,
        disableReasonNote: null,
        retryPolicy: this.toWebhookRetryPolicy(DEFAULT_WEBHOOK_RETRY_POLICY),
        secretRotation: {
          currentVersion: 1,
          rotatedAt: now,
          rotationCount: 1,
          history: [this.toWebhookSecretHistoryRecord(initialSecret)],
        },
      },
      secretHistory: [this.toWebhookSecretHistoryRecord(initialSecret)],
      createdAt: now,
      updatedAt: now,
    };
    this.reconcileStoredWebhookEndpoint(webhookEndpoint, now);

    this.webhookEndpoints = [
      this.cloneStoredWebhookEndpoint(webhookEndpoint),
      ...this.webhookEndpoints,
    ];
    this.persistChanges(
      {
        webhookEndpoints: [this.cloneStoredWebhookEndpoint(webhookEndpoint)],
      },
      "create_webhook_endpoint",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "create_webhook_endpoint",
        resourceType: "webhook_endpoint",
        resourceId: webhookEndpoint.webhookId,
        newValuesSummary: {
          ownerName: webhookEndpoint.ownerName,
          purpose: webhookEndpoint.purpose,
          url: webhookEndpoint.url,
          events: webhookEndpoint.events,
          secretVersion: webhookEndpoint.secretVersion,
          secretExpiresAt: webhookEndpoint.secretExpiresAt,
          retryPolicy: webhookEndpoint.retryPolicy,
        },
      },
      requestId,
    );

    return {
      webhookId: webhookEndpoint.webhookId,
      status: webhookEndpoint.status,
    };
  }

  updateWebhookEndpoint(
    tenantId: string,
    webhookId: string,
    command: UpdateTenantWebhookEndpointCommand,
    requestId?: string,
  ) {
    const endpoint = this.requireWebhookEndpoint(tenantId, webhookId);
    const oldValues = this.toWebhookResponse(endpoint);
    const previousEndpointStatus = endpoint.status;

    let changed = false;
    let requiresRevalidation = false;
    let requestedStatus: TenantWebhookEndpointStatus | undefined;

    if (command.url !== undefined) {
      this.assertNonBlank(command.url, "url");
      endpoint.url = command.url.trim();
      changed = true;
      requiresRevalidation = true;
    }

    if (command.events !== undefined) {
      endpoint.events = this.normalizeWebhookEvents(command.events);
      changed = true;
      requiresRevalidation = true;
    }

    if (command.status !== undefined) {
      this.assertSupportedWebhookStatus(command.status);
      requestedStatus = command.status;
      changed = true;
    }

    if (!changed) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "WEBHOOK_UPDATE_EMPTY",
        "At least one webhook metadata field must be provided.",
        {
          webhookId,
        },
      );
    }

    const now = new Date().toISOString();
    if (requestedStatus === "disabled") {
      const disableReasonNote = command.disableReason?.trim();
      if (!disableReasonNote) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "WEBHOOK_DISABLE_REASON_REQUIRED",
          "disableReason is required when disabling a webhook endpoint.",
          {
            webhookId,
          },
        );
      }
      endpoint.status = "disabled";
      endpoint.runtimeMetadata.disabledAt = now;
      endpoint.runtimeMetadata.disableReason = "manual_disable";
      endpoint.runtimeMetadata.disableReasonNote = disableReasonNote;
      endpoint.updatedAt = now;
    } else if (requiresRevalidation || requestedStatus === "test_pending") {
      this.markWebhookValidationPending(endpoint, now);
    } else if (requestedStatus === "active") {
      if (previousEndpointStatus === "disabled") {
        this.markWebhookValidationPending(endpoint, now);
      } else {
        endpoint.status = "active";
        endpoint.runtimeMetadata.disabledAt = null;
        endpoint.runtimeMetadata.disableReason = null;
        endpoint.runtimeMetadata.disableReasonNote = null;
        endpoint.updatedAt = now;
      }
    } else {
      endpoint.updatedAt = now;
    }

    this.persistChanges(
      {
        webhookEndpoints: [this.cloneStoredWebhookEndpoint(endpoint)],
      },
      "update_webhook_endpoint",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "update_webhook_endpoint",
        resourceType: "webhook_endpoint",
        resourceId: endpoint.webhookId,
        oldValuesSummary: oldValues,
        newValuesSummary: this.toWebhookResponse(endpoint),
      },
      requestId,
    );

    return this.toWebhookResponse(endpoint);
  }

  async sendTestWebhook(
    tenantId: string,
    command: SendTestWebhookCommand,
    requestId?: string,
  ) {
    const endpoint = this.requireWebhookEndpoint(tenantId, command.webhookId);
    const oldValues = this.toWebhookResponse(endpoint);
    const createdAt = new Date().toISOString();
    this.markWebhookValidationPending(endpoint, createdAt);
    this.persistChanges(
      {
        webhookEndpoints: [this.cloneStoredWebhookEndpoint(endpoint)],
      },
      "send_test_webhook_pending",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "set_webhook_test_pending",
        resourceType: "webhook_endpoint",
        resourceId: endpoint.webhookId,
        oldValuesSummary: oldValues,
        newValuesSummary: this.toWebhookResponse(endpoint),
      },
      requestId,
    );

    const delivery = await this.enqueueWebhookDelivery(
      endpoint,
      "tenant.webhook.test",
      createdAt,
      "send_test_webhook",
    );

    const payload = this.buildWebhookPayload<{
      webhookId: string;
      secretVersion: number;
    }>({
      deliveryId: delivery.deliveryId,
      eventType: delivery.eventType,
      tenantId: endpoint.tenantId,
      occurredAt: createdAt,
      data: {
        webhookId: endpoint.webhookId,
        secretVersion: endpoint.secretVersion,
      },
    });
    const result = await this.dispatchWebhookAttempt(
      endpoint,
      delivery,
      payload as unknown as Record<string, unknown>,
    );

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "send_test_webhook",
        resourceType: "webhook_delivery",
        resourceId: delivery.deliveryId,
        newValuesSummary: {
          webhookId: endpoint.webhookId,
          eventType: delivery.eventType,
          attempt: result.attempt,
          httpStatus: result.httpStatus,
          nextAttemptAt: result.nextAttemptAt,
          retryPolicy: delivery.retryPolicySnapshot,
        },
      },
      requestId,
    );

    return {
      deliveryId: delivery.deliveryId,
      httpStatus: result.httpStatus,
      attempt: result.attempt,
      nextAttemptAt: result.nextAttemptAt,
    };
  }

  async publishWebhookEvent<T extends Record<string, unknown>>(
    tenantId: string,
    input: {
      eventType: string;
      data: T;
      occurredAt?: string;
      deliveryId?: string;
      outboxKey?: string;
    },
  ) {
    this.assertNonBlank(tenantId, "tenantId");
    this.assertNonBlank(input.eventType, "eventType");

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const endpoints = this.webhookEndpoints.filter(
      (endpoint) =>
        endpoint.tenantId === tenantId &&
        endpoint.status === "active" &&
        endpoint.events.includes(input.eventType),
    );

    const results: Array<{
      webhookId: string;
      deliveryId: string;
      attempt: number;
      httpStatus: number | null;
      nextAttemptAt: string | null;
      status: StoredWebhookDelivery["status"];
    }> = [];

    for (const endpoint of endpoints) {
      const deliveryIdOverride =
        input.deliveryId ??
        (input.outboxKey
          ? `wd_${generateDeterministicUuid("webhook_delivery", `${input.outboxKey}:${endpoint.webhookId}`)}`
          : undefined);

      const delivery = await this.enqueueWebhookDelivery(
        endpoint,
        input.eventType,
        occurredAt,
        "publish_webhook_event",
        deliveryIdOverride,
      );
      if (delivery.status === "delivered") {
        results.push({
          webhookId: endpoint.webhookId,
          deliveryId: delivery.deliveryId,
          attempt: delivery.attempt,
          httpStatus: delivery.httpStatus,
          nextAttemptAt: delivery.nextAttemptAt,
          status: delivery.status,
        });
        continue;
      }
      const payload = this.buildWebhookPayload({
        deliveryId: delivery.deliveryId,
        eventType: input.eventType,
        tenantId,
        occurredAt,
        data: input.data,
      });
      const result = await this.dispatchWebhookAttempt(
        endpoint,
        delivery,
        payload as unknown as Record<string, unknown>,
      );
      results.push({
        webhookId: endpoint.webhookId,
        deliveryId: delivery.deliveryId,
        attempt: result.attempt,
        httpStatus: result.httpStatus,
        nextAttemptAt: result.nextAttemptAt,
        status: result.status,
      });
    }

    return results;
  }

  private buildWebhookPayload<T extends Record<string, unknown>>(input: {
    deliveryId: string;
    eventType: string;
    tenantId: string;
    occurredAt: string;
    data: T;
  }): WebhookEventPayload<T> {
    return {
      event: input.eventType,
      deliveryId: input.deliveryId,
      occurredAt: input.occurredAt,
      tenantId: input.tenantId,
      data: {
        ...input.data,
      },
    };
  }

  private async enqueueWebhookDelivery(
    endpoint: StoredWebhookEndpoint,
    eventType: string,
    createdAt: string,
    context: string,
    deliveryIdOverride?: string,
  ): Promise<StoredWebhookDelivery> {
    this.reconcileStoredWebhookEndpoint(endpoint, createdAt);
    const deliveryId = deliveryIdOverride ?? `wd_${randomUUID()}`;
    const existingIndex = this.webhookDeliveries.findIndex(
      (d) => d.deliveryId === deliveryId,
    );
    if (existingIndex >= 0 && this.webhookDeliveries[existingIndex]) {
      return this.webhookDeliveries[existingIndex];
    }

    const delivery: StoredWebhookDelivery = {
      deliveryId,
      webhookId: endpoint.webhookId,
      tenantId: endpoint.tenantId,
      eventType,
      attempt: 0,
      status: "queued",
      httpStatus: null,
      signature: "",
      createdAt,
      attemptedAt: createdAt,
      nextAttemptAt: null,
      signatureHeader: "",
      signatureVersion: endpoint.secretVersion,
      secretVersion: endpoint.secretVersion,
      retryPolicySnapshot: this.toWebhookRetryPolicy(endpoint.retryPolicy),
      rawBody: {},
    };

    this.webhookDeliveries = [delivery, ...this.webhookDeliveries];
    endpoint.runtimeMetadata = this.toWebhookRuntimeMetadata(
      {
        ...endpoint.runtimeMetadata,
        deliveryCount: endpoint.runtimeMetadata.deliveryCount + 1,
        retryPolicy: endpoint.retryPolicy,
      },
      {
        currentVersion: endpoint.secretVersion,
        rotatedAt: endpoint.runtimeMetadata.secretRotation.rotatedAt,
        rotationCount: endpoint.runtimeMetadata.secretRotation.rotationCount,
        history: endpoint.runtimeMetadata.secretRotation.history,
      },
    );

    await this.persistChangesRequired(
      {
        webhookEndpoints: [this.cloneStoredWebhookEndpoint(endpoint)],
        webhookDeliveries: [this.cloneStoredWebhookDelivery(delivery)],
      },
      context,
    );

    return delivery;
  }

  private async dispatchWebhookAttempt(
    endpoint: StoredWebhookEndpoint,
    delivery: StoredWebhookDelivery,
    payload: Record<string, unknown>,
  ) {
    const previousStatus = delivery.status;
    const previousEndpointValues = this.toWebhookResponse(endpoint);
    const signingSecret = this.resolveWebhookSecretMaterial(
      endpoint,
      delivery.secretVersion,
    );
    if (
      !signingSecret ||
      (signingSecret.status !== "active" &&
        signingSecret.status !== "overlap_active")
    ) {
      const attemptedAt = new Date().toISOString();
      delivery.attempt += 1;
      delivery.status = "delivery_failed";
      delivery.httpStatus = null;
      delivery.signature = "";
      delivery.attemptedAt = attemptedAt;
      delivery.nextAttemptAt = null;
      delivery.signatureHeader = "";
      delivery.signatureVersion = delivery.secretVersion;
      delivery.rawBody = {
        errorCode: "WEBHOOK_SECRET_UNAVAILABLE",
        secretVersion: delivery.secretVersion,
      };
      endpoint.runtimeMetadata = this.toWebhookRuntimeMetadata(
        {
          ...endpoint.runtimeMetadata,
          failedDeliveryCount: endpoint.runtimeMetadata.failedDeliveryCount + 1,
          lastAttemptAt: attemptedAt,
          nextAttemptAt: null,
          lastSignaturePreview: null,
          retryPolicy: endpoint.retryPolicy,
        },
        {
          currentVersion: endpoint.secretVersion,
          rotatedAt: endpoint.runtimeMetadata.secretRotation.rotatedAt,
          rotationCount: endpoint.runtimeMetadata.secretRotation.rotationCount,
          history: endpoint.runtimeMetadata.secretRotation.history,
        },
      );
      this.applyWebhookPostDispatchPolicy(
        endpoint,
        delivery,
        {
          attempt: delivery.attempt,
          status: delivery.status,
          httpStatus: null,
          signature: "",
          attemptedAt,
          nextAttemptAt: null,
          signatureHeader: "",
          signatureVersion: delivery.secretVersion,
          secretVersion: delivery.secretVersion,
          rawBody: { ...delivery.rawBody },
        },
        previousEndpointValues,
      );
      await this.persistChangesRequired(
        {
          webhookEndpoints: [this.cloneStoredWebhookEndpoint(endpoint)],
          webhookDeliveries: [this.cloneStoredWebhookDelivery(delivery)],
        },
        "webhook_dispatch_secret_unavailable",
      );
      this.clearWebhookRetry(delivery.deliveryId);
      return {
        attempt: delivery.attempt,
        status: delivery.status,
        httpStatus: null,
        signature: "",
        attemptedAt,
        nextAttemptAt: null,
        signatureHeader: "",
        signatureVersion: delivery.secretVersion,
        secretVersion: delivery.secretVersion,
        rawBody: { ...delivery.rawBody },
      };
    }

    const result = await this.webhookDispatchService.dispatchAttempt({
      url: endpoint.url,
      deliveryId: delivery.deliveryId,
      eventType: delivery.eventType,
      tenantId: endpoint.tenantId,
      secretValue: signingSecret.secretValue,
      secretVersion: signingSecret.secretVersion,
      payload,
      attempt: delivery.attempt + 1,
      retryPolicy: endpoint.retryPolicy,
    });

    delivery.attempt = result.attempt;
    delivery.status = result.status;
    delivery.httpStatus = result.httpStatus;
    delivery.signature = result.signature;
    delivery.attemptedAt = result.attemptedAt;
    delivery.nextAttemptAt = result.nextAttemptAt;
    delivery.signatureHeader = result.signatureHeader;
    delivery.signatureVersion = result.signatureVersion;
    delivery.secretVersion = result.secretVersion;
    delivery.retryPolicySnapshot = this.toWebhookRetryPolicy(
      endpoint.retryPolicy,
    );
    delivery.rawBody = { ...result.rawBody };
    this.markWebhookSecretUsed(
      endpoint,
      signingSecret,
      `webhook_dispatch:${delivery.eventType}`,
      result.attemptedAt,
    );

    endpoint.runtimeMetadata = this.toWebhookRuntimeMetadata(
      {
        ...endpoint.runtimeMetadata,
        failedDeliveryCount:
          result.status === "delivery_failed" &&
          previousStatus !== "delivery_failed"
            ? endpoint.runtimeMetadata.failedDeliveryCount + 1
            : endpoint.runtimeMetadata.failedDeliveryCount,
        lastAttemptAt: result.attemptedAt,
        lastDeliveredAt:
          result.status === "delivered"
            ? result.attemptedAt
            : endpoint.runtimeMetadata.lastDeliveredAt,
        nextAttemptAt: result.nextAttemptAt,
        lastSignaturePreview: (result.signature ?? "").slice(0, 16),
        retryPolicy: endpoint.retryPolicy,
      },
      {
        currentVersion: endpoint.secretVersion,
        rotatedAt: endpoint.runtimeMetadata.secretRotation.rotatedAt,
        rotationCount: endpoint.runtimeMetadata.secretRotation.rotationCount,
        history: endpoint.runtimeMetadata.secretRotation.history,
      },
    );
    this.applyWebhookPostDispatchPolicy(
      endpoint,
      delivery,
      result,
      previousEndpointValues,
    );

    await this.persistChangesRequired(
      {
        webhookEndpoints: [this.cloneStoredWebhookEndpoint(endpoint)],
        webhookDeliveries: [this.cloneStoredWebhookDelivery(delivery)],
      },
      "webhook_dispatch_attempt",
    );

    if (result.status === "queued" && result.nextAttemptAt) {
      this.scheduleWebhookRetry(
        endpoint.webhookId,
        delivery.deliveryId,
        result.nextAttemptAt,
      );
    } else {
      this.clearWebhookRetry(delivery.deliveryId);
    }

    return result;
  }

  private applyWebhookPostDispatchPolicy(
    endpoint: StoredWebhookEndpoint,
    delivery: StoredWebhookDelivery,
    result: Awaited<ReturnType<WebhookDispatchService["dispatchAttempt"]>>,
    previousEndpointValues: Record<string, unknown>,
  ) {
    if (result.status === "delivered" && endpoint.status === "test_pending") {
      endpoint.status = "active";
      endpoint.updatedAt = result.attemptedAt;
      endpoint.runtimeMetadata.lastValidatedAt = result.attemptedAt;
      endpoint.runtimeMetadata.disabledAt = null;
      endpoint.runtimeMetadata.disableReason = null;
      endpoint.runtimeMetadata.disableReasonNote = null;

      this.recordTenantAudit({
        actorId: null,
        actorType: "system",
        tenantId: endpoint.tenantId,
        moduleName: "tenant-partner",
        actionName: "activate_webhook_endpoint",
        resourceType: "webhook_endpoint",
        resourceId: endpoint.webhookId,
        oldValuesSummary: previousEndpointValues,
        newValuesSummary: this.toWebhookResponse(endpoint) as Record<
          string,
          unknown
        >,
      });
      return;
    }

    if (result.status === "delivery_failed" && endpoint.status !== "disabled") {
      endpoint.status = "disabled";
      endpoint.updatedAt = result.attemptedAt;
      endpoint.runtimeMetadata.disabledAt = result.attemptedAt;
      endpoint.runtimeMetadata.disableReason = "delivery_failed";
      endpoint.runtimeMetadata.disableReasonNote = null;

      this.auditNotificationService.recordNotification({
        tenantId: endpoint.tenantId,
        recipientUserId: null,
        channel: "ops_notice",
        title: "Tenant webhook disabled after repeated delivery failures",
        message: [
          `Endpoint ${endpoint.webhookId} (${endpoint.url})`,
          `failed ${result.attempt} attempts for ${delivery.eventType}`,
          `and was disabled pending revalidation.`,
        ].join(" "),
        status: "unread",
      });
      this.recordTenantAudit({
        actorId: null,
        actorType: "system",
        tenantId: endpoint.tenantId,
        moduleName: "tenant-partner",
        actionName: "disable_webhook_endpoint",
        resourceType: "webhook_endpoint",
        resourceId: endpoint.webhookId,
        oldValuesSummary: previousEndpointValues,
        newValuesSummary: this.toWebhookResponse(endpoint) as Record<
          string,
          unknown
        >,
      });
    }
  }

  private markWebhookValidationPending(
    endpoint: StoredWebhookEndpoint,
    updatedAt: string,
  ) {
    endpoint.status = "test_pending";
    endpoint.updatedAt = updatedAt;
    endpoint.runtimeMetadata.disabledAt = null;
    endpoint.runtimeMetadata.disableReason = null;
    endpoint.runtimeMetadata.disableReasonNote = null;
    endpoint.runtimeMetadata.nextAttemptAt = null;
  }

  private schedulePersistedWebhookRetries() {
    for (const delivery of this.webhookDeliveries) {
      if (delivery.status !== "queued" || !delivery.nextAttemptAt) {
        continue;
      }

      const endpoint = this.webhookEndpoints.find(
        (candidate) => candidate.webhookId === delivery.webhookId,
      );
      if (!endpoint) {
        continue;
      }

      this.scheduleWebhookRetry(
        endpoint.webhookId,
        delivery.deliveryId,
        delivery.nextAttemptAt,
      );
    }
  }

  private scheduleWebhookRetry(
    webhookId: string,
    deliveryId: string,
    nextAttemptAt: string,
  ) {
    this.clearWebhookRetry(deliveryId);

    const delayMs = Math.max(0, new Date(nextAttemptAt).getTime() - Date.now());
    const timer = setTimeout(() => {
      this.retryTimers.delete(deliveryId);
      void this.retryQueuedWebhookDelivery(webhookId, deliveryId);
    }, delayMs);

    this.retryTimers.set(deliveryId, timer);
  }

  private clearWebhookRetry(deliveryId: string) {
    const timer = this.retryTimers.get(deliveryId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.retryTimers.delete(deliveryId);
  }

  retryWebhookDelivery(
    tenantId: string,
    webhookId: string,
    deliveryId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    this.assertNonBlank(tenantId, "tenantId");

    if (!this.canManageWebhook(identity)) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "TENANT_ROLE_MISSING",
        "Webhook retry requires tc_admin or tc_integration_mgr role.",
      );
    }

    const endpoint = this.webhookEndpoints.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.webhookId === webhookId,
    );
    if (!endpoint) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "WEBHOOK_ENDPOINT_NOT_FOUND",
        `Webhook endpoint ${webhookId} was not found for tenant ${tenantId}.`,
      );
    }

    const delivery = this.webhookDeliveries.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.webhookId === webhookId &&
        candidate.deliveryId === deliveryId,
    );
    if (!delivery) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "WEBHOOK_DELIVERY_NOT_FOUND",
        `Webhook delivery ${deliveryId} was not found for endpoint ${webhookId}.`,
      );
    }
    if (delivery.status !== "delivery_failed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "WEBHOOK_DELIVERY_NOT_RETRYABLE",
        "Only failed webhook deliveries can be retried manually.",
      );
    }

    this.clearWebhookRetry(delivery.deliveryId);
    delivery.status = "queued";
    delivery.nextAttemptAt = null;

    const now = new Date().toISOString();
    const previousEndpointValues = this.toWebhookResponse(endpoint, identity);
    if (endpoint.status === "disabled") {
      this.markWebhookValidationPending(endpoint, now);
      this.recordTenantAudit(
        {
          actorId: identity?.actorId ?? null,
          actorType:
            (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
            "system",
          tenantId,
          moduleName: "tenant-partner",
          actionName: "prepare_webhook_retry",
          resourceType: "webhook_endpoint",
          resourceId: endpoint.webhookId,
          oldValuesSummary: previousEndpointValues as Record<string, unknown>,
          newValuesSummary: this.toWebhookResponse(
            endpoint,
            identity,
          ) as Record<string, unknown>,
        },
        requestId,
      );
    }

    return this.retryQueuedWebhookDelivery(
      webhookId,
      deliveryId,
      requestId,
      identity,
    );
  }

  private async retryQueuedWebhookDelivery(
    webhookId: string,
    deliveryId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    const endpoint = this.webhookEndpoints.find(
      (candidate) => candidate.webhookId === webhookId,
    );
    const delivery = this.webhookDeliveries.find(
      (candidate) => candidate.deliveryId === deliveryId,
    );

    if (!endpoint || !delivery || delivery.status !== "queued") {
      this.clearWebhookRetry(deliveryId);
      if (!endpoint || !delivery) {
        return undefined;
      }
      return this.toDeliveryResponse(delivery, identity);
    }

    await this.dispatchWebhookAttempt(endpoint, delivery, delivery.rawBody);

    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId: endpoint.tenantId,
        moduleName: "tenant-partner",
        actionName: "retry_webhook_delivery",
        resourceType: "webhook_delivery",
        resourceId: delivery.deliveryId,
        newValuesSummary: {
          webhookId: endpoint.webhookId,
          eventType: delivery.eventType,
          status: delivery.status,
          attempt: delivery.attempt,
          httpStatus: delivery.httpStatus,
          nextAttemptAt: delivery.nextAttemptAt,
        },
      },
      requestId,
    );

    return this.toDeliveryResponse(delivery, identity);
  }

  listWebhookDeliveries(
    tenantId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "webhook_delivery",
      identity,
      tenantId,
    });
    const items = this.webhookDeliveries
      .filter((delivery) => delivery.tenantId === tenantId)
      .map((delivery) => this.toDeliveryResponse(delivery, identity));
    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId,
        moduleName: "tenant-partner",
        actionName: policy.auditAction,
        resourceType: "webhook_delivery",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
        }),
      },
      requestId,
    );
    return items;
  }

  listWebhookDeliveriesByWebhook(
    tenantId: string,
    webhookId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "webhook_delivery",
      identity,
      tenantId,
    });
    const items = this.webhookDeliveries
      .filter(
        (delivery) =>
          delivery.tenantId === tenantId && delivery.webhookId === webhookId,
      )
      .map((delivery) => this.toDeliveryResponse(delivery, identity));
    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId,
        moduleName: "tenant-partner",
        actionName: policy.auditAction,
        resourceType: "webhook_delivery",
        resourceId: webhookId,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "read", {
          itemCount: items.length,
          webhookId,
        }),
      },
      requestId,
    );
    return items;
  }

  rotateWebhookSecret(
    tenantId: string,
    command: RotateWebhookSecretCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.secret, "secret");

    const endpoint = this.requireWebhookEndpoint(tenantId, command.webhookId);
    const oldValues = this.toWebhookResponse(endpoint);

    const rotatedAt = new Date().toISOString();
    const secretPreview = this.secretPreview(command.secret);
    const rotationReason = command.rotationReason?.trim() || null;
    const overlapEndsAt = this.resolveCredentialOverlapEndsAt(
      rotatedAt,
      command.overlapDays,
    );
    const currentSecret = this.resolveWebhookSecretMaterial(
      endpoint,
      endpoint.secretVersion,
      rotatedAt,
    );
    if (!currentSecret) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "WEBHOOK_SECRET_NOT_CONFIGURED",
        "The current webhook secret could not be resolved.",
        {
          webhookId: endpoint.webhookId,
          secretVersion: endpoint.secretVersion,
        },
      );
    }

    // Recovering from an expired or revoked secret is a legitimate reason to
    // rotate, but the dead secret is retired outright: only a still-live secret
    // earns an overlap window, so signing material is never resurrected.
    const currentSecretIsLive =
      currentSecret.status === "active" ||
      currentSecret.status === "overlap_active";
    const grantedOverlapEndsAt = currentSecretIsLive ? overlapEndsAt : null;
    currentSecret.overlapEndsAt = grantedOverlapEndsAt;
    currentSecret.supersededByVersion = endpoint.secretVersion + 1;
    if (currentSecretIsLive) {
      currentSecret.autoRevokedAt = null;
      currentSecret.status = "overlap_active";
      currentSecret.revokedAt = null;
    }
    currentSecret.signals = this.buildCredentialSignals(
      currentSecret.lastUsedAt,
      currentSecret.expiresAt ?? null,
      currentSecret.autoRevokedAt ?? null,
      rotatedAt,
    );

    const owner = this.resolveCredentialOwner(command, {
      ownerRef: endpoint.ownerRef ?? null,
      ownerName: endpoint.ownerName ?? "Tenant webhook integration owner",
      ownerType: endpoint.ownerType ?? "tenant_admin",
    });
    const nextSecretExpiresAt = this.resolveWebhookSecretExpiry(
      command.expiresAt ?? null,
      rotatedAt,
    );
    const nextSecret: StoredWebhookSecretMaterial = {
      createdAt: rotatedAt,
      secretVersion: endpoint.secretVersion + 1,
      rotatedAt,
      rotationReason,
      secretPreview,
      secretValue: command.secret,
      ownerRef: owner.ownerRef,
      ownerName: owner.ownerName,
      ownerType: owner.ownerType,
      purpose: this.resolveCredentialPurpose(
        command.purpose ?? endpoint.purpose,
        "tenant webhook signing secret",
      ),
      expiresAt: nextSecretExpiresAt,
      lastUsedAt: null,
      lastUsedWorkload: null,
      status: "active",
      overlapEndsAt: null,
      autoRevokedAt: null,
      supersededByVersion: null,
      revokedAt: null,
      signals: this.buildCredentialSignals(
        null,
        nextSecretExpiresAt,
        null,
        rotatedAt,
      ),
    };

    endpoint.secretVersion = nextSecret.secretVersion;
    endpoint.secretValue = command.secret;
    endpoint.secretPreview = secretPreview;
    endpoint.secretCredentials = [
      nextSecret,
      ...(endpoint.secretCredentials ?? []).map(
        (record): StoredWebhookSecretMaterial => ({
          ...record,
          createdAt: record.createdAt ?? record.rotatedAt,
          status: record.status ?? "active",
          signals:
            record.signals ??
            this.buildCredentialSignals(
              record.lastUsedAt ?? null,
              record.expiresAt ??
                this.addDaysToIso(
                  rotatedAt,
                  DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS,
                ),
              record.autoRevokedAt ?? null,
              rotatedAt,
            ),
        }),
      ),
    ];
    endpoint.ownerRef = owner.ownerRef;
    endpoint.ownerName = owner.ownerName;
    endpoint.ownerType = owner.ownerType;
    endpoint.purpose = nextSecret.purpose;
    endpoint.updatedAt = rotatedAt;
    this.reconcileStoredWebhookEndpoint(endpoint, rotatedAt);
    this.markWebhookValidationPending(endpoint, rotatedAt);
    this.persistChanges(
      {
        webhookEndpoints: [this.cloneStoredWebhookEndpoint(endpoint)],
      },
      "rotate_webhook_secret",
    );

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "rotate_webhook_secret",
        resourceType: "webhook_endpoint",
        resourceId: endpoint.webhookId,
        oldValuesSummary: oldValues,
        newValuesSummary: {
          secretVersion: endpoint.secretVersion,
          rotationCount: endpoint.secretHistory.length,
          rotationReason,
          secretPreview: endpoint.secretPreview,
          secretExpiresAt: endpoint.secretExpiresAt,
          overlapEndsAt: grantedOverlapEndsAt,
          status: endpoint.status,
        },
      },
      requestId,
    );

    return {
      webhookId: endpoint.webhookId,
      secretVersion: endpoint.secretVersion,
      secretPreview: endpoint.secretPreview,
      rotationCount: endpoint.secretHistory.length,
      rotatedAt,
      overlapEndsAt: grantedOverlapEndsAt,
    };
  }

  getSlaProfile(tenantId: string) {
    return { ...this.getOrCreateSlaProfile(tenantId) };
  }

  getSlaProfileView(tenantId: string): TenantSlaProfileView {
    const profile = this.slaProfiles.get(tenantId);
    const availableActions = this.buildTenantSlaAvailableActions(profile);
    const refreshMetadata: UiRefreshMetadata = {
      generatedAt: new Date().toISOString(),
      staleAfterMs: 30_000,
      dataFreshness: "fresh",
      source: "live",
    };
    const tenantAuditLogs = this.auditNotificationService
      .listAuditLogs()
      .filter((auditLog) => auditLog.tenantId === tenantId);

    return {
      profile: profile ? this.cloneSlaProfile(profile) : null,
      emptyState: profile
        ? null
        : availableActions[0]
          ? ({
              reason: "not_provisioned",
              messageCode: "tenant.sla.not_provisioned",
              nextAction: availableActions[0],
            } satisfies EmptyStateEnvelope)
          : ({
              reason: "not_provisioned",
              messageCode: "tenant.sla.not_provisioned",
            } satisfies EmptyStateEnvelope),
      availableActions,
      refreshTier: "slow",
      refreshMetadata,
      resourceLinks: [
        {
          targetApp: "tenant-console",
          route: "/integration-governance",
          resourceType: "tenant_integration_governance",
          resourceId: tenantId,
          openMode: "same_tab",
          label: "查看整合就緒度",
        },
        {
          targetApp: "tenant-console",
          route: "/audit?resourceType=tenant_sla",
          resourceType: "tenant_sla_audit",
          resourceId: tenantId,
          openMode: "same_tab",
          label: "查看 SLA 稽核軌跡",
        },
        {
          targetApp: "tenant-console",
          route: "/settings",
          resourceType: "tenant_settings",
          resourceId: tenantId,
          openMode: "same_tab",
          label: "返回租戶設定總覽",
        },
        {
          targetApp: "ops-console",
          route: `/complaints?tenantId=${encodeURIComponent(tenantId)}&slaBreached=true`,
          resourceType: "complaint",
          resourceId: tenantId,
          openMode: "new_tab",
          label: "前往 Ops Console 檢視 SLA 違規客訴",
        },
      ],
      updatedBy: this.pickTenantSlaUpdatedBy(tenantAuditLogs),
      lastRecalculationAt:
        this.pickTenantSlaLastRecalculationAt(tenantAuditLogs),
    };
  }

  updateSlaProfile(
    tenantId: string,
    command: UpdateTenantSlaProfileCommand,
    actorId?: string,
    requestId?: string,
  ): ActionReceipt {
    const currentProfile = this.getOrCreateSlaProfile(tenantId);
    const slaProfile: TenantSlaProfile = {
      tenantId,
      waitThresholdMin:
        command.waitThresholdMin ?? currentProfile.waitThresholdMin,
      arrivalThresholdMin:
        command.arrivalThresholdMin ?? currentProfile.arrivalThresholdMin,
      completionThresholdMin:
        command.completionThresholdMin ?? currentProfile.completionThresholdMin,
      updatedAt: new Date().toISOString(),
    };
    this.slaProfiles.set(tenantId, this.cloneSlaProfile(slaProfile));
    this.persistChanges(
      {
        slaProfiles: [this.cloneSlaProfile(slaProfile)],
      },
      "update_sla_profile",
    );

    this.recordTenantAudit(
      {
        actorId: actorId ?? null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "update_sla_profile",
        resourceType: "tenant_sla",
        resourceId: tenantId,
        newValuesSummary: {
          waitThresholdMin: slaProfile.waitThresholdMin,
          arrivalThresholdMin: slaProfile.arrivalThresholdMin,
          completionThresholdMin: slaProfile.completionThresholdMin,
          reason: command.reason ?? null,
        },
      },
      requestId,
    );

    return {
      actionId: randomUUID(),
      auditId: requestId ?? randomUUID(),
      resourceType: "tenant_sla",
      resourceId: tenantId,
      status: "completed",
      message: "SLA profile updated.",
    };
  }

  recalculateSlaBookings(
    tenantId: string,
    command: RecalculateTenantSlaBookingsCommand,
    actorId?: string,
    requestId?: string,
  ): ActionReceipt {
    const normalizedReason = command.reason?.trim();
    if (!normalizedReason) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "SLA_RECALCULATE_REASON_REQUIRED",
        "A non-empty reason is required to recalculate existing bookings.",
      );
    }

    this.recordTenantAudit(
      {
        actorId: actorId ?? null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "recalculate_sla_bookings",
        resourceType: "tenant_sla",
        resourceId: tenantId,
        newValuesSummary: {
          reason: normalizedReason,
          requestedAt: new Date().toISOString(),
        },
      },
      requestId,
    );

    return {
      actionId: randomUUID(),
      auditId: requestId ?? randomUUID(),
      resourceType: "tenant_sla",
      resourceId: tenantId,
      status: "accepted",
      message:
        "SLA recalculation was accepted. Existing bookings will be recomputed asynchronously.",
    };
  }

  revokeApiKey(
    tenantId: string,
    apiKeyId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    this.assertTenantMutationScope(tenantId, identity);
    const apiKey = this.requireApiKey(tenantId, apiKeyId);
    if (!apiKey.revokedAt) {
      const before = this.cloneStoredApiKey(apiKey);
      const previousApiKeys = this.apiKeys.map((entry) =>
        this.cloneStoredApiKey(entry),
      );
      const securityActor = this.requireSecurityEventActor(identity, tenantId);
      apiKey.revokedAt = new Date().toISOString();
      apiKey.revokeReason = "manual_revoke";
      apiKey.status = "revoked";
      apiKey.overlapEndsAt = null;
      const persisted = this.persistIdentityGovernanceMutation({
        changes: { apiKeys: [this.cloneStoredApiKey(apiKey)] },
        context: "revoke_api_key",
        rollback: () => {
          this.apiKeys = previousApiKeys.map((entry) =>
            this.cloneStoredApiKey(entry),
          );
        },
        event: securityActor
          ? {
              actorId: securityActor.actorId,
              actorType: securityActor.actorType,
              subjectId: securityActor.actorId,
              realm: securityActor.realm,
              tenantId,
              partnerId: null,
              eventType: "tenant_api_key.revoked",
              eventFamily: "credential",
              outcome: "revoked",
              severity: "high",
              targetType: "tenant_api_key",
              targetId: apiKey.apiKeyId,
              sessionId: null,
              tokenId: null,
              authMethods: [securityActor.authMode],
              sourceIp: null,
              userAgent: null,
              requestId: requestId ?? null,
              traceId: null,
              reasonCode: null,
              approvalId: null,
              beforeSummary: this.toApiKeyResponse(before),
              afterSummary: this.toApiKeyResponse(apiKey),
              maskedContext: {
                keyPrefix: apiKey.keyPrefix,
              },
            }
          : null,
      });

      return this.afterPersistence(persisted, () => {
        this.recordTenantAudit(
          {
            actorId: null,
            actorType: "tenant_admin",
            tenantId,
            moduleName: "tenant-partner",
            actionName: "revoke_api_key",
            resourceType: "tenant_api_key",
            resourceId: apiKey.apiKeyId,
            newValuesSummary: this.toApiKeyResponse(apiKey),
          },
          requestId,
        );

        return { status: "revoked", apiKeyId };
      });
    }
    return { status: "revoked", apiKeyId };
  }

  listTenantAudit(
    tenantId: string,
    requestId?: string,
    identity?: IdentityContext | null,
  ) {
    const policy = assertEvidenceAccess({
      family: "audit_log",
      identity,
      tenantId,
    });
    const items = this.auditNotificationService
      .listAuditLogs(identity, requestId)
      .filter((auditLog) => auditLog.tenantId === tenantId);
    this.recordTenantAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType:
          (identity?.actorType as AuditLogRecord["actorType"] | undefined) ??
          "system",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "view_tenant_audit_evidence",
        resourceType: "audit_log",
        resourceId: null,
        newValuesSummary: buildEvidenceAccessAuditSummary(policy, "list", {
          itemCount: items.length,
        }),
      },
      requestId,
    );
    return items;
  }

  private buildIssuedApiKey(
    tenantId: string,
    input: {
      keyName: string;
      scopes: string[];
      ownerRef?: string | null;
      ownerName?: string | null;
      ownerType?: string | null;
      purpose?: string | null;
      expiresAt: string | null;
    },
    previousApiKey: StoredTenantApiKeyRecord | null,
  ) {
    const now = new Date().toISOString();
    const plaintextKey = `tk_${randomBytes(18).toString("hex")}`;
    const normalizedScopes = this.normalizeTenantApiKeyScopes(input.scopes);
    const expiresAt = this.resolveTenantApiKeyExpiry(input.expiresAt);
    const owner = this.resolveCredentialOwner(input, {
      ownerRef: null,
      ownerName: "Unassigned tenant integration owner",
      ownerType: "unknown",
    });
    const storedApiKey: StoredTenantApiKeyRecord = {
      apiKeyId: `api_key_${randomUUID()}`,
      tenantId,
      keyName: input.keyName.trim(),
      keyPrefix: plaintextKey.slice(0, 12),
      maskedSuffix: this.maskedSuffix(plaintextKey),
      ownerRef: owner.ownerRef,
      ownerName: owner.ownerName,
      ownerType: owner.ownerType,
      purpose: this.resolveCredentialPurpose(
        input.purpose,
        `${input.keyName.trim()} integration credential`,
      ),
      realm: "tenant",
      resourceScope: `tenant:${tenantId}`,
      scopes: normalizedScopes,
      lastUsedAt: null,
      lastUsedWorkload: null,
      expiresAt,
      status: "active",
      overlapEndsAt: null,
      autoRevokedAt: null,
      rotatedFromApiKeyId: previousApiKey?.apiKeyId ?? null,
      supersededByApiKeyId: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: now,
      signals: this.buildCredentialSignals(null, expiresAt, null, now),
      keyHash: this.hashSecret(plaintextKey),
    };

    return {
      storedApiKey,
      plaintextKey,
      revokedApiKeyId: previousApiKey?.apiKeyId ?? null,
    };
  }

  private buildTenantApiKeyGovernancePolicy(): TenantApiKeyGovernancePolicy {
    return {
      allowedScopes: [...CANONICAL_TENANT_API_KEY_SCOPES].sort(),
      compatibilityAliases: { ...TENANT_API_KEY_SCOPE_ALIASES },
      defaultLifetimeDays: DEFAULT_TENANT_API_KEY_LIFETIME_DAYS,
      maxLifetimeDays: MAX_TENANT_API_KEY_LIFETIME_DAYS,
      rotationOverlapDays: DEFAULT_CREDENTIAL_ROTATION_OVERLAP_DAYS,
      approachingExpiryThresholdDays:
        CREDENTIAL_APPROACHING_EXPIRY_THRESHOLD_DAYS,
      dormantUseThresholdDays: CREDENTIAL_DORMANT_THRESHOLD_DAYS,
      requireExpiry: true,
      breakGlassRequiresPlatformApproval: true,
      revokeEffect: "immediate",
    };
  }

  private buildTenantWebhookGovernancePolicy(): TenantWebhookGovernancePolicy {
    return {
      testEventType: "tenant.webhook.test",
      autoDisableAfterConsecutiveFailures:
        DEFAULT_WEBHOOK_RETRY_POLICY.maxAttempts,
      rotationOverlapDays: DEFAULT_CREDENTIAL_ROTATION_OVERLAP_DAYS,
      approachingExpiryThresholdDays:
        CREDENTIAL_APPROACHING_EXPIRY_THRESHOLD_DAYS,
      dormantUseThresholdDays: CREDENTIAL_DORMANT_THRESHOLD_DAYS,
      revalidationRequiredOnCreate: true,
      revalidationRequiredOnEndpointMutation: true,
      revalidationRequiredOnSecretRotation: true,
      deliveryFailureNotificationChannel: "ops_notice",
      retryPolicy: this.cloneWebhookRetryPolicy(DEFAULT_WEBHOOK_RETRY_POLICY),
    };
  }

  private cloneWebhookRetryPolicy(
    retryPolicy: WebhookRetryPolicy,
  ): WebhookRetryPolicyRecord {
    return {
      maxAttempts: retryPolicy.maxAttempts,
      initialBackoffSeconds: retryPolicy.initialBackoffSeconds,
      backoffMultiplier: retryPolicy.backoffMultiplier,
      maxBackoffSeconds: retryPolicy.maxBackoffSeconds,
      retryableStatusCodes: [...retryPolicy.retryableStatusCodes],
    };
  }

  private normalizeTenantApiKeyScopes(scopes: string[]): string[] {
    const normalized = [
      ...new Set(
        scopes
          .map((scope) => this.requireNonBlank(scope, "scope"))
          .map((scope) => TENANT_API_KEY_SCOPE_ALIASES[scope] ?? scope),
      ),
    ];

    if (normalized.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_API_KEY_SCOPES_REQUIRED",
        "At least one tenant API key scope must be provided.",
        {},
      );
    }

    const unsupported = normalized.filter(
      (scope) => !CANONICAL_TENANT_API_KEY_SCOPES.has(scope),
    );
    if (unsupported.length > 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "UNSUPPORTED_TENANT_API_KEY_SCOPE",
        "One or more tenant API key scopes are not supported.",
        {
          scopes: unsupported,
          allowedScopes: [...CANONICAL_TENANT_API_KEY_SCOPES].sort(),
        },
      );
    }

    return normalized.sort((left, right) => left.localeCompare(right));
  }

  private resolveTenantApiKeyExpiry(expiresAt: string | null): string {
    const now = Date.now();
    const fallbackExpiry = new Date(
      now + DEFAULT_TENANT_API_KEY_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    if (!expiresAt) {
      return fallbackExpiry;
    }

    const parsed = Date.parse(expiresAt);
    if (Number.isNaN(parsed)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_API_KEY_EXPIRY_INVALID",
        "expiresAt must be a valid ISO timestamp.",
        {
          expiresAt,
        },
      );
    }
    if (parsed <= now) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_API_KEY_EXPIRY_PAST",
        "expiresAt must be in the future.",
        {
          expiresAt,
        },
      );
    }

    const maxExpiry =
      now + MAX_TENANT_API_KEY_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
    if (parsed > maxExpiry) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_API_KEY_EXPIRY_TOO_FAR",
        "expiresAt exceeds the tenant API key maximum lifetime.",
        {
          expiresAt,
          maxLifetimeDays: MAX_TENANT_API_KEY_LIFETIME_DAYS,
        },
      );
    }

    return new Date(parsed).toISOString();
  }

  private canManageWebhook(identity?: IdentityContext | null) {
    if (!identity) {
      return true;
    }
    if (identity.actorType === "tenant_admin") {
      return true;
    }
    return identity.roles.some(
      (role) => role === "tc_admin" || role === "tc_integration_mgr",
    );
  }

  private buildWebhookManagementActions(
    identity?: IdentityContext | null,
  ): ResourceActionDescriptor[] {
    const canManage = this.canManageWebhook(identity);
    return [
      {
        action: "payload_schema",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "createWebhookEndpoint",
        enabled: canManage,
        riskLevel: "medium",
        ...(canManage ? {} : { disabledReasonCode: "tenant_role_missing" }),
      },
    ];
  }

  private buildWebhookEndpointActions(
    endpoint: StoredWebhookEndpoint,
    identity?: IdentityContext | null,
  ): ResourceActionDescriptor[] {
    const canManage = this.canManageWebhook(identity);
    return [
      {
        action: "updateWebhookEndpoint",
        enabled: canManage,
        riskLevel: "medium",
        ...(canManage ? {} : { disabledReasonCode: "tenant_role_missing" }),
      },
      {
        action: "disableWebhookEndpoint",
        enabled: canManage && endpoint.status !== "disabled",
        requiresReason: true,
        riskLevel: "high",
        ...(endpoint.status === "disabled"
          ? { disabledReasonCode: "already_disabled" }
          : canManage
            ? {}
            : { disabledReasonCode: "tenant_role_missing" }),
      },
      {
        action: "deleteWebhookEndpoint",
        enabled: canManage,
        requiresReason: true,
        riskLevel: "high",
        ...(canManage ? {} : { disabledReasonCode: "tenant_role_missing" }),
      },
      {
        action: "rotateWebhookSecret",
        enabled: canManage,
        requiresReason: true,
        riskLevel: "high",
        ...(canManage ? {} : { disabledReasonCode: "tenant_role_missing" }),
      },
      {
        action: "viewDeliveryLog",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "retryFailedDelivery",
        enabled: false,
        disabledReasonCode: "backend_retry_endpoint_pending",
        riskLevel: "medium",
      },
    ];
  }

  private buildWebhookDeliveryActions(
    delivery: StoredWebhookDelivery,
    identity?: IdentityContext | null,
  ): ResourceActionDescriptor[] {
    const canManage = this.canManageWebhook(identity);
    return [
      {
        action: "viewDeliveryLog",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "retryFailedDelivery",
        enabled: delivery.status === "delivery_failed" && canManage,
        riskLevel: "medium",
        ...(delivery.status === "delivery_failed"
          ? canManage
            ? {}
            : { disabledReasonCode: "tenant_role_missing" }
          : { disabledReasonCode: "delivery_not_failed" }),
      },
    ];
  }

  private toWebhookResponse(
    endpoint: StoredWebhookEndpoint,
    identity?: IdentityContext | null,
  ) {
    return {
      webhookId: endpoint.webhookId,
      tenantId: endpoint.tenantId,
      url: endpoint.url,
      events: [...endpoint.events],
      status: endpoint.status,
      ownerRef: endpoint.ownerRef ?? null,
      ownerName: endpoint.ownerName ?? null,
      ownerType: endpoint.ownerType ?? null,
      purpose: endpoint.purpose ?? null,
      resourceScope: endpoint.resourceScope ?? null,
      secretVersion: endpoint.secretVersion,
      secretPreview: endpoint.secretPreview,
      secretExpiresAt: endpoint.secretExpiresAt ?? null,
      secretLastUsedAt: endpoint.secretLastUsedAt ?? null,
      secretLastUsedWorkload: endpoint.secretLastUsedWorkload ?? null,
      credentialStatus: endpoint.credentialStatus ?? "active",
      rotationOverlapEndsAt: endpoint.rotationOverlapEndsAt ?? null,
      credentialSignals: this.toCredentialSignals(endpoint.credentialSignals),
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
      availableActions: this.buildWebhookEndpointActions(endpoint, identity),
      retryPolicy: this.toWebhookRetryPolicy(endpoint.retryPolicy),
      // Projected, not spread: a webhook read must never carry secret material
      // even if a stored record was hydrated with it.
      runtimeMetadata: this.toWebhookRuntimeMetadata(endpoint.runtimeMetadata),
      secretHistory: (endpoint.secretHistory ?? []).map((record) =>
        this.toWebhookSecretHistoryRecord(record),
      ),
    };
  }

  private toDeliveryResponse(
    delivery: StoredWebhookDelivery,
    identity?: IdentityContext | null,
  ) {
    return {
      deliveryId: delivery.deliveryId,
      webhookId: delivery.webhookId,
      tenantId: delivery.tenantId,
      eventType: delivery.eventType,
      attempt: delivery.attempt,
      status: delivery.status,
      httpStatus: delivery.httpStatus,
      signature: previewOpaqueValue(delivery.signature, 20) ?? "",
      createdAt: delivery.createdAt,
      availableActions: this.buildWebhookDeliveryActions(delivery, identity),
      attemptedAt: delivery.attemptedAt,
      nextAttemptAt: delivery.nextAttemptAt,
      signatureVersion: delivery.signatureVersion,
      secretVersion: delivery.secretVersion,
    };
  }

  private toApiKeyResponse(
    apiKey: StoredTenantApiKeyRecord,
  ): TenantApiKeyRecord & Record<string, unknown> {
    const signals = this.materializeCredentialSignals(
      apiKey.signals,
      apiKey.lastUsedAt,
      apiKey.expiresAt ?? null,
      apiKey.autoRevokedAt ?? null,
    );
    return {
      apiKeyId: apiKey.apiKeyId,
      tenantId: apiKey.tenantId,
      keyName: apiKey.keyName,
      keyPrefix: apiKey.keyPrefix,
      maskedSuffix: apiKey.maskedSuffix,
      ownerRef: apiKey.ownerRef ?? null,
      ownerName: apiKey.ownerName ?? null,
      ownerType: apiKey.ownerType ?? null,
      purpose: apiKey.purpose ?? null,
      realm: apiKey.realm ?? "tenant",
      resourceScope: apiKey.resourceScope ?? null,
      scopes: [...apiKey.scopes],
      lastUsedAt: apiKey.lastUsedAt,
      lastUsedWorkload: apiKey.lastUsedWorkload ?? null,
      expiresAt: apiKey.expiresAt,
      status: apiKey.status ?? "active",
      overlapEndsAt: apiKey.overlapEndsAt ?? null,
      autoRevokedAt: apiKey.autoRevokedAt ?? null,
      rotatedFromApiKeyId: apiKey.rotatedFromApiKeyId ?? null,
      supersededByApiKeyId: apiKey.supersededByApiKeyId ?? null,
      revokedAt: apiKey.revokedAt,
      revokeReason: apiKey.revokeReason ?? null,
      createdAt: apiKey.createdAt,
      signals,
    };
  }

  private buildPassengerAuditSummary(passenger: TenantPassengerRecord) {
    return {
      passengerId: passenger.passengerId,
      tenantId: passenger.tenantId,
      fullName: maskName(passenger.fullName),
      employeeNo: passenger.employeeNo,
      departmentName: passenger.departmentName,
      mobile: maskPhone(passenger.mobile),
      email: maskEmail(passenger.email),
      roles: [...(passenger.roles ?? [])],
      qualityIssues: [...(passenger.qualityIssues ?? [])],
      activeFlag: passenger.activeFlag,
      metadataKeys: Object.keys(passenger.metadata).sort(),
      createdAt: passenger.createdAt,
      updatedAt: passenger.updatedAt,
    };
  }

  private buildAddressAuditSummary(address: TenantAddressRecord) {
    return {
      addressId: address.addressId,
      tenantId: address.tenantId,
      ownerPassengerId: address.ownerPassengerId,
      addressName: address.addressName,
      addressText: maskAddress(address.addressText),
      normalizedAddressText: address.normalizedAddressText ?? null,
      sensitiveFlag: address.sensitiveFlag ?? false,
      geocodeSource: address.geocodeSource ?? "none",
      qualityIssues: [...(address.qualityIssues ?? [])],
      coordinatesRedacted: address.lat !== null || address.lng !== null,
      tags: [...address.tags],
      activeFlag: address.activeFlag,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }

  private buildCostCenterAuditSummary(costCenter: TenantCostCenterRecord) {
    return {
      tenantId: costCenter.tenantId,
      code: costCenter.code,
      name: costCenter.name,
      description: costCenter.description,
      ownerUserId: costCenter.ownerUserId,
      ownerName: costCenter.ownerName,
      activeFlag: costCenter.activeFlag,
      disabledAt: costCenter.disabledAt,
      disabledReason: costCenter.disabledReason,
      createdAt: costCenter.createdAt,
      updatedAt: costCenter.updatedAt,
    };
  }

  private buildTenantUserAuditSummary(userRole: TenantUserRoleRecord) {
    return {
      userId: userRole.userId,
      tenantId: userRole.tenantId,
      email: maskEmail(userRole.email),
      displayName: maskName(userRole.displayName),
      roleCode: userRole.roleCode,
      status: userRole.status,
      approvalNotificationOptOut: userRole.approvalNotificationOptOut,
      invitedAt: userRole.invitedAt,
      updatedAt: userRole.updatedAt,
    };
  }

  private assertTenantMutationScope(
    targetTenantId: string,
    identity?: IdentityContext | null,
  ) {
    if (!identity) {
      return;
    }

    const isPlatformOrSystem =
      identity.realm === "platform" ||
      identity.realm === "system" ||
      identity.actorType === "platform_admin" ||
      identity.actorType === "system" ||
      identity.roleFamilies?.includes("platform");

    if (isPlatformOrSystem) {
      return;
    }

    if (!identity.tenantId || identity.tenantId !== targetTenantId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "TENANT_SCOPE_MISMATCH",
        "Cross-tenant identity mutation is forbidden. Principal tenantId does not match target tenantId.",
        {
          targetTenantId,
          principalTenantId: identity.tenantId ?? null,
        },
      );
    }
  }

  private requireSecurityEventActor(
    identity: IdentityContext | null | undefined,
    tenantId: string,
  ) {
    if (!this.securityEventsService) {
      return null;
    }
    if (!identity?.actorId) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTHENTICATION_REQUIRED",
        "Authenticated actor identity is required for privileged identity mutations.",
        {
          tenantId,
        },
      );
    }

    return {
      actorId: identity.actorId,
      actorType: identity.actorType,
      realm: identity.realm,
      authMode: identity.authMode,
      tenantId: identity.tenantId ?? tenantId,
      partnerId: identity.partnerId ?? null,
    };
  }

  private persistIdentityGovernanceMutation(params: {
    changes: IdentityGovernanceChanges;
    context: string;
    rollback: () => void;
    event: CreateSecurityEventInput | null;
  }): MaybePromise<void> {
    const event = params.event;

    if (!this.securityEventsService || !event) {
      this.persistChanges(params.changes, params.context);
      return;
    }

    const canUseTransaction =
      Boolean(this.tenantPartnerRepository?.isEnabled()) &&
      this.securityEventsService.isEnabled();

    if (canUseTransaction && this.tenantPartnerRepository) {
      return this.tenantPartnerRepository
        .withTransaction(async (executor) => {
          await this.tenantPartnerRepository!.persistIdentityGovernanceChanges(
            executor,
            params.changes,
          );
          await this.securityEventsService!.recordEventRequired(
            event,
            executor,
          );
        })
        .catch((error) => {
          this.tenantPartnerRepository?.reportPersistenceFailure(
            error,
            params.context,
          );
          params.rollback();
          throw error;
        });
    }

    return this.securityEventsService
      .recordEventRequired(event)
      .then(() => {
        this.persistChanges(params.changes, params.context);
      })
      .catch((error) => {
        params.rollback();
        throw error;
      });
  }

  private cloneNotificationPreferences(
    preferences: TenantNotificationPreferences,
  ): TenantNotificationPreferences {
    return {
      ...preferences,
      subscriptions: preferences.subscriptions.map((subscription) => ({
        ...subscription,
      })),
    };
  }

  private cloneSlaProfile(profile: TenantSlaProfile): TenantSlaProfile {
    return { ...profile };
  }

  private buildTenantSlaAvailableActions(
    profile: TenantSlaProfile | undefined,
  ): ResourceActionDescriptor[] {
    return [
      {
        action: "update_sla_profile",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      },
      {
        action: "recalculate_sla_bookings",
        enabled: Boolean(profile),
        riskLevel: "high",
        requiresReason: true,
        ...(profile ? {} : { disabledReasonCode: "sla_not_provisioned" }),
      },
    ];
  }

  private pickTenantSlaUpdatedBy(
    auditLogs: readonly AuditLogRecord[],
  ): string | null {
    const auditLog = [...auditLogs]
      .filter((entry) => entry.actionName === "update_sla_profile")
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      )[0];

    return auditLog?.actorId ?? auditLog?.actorType ?? null;
  }

  private pickTenantSlaLastRecalculationAt(
    auditLogs: readonly AuditLogRecord[],
  ): string | null {
    const auditLog = [...auditLogs]
      .filter((entry) => entry.actionName === "recalculate_sla_bookings")
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      )[0];

    return auditLog?.createdAt ?? null;
  }

  private clonePassenger(
    passenger: TenantPassengerRecord,
  ): TenantPassengerRecord {
    return {
      ...passenger,
      roles: [...(passenger.roles ?? [])],
      qualityIssues: [...(passenger.qualityIssues ?? [])],
      metadata: { ...passenger.metadata },
    };
  }

  private cloneAddress(address: TenantAddressRecord): TenantAddressRecord {
    return {
      ...address,
      qualityIssues: [...(address.qualityIssues ?? [])],
      tags: [...address.tags],
    };
  }

  private cloneCostCenter(
    costCenter: TenantCostCenterRecord,
  ): TenantCostCenterRecord {
    return {
      ...costCenter,
    };
  }

  private cloneUserRole(userRole: TenantUserRoleRecord): TenantUserRoleRecord {
    return {
      ...userRole,
    };
  }

  private clonePartnerEntry(
    entry: PartnerChannelEntryRecord,
  ): PartnerChannelEntryRecord {
    const eligibilityContract =
      entry.eligibilityContract ?? this.buildPartnerEligibilityContract(entry);
    return {
      ...entry,
      brandingMetadata: entry.brandingMetadata
        ? { ...entry.brandingMetadata }
        : null,
      eligibilityContract: eligibilityContract
        ? this.clonePartnerEligibilityContract(eligibilityContract)
        : null,
      auditMetadata: { ...entry.auditMetadata },
    };
  }

  private cloneStoredPartnerIngressCredential(
    credential: StoredPartnerIngressCredentialRecord,
  ): StoredPartnerIngressCredentialRecord {
    const nowIso = new Date().toISOString();
    const cloned: StoredPartnerIngressCredentialRecord = {
      ...credential,
      scopes: [...(credential.scopes ?? [])],
      signals: this.materializeCredentialSignals(
        credential.signals,
        credential.lastUsedAt,
        credential.expiresAt ?? null,
        credential.autoRevokedAt ?? null,
        nowIso,
      ),
    };
    this.reconcileStoredPartnerIngressCredential(cloned, nowIso);
    return cloned;
  }

  private toPartnerIngressCredentialResponse(
    credential: StoredPartnerIngressCredentialRecord,
  ): PartnerIngressCredentialRecord {
    const signals = this.materializeCredentialSignals(
      credential.signals,
      credential.lastUsedAt,
      credential.expiresAt ?? null,
      credential.autoRevokedAt ?? null,
    );
    return {
      keyId: credential.keyId,
      entrySlug: credential.entrySlug,
      keyPrefix: credential.keyPrefix,
      maskedSuffix: credential.maskedSuffix,
      source: credential.source,
      ownerRef: credential.ownerRef ?? null,
      ownerName: credential.ownerName ?? null,
      ownerType: credential.ownerType ?? null,
      purpose: credential.purpose ?? null,
      realm: credential.realm ?? "partner",
      resourceScope: credential.resourceScope ?? null,
      scopes: [...(credential.scopes ?? [])],
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt,
      lastUsedWorkload: credential.lastUsedWorkload ?? null,
      expiresAt: credential.expiresAt ?? null,
      status: credential.status ?? "active",
      overlapEndsAt: credential.overlapEndsAt ?? null,
      autoRevokedAt: credential.autoRevokedAt ?? null,
      rotatedFromKeyId: credential.rotatedFromKeyId ?? null,
      supersededByKeyId: credential.supersededByKeyId ?? null,
      revokedAt: credential.revokedAt,
      issuedBy: credential.issuedBy,
      revokedBy: credential.revokedBy,
      rotationReason: credential.rotationReason,
      revokeReason: credential.revokeReason,
      signals,
    };
  }

  private clonePartnerEligibilityVerification(
    verification: PartnerEligibilityVerificationRecord,
  ): PartnerEligibilityVerificationRecord {
    const entry = this.findPartnerEntryBySlug(verification.partnerEntrySlug);
    const contract =
      verification.contractSnapshot ??
      (entry ? this.buildPartnerEligibilityContract(entry) : null);
    const decisionSource =
      verification.decisionSource ??
      this.inferPartnerEligibilityDecisionSource(
        verification.verificationStatus,
        entry?.eligibilityMode ?? "none",
      );
    const adapterCode =
      verification.adapterCode ?? contract?.adapterCode ?? null;
    const adapterVersion =
      verification.adapterVersion ?? contract?.adapterVersion ?? null;
    const manualFallback =
      verification.manualFallback ??
      (verification.verificationStatus === "manual_review"
        ? this.createPartnerEligibilityManualFallback(
            verification.verificationReasonCode,
            verification.verifiedAt,
          )
        : {
            required: false,
            reasonCode: null,
            requestedAt: null,
            requestedBy: null,
            notes: null,
          });
    return {
      ...verification,
      cardProgramCode:
        verification.cardProgramCode ??
        entry?.programCode ??
        entry?.bankCode ??
        null,
      decisionSource,
      adapterCode,
      adapterVersion,
      contractSnapshot: contract
        ? this.clonePartnerEligibilityContract(contract)
        : null,
      attempts: (verification.attempts ?? []).map((attempt) => ({
        ...attempt,
      })),
      manualFallback: { ...manualFallback },
      requestMetadata: { ...verification.requestMetadata },
      auditMetadata: { ...verification.auditMetadata },
    };
  }

  private clonePartnerEligibilityContract(
    contract: PartnerEligibilityIntegrationContractRecord,
  ): PartnerEligibilityIntegrationContractRecord {
    return {
      ...contract,
      retryPolicy: contract.retryPolicy ? { ...contract.retryPolicy } : null,
      manualFallbackPolicy: contract.manualFallbackPolicy
        ? {
            ...contract.manualFallbackPolicy,
            requiredAuditFields: [
              ...contract.manualFallbackPolicy.requiredAuditFields,
            ],
          }
        : null,
      sensitiveDataPolicy: contract.sensitiveDataPolicy
        ? { ...contract.sensitiveDataPolicy }
        : null,
      notes: [...contract.notes],
    };
  }

  private addDaysToIso(baseIso: string, days: number) {
    return new Date(
      Date.parse(baseIso) + days * 24 * 60 * 60 * 1_000,
    ).toISOString();
  }

  private resolveCredentialOverlapDays(overlapDays?: number | null) {
    if (overlapDays === undefined || overlapDays === null) {
      return DEFAULT_CREDENTIAL_ROTATION_OVERLAP_DAYS;
    }
    if (
      !Number.isInteger(overlapDays) ||
      overlapDays < 0 ||
      overlapDays > MAX_CREDENTIAL_ROTATION_OVERLAP_DAYS
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CREDENTIAL_ROTATION_OVERLAP_INVALID",
        "Credential rotation overlap must be an integer between 0 and 7 days.",
        {
          overlapDays,
          maxOverlapDays: MAX_CREDENTIAL_ROTATION_OVERLAP_DAYS,
        },
      );
    }
    return overlapDays;
  }

  private resolveCredentialOverlapEndsAt(
    rotatedAt: string,
    overlapDays?: number | null,
  ) {
    const resolvedOverlapDays = this.resolveCredentialOverlapDays(overlapDays);
    return this.addDaysToIso(rotatedAt, resolvedOverlapDays);
  }

  private buildCredentialSignals(
    lastUsedAt: string | null,
    expiresAt: string | null,
    autoRevokedAt: string | null,
    nowIso: string,
  ): IntegrationCredentialSignals {
    const nowMs = Date.parse(nowIso);
    const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    const lastUsedMs = lastUsedAt ? Date.parse(lastUsedAt) : Number.NaN;
    const approachingExpiry =
      Number.isFinite(expiresMs) &&
      expiresMs > nowMs &&
      expiresMs - nowMs <=
        CREDENTIAL_APPROACHING_EXPIRY_THRESHOLD_DAYS * 24 * 60 * 60 * 1_000;
    const dormant = Number.isFinite(lastUsedMs)
      ? nowMs - lastUsedMs >=
        CREDENTIAL_DORMANT_THRESHOLD_DAYS * 24 * 60 * 60 * 1_000
      : false;
    const expired = Number.isFinite(expiresMs) ? expiresMs <= nowMs : false;

    return {
      approachingExpiry,
      dormant,
      expired,
      autoRevoked: autoRevokedAt !== null,
      evaluatedAt: nowIso,
    };
  }

  private materializeCredentialSignals(
    signals: IntegrationCredentialSignals | null | undefined,
    lastUsedAt: string | null,
    expiresAt: string | null,
    autoRevokedAt: string | null,
    nowIso = new Date().toISOString(),
  ): IntegrationCredentialSignals {
    if (signals) {
      return this.toCredentialSignals(signals);
    }

    return this.buildCredentialSignals(
      lastUsedAt,
      expiresAt,
      autoRevokedAt,
      nowIso,
    );
  }

  private resolveCredentialStatus(params: {
    revokedAt: string | null;
    expiresAt?: string | null;
    overlapEndsAt?: string | null;
    autoRevokedAt?: string | null;
    nowIso: string;
  }): IntegrationCredentialStatus {
    if (params.revokedAt) {
      return params.autoRevokedAt ? "auto_revoked" : "revoked";
    }

    const nowMs = Date.parse(params.nowIso);
    const expiresMs = params.expiresAt
      ? Date.parse(params.expiresAt)
      : Number.NaN;
    if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
      return "expired";
    }

    const overlapMs = params.overlapEndsAt
      ? Date.parse(params.overlapEndsAt)
      : Number.NaN;
    if (Number.isFinite(overlapMs) && overlapMs > nowMs) {
      return "overlap_active";
    }

    return "active";
  }

  private reconcileCredentialLifecycle<
    T extends {
      createdAt: string;
      lastUsedAt: string | null;
      lastUsedWorkload?: string | null;
      expiresAt?: string | null;
      status?: IntegrationCredentialStatus;
      overlapEndsAt?: string | null;
      autoRevokedAt?: string | null;
      revokedAt: string | null;
      revokeReason?: string | null;
      signals?: IntegrationCredentialSignals | undefined;
    },
  >(
    record: T,
    params: {
      nowIso: string;
      defaultExpiresAt: string | null;
      autoRevokeReason: string;
    },
  ) {
    let changed = false;

    if (record.lastUsedWorkload === undefined) {
      record.lastUsedWorkload = null;
      changed = true;
    }
    if (record.expiresAt === undefined || record.expiresAt === null) {
      record.expiresAt = params.defaultExpiresAt;
      changed = true;
    }
    if (record.overlapEndsAt === undefined) {
      record.overlapEndsAt = null;
      changed = true;
    }
    if (record.autoRevokedAt === undefined) {
      record.autoRevokedAt = null;
      changed = true;
    }

    if (
      !record.revokedAt &&
      record.overlapEndsAt &&
      Date.parse(record.overlapEndsAt) <= Date.parse(params.nowIso)
    ) {
      record.revokedAt = record.overlapEndsAt;
      record.autoRevokedAt = record.overlapEndsAt;
      if ("revokeReason" in record && !record.revokeReason) {
        record.revokeReason = params.autoRevokeReason;
      }
      changed = true;
    }

    const nextStatus = this.resolveCredentialStatus({
      revokedAt: record.revokedAt,
      expiresAt: record.expiresAt ?? null,
      overlapEndsAt: record.overlapEndsAt ?? null,
      autoRevokedAt: record.autoRevokedAt ?? null,
      nowIso: params.nowIso,
    });
    if (record.status !== nextStatus) {
      record.status = nextStatus;
      changed = true;
    }

    const nextSignals = this.buildCredentialSignals(
      record.lastUsedAt,
      record.expiresAt ?? null,
      record.autoRevokedAt ?? null,
      params.nowIso,
    );
    if (
      JSON.stringify(record.signals ?? null) !== JSON.stringify(nextSignals)
    ) {
      record.signals = nextSignals;
      changed = true;
    }

    return changed;
  }

  private resolveCredentialOwner(
    input: {
      ownerRef?: string | null;
      ownerName?: string | null;
      ownerType?: string | null;
    },
    fallback: {
      ownerRef: string | null;
      ownerName: string;
      ownerType: string;
    },
  ) {
    return {
      ownerRef: this.normalizeNullableText(input.ownerRef) ?? fallback.ownerRef,
      ownerName:
        this.normalizeNullableText(input.ownerName) ?? fallback.ownerName,
      ownerType:
        this.normalizeNullableText(input.ownerType) ?? fallback.ownerType,
    };
  }

  private resolveCredentialPurpose(
    purpose: string | null | undefined,
    fallback: string,
  ) {
    return this.normalizeNullableText(purpose) ?? fallback;
  }

  private resolvePartnerIngressCredentialExpiry(
    expiresAt: string | null | undefined,
    nowIso: string,
  ) {
    const fallbackExpiry = this.addDaysToIso(
      nowIso,
      DEFAULT_PARTNER_INGRESS_CREDENTIAL_LIFETIME_DAYS,
    );
    if (!expiresAt) {
      return fallbackExpiry;
    }

    const parsed = Date.parse(expiresAt);
    if (Number.isNaN(parsed)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_INGRESS_CREDENTIAL_EXPIRY_INVALID",
        "expiresAt must be a valid ISO timestamp.",
        { expiresAt },
      );
    }
    if (parsed <= Date.parse(nowIso)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_INGRESS_CREDENTIAL_EXPIRY_PAST",
        "expiresAt must be in the future.",
        { expiresAt },
      );
    }
    const maxExpiry =
      Date.parse(nowIso) +
      MAX_PARTNER_INGRESS_CREDENTIAL_LIFETIME_DAYS * 24 * 60 * 60 * 1_000;
    if (parsed > maxExpiry) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_INGRESS_CREDENTIAL_EXPIRY_TOO_FAR",
        "expiresAt exceeds the partner credential maximum lifetime.",
        {
          expiresAt,
          maxLifetimeDays: MAX_PARTNER_INGRESS_CREDENTIAL_LIFETIME_DAYS,
        },
      );
    }

    return new Date(parsed).toISOString();
  }

  private resolveWebhookSecretExpiry(
    expiresAt: string | null | undefined,
    nowIso: string,
  ) {
    const fallbackExpiry = this.addDaysToIso(
      nowIso,
      DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS,
    );
    if (!expiresAt) {
      return fallbackExpiry;
    }

    const parsed = Date.parse(expiresAt);
    if (Number.isNaN(parsed)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "WEBHOOK_SECRET_EXPIRY_INVALID",
        "expiresAt must be a valid ISO timestamp.",
        { expiresAt },
      );
    }
    if (parsed <= Date.parse(nowIso)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "WEBHOOK_SECRET_EXPIRY_PAST",
        "expiresAt must be in the future.",
        { expiresAt },
      );
    }
    const maxExpiry =
      Date.parse(nowIso) +
      MAX_WEBHOOK_SECRET_LIFETIME_DAYS * 24 * 60 * 60 * 1_000;
    if (parsed > maxExpiry) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "WEBHOOK_SECRET_EXPIRY_TOO_FAR",
        "expiresAt exceeds the webhook credential maximum lifetime.",
        {
          expiresAt,
          maxLifetimeDays: MAX_WEBHOOK_SECRET_LIFETIME_DAYS,
        },
      );
    }

    return new Date(parsed).toISOString();
  }

  private reconcileStoredApiKey(
    apiKey: StoredTenantApiKeyRecord,
    nowIso = new Date().toISOString(),
  ) {
    let changed = false;
    const owner = this.resolveCredentialOwner(apiKey, {
      ownerRef: null,
      ownerName: "Unassigned tenant integration owner",
      ownerType: "unknown",
    });
    if (apiKey.ownerRef !== owner.ownerRef) {
      apiKey.ownerRef = owner.ownerRef;
      changed = true;
    }
    if (apiKey.ownerName !== owner.ownerName) {
      apiKey.ownerName = owner.ownerName;
      changed = true;
    }
    if (apiKey.ownerType !== owner.ownerType) {
      apiKey.ownerType = owner.ownerType;
      changed = true;
    }
    if (apiKey.realm !== "tenant") {
      apiKey.realm = "tenant";
      changed = true;
    }
    const resourceScope = apiKey.resourceScope ?? `tenant:${apiKey.tenantId}`;
    if (apiKey.resourceScope !== resourceScope) {
      apiKey.resourceScope = resourceScope;
      changed = true;
    }
    const purpose = this.resolveCredentialPurpose(
      apiKey.purpose,
      `${apiKey.keyName} integration credential`,
    );
    if (apiKey.purpose !== purpose) {
      apiKey.purpose = purpose;
      changed = true;
    }
    if (apiKey.rotatedFromApiKeyId === undefined) {
      apiKey.rotatedFromApiKeyId = null;
      changed = true;
    }
    if (apiKey.supersededByApiKeyId === undefined) {
      apiKey.supersededByApiKeyId = null;
      changed = true;
    }
    changed =
      this.reconcileCredentialLifecycle(apiKey, {
        nowIso,
        defaultExpiresAt:
          apiKey.expiresAt ??
          this.addDaysToIso(nowIso, DEFAULT_TENANT_API_KEY_LIFETIME_DAYS),
        autoRevokeReason: "rotation_overlap_elapsed",
      }) || changed;
    return changed;
  }

  private reconcileStoredPartnerIngressCredential(
    credential: StoredPartnerIngressCredentialRecord,
    nowIso = new Date().toISOString(),
  ) {
    let changed = false;
    const owner = this.resolveCredentialOwner(credential, {
      ownerRef: null,
      ownerName:
        credential.source === "env_bootstrap"
          ? "Bootstrap partner credential owner"
          : "Platform partner credential owner",
      ownerType:
        credential.source === "env_bootstrap" ? "system" : "platform_admin",
    });
    if (credential.ownerRef !== owner.ownerRef) {
      credential.ownerRef = owner.ownerRef;
      changed = true;
    }
    if (credential.ownerName !== owner.ownerName) {
      credential.ownerName = owner.ownerName;
      changed = true;
    }
    if (credential.ownerType !== owner.ownerType) {
      credential.ownerType = owner.ownerType;
      changed = true;
    }
    if (credential.realm !== "partner") {
      credential.realm = "partner";
      changed = true;
    }
    const resourceScope =
      credential.resourceScope ?? `partner_entry:${credential.entrySlug}`;
    if (credential.resourceScope !== resourceScope) {
      credential.resourceScope = resourceScope;
      changed = true;
    }
    const purpose = this.resolveCredentialPurpose(
      credential.purpose,
      `partner ingress for ${credential.entrySlug}`,
    );
    if (credential.purpose !== purpose) {
      credential.purpose = purpose;
      changed = true;
    }
    const scopes = credential.scopes ?? [
      "partner:entries:read",
      "partner:eligibility:read",
      "partner:eligibility:write",
    ];
    if (JSON.stringify(credential.scopes ?? null) !== JSON.stringify(scopes)) {
      credential.scopes = [...scopes];
      changed = true;
    }
    if (credential.rotatedFromKeyId === undefined) {
      credential.rotatedFromKeyId = null;
      changed = true;
    }
    if (credential.supersededByKeyId === undefined) {
      credential.supersededByKeyId = null;
      changed = true;
    }
    const defaultExpiresAt =
      credential.expiresAt ??
      (credential.source === "env_bootstrap"
        ? this.addDaysToIso(
            nowIso,
            DEFAULT_PARTNER_INGRESS_CREDENTIAL_LIFETIME_DAYS,
          )
        : this.addDaysToIso(
            nowIso,
            DEFAULT_PARTNER_INGRESS_CREDENTIAL_LIFETIME_DAYS,
          ));
    changed =
      this.reconcileCredentialLifecycle(credential, {
        nowIso,
        defaultExpiresAt,
        autoRevokeReason: "rotation_overlap_elapsed",
      }) || changed;
    return changed;
  }

  private reconcileWebhookSecretMaterial(
    secret: StoredWebhookSecretMaterial,
    nowIso = new Date().toISOString(),
  ) {
    return this.reconcileCredentialLifecycle(secret, {
      nowIso,
      defaultExpiresAt:
        secret.expiresAt ??
        this.addDaysToIso(nowIso, DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS),
      autoRevokeReason: "rotation_overlap_elapsed",
    });
  }

  private reconcileStoredWebhookEndpoint(
    endpoint: StoredWebhookEndpoint,
    nowIso = new Date().toISOString(),
  ) {
    let changed = false;
    const owner = this.resolveCredentialOwner(endpoint, {
      ownerRef: null,
      ownerName: "Tenant webhook integration owner",
      ownerType: "tenant_admin",
    });
    if (endpoint.ownerRef !== owner.ownerRef) {
      endpoint.ownerRef = owner.ownerRef;
      changed = true;
    }
    if (endpoint.ownerName !== owner.ownerName) {
      endpoint.ownerName = owner.ownerName;
      changed = true;
    }
    if (endpoint.ownerType !== owner.ownerType) {
      endpoint.ownerType = owner.ownerType;
      changed = true;
    }
    const purpose = this.resolveCredentialPurpose(
      endpoint.purpose,
      `tenant webhook signing for ${endpoint.webhookId}`,
    );
    if (endpoint.purpose !== purpose) {
      endpoint.purpose = purpose;
      changed = true;
    }
    const resourceScope =
      endpoint.resourceScope ??
      `tenant:${endpoint.tenantId}:webhook:${endpoint.webhookId}`;
    if (endpoint.resourceScope !== resourceScope) {
      endpoint.resourceScope = resourceScope;
      changed = true;
    }

    const secretCredentials: StoredWebhookSecretMaterial[] =
      endpoint.secretCredentials && endpoint.secretCredentials.length > 0
        ? endpoint.secretCredentials.map(
            (record): StoredWebhookSecretMaterial => ({
              ...record,
              createdAt: record.createdAt ?? record.rotatedAt,
              status: record.status ?? "active",
              signals:
                record.signals ??
                this.buildCredentialSignals(
                  record.lastUsedAt ?? null,
                  record.expiresAt ??
                    this.addDaysToIso(
                      nowIso,
                      DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS,
                    ),
                  record.autoRevokedAt ?? null,
                  nowIso,
                ),
            }),
          )
        : [
            {
              createdAt:
                endpoint.runtimeMetadata?.secretRotation?.rotatedAt ??
                endpoint.createdAt,
              secretVersion: endpoint.secretVersion,
              rotatedAt:
                endpoint.runtimeMetadata?.secretRotation?.rotatedAt ??
                endpoint.updatedAt,
              rotationReason:
                endpoint.secretHistory?.at(-1)?.rotationReason ??
                "initial_secret",
              secretPreview: endpoint.secretPreview,
              secretValue: endpoint.secretValue,
              ownerRef: owner.ownerRef,
              ownerName: owner.ownerName,
              ownerType: owner.ownerType,
              purpose,
              expiresAt:
                endpoint.secretExpiresAt ??
                this.addDaysToIso(nowIso, DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS),
              lastUsedAt: endpoint.secretLastUsedAt ?? null,
              lastUsedWorkload: endpoint.secretLastUsedWorkload ?? null,
              status: "active",
              overlapEndsAt: endpoint.rotationOverlapEndsAt ?? null,
              autoRevokedAt: null,
              supersededByVersion: null,
              revokedAt: null,
              signals: this.buildCredentialSignals(
                endpoint.secretLastUsedAt ?? null,
                endpoint.secretExpiresAt ??
                  this.addDaysToIso(
                    nowIso,
                    DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS,
                  ),
                null,
                nowIso,
              ),
            },
          ];

    const reconciledSecrets = secretCredentials
      .map((record) => {
        const secret: StoredWebhookSecretMaterial = {
          ...record,
          createdAt: record.createdAt ?? record.rotatedAt,
          status: record.status ?? "active",
          ownerRef: record.ownerRef ?? owner.ownerRef,
          ownerName: record.ownerName ?? owner.ownerName,
          ownerType: record.ownerType ?? owner.ownerType,
          purpose: this.resolveCredentialPurpose(record.purpose, purpose),
          lastUsedWorkload: record.lastUsedWorkload ?? null,
          overlapEndsAt: record.overlapEndsAt ?? null,
          autoRevokedAt: record.autoRevokedAt ?? null,
          supersededByVersion: record.supersededByVersion ?? null,
          revokedAt: record.revokedAt ?? null,
          signals: this.materializeCredentialSignals(
            record.signals,
            record.lastUsedAt ?? null,
            record.expiresAt ??
              this.addDaysToIso(nowIso, DEFAULT_WEBHOOK_SECRET_LIFETIME_DAYS),
            record.autoRevokedAt ?? null,
            nowIso,
          ),
        };
        changed =
          this.reconcileWebhookSecretMaterial(secret, nowIso) || changed;
        return secret;
      })
      .sort((left, right) => right.secretVersion - left.secretVersion);

    endpoint.secretCredentials = reconciledSecrets;
    const currentSecret =
      reconciledSecrets.find(
        (record) => record.secretVersion === endpoint.secretVersion,
      ) ?? reconciledSecrets[0];

    if (currentSecret) {
      if (endpoint.secretVersion !== currentSecret.secretVersion) {
        endpoint.secretVersion = currentSecret.secretVersion;
        changed = true;
      }
      if (endpoint.secretValue !== currentSecret.secretValue) {
        endpoint.secretValue = currentSecret.secretValue;
        changed = true;
      }
      if (endpoint.secretPreview !== currentSecret.secretPreview) {
        endpoint.secretPreview = currentSecret.secretPreview;
        changed = true;
      }
      if (endpoint.secretExpiresAt !== currentSecret.expiresAt) {
        endpoint.secretExpiresAt = currentSecret.expiresAt;
        changed = true;
      }
      if (endpoint.secretLastUsedAt !== currentSecret.lastUsedAt) {
        endpoint.secretLastUsedAt = currentSecret.lastUsedAt;
        changed = true;
      }
      if (endpoint.secretLastUsedWorkload !== currentSecret.lastUsedWorkload) {
        endpoint.secretLastUsedWorkload = currentSecret.lastUsedWorkload;
        changed = true;
      }
      if (endpoint.credentialStatus !== currentSecret.status) {
        endpoint.credentialStatus = currentSecret.status;
        changed = true;
      }
      if (endpoint.rotationOverlapEndsAt !== currentSecret.overlapEndsAt) {
        endpoint.rotationOverlapEndsAt = currentSecret.overlapEndsAt;
        changed = true;
      }
      if (
        JSON.stringify(endpoint.credentialSignals ?? null) !==
        JSON.stringify(currentSecret.signals)
      ) {
        endpoint.credentialSignals = this.toCredentialSignals(
          currentSecret.signals,
        );
        changed = true;
      }
    }

    // `reconciledSecrets` is newest-first so the active secret resolves cheaply,
    // but tenant-facing rotation history stays oldest-first as it always has.
    const secretHistory: WebhookSecretRotationRecord[] = reconciledSecrets
      .slice()
      .reverse()
      .map((record) => this.toWebhookSecretHistoryRecord(record));
    if (
      JSON.stringify(endpoint.secretHistory ?? null) !==
      JSON.stringify(secretHistory)
    ) {
      endpoint.secretHistory = secretHistory;
      changed = true;
    }

    endpoint.runtimeMetadata = this.toWebhookRuntimeMetadata(
      endpoint.runtimeMetadata,
      {
        currentVersion: endpoint.secretVersion,
        rotatedAt:
          currentSecret?.rotatedAt ??
          endpoint.runtimeMetadata.secretRotation.rotatedAt,
        rotationCount: reconciledSecrets.length,
        history: endpoint.secretHistory,
      },
    );

    return changed;
  }

  /**
   * Rotation history is tenant-facing, so it is projected field by field out of
   * the stored credential instead of spread. Raw secret material and any future
   * field added to `StoredWebhookSecretMaterial` stay internal until they are
   * listed here on purpose.
   */
  private toWebhookSecretHistoryRecord(
    secret: WebhookSecretRotationRecord & {
      createdAt?: string;
      // Declared so the input type admits stored material; never projected out.
      secretValue?: string;
    },
  ): PublishedWebhookSecretRotationRecord {
    return {
      createdAt: secret.createdAt ?? secret.rotatedAt,
      secretVersion: secret.secretVersion,
      rotatedAt: secret.rotatedAt,
      rotationReason: secret.rotationReason,
      secretPreview: secret.secretPreview,
      ownerRef: secret.ownerRef ?? null,
      ownerName: secret.ownerName ?? null,
      ownerType: secret.ownerType ?? null,
      purpose: secret.purpose ?? null,
      expiresAt: secret.expiresAt ?? null,
      lastUsedAt: secret.lastUsedAt ?? null,
      lastUsedWorkload: secret.lastUsedWorkload ?? null,
      status: secret.status ?? "active",
      overlapEndsAt: secret.overlapEndsAt ?? null,
      autoRevokedAt: secret.autoRevokedAt ?? null,
      supersededByVersion: secret.supersededByVersion ?? null,
      revokedAt: secret.revokedAt ?? null,
      signals: this.toCredentialSignals(secret.signals),
    };
  }

  /**
   * Signals ride along on tenant-facing credential reads, so they are projected
   * field by field for the same reason rotation history is: a legacy persisted
   * row can carry keys this type no longer declares.
   */
  private toCredentialSignals(
    signals: IntegrationCredentialSignals,
  ): IntegrationCredentialSignals;
  private toCredentialSignals(
    signals: IntegrationCredentialSignals | null | undefined,
  ): IntegrationCredentialSignals | undefined;
  private toCredentialSignals(
    signals: IntegrationCredentialSignals | null | undefined,
  ): IntegrationCredentialSignals | undefined {
    if (!signals) {
      return undefined;
    }
    return {
      approachingExpiry: signals.approachingExpiry,
      dormant: signals.dormant,
      expired: signals.expired,
      autoRevoked: signals.autoRevoked,
      evaluatedAt: signals.evaluatedAt,
    };
  }

  /**
   * Projected rather than spread so hydrated rows cannot republish stray keys,
   * and so `retryableStatusCodes` is copied instead of aliased into the clone.
   * A spread used to silently tolerate a missing or partial persisted policy,
   * so each field falls back to the platform default rather than projecting
   * `undefined` into a fully required contract shape.
   */
  private toWebhookRetryPolicy(
    retryPolicy: Partial<WebhookRetryPolicyRecord> | null | undefined,
  ): WebhookRetryPolicyRecord {
    const fallback = DEFAULT_WEBHOOK_RETRY_POLICY;
    return {
      maxAttempts: retryPolicy?.maxAttempts ?? fallback.maxAttempts,
      initialBackoffSeconds:
        retryPolicy?.initialBackoffSeconds ?? fallback.initialBackoffSeconds,
      backoffMultiplier:
        retryPolicy?.backoffMultiplier ?? fallback.backoffMultiplier,
      maxBackoffSeconds:
        retryPolicy?.maxBackoffSeconds ?? fallback.maxBackoffSeconds,
      retryableStatusCodes: [
        ...(retryPolicy?.retryableStatusCodes ?? fallback.retryableStatusCodes),
      ],
    };
  }

  /**
   * Runtime metadata is tenant-facing and is rebuilt field by field rather than
   * spread. Persisted rows are loaded through an unchecked JSONB cast, so a
   * legacy endpoint that carried extra keys under `runtimeMetadata` cannot
   * republish them through a webhook read.
   */
  private toWebhookRuntimeMetadata(
    metadata: WebhookRuntimeMetadata,
    secretRotation?: WebhookRuntimeMetadata["secretRotation"],
  ): WebhookRuntimeMetadata {
    const rotation = secretRotation ?? metadata.secretRotation;
    return {
      deliveryCount: metadata.deliveryCount,
      failedDeliveryCount: metadata.failedDeliveryCount,
      lastAttemptAt: metadata.lastAttemptAt,
      lastDeliveredAt: metadata.lastDeliveredAt,
      lastValidatedAt: metadata.lastValidatedAt,
      nextAttemptAt: metadata.nextAttemptAt,
      lastSignaturePreview: metadata.lastSignaturePreview,
      disabledAt: metadata.disabledAt,
      disableReason: metadata.disableReason,
      disableReasonNote: metadata.disableReasonNote ?? null,
      retryPolicy: this.toWebhookRetryPolicy(metadata.retryPolicy),
      secretRotation: {
        currentVersion: rotation.currentVersion,
        rotatedAt: rotation.rotatedAt,
        rotationCount: rotation.rotationCount,
        history: (rotation.history ?? []).map((record) =>
          this.toWebhookSecretHistoryRecord(record),
        ),
      },
    };
  }

  private cloneStoredApiKey(
    apiKey: StoredTenantApiKeyRecord,
  ): StoredTenantApiKeyRecord {
    const nowIso = new Date().toISOString();
    const cloned: StoredTenantApiKeyRecord = {
      ...apiKey,
      scopes: [...apiKey.scopes],
      signals: this.materializeCredentialSignals(
        apiKey.signals,
        apiKey.lastUsedAt,
        apiKey.expiresAt ?? null,
        apiKey.autoRevokedAt ?? null,
        nowIso,
      ),
    };
    this.reconcileStoredApiKey(cloned, nowIso);
    return cloned;
  }

  private maybeRecordDormantCredentialUse(params: {
    tenantId: string | null;
    channel: "ops_notice";
    title: string;
    message: string;
    previousLastUsedAt: string | null;
    createdAt: string;
  }) {
    const baseline = params.previousLastUsedAt ?? params.createdAt;
    const baselineMs = Date.parse(baseline);
    if (
      !Number.isFinite(baselineMs) ||
      Date.now() - baselineMs <
        CREDENTIAL_DORMANT_THRESHOLD_DAYS * 24 * 60 * 60 * 1_000
    ) {
      return;
    }

    this.auditNotificationService.recordNotification({
      tenantId: params.tenantId,
      recipientUserId: null,
      channel: params.channel,
      title: params.title,
      message: params.message,
      status: "unread",
    });
  }

  private resolveWebhookSecretMaterial(
    endpoint: StoredWebhookEndpoint,
    secretVersion: number,
    nowIso = new Date().toISOString(),
  ) {
    this.reconcileStoredWebhookEndpoint(endpoint, nowIso);
    return (
      endpoint.secretCredentials?.find(
        (candidate) => candidate.secretVersion === secretVersion,
      ) ?? null
    );
  }

  private markWebhookSecretUsed(
    endpoint: StoredWebhookEndpoint,
    secret: StoredWebhookSecretMaterial,
    workload: string,
    usedAt: string,
  ) {
    const previousLastUsedAt = secret.lastUsedAt;
    secret.lastUsedAt = usedAt;
    secret.lastUsedWorkload = workload;
    secret.signals = this.buildCredentialSignals(
      secret.lastUsedAt,
      secret.expiresAt ?? null,
      secret.autoRevokedAt ?? null,
      usedAt,
    );
    this.maybeRecordDormantCredentialUse({
      tenantId: endpoint.tenantId,
      channel: "ops_notice",
      title: "Dormant webhook credential used",
      message: `Webhook secret v${secret.secretVersion} for ${endpoint.webhookId} was used after dormancy.`,
      previousLastUsedAt,
      createdAt: secret.rotatedAt,
    });
    this.reconcileStoredWebhookEndpoint(endpoint, usedAt);
  }

  private cloneStoredWebhookEndpoint(
    endpoint: StoredWebhookEndpointRecord,
  ): StoredWebhookEndpoint {
    const defaultOwnerName =
      endpoint.ownerName ?? "Tenant webhook integration owner";
    const defaultOwnerType = endpoint.ownerType ?? "tenant_admin";
    const defaultPurpose =
      endpoint.purpose ?? `tenant webhook signing for ${endpoint.webhookId}`;
    const cloned: StoredWebhookEndpoint = {
      ...endpoint,
      events: [...endpoint.events],
      retryPolicy: this.toWebhookRetryPolicy(endpoint.retryPolicy),
      runtimeMetadata: this.toWebhookRuntimeMetadata(endpoint.runtimeMetadata),
      // Live secret material belongs to `secretCredentials` only; history is
      // re-projected so hydrated rows cannot smuggle it back in.
      secretHistory: (endpoint.secretHistory ?? []).map((record) =>
        this.toWebhookSecretHistoryRecord(record),
      ),
      secretCredentials: (endpoint.secretCredentials ?? []).map(
        (record): StoredWebhookSecretMaterial => ({
          ...record,
          createdAt: record.createdAt ?? record.rotatedAt,
          ownerRef: record.ownerRef ?? endpoint.ownerRef ?? null,
          ownerName: record.ownerName ?? defaultOwnerName,
          ownerType: record.ownerType ?? defaultOwnerType,
          purpose: this.resolveCredentialPurpose(
            record.purpose,
            defaultPurpose,
          ),
          expiresAt: record.expiresAt ?? endpoint.secretExpiresAt ?? null,
          lastUsedAt: record.lastUsedAt ?? null,
          lastUsedWorkload: record.lastUsedWorkload ?? null,
          status: record.status ?? "active",
          overlapEndsAt: record.overlapEndsAt ?? null,
          autoRevokedAt: record.autoRevokedAt ?? null,
          supersededByVersion: record.supersededByVersion ?? null,
          revokedAt: record.revokedAt ?? null,
          signals: this.materializeCredentialSignals(
            record.signals,
            record.lastUsedAt ?? null,
            record.expiresAt ?? endpoint.secretExpiresAt ?? null,
            record.autoRevokedAt ?? null,
          ),
        }),
      ),
      credentialSignals: this.materializeCredentialSignals(
        endpoint.credentialSignals,
        endpoint.secretLastUsedAt ?? null,
        endpoint.secretExpiresAt ?? null,
        null,
      ),
    };
    this.reconcileStoredWebhookEndpoint(cloned);
    return cloned;
  }

  private cloneStoredWebhookDelivery(
    delivery: StoredWebhookDeliveryRecord,
  ): StoredWebhookDelivery {
    return {
      ...delivery,
      rawBody: { ...delivery.rawBody },
      retryPolicySnapshot: this.toWebhookRetryPolicy(
        delivery.retryPolicySnapshot,
      ),
    };
  }

  private getOrCreateNotificationPreferences(tenantId: string) {
    const existing = this.notificationPreferences.get(tenantId);
    if (existing) {
      return existing;
    }

    const created = this.createDefaultNotificationPreferences(tenantId);
    this.notificationPreferences.set(
      tenantId,
      this.cloneNotificationPreferences(created),
    );
    return created;
  }

  private getOrCreateSlaProfile(tenantId: string) {
    const existing = this.slaProfiles.get(tenantId);
    if (existing) {
      return existing;
    }

    const created = this.createDefaultSlaProfile(tenantId);
    this.slaProfiles.set(tenantId, this.cloneSlaProfile(created));
    return created;
  }

  private createDefaultNotificationPreferences(
    tenantId: string,
  ): TenantNotificationPreferences {
    return {
      tenantId,
      subscriptions: [
        {
          eventType: "reservation.failed",
          channel: "ops_console",
          enabled: true,
        },
        {
          eventType: "tenant.sla.threshold_breached",
          channel: "webhook",
          enabled: true,
        },
        {
          eventType: "tenant.webhook.delivery_failed",
          channel: "ops_console",
          enabled: true,
        },
      ],
      updatedAt: "2026-04-10T00:00:00.000Z",
    };
  }

  private createDefaultSlaProfile(tenantId: string): TenantSlaProfile {
    return {
      tenantId,
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 90,
      updatedAt: "2026-04-10T00:00:00.000Z",
    };
  }

  private requireTenantUser(tenantId: string, userId: string) {
    const userRole = this.userRoles.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.userId === userId,
    );
    if (!userRole) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TENANT_USER_NOT_FOUND",
        "The tenant user could not be found.",
        {
          userId,
        },
      );
    }
    return userRole;
  }

  private requirePublicPartnerEntry(entrySlug: string) {
    return this.requireAccessiblePartnerEntry(entrySlug, undefined, "public");
  }

  private requirePartnerEntry(entrySlug: string) {
    const normalizedSlug = entrySlug?.trim();
    if (!normalizedSlug) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_ENTRY_REQUIRED",
        "entrySlug is required.",
        {},
      );
    }

    const entry = this.partnerEntries.find(
      (candidate) =>
        candidate.entrySlug === normalizedSlug &&
        candidate.activeFlag &&
        candidate.status === "active",
    );
    if (!entry) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_ENTRY_NOT_FOUND",
        "The partner entry could not be found.",
        {
          entrySlug: normalizedSlug,
        },
      );
    }

    return entry;
  }

  private requireAccessiblePartnerEntry(
    entrySlug: string,
    requestId: string | undefined,
    mode: "authenticate" | "eligibility" | "public",
  ) {
    const normalizedSlug = entrySlug?.trim();
    if (!normalizedSlug) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_ENTRY_REQUIRED",
        "entrySlug is required.",
        {},
      );
    }

    const entry = this.findPartnerEntryBySlug(normalizedSlug);
    if (!entry) {
      this.recordPartnerIngressAttempt(null, requestId, "rejected", {
        reason: "entry_not_found",
        entrySlug: normalizedSlug,
      });
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_ENTRY_NOT_FOUND",
        "The partner entry could not be found.",
        {
          entrySlug: normalizedSlug,
        },
      );
    }

    if (entry.status === "revoked") {
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "entry_revoked",
        entrySlug: entry.entrySlug,
        status: entry.status,
      });
      throw new ApiRequestError(
        mode === "public" ? HttpStatus.NOT_FOUND : HttpStatus.FORBIDDEN,
        "PARTNER_ENTRY_REVOKED",
        "The partner entry has been revoked.",
        {
          entrySlug: entry.entrySlug,
          status: entry.status,
        },
      );
    }

    if (!entry.activeFlag || entry.status !== "active") {
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "entry_inactive",
        entrySlug: entry.entrySlug,
        status: entry.status,
        activeFlag: entry.activeFlag,
      });
      throw new ApiRequestError(
        mode === "public" ? HttpStatus.NOT_FOUND : HttpStatus.FORBIDDEN,
        "PARTNER_ENTRY_INACTIVE",
        "The partner entry is inactive and cannot be used.",
        {
          entrySlug: entry.entrySlug,
          status: entry.status,
        },
      );
    }

    return entry;
  }

  private requirePlatformPartnerEntry(entrySlug: string) {
    const normalizedSlug = entrySlug?.trim();
    if (!normalizedSlug) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_ENTRY_REQUIRED",
        "entrySlug is required.",
        {},
      );
    }

    const entry = this.partnerEntries.find(
      (candidate) => candidate.entrySlug === normalizedSlug,
    );
    if (!entry) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_ENTRY_NOT_FOUND",
        "The partner entry could not be found.",
        {
          entrySlug: normalizedSlug,
        },
      );
    }

    return entry;
  }

  private reconcilePartnerEntrySeeds() {
    if (isStrictAuthEnvironment()) {
      return;
    }
    const existingSlugs = new Set(
      this.partnerEntries.map((entry) => entry.entrySlug),
    );
    const missingSeedEntries = PARTNER_ENTRY_SEED.filter(
      (seed) => !existingSlugs.has(seed.entrySlug),
    ).map((seed) => this.clonePartnerEntry(seed));

    if (missingSeedEntries.length === 0) {
      return;
    }

    this.partnerEntries = [...this.partnerEntries, ...missingSeedEntries];
    this.persistChanges(
      {
        partnerEntries: missingSeedEntries.map((entry) =>
          this.clonePartnerEntry(entry),
        ),
      },
      "module init partner entry seed reconciliation",
    );
  }

  private normalizePartnerEntryAuthModes() {
    const changedEntries = this.partnerEntries
      .filter((entry) => entry.authMode !== "partner_api_key")
      .map((entry) => {
        entry.authMode = "partner_api_key";
        entry.updatedAt = new Date().toISOString();
        entry.auditMetadata = {
          ...entry.auditMetadata,
          source: entry.auditMetadata.source ?? "partner_auth_upgrade",
          updatedBy: "system:partner-auth-upgrade",
        };
        return this.clonePartnerEntry(entry);
      });

    if (changedEntries.length > 0) {
      this.persistChanges(
        {
          partnerEntries: changedEntries,
        },
        "normalize_partner_entry_auth_modes",
      );
    }
  }

  private reconcilePartnerIngressCredentialSeeds() {
    if (isStrictAuthEnvironment()) {
      return;
    }
    const configuredEntrySlugs = new Set(
      this.partnerIngressCredentials.map((credential) => credential.entrySlug),
    );
    const missingCredentials = this.partnerIngressCredentialSeeds
      .filter((seed) => !configuredEntrySlugs.has(seed.entrySlug))
      .map((seed) => createBootstrapPartnerIngressCredential(seed));

    if (missingCredentials.length === 0) {
      return;
    }

    this.partnerIngressCredentials = [
      ...this.partnerIngressCredentials,
      ...missingCredentials,
    ];
    this.persistChanges(
      {
        partnerIngressCredentials: missingCredentials.map((credential) =>
          this.cloneStoredPartnerIngressCredential(credential),
        ),
      },
      "module init partner ingress credential seed reconciliation",
    );
  }

  private resolvePartnerIngressCredential(entrySlug: string) {
    return this.partnerIngressCredentials
      .filter((credential) => credential.entrySlug === entrySlug)
      .map((credential) => {
        this.reconcileStoredPartnerIngressCredential(credential);
        return credential;
      })
      .filter(
        (credential) =>
          credential.status === "active" ||
          credential.status === "overlap_active",
      )
      .sort((left, right) => {
        if (left.status === right.status) {
          return right.createdAt.localeCompare(left.createdAt);
        }
        return left.status === "active" ? -1 : 1;
      })[0];
  }

  private findPartnerIngressCredentialByApiKey(
    entrySlug: string,
    apiKey: string,
  ) {
    const providedHash = this.hashPartnerApiKey(apiKey);
    return this.partnerIngressCredentials
      .filter((credential) => credential.entrySlug === entrySlug)
      .map((credential) => {
        this.reconcileStoredPartnerIngressCredential(credential);
        return credential;
      })
      .find((credential) => this.hashesMatch(providedHash, credential.keyHash));
  }

  private clearDemoSeedState() {
    this.notificationPreferences = new Map();
    this.slaProfiles = new Map();
    this.passengers = [];
    this.addresses = [];
    this.costCenters = [];
    this.userRoles = [];
    this.apiKeys = [];
    this.partnerEntries = [];
    this.referralRevenueShareRules = [];
  }

  private sanitizePersistedState(
    state: TenantPartnerState,
  ): TenantPartnerState {
    if (!isStrictAuthEnvironment()) {
      return {
        ...state,
        notificationPreferences: state.notificationPreferences.map((value) => ({
          ...value,
        })),
        webhookEndpoints: state.webhookEndpoints.map((value) =>
          this.cloneStoredWebhookEndpoint(value),
        ),
        webhookDeliveries: state.webhookDeliveries.map((value) =>
          this.cloneStoredWebhookDelivery(value),
        ),
        slaProfiles: state.slaProfiles.map((value) =>
          this.cloneSlaProfile(value),
        ),
        partnerEntries: state.partnerEntries.map((value) =>
          this.clonePartnerEntry(value),
        ),
        partnerIngressCredentials: state.partnerIngressCredentials.map(
          (value) => this.cloneStoredPartnerIngressCredential(value),
        ),
        partnerEligibilityVerifications:
          state.partnerEligibilityVerifications.map((value) =>
            this.clonePartnerEligibilityVerification(value),
          ),
        approvalRules: state.approvalRules.map((value) =>
          this.cloneApprovalRule(value),
        ),
        approvalRequests: state.approvalRequests.map((value) =>
          this.cloneApprovalRequest(value),
        ),
        approvalDecisions: state.approvalDecisions.map((value) =>
          this.cloneApprovalDecision(value),
        ),
        passengers: state.passengers.map((value) => this.clonePassenger(value)),
        addresses: state.addresses.map((value) => this.cloneAddress(value)),
        costCenters: state.costCenters.map((value) =>
          this.cloneCostCenter(value),
        ),
        quotaPolicies: state.quotaPolicies.map((value) =>
          this.cloneQuotaPolicy(value),
        ),
        quotaLedger: state.quotaLedger.map((value) =>
          this.cloneQuotaLedgerEntry(value),
        ),
        quotaMonthlySnapshots: state.quotaMonthlySnapshots.map((value) =>
          this.cloneQuotaMonthlySnapshot(value),
        ),
        userRoles: state.userRoles.map((value) => this.cloneUserRole(value)),
        apiKeys: state.apiKeys.map((value) => this.cloneStoredApiKey(value)),
      };
    }

    const retainedPartnerEntries = state.partnerEntries
      .filter((entry) => entry.tenantId !== DEMO_TENANT_ID)
      .map((entry) => this.clonePartnerEntry(entry));
    const retainedPartnerEntrySlugs = new Set(
      retainedPartnerEntries.map((entry) => entry.entrySlug),
    );
    const retainIfNotDemoTenant = <T>(values: readonly T[]) =>
      values.filter((value) => {
        if (!value || typeof value !== "object" || !("tenantId" in value)) {
          return true;
        }
        return (value as { tenantId?: string }).tenantId !== DEMO_TENANT_ID;
      });

    return {
      notificationPreferences: retainIfNotDemoTenant(
        state.notificationPreferences,
      ).map((value) => ({ ...value })),
      webhookEndpoints: retainIfNotDemoTenant(state.webhookEndpoints).map(
        (value) => this.cloneStoredWebhookEndpoint(value),
      ),
      webhookDeliveries: retainIfNotDemoTenant(state.webhookDeliveries).map(
        (value) => this.cloneStoredWebhookDelivery(value),
      ),
      slaProfiles: retainIfNotDemoTenant(state.slaProfiles).map((value) =>
        this.cloneSlaProfile(value),
      ),
      partnerEntries: retainedPartnerEntries,
      partnerIngressCredentials: state.partnerIngressCredentials
        .filter((value) => retainedPartnerEntrySlugs.has(value.entrySlug))
        .map((value) => this.cloneStoredPartnerIngressCredential(value)),
      partnerEligibilityVerifications: retainIfNotDemoTenant(
        state.partnerEligibilityVerifications,
      ).map((value) => this.clonePartnerEligibilityVerification(value)),
      approvalRules: retainIfNotDemoTenant(state.approvalRules).map((value) =>
        this.cloneApprovalRule(value),
      ),
      approvalRequests: retainIfNotDemoTenant(state.approvalRequests).map(
        (value) => this.cloneApprovalRequest(value),
      ),
      approvalDecisions: retainIfNotDemoTenant(state.approvalDecisions).map(
        (value) => this.cloneApprovalDecision(value),
      ),
      passengers: retainIfNotDemoTenant(state.passengers).map((value) =>
        this.clonePassenger(value),
      ),
      addresses: retainIfNotDemoTenant(state.addresses).map((value) =>
        this.cloneAddress(value),
      ),
      costCenters: retainIfNotDemoTenant(state.costCenters).map((value) =>
        this.cloneCostCenter(value),
      ),
      quotaPolicies: retainIfNotDemoTenant(state.quotaPolicies).map((value) =>
        this.cloneQuotaPolicy(value),
      ),
      quotaLedger: retainIfNotDemoTenant(state.quotaLedger).map((value) =>
        this.cloneQuotaLedgerEntry(value),
      ),
      quotaMonthlySnapshots: retainIfNotDemoTenant(
        state.quotaMonthlySnapshots,
      ).map((value) => this.cloneQuotaMonthlySnapshot(value)),
      userRoles: retainIfNotDemoTenant(state.userRoles).map((value) =>
        this.cloneUserRole(value),
      ),
      apiKeys: retainIfNotDemoTenant(state.apiKeys).map((value) =>
        this.cloneStoredApiKey(value),
      ),
    };
  }

  private didSanitizePersistedState(
    original: TenantPartnerState,
    sanitized: TenantPartnerState,
  ): boolean {
    return JSON.stringify(original) !== JSON.stringify(sanitized);
  }

  private hasPersistedState(state: TenantPartnerState) {
    return (
      state.notificationPreferences.length > 0 ||
      state.slaProfiles.length > 0 ||
      state.webhookEndpoints.length > 0 ||
      state.webhookDeliveries.length > 0 ||
      state.partnerEntries.length > 0 ||
      state.partnerIngressCredentials.length > 0 ||
      state.partnerEligibilityVerifications.length > 0 ||
      state.approvalRules.length > 0 ||
      state.approvalRequests.length > 0 ||
      state.approvalDecisions.length > 0 ||
      state.passengers.length > 0 ||
      state.addresses.length > 0 ||
      state.costCenters.length > 0 ||
      state.quotaPolicies.length > 0 ||
      state.quotaLedger.length > 0 ||
      state.quotaMonthlySnapshots.length > 0 ||
      state.userRoles.length > 0 ||
      state.apiKeys.length > 0
    );
  }

  private buildStrictSanitizeChanges(
    original: TenantPartnerState,
    sanitized: TenantPartnerState,
  ): PersistTenantPartnerChanges {
    return {
      ...sanitized,
      deletedTenantIds: this.hasDemoTenantState(original)
        ? [DEMO_TENANT_ID]
        : [],
      deletedPartnerEntrySlugs: this.collectRemovedKeys(
        original.partnerEntries,
        sanitized.partnerEntries,
        (value) => value.entrySlug,
      ),
      deletedPartnerIngressCredentialIds: this.collectRemovedKeys(
        original.partnerIngressCredentials,
        sanitized.partnerIngressCredentials,
        (value) => value.keyId,
      ),
      deletedApprovalRequestIds: this.collectRemovedKeys(
        original.approvalRequests,
        sanitized.approvalRequests,
        (value) => value.approvalRequestId,
      ),
      deletedApprovalDecisionIds: this.collectRemovedKeys(
        original.approvalDecisions,
        sanitized.approvalDecisions,
        (value) => value.decisionId,
      ),
    };
  }

  private hasDemoTenantState(state: TenantPartnerState) {
    const addTenantIds = <T extends { tenantId: string }>(
      values: readonly T[],
      target: Set<string>,
    ) => {
      for (const value of values) {
        target.add(value.tenantId);
      }
    };

    const tenantIds = new Set<string>();
    addTenantIds(state.notificationPreferences, tenantIds);
    addTenantIds(state.webhookEndpoints, tenantIds);
    addTenantIds(state.webhookDeliveries, tenantIds);
    addTenantIds(state.slaProfiles, tenantIds);
    addTenantIds(state.partnerEntries, tenantIds);
    addTenantIds(state.partnerEligibilityVerifications, tenantIds);
    addTenantIds(state.approvalRules, tenantIds);
    addTenantIds(state.approvalRequests, tenantIds);
    addTenantIds(state.passengers, tenantIds);
    addTenantIds(state.addresses, tenantIds);
    addTenantIds(state.costCenters, tenantIds);
    addTenantIds(state.quotaPolicies, tenantIds);
    addTenantIds(state.quotaLedger, tenantIds);
    addTenantIds(state.quotaMonthlySnapshots, tenantIds);
    addTenantIds(state.userRoles, tenantIds);
    addTenantIds(state.apiKeys, tenantIds);
    return tenantIds.has(DEMO_TENANT_ID);
  }

  private collectRemovedKeys<T>(
    original: readonly T[],
    sanitized: readonly T[],
    keyOf: (value: T) => string,
  ) {
    const sanitizedKeys = new Set(sanitized.map(keyOf));
    return original.map(keyOf).filter((key) => !sanitizedKeys.has(key));
  }

  private requirePartnerIngressCredential(entrySlug: string, keyId: string) {
    const credential = this.partnerIngressCredentials.find(
      (candidate) =>
        candidate.entrySlug === entrySlug && candidate.keyId === keyId,
    );
    if (!credential) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_INGRESS_CREDENTIAL_NOT_FOUND",
        "The partner ingress credential could not be found.",
        {
          entrySlug,
          keyId,
        },
      );
    }
    this.reconcileStoredPartnerIngressCredential(credential);
    return credential;
  }

  private hashPartnerApiKey(apiKey: string) {
    return hashPartnerApiKeyValue(apiKey);
  }

  private hashesMatch(left: string, right: string) {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private assertPartnerEligibilityIdentity(
    identity: PartnerEligibilityIdentity | null | undefined,
    entry: PartnerChannelEntryRecord,
    requestId?: string,
  ) {
    if (!identity || identity.realm === "system") {
      return;
    }

    const partnerMismatch =
      identity.realm !== "partner" ||
      (identity.actorType === "referral_passenger"
        ? identity.tenantId !== entry.tenantId ||
          identity.partnerId !== entry.partnerId ||
          identity.partnerProgramId !== entry.programId ||
          identity.partnerEntrySlug !== entry.entrySlug
        : (identity.actorType !== "partner_api_key" &&
            identity.actorType !== "partner_user") ||
          (identity.tenantId !== null &&
            identity.tenantId !== undefined &&
            identity.tenantId !== entry.tenantId) ||
          (identity.partnerId !== null &&
            identity.partnerId !== undefined &&
            identity.partnerId !== entry.partnerId) ||
          (identity.partnerProgramId !== null &&
            identity.partnerProgramId !== undefined &&
            identity.partnerProgramId !== entry.programId) ||
          (identity.partnerEntrySlug !== null &&
            identity.partnerEntrySlug !== undefined &&
            identity.partnerEntrySlug !== entry.entrySlug));

    if (!partnerMismatch) {
      return;
    }

    this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
      reason: "identity_scope_mismatch",
      actorId: identity.actorId,
      identityTenantId: identity.tenantId,
      identityPartnerId: identity.partnerId,
      identityPartnerProgramId: identity.partnerProgramId,
      identityPartnerEntrySlug: identity.partnerEntrySlug,
    });
    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "PARTNER_SCOPE_MISMATCH",
      "Authenticated partner identity cannot access another partner or tenant entry.",
      {
        entrySlug: entry.entrySlug,
        tenantId: entry.tenantId,
      },
    );
  }

  private assertPartnerEligibilityVerificationIdentity(
    identity: PartnerEligibilityIdentity | null | undefined,
    verification: PartnerEligibilityVerificationRecord,
    eligibilityVerificationId: string,
  ) {
    if (!identity || identity.realm === "system") {
      return;
    }

    const partnerMismatch =
      identity.realm !== "partner" ||
      (identity.actorType === "referral_passenger"
        ? identity.tenantId !== verification.tenantId ||
          identity.partnerId !== verification.partnerId ||
          identity.partnerProgramId !== verification.partnerProgramId ||
          identity.partnerEntrySlug !== verification.partnerEntrySlug
        : (identity.actorType !== "partner_api_key" &&
            identity.actorType !== "partner_user") ||
          (identity.tenantId !== null &&
            identity.tenantId !== undefined &&
            identity.tenantId !== verification.tenantId) ||
          (identity.partnerId !== null &&
            identity.partnerId !== undefined &&
            identity.partnerId !== verification.partnerId) ||
          (identity.partnerProgramId !== null &&
            identity.partnerProgramId !== undefined &&
            identity.partnerProgramId !== verification.partnerProgramId) ||
          (identity.partnerEntrySlug !== null &&
            identity.partnerEntrySlug !== undefined &&
            identity.partnerEntrySlug !== verification.partnerEntrySlug));

    if (!partnerMismatch) {
      return;
    }

    this.recordPartnerIngressAttempt(
      this.findPartnerEntryBySlug(verification.partnerEntrySlug),
      identity.requestId ?? undefined,
      "rejected",
      {
        reason: "verification_scope_mismatch",
        actorId: identity.actorId,
        eligibilityVerificationId,
        identityTenantId: identity.tenantId,
        identityPartnerId: identity.partnerId,
        identityPartnerProgramId: identity.partnerProgramId,
        identityPartnerEntrySlug: identity.partnerEntrySlug,
      },
    );
    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "PARTNER_SCOPE_MISMATCH",
      "Authenticated partner identity cannot access another partner or tenant verification.",
      {
        eligibilityVerificationId,
        tenantId: verification.tenantId,
      },
    );
  }

  private findPartnerEntryBySlug(entrySlug: string) {
    return (
      this.partnerEntries.find((entry) => entry.entrySlug === entrySlug) ?? null
    );
  }

  private requirePartnerReferralPortalEntry(
    identity: IdentityContext | null,
    requestId?: string,
  ) {
    if (
      !identity ||
      (identity.actorType !== "partner_api_key" &&
        identity.actorType !== "partner_user") ||
      identity.realm !== "partner" ||
      !identity.partnerEntrySlug
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_SCOPE_REQUIRED",
        "Authenticated partner identity is required for referral portal reads.",
      );
    }

    const entry = this.requireAccessiblePartnerEntry(
      identity.partnerEntrySlug,
      requestId,
      "authenticate",
    );
    const partnerMismatch =
      identity.tenantId !== entry.tenantId ||
      (identity.partnerId ?? null) !== entry.partnerId ||
      (identity.partnerProgramId ?? null) !== entry.programId ||
      identity.partnerEntrySlug !== entry.entrySlug;

    if (partnerMismatch) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_SCOPE_MISMATCH",
        "Authenticated partner identity cannot access another partner entry.",
        {
          entrySlug: entry.entrySlug,
          tenantId: entry.tenantId,
        },
      );
    }

    if (entry.partnerType !== "referral_channel") {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_SCOPE_UNSUPPORTED",
        "Authenticated partner identity is not provisioned for the referral partner portal.",
        {
          entrySlug: entry.entrySlug,
          partnerType: entry.partnerType,
        },
      );
    }

    return entry;
  }

  private toPartnerReferralUsage(
    statement: ReferralStatementRecord,
  ): PartnerReferralUsagePeriodRecord {
    return {
      partnerEntrySlug: statement.partnerEntrySlug,
      period: statement.period,
      activeUserCount: statement.totals.activeRiderCount,
      tripCount: statement.totals.tripCount,
      gmv: { ...statement.totals.gmv },
    };
  }

  private toPartnerReferralRevenue(
    statement: ReferralStatementRecord,
  ): PartnerReferralRevenuePeriodRecord {
    return {
      partnerEntrySlug: statement.partnerEntrySlug,
      period: statement.period,
      currency: statement.currency,
      tripCount: statement.totals.tripCount,
      gmv: { ...statement.totals.gmv },
      shareAmount: { ...statement.totals.shareTotal },
      statementId: statement.statementId,
      statementStatus: statement.status,
      generatedAt: statement.generatedAt,
    };
  }

  private buildIssuedPartnerIngressCredential(
    entrySlug: string,
    rotationReason: string | null,
    input: {
      ownerRef?: string | null;
      ownerName?: string | null;
      ownerType?: string | null;
      purpose?: string | null;
      scopes?: string[] | undefined;
      expiresAt?: string | null;
    },
  ) {
    const now = new Date().toISOString();
    const plaintextKey = `pk_${randomBytes(18).toString("hex")}`;
    const owner = this.resolveCredentialOwner(input, {
      ownerRef: null,
      ownerName: "Platform partner credential owner",
      ownerType: "platform_admin",
    });
    const expiresAt = this.resolvePartnerIngressCredentialExpiry(
      input.expiresAt ?? null,
      now,
    );
    const storedCredential: StoredPartnerIngressCredentialRecord = {
      keyId: `partner_key_${randomUUID()}`,
      entrySlug,
      keyPrefix: plaintextKey.slice(0, 12),
      maskedSuffix: this.maskedSuffix(plaintextKey),
      source: "platform_admin",
      ownerRef: owner.ownerRef,
      ownerName: owner.ownerName,
      ownerType: owner.ownerType,
      purpose: this.resolveCredentialPurpose(
        input.purpose,
        `partner ingress for ${entrySlug}`,
      ),
      realm: "partner",
      resourceScope: `partner_entry:${entrySlug}`,
      scopes: [
        ...(input.scopes ?? [
          "partner:entries:read",
          "partner:eligibility:read",
          "partner:eligibility:write",
        ]),
      ],
      createdAt: now,
      lastUsedAt: null,
      lastUsedWorkload: null,
      expiresAt,
      status: "active",
      overlapEndsAt: null,
      autoRevokedAt: null,
      rotatedFromKeyId: null,
      supersededByKeyId: null,
      revokedAt: null,
      issuedBy: "platform_admin",
      revokedBy: null,
      rotationReason,
      revokeReason: null,
      signals: this.buildCredentialSignals(null, expiresAt, null, now),
      keyHash: this.hashPartnerApiKey(plaintextKey),
    };

    return {
      storedCredential,
      credential: this.toPartnerIngressCredentialResponse(storedCredential),
      plaintextKey,
    };
  }

  private resolveLifecycleStatus(
    status: PartnerEntryStatus | undefined,
  ): PartnerEntryStatus | undefined {
    return status;
  }

  private requireApiKey(tenantId: string, apiKeyId: string) {
    const apiKey = this.apiKeys.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.apiKeyId === apiKeyId,
    );
    if (!apiKey) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "API_KEY_NOT_FOUND",
        "The tenant API key could not be found.",
        {
          apiKeyId,
        },
      );
    }
    this.reconcileStoredApiKey(apiKey);
    return apiKey;
  }

  private requireWebhookEndpoint(tenantId: string, webhookId: string) {
    const endpoint = this.webhookEndpoints.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.webhookId === webhookId,
    );
    if (!endpoint) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "WEBHOOK_NOT_FOUND",
        "The tenant webhook endpoint could not be found.",
        {
          webhookId,
        },
      );
    }
    this.reconcileStoredWebhookEndpoint(endpoint);
    return endpoint;
  }

  private requireApprovalRequest(tenantId: string, approvalRequestId: string) {
    const request = this.approvalRequests.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.approvalRequestId === approvalRequestId,
    );
    if (!request) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "APPROVAL_REQUEST_NOT_FOUND",
        "The approval request could not be found.",
        {
          approvalRequestId,
        },
      );
    }
    return request;
  }

  private requirePendingApprovalRequest(
    tenantId: string,
    approvalRequestId: string,
  ) {
    const request = this.requireApprovalRequest(tenantId, approvalRequestId);
    if (request.status !== "pending") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "APPROVAL_REQUEST_NOT_PENDING",
        "The approval request is no longer pending.",
        {
          approvalRequestId,
          status: request.status,
        },
      );
    }
    return request;
  }

  private requirePendingApprovalRequestById(approvalRequestId: string) {
    const request = this.approvalRequests.find(
      (candidate) => candidate.approvalRequestId === approvalRequestId,
    );
    if (!request) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "APPROVAL_REQUEST_NOT_FOUND",
        "The approval request could not be found.",
        {
          approvalRequestId,
        },
      );
    }
    if (request.status !== "pending") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "APPROVAL_REQUEST_NOT_PENDING",
        "The approval request is no longer pending.",
        {
          approvalRequestId,
          status: request.status,
        },
      );
    }
    return request;
  }

  private requireOpsApprovalQueueIdentity(identity: IdentityContext | null) {
    const actorType = identity?.actorType;
    if (
      !identity?.actorId ||
      !actorType ||
      !OPS_APPROVAL_QUEUE_ACTOR_TYPES.has(
        actorType as AuditLogRecord["actorType"],
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "APPROVAL_NOT_AUTHORIZED",
        "The caller is not authorized to manage ops approval requests.",
      );
    }
    return {
      actorId: identity.actorId,
      actorType: actorType as Extract<
        AuditLogRecord["actorType"],
        "ops_user" | "platform_admin"
      >,
    };
  }

  private resolveOpsApprovalQueueRoleCode(identity: IdentityContext | null) {
    return identity?.roles?.[0] ?? null;
  }

  private buildOpsPendingApprovalRequestRecord(
    request: TenantBookingApprovalRequestRecord,
  ): OpsPendingApprovalRequestRecord {
    const auditLogs = this.auditNotificationService
      .getAuditLogsSnapshot()
      .filter(
        (auditLog) =>
          auditLog.moduleName === "tenant-partner" &&
          auditLog.resourceType === "tenant_approval_request" &&
          auditLog.resourceId === request.approvalRequestId,
      );
    const lastNudge = [...auditLogs]
      .filter(
        (auditLog) => auditLog.actionName === OPS_APPROVAL_REQUEST_NUDGE_ACTION,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const lastAck = [...auditLogs]
      .filter(
        (auditLog) =>
          auditLog.actionName === OPS_APPROVAL_REQUEST_SLA_ACK_ACTION,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    return {
      ...this.cloneApprovalRequest(request),
      slaBreached: Date.parse(request.timeoutAt) <= Date.now(),
      lastNudgedAt: lastNudge?.createdAt ?? null,
      lastNudgedByActorId: lastNudge?.actorId ?? null,
      lastNudgedByActorType: (lastNudge?.actorType ??
        null) as OpsPendingApprovalRequestRecord["lastNudgedByActorType"],
      opsSlaAcknowledgedAt: lastAck?.createdAt ?? null,
      opsSlaAcknowledgedByActorId: lastAck?.actorId ?? null,
      opsSlaAcknowledgedByActorType: (lastAck?.actorType ??
        null) as OpsPendingApprovalRequestRecord["opsSlaAcknowledgedByActorType"],
      availableActions: this.buildOpsApprovalRequestAvailableActions(request),
    };
  }

  private buildOpsApprovalRequestAvailableActions(
    request: TenantBookingApprovalRequestRecord,
  ): ResourceActionDescriptor[] {
    if (request.status !== "pending") {
      return [];
    }

    return [
      {
        action: "approve",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "reject",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "escalate",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
    ];
  }

  private replaceApprovalRequest(request: TenantBookingApprovalRequestRecord) {
    this.approvalRequests = [
      this.cloneApprovalRequest(request),
      ...this.approvalRequests.filter(
        (candidate) =>
          candidate.approvalRequestId !== request.approvalRequestId,
      ),
    ];
  }

  private mergeApprovalRequestDecisions(
    request: TenantBookingApprovalRequestRecord,
    decisions: readonly TenantBookingApprovalDecisionRecord[],
  ) {
    const merged = new Map<string, TenantBookingApprovalDecisionRecord>();
    for (const decision of request.decisions ?? []) {
      merged.set(decision.decisionId, this.cloneApprovalDecision(decision));
    }
    for (const decision of decisions) {
      merged.set(decision.decisionId, this.cloneApprovalDecision(decision));
    }
    return {
      ...request,
      decisions: [...merged.values()].sort((left, right) =>
        left.decidedAt.localeCompare(right.decidedAt),
      ),
    };
  }

  private findActiveTenantUser(tenantId: string, userId: string) {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return null;
    }
    const userRole = this.userRoles.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.userId === normalizedUserId &&
        candidate.status === "active",
    );
    return userRole ? this.cloneUserRole(userRole) : null;
  }

  private listActiveTenantUsersByRole(tenantId: string, roleCode: string) {
    return this.userRoles
      .filter(
        (candidate) =>
          candidate.tenantId === tenantId &&
          candidate.roleCode === roleCode &&
          candidate.status === "active",
      )
      .map((userRole) => this.cloneUserRole(userRole));
  }

  private getActiveCostCenterOwnerUserId(
    tenantId: string,
    costCenterCode: string,
  ) {
    const costCenter = this.costCenters.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.code === costCenterCode,
    );
    if (!costCenter?.ownerUserId) {
      return null;
    }
    return this.findActiveTenantUser(tenantId, costCenter.ownerUserId)
      ? costCenter.ownerUserId
      : null;
  }

  private resolveApprovalNotificationRecipients(
    tenantId: string,
    userIds: readonly string[],
  ): ApprovalNotificationRecipient[] {
    const recipients = new Map<string, ApprovalNotificationRecipient>();

    for (const userId of userIds) {
      const user = this.findActiveTenantUser(tenantId, userId);
      if (!user || recipients.has(user.userId)) {
        continue;
      }
      recipients.set(user.userId, {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        approvalNotificationOptOut: user.approvalNotificationOptOut,
      });
    }

    return [...recipients.values()];
  }

  private toApprovalNotificationEventType(
    templateKey: ApprovalNotificationTemplateKey,
  ) {
    switch (templateKey) {
      case "new_request":
        return "booking.approval_request.created";
      case "approaching_timeout":
        return "booking.approval_request.approaching_timeout";
      case "escalated":
        return "booking.approval_request.timeout_escalated";
      case "approved":
        return "booking.approval_request.approved";
      case "rejected":
        return "booking.approval_request.rejected";
    }
  }

  private startApprovalNotificationPolling() {
    if (this.approvalNotificationPollTimer) {
      return;
    }
    this.approvalNotificationPollTimer = setInterval(() => {
      void this.pollPendingApprovalTimeoutNotifications();
    }, APPROVAL_NOTIFICATION_POLL_INTERVAL_MS);
    this.approvalNotificationPollTimer.unref?.();
  }

  private async pollPendingApprovalTimeoutNotifications() {
    if (this.approvalNotificationPollInFlight) {
      return;
    }

    this.approvalNotificationPollInFlight = true;
    try {
      const now = Date.now();
      const eligibleRequests = this.approvalRequests.filter((request) => {
        if (request.status !== "pending" || request.escalatedAt) {
          return false;
        }

        const timeoutAtMs = Date.parse(request.timeoutAt);
        if (!Number.isFinite(timeoutAtMs) || timeoutAtMs <= now) {
          return false;
        }

        return (
          timeoutAtMs - APPROVAL_NOTIFICATION_TIMEOUT_LEAD_MS <= now &&
          !this.auditNotificationService.hasApprovalNotificationDispatch(
            request.approvalRequestId,
            "approaching_timeout",
          )
        );
      });

      for (const request of eligibleRequests) {
        await this.dispatchApprovalNotifications(
          "approaching_timeout",
          request,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown polling failure";
      this.logger.error(
        `Failed to poll pending approval timeout notifications: ${message}`,
      );
    } finally {
      this.approvalNotificationPollInFlight = false;
    }
  }

  private async dispatchApprovalNotifications(
    templateKey: ApprovalNotificationTemplateKey,
    request: TenantBookingApprovalRequestRecord,
    options?: {
      requestId?: string;
      actorUserId?: string | null;
      decidedAt?: string | null;
      reasonCode?: string | null;
      reasonNote?: string | null;
      recipientUserIds?: readonly string[];
    },
  ) {
    const recipientUserIds =
      options?.recipientUserIds ?? request.resolvedApproverUserIds;
    const recipients = this.resolveApprovalNotificationRecipients(
      request.tenantId,
      recipientUserIds,
    );
    const dispatchResult =
      await this.auditNotificationService.dispatchApprovalNotification({
        templateKey,
        tenantId: request.tenantId,
        approvalRequestId: request.approvalRequestId,
        bookingId: request.bookingId,
        orderId: request.orderId,
        timeoutAt: request.timeoutAt,
        recipients,
        escalatedAt: request.escalatedAt ?? null,
        decidedAt: options?.decidedAt ?? request.resolvedAt ?? null,
        actorUserId: options?.actorUserId ?? null,
        reasonCode: options?.reasonCode ?? null,
        reasonNote: options?.reasonNote ?? null,
        ...(options?.requestId ? { requestId: options.requestId } : {}),
      });

    if (dispatchResult.deduplicated) {
      return dispatchResult;
    }

    await this.publishWebhookEvent(request.tenantId, {
      eventType: this.toApprovalNotificationEventType(templateKey),
      data: {
        approvalRequestId: request.approvalRequestId,
        bookingId: request.bookingId,
        orderId: request.orderId,
        status: request.status,
        resolvedApproverUserIds: [...request.resolvedApproverUserIds],
        timeoutAt: request.timeoutAt,
        escalatedAt: request.escalatedAt,
        resolvedAt: request.resolvedAt,
        actorUserId: options?.actorUserId ?? null,
        reasonCode: options?.reasonCode ?? null,
        reasonNote: options?.reasonNote ?? null,
      },
      occurredAt:
        request.resolvedAt ?? request.escalatedAt ?? new Date().toISOString(),
    });

    return dispatchResult;
  }

  private async escalateApprovalRequestInternal(input: {
    tenantId: string;
    approvalRequestId: string;
    actorUserId: string;
    actorType?: AuditLogRecord["actorType"];
    reasonNote: string | null;
    requestId?: string;
  }) {
    const request = this.requirePendingApprovalRequest(
      input.tenantId,
      input.approvalRequestId,
    );
    const escalationTarget = request.escalationTarget ?? {
      kind: "tenant_admin" as const,
      displayName: "Tenant Admin",
    };
    const resolvedApproverUserIds = resolveApprovalApproverUserIds(
      {
        approvers: [escalationTarget],
        escalationTarget,
        bookingCostCenterCode:
          request.evaluationSnapshot.inputSnapshot?.costCenterCode ?? null,
      },
      {
        hasUser: (userId) =>
          this.findActiveTenantUser(input.tenantId, userId) !== null,
        listUserIdsByRole: (roleCode) =>
          this.listActiveTenantUsersByRole(input.tenantId, roleCode).map(
            (userRole) => userRole.userId,
          ),
        getCostCenterOwnerUserId: (costCenterCode) =>
          this.getActiveCostCenterOwnerUserId(input.tenantId, costCenterCode),
      },
    ).resolvedApproverUserIds;
    const now = new Date().toISOString();
    // P1 manual escalation rotates approvers to the escalation target but keeps
    // the request actionable so the booking is not stranded in approvalState=pending
    // with an empty approvalRequestIds. Auto-terminal escalation is deferred to P2.
    const escalated: TenantBookingApprovalRequestRecord = {
      ...request,
      status: "pending",
      previousApprovers: request.approvers.map((approver) =>
        this.clonePrincipalRef(approver),
      ),
      approvers: [this.clonePrincipalRef(escalationTarget)],
      resolvedApproverUserIds,
      decisions: [],
      escalatedAt: now,
      resolvedAt: null,
    };

    this.replaceApprovalRequest(escalated);
    await this.persistApprovalWorkflow({
      approvalRequests: [escalated],
      context: "escalate approval request",
    });
    this.recordTenantAudit(
      {
        actorId: input.actorUserId,
        actorType: input.actorType ?? "tenant_admin",
        tenantId: input.tenantId,
        moduleName: "tenant-partner",
        actionName: "booking.approval_request.timeout_escalated",
        resourceType: "booking",
        resourceId: escalated.bookingId,
        newValuesSummary: {
          approvalRequestId: input.approvalRequestId,
          bookingId: escalated.bookingId,
          orderId: escalated.orderId,
          previousApprovers: escalated.previousApprovers,
          escalationTarget: escalated.escalationTarget,
          reasonNote: input.reasonNote,
        },
      },
      input.requestId,
    );
    await this.dispatchApprovalNotifications("escalated", escalated, {
      actorUserId: input.actorUserId,
      reasonNote: input.reasonNote,
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
    return this.cloneApprovalRequest(escalated);
  }

  private async recordOpsApprovalDecision(input: {
    approvalRequestId: string;
    actorId: string;
    actorType: Extract<
      AuditLogRecord["actorType"],
      "ops_user" | "platform_admin"
    >;
    actorRoleCode: string | null;
    decision: "approve" | "reject";
    reasonCode: string | null;
    reasonNote: string | null;
    requestId?: string;
  }) {
    const request = this.requirePendingApprovalRequestById(
      input.approvalRequestId,
    );
    const decidedAt = new Date().toISOString();
    const decision: TenantBookingApprovalDecisionRecord = {
      decisionId: `approval-decision-${randomUUID()}`,
      approvalRequestId: request.approvalRequestId,
      actorUserId: input.actorId,
      actorRoleCode: input.actorRoleCode,
      decision: input.decision,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      decidedAt,
    };
    const persistedRequest: TenantBookingApprovalRequestRecord = {
      ...request,
      decisions: [...request.decisions, this.cloneApprovalDecision(decision)],
      status: input.decision === "approve" ? "approved" : "rejected",
      resolvedAt: decidedAt,
    };

    this.approvalDecisions = [
      this.cloneApprovalDecision(decision),
      ...this.approvalDecisions.filter(
        (candidate) => candidate.decisionId !== decision.decisionId,
      ),
    ];
    this.replaceApprovalRequest(persistedRequest);
    await this.persistApprovalWorkflow({
      approvalRequests: [persistedRequest],
      approvalDecisions: [decision],
      context: "record ops approval decision",
    });

    this.recordTenantAudit(
      {
        actorId: input.actorId,
        actorType: input.actorType,
        tenantId: request.tenantId,
        moduleName: "tenant-partner",
        actionName:
          input.decision === "approve"
            ? "booking.approval_request.approved"
            : "booking.approval_request.rejected",
        resourceType: "booking",
        resourceId: persistedRequest.bookingId,
        newValuesSummary: {
          approvalRequestId: request.approvalRequestId,
          bookingId: persistedRequest.bookingId,
          orderId: persistedRequest.orderId,
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote,
          actorRoleCode: input.actorRoleCode,
        },
      },
      input.requestId,
    );
    await this.dispatchApprovalNotifications(
      input.decision === "approve" ? "approved" : "rejected",
      persistedRequest,
      {
        actorUserId: input.actorId,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        ...(input.requestId ? { requestId: input.requestId } : {}),
      },
    );

    return this.buildOpsPendingApprovalRequestRecord(persistedRequest);
  }

  private async recordApprovalDecision(input: {
    tenantId: string;
    approvalRequestId: string;
    actorUserId: string;
    actorRoleCode: string | null;
    decision: "approve" | "reject";
    reasonCode: string | null;
    reasonNote: string | null;
    requestId?: string;
  }) {
    const request = this.requirePendingApprovalRequest(
      input.tenantId,
      input.approvalRequestId,
    );
    if (!request.resolvedApproverUserIds.includes(input.actorUserId)) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "APPROVAL_NOT_AUTHORIZED",
        "The caller is not authorized to act on this approval request.",
        {
          approvalRequestId: input.approvalRequestId,
          actorUserId: input.actorUserId,
        },
      );
    }
    if (hasActorDecidedApprovalRequest(request.decisions, input.actorUserId)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "APPROVAL_DECISION_ALREADY_RECORDED",
        "The caller has already decided this approval request.",
        {
          approvalRequestId: input.approvalRequestId,
          actorUserId: input.actorUserId,
        },
      );
    }

    const actor =
      this.findActiveTenantUser(input.tenantId, input.actorUserId) ?? null;
    const decision: TenantBookingApprovalDecisionRecord = {
      decisionId: `approval-decision-${randomUUID()}`,
      approvalRequestId: request.approvalRequestId,
      actorUserId: input.actorUserId,
      actorRoleCode: input.actorRoleCode ?? actor?.roleCode ?? null,
      decision: input.decision,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      decidedAt: new Date().toISOString(),
    };
    const nextRequest = this.mergeApprovalRequestDecisions(
      {
        ...request,
        decisions: [...request.decisions, this.cloneApprovalDecision(decision)],
      },
      [],
    );
    const nextStatus = computeApprovalRequestStatus({
      approvalMode: request.approvalMode,
      resolvedApproverUserIds: request.resolvedApproverUserIds,
      decisions: nextRequest.decisions,
    });
    const persistedRequest: TenantBookingApprovalRequestRecord = {
      ...nextRequest,
      status: nextStatus.status,
      resolvedAt: nextStatus.resolved ? decision.decidedAt : null,
    };

    this.approvalDecisions = [
      this.cloneApprovalDecision(decision),
      ...this.approvalDecisions.filter(
        (candidate) => candidate.decisionId !== decision.decisionId,
      ),
    ];
    this.replaceApprovalRequest(persistedRequest);
    await this.persistApprovalWorkflow({
      approvalRequests: [persistedRequest],
      approvalDecisions: [decision],
      context: "record approval decision",
    });

    if (persistedRequest.status !== "pending") {
      this.recordTenantAudit(
        {
          actorId: input.actorUserId,
          actorType: "tenant_admin",
          tenantId: input.tenantId,
          moduleName: "tenant-partner",
          actionName:
            persistedRequest.status === "approved"
              ? "booking.approval_request.approved"
              : "booking.approval_request.rejected",
          resourceType: "booking",
          resourceId: persistedRequest.bookingId,
          newValuesSummary: {
            approvalRequestId: input.approvalRequestId,
            bookingId: persistedRequest.bookingId,
            orderId: persistedRequest.orderId,
            decision: input.decision,
            reasonCode: input.reasonCode,
          },
        },
        input.requestId,
      );
      await this.dispatchApprovalNotifications(
        persistedRequest.status === "approved" ? "approved" : "rejected",
        persistedRequest,
        {
          actorUserId: input.actorUserId,
          decidedAt: decision.decidedAt,
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote,
          ...(input.requestId ? { requestId: input.requestId } : {}),
        },
      );
    }

    return this.cloneApprovalRequest(persistedRequest);
  }

  private recordApprovalFallbackAudits(
    tenantId: string,
    bookingId: string,
    fallbackRecords: readonly ApprovalApproverFallbackRecord[],
    requestId?: string,
  ) {
    fallbackRecords.forEach((record) =>
      this.recordTenantAudit(
        {
          actorId: null,
          actorType: "tenant_admin",
          tenantId,
          moduleName: "tenant-partner",
          actionName: "approver_fallback_used",
          resourceType: "booking",
          resourceId: bookingId,
          newValuesSummary: {
            descriptor: record.descriptor,
            fallbackDescriptor: record.fallbackDescriptor,
            reasonCode: record.reasonCode,
          },
        },
        requestId,
      ),
    );
  }

  private persistApprovalWorkflow(params: {
    tx?: TenantPartnerQueryExecutor | null;
    approvalRequests?: readonly TenantBookingApprovalRequestRecord[];
    approvalDecisions?: readonly TenantBookingApprovalDecisionRecord[];
    context: string;
  }): MaybePromise<void> {
    if (!this.tenantPartnerRepository) {
      return;
    }

    const approvalRequests = (params.approvalRequests ?? []).map((request) =>
      this.cloneApprovalRequest(request),
    );
    const approvalDecisions = (params.approvalDecisions ?? []).map((decision) =>
      this.cloneApprovalDecision(decision),
    );

    try {
      if (params.tx) {
        return this.tenantPartnerRepository.persistApprovalWorkflow(params.tx, {
          approvalRequests,
          approvalDecisions,
        });
      }

      return this.tenantPartnerRepository.persistChanges({
        approvalRequests,
        approvalDecisions,
      });
    } catch (error) {
      this.tenantPartnerRepository.reportPersistenceFailure(
        error,
        params.context,
      );
      throw error;
    }
  }

  private afterPersistence<T>(
    persisted: MaybePromise<void>,
    onSuccess: () => MaybePromise<T>,
  ): MaybePromise<T> {
    if (persisted instanceof Promise) {
      return persisted.then(() => onSuccess());
    }
    return onSuccess();
  }

  private clonePrincipalRef(
    principal: TenantBookingApprovalRequestRecord["approvers"][number],
  ) {
    return { ...principal };
  }

  private cloneApprovalDecision(
    decision: TenantBookingApprovalDecisionRecord,
  ): TenantBookingApprovalDecisionRecord {
    return {
      ...decision,
      reasonCode: decision.reasonCode ?? null,
      reasonNote: decision.reasonNote ?? null,
    };
  }

  private cloneApprovalRequest(
    request: TenantBookingApprovalRequestRecord,
  ): TenantBookingApprovalRequestRecord {
    return {
      ...request,
      approvers: request.approvers.map((approver) =>
        this.clonePrincipalRef(approver),
      ),
      resolvedApproverUserIds: [...request.resolvedApproverUserIds],
      previousApprovers: request.previousApprovers.map((approver) =>
        this.clonePrincipalRef(approver),
      ),
      decisions: request.decisions.map((decision) =>
        this.cloneApprovalDecision(decision),
      ),
      evaluationSnapshot: this.cloneTenantApprovalEvaluationResult(
        request.evaluationSnapshot,
      ),
      escalationTarget: request.escalationTarget
        ? this.clonePrincipalRef(request.escalationTarget)
        : null,
    };
  }

  private cloneTenantApprovalEvaluationResult(
    result: TenantApprovalEvaluationResult,
  ): TenantApprovalEvaluationResult {
    return {
      ...result,
      matchedRules: result.matchedRules.map((rule) => ({
        ...rule,
        approvers: rule.approvers.map((approver) =>
          this.clonePrincipalRef(approver),
        ),
        matchedConditions: rule.matchedConditions.map((condition) => ({
          ...condition,
          ...(Array.isArray(condition.values)
            ? { values: [...condition.values] }
            : {}),
          ...(Array.isArray(condition.value)
            ? { value: [...condition.value] }
            : {}),
        })),
      })),
      ...(result.subject ? { subject: { ...result.subject } } : {}),
      ...(result.inputSnapshot
        ? { inputSnapshot: { ...result.inputSnapshot } }
        : {}),
      ...(result.quotaImpacts
        ? { quotaImpacts: result.quotaImpacts.map((impact) => ({ ...impact })) }
        : {}),
      ...(result.outcome
        ? {
            outcome: {
              ...result.outcome,
              warnings: result.outcome.warnings.map((warning) => ({
                ...warning,
              })),
              reasonCodes: [...result.outcome.reasonCodes],
            },
          }
        : {}),
      ...(result.approvalPlan === null
        ? { approvalPlan: null }
        : result.approvalPlan
          ? {
              approvalPlan: {
                ...result.approvalPlan,
                approvers: result.approvalPlan.approvers.map((approver) =>
                  this.clonePrincipalRef(approver),
                ),
                escalationTarget: result.approvalPlan.escalationTarget
                  ? this.clonePrincipalRef(result.approvalPlan.escalationTarget)
                  : null,
              },
            }
          : {}),
      ...(result.auditSummary
        ? { auditSummary: { ...result.auditSummary } }
        : {}),
      ...(result.warnings
        ? { warnings: result.warnings.map((warning) => ({ ...warning })) }
        : {}),
    };
  }

  private recordTenantAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditLogInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      ...input,
    };
    if (requestId) {
      auditLogInput.requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(auditLogInput);
  }

  getTenantGovernanceMetricsSnapshot(
    referenceDate = new Date(),
  ): TenantGovernanceMetricsSnapshot {
    const referenceTimeMs = referenceDate.getTime();
    const auditLogs = this.auditNotificationService
      .getAuditLogsSnapshot()
      .filter(
        (auditLog) =>
          auditLog.moduleName === "tenant-partner" &&
          typeof auditLog.tenantId === "string" &&
          auditLog.tenantId.length > 0,
      );
    const tenantIds = new Set<string>([
      ...auditLogs
        .map((auditLog) => auditLog.tenantId)
        .filter((tenantId): tenantId is string => Boolean(tenantId)),
      ...this.approvalRequests.map((request) => request.tenantId),
      ...this.costCenters.map((costCenter) => costCenter.tenantId),
      ...Array.from(this.quotaPolicies.values()).map(
        (policy) => policy.tenantId,
      ),
    ]);
    const samples: TenantGovernanceMetricSample[] = [];

    for (const tenantId of [...tenantIds].sort((left, right) =>
      left.localeCompare(right),
    )) {
      const pendingApprovalAgesHours = this.approvalRequests
        .filter(
          (request) =>
            request.tenantId === tenantId && request.status === "pending",
        )
        .map((request) =>
          Math.max(
            0,
            (referenceTimeMs - Date.parse(request.createdAt)) /
              (60 * 60 * 1000),
          ),
        );
      const tenantAuditLogs = auditLogs.filter(
        (auditLog) => auditLog.tenantId === tenantId,
      );
      const evaluatorLatenciesMs = tenantAuditLogs
        .filter(
          (auditLog) =>
            auditLog.actionName === "booking.approval_rules.evaluated",
        )
        .map((auditLog) =>
          this.readNumericSummaryValue(
            auditLog.newValuesSummary,
            "evaluationLatencyMs",
          ),
        )
        .filter((value): value is number => value !== null);
      const validationRejectCounts =
        this.countCostCenterValidationRejectsByCode(tenantAuditLogs);
      const quotaUsagePercent = this.computeQuotaPercentUsed(
        this.getTenantQuotaSummary(tenantId).usage.remainingPercent,
      );

      samples.push(
        this.buildTenantGovernanceMetricSample(
          "approval.pending_count",
          { tenant_id: tenantId },
          pendingApprovalAgesHours.length,
          "count",
        ),
        this.buildTenantGovernanceMetricSample(
          "approval.pending_age_hours",
          { tenant_id: tenantId, quantile: "p95" },
          this.computePercentile(pendingApprovalAgesHours, 0.95),
          "hours",
        ),
        this.buildTenantGovernanceMetricSample(
          "approval.pending_age_hours",
          { tenant_id: tenantId, quantile: "max" },
          this.computePercentile(pendingApprovalAgesHours, 1),
          "hours",
        ),
        this.buildTenantGovernanceMetricSample(
          "quota.usage_percent",
          { tenant_id: tenantId },
          quotaUsagePercent,
          "percent",
        ),
        this.buildTenantGovernanceMetricSample(
          "quota.ledger_write_total",
          { tenant_id: tenantId },
          tenantAuditLogs.filter(
            (auditLog) =>
              auditLog.actionName === "tenant.quota_ledger.entry_added",
          ).length,
          "count",
        ),
        this.buildTenantGovernanceMetricSample(
          "quota.ledger_write_per_second",
          { tenant_id: tenantId },
          this.countAuditEventsWithinWindow(
            tenantAuditLogs,
            "tenant.quota_ledger.entry_added",
            FIVE_MINUTES_IN_MS,
            referenceTimeMs,
          ) /
            (FIVE_MINUTES_IN_MS / 1000),
          "count",
        ),
        this.buildTenantGovernanceMetricSample(
          "quota.race_failure_total",
          {
            tenant_id: tenantId,
            error_code: "QUOTA_INSUFFICIENT_AT_COMMIT",
          },
          tenantAuditLogs.filter(
            (auditLog) =>
              auditLog.actionName === "tenant.quota_reservation.blocked" &&
              auditLog.newValuesSummary?.errorCode ===
                "QUOTA_INSUFFICIENT_AT_COMMIT",
          ).length,
          "count",
        ),
      );

      for (const [label, quantile] of [
        ["p50", 0.5],
        ["p95", 0.95],
        ["p99", 0.99],
      ] as const) {
        samples.push(
          this.buildTenantGovernanceMetricSample(
            "approval.evaluator_latency_ms",
            { tenant_id: tenantId, quantile: label },
            this.computePercentile(evaluatorLatenciesMs, quantile),
            "milliseconds",
          ),
        );
      }

      for (const [errorCode, count] of [
        ...validationRejectCounts.entries(),
      ].sort(([left], [right]) => left.localeCompare(right))) {
        samples.push(
          this.buildTenantGovernanceMetricSample(
            "cost_center.validation_reject_total",
            { tenant_id: tenantId, error_code: errorCode },
            count,
            "count",
          ),
        );
      }
    }

    return {
      generatedAt: referenceDate.toISOString(),
      namespace: TENANT_GOVERNANCE_METRIC_NAMESPACE,
      samples,
    };
  }

  private recordPartnerIngressAttempt(
    entry: PartnerChannelEntryRecord | null,
    requestId: string | undefined,
    outcome: "accepted" | "rejected",
    details: Record<string, unknown>,
  ) {
    this.recordTenantAudit(
      {
        actorId:
          typeof details.actorId === "string"
            ? (details.actorId as string)
            : null,
        actorType: "partner_api_key",
        tenantId: entry?.tenantId ?? null,
        moduleName: "tenant-partner",
        actionName:
          outcome === "accepted"
            ? "partner_ingress_authenticated"
            : "partner_ingress_rejected",
        resourceType: "partner_entry",
        resourceId: entry?.entrySlug ?? null,
        newValuesSummary: {
          partnerId: entry?.partnerId ?? null,
          partnerProgramId: entry?.programId ?? null,
          partnerEntrySlug: entry?.entrySlug ?? null,
          outcome,
          ...details,
        },
      },
      requestId,
    );
  }

  private hashSecret(secret: string) {
    return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
  }

  private secretPreview(secret: string) {
    const hash = createHash("sha256").update(secret).digest("hex");
    return `sha256:${hash.slice(0, 12)}`;
  }

  private maskedSuffix(secret: string) {
    return `****${secret.slice(-4)}`;
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizePassengerRoles(
    roles: TenantPassengerMasterRole[] | undefined,
  ): TenantPassengerMasterRole[] {
    const normalized = [...new Set((roles ?? ["passenger"]).filter(Boolean))];
    return normalized.length > 0 ? normalized : ["passenger"];
  }

  private buildPassengerQualityIssues(
    tenantId: string,
    passenger: TenantPassengerRecord,
  ): TenantPassengerQualityIssue[] {
    const issues: TenantPassengerQualityIssue[] = [];
    if (!passenger.mobile && !passenger.email) {
      issues.push("missing_contact");
    }
    if (
      passenger.roles?.includes("employee") &&
      !this.normalizeNullableText(passenger.employeeNo)
    ) {
      issues.push("missing_employee_no");
    }
    if (
      passenger.employeeNo &&
      this.passengers.some(
        (candidate) =>
          candidate.tenantId === tenantId &&
          candidate.passengerId !== passenger.passengerId &&
          candidate.employeeNo === passenger.employeeNo,
      )
    ) {
      issues.push("duplicate_employee_no");
    }
    return issues;
  }

  private normalizeAddressTags(tags: string[] | undefined): string[] {
    const normalized = [
      ...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
    ];
    return normalized.sort((left, right) => left.localeCompare(right));
  }

  private normalizeAddressText(value: string): string {
    return value.replace(/\s+/g, "").trim();
  }

  private resolveAddressGeocodeSource(
    source: TenantAddressGeocodeSource | undefined,
    lat: number | null,
    lng: number | null,
  ): TenantAddressGeocodeSource {
    const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
    if (!hasCoordinates) {
      return "none";
    }
    return source ?? "manual";
  }

  private buildAddressQualityIssues(
    tenantId: string,
    address: TenantAddressRecord,
  ): TenantAddressQualityIssue[] {
    const issues: TenantAddressQualityIssue[] = [];
    const hasCoordinates =
      Number.isFinite(address.lat) && Number.isFinite(address.lng);
    if (!hasCoordinates) {
      issues.push("missing_geocode");
    }
    if (
      address.normalizedAddressText &&
      this.addresses.some(
        (candidate) =>
          candidate.tenantId === tenantId &&
          candidate.addressId !== address.addressId &&
          candidate.normalizedAddressText === address.normalizedAddressText,
      )
    ) {
      issues.push("duplicate_normalized_address");
    }
    return issues;
  }

  private normalizeCostCenterCode(value: string) {
    const normalized = this.requireNonBlank(value, "code").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(normalized)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "COST_CENTER_CODE_INVALID",
        "code must use uppercase letters, numbers, or hyphens.",
        {
          code: value,
        },
      );
    }
    return normalized;
  }

  private cloneApprovalRule(
    rule: TenantApprovalRuleRecord,
  ): TenantApprovalRuleRecord {
    return {
      ...rule,
      approvers: rule.approvers.map((approver) => ({ ...approver })),
      escalationTarget: rule.escalationTarget
        ? { ...rule.escalationTarget }
        : null,
      conditions: rule.conditions.map((condition) => ({
        ...condition,
        ...(Array.isArray(condition.values)
          ? { values: [...condition.values] }
          : {}),
        ...(Array.isArray(condition.value)
          ? { value: [...condition.value] }
          : {}),
      })),
    };
  }

  private requireApprovalRule(tenantId: string, ruleId: string) {
    const rule = this.approvalRules.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.ruleId === ruleId,
    );
    if (!rule) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "TENANT_APPROVAL_RULE_NOT_FOUND",
        "The tenant approval rule could not be found.",
        { ruleId },
      );
    }
    return rule;
  }

  private bumpApprovalRuleVersion(tenantId: string) {
    this.approvalRuleVersions.set(
      tenantId,
      (this.approvalRuleVersions.get(tenantId) ?? 0) + 1,
    );
  }

  private getApprovalRuleVersionSnapshot(tenantId: string) {
    return String(this.approvalRuleVersions.get(tenantId) ?? 0);
  }

  private buildApprovalRuleAuditSummary(rule: TenantApprovalRuleRecord) {
    return {
      ruleId: rule.ruleId,
      ruleName: rule.ruleName ?? rule.name ?? rule.ruleId,
      priority: rule.priority,
      activeFlag: rule.activeFlag,
      action: rule.action,
      approvalMode: rule.approvalMode,
      effectiveFrom: rule.effectiveFrom ?? null,
      effectiveUntil: rule.effectiveUntil ?? null,
      approverKinds: rule.approvers.map((approver) => approver.kind),
      conditionFields: rule.conditions.map((condition) => condition.field),
      timeoutHoursOverride: rule.timeoutHoursOverride ?? null,
      fallbackPolicyOverride: rule.fallbackPolicyOverride ?? null,
      escalationTargetKind: rule.escalationTarget?.kind ?? null,
      ruleVersionSnapshot: this.getApprovalRuleVersionSnapshot(rule.tenantId),
    };
  }

  private computeQuotaPercentUsed(remainingPercent: number | null) {
    if (remainingPercent === null || Number.isNaN(remainingPercent)) {
      return 0;
    }
    return Math.max(0, Math.min(100, 100 - remainingPercent));
  }

  private requireQuotaPeriodKey(reservationWindowStart: string) {
    try {
      return toTenantQuotaPeriodKey(reservationWindowStart);
    } catch {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_QUOTA_RESERVATION_WINDOW_START_INVALID",
        "reservationWindowStart must be a valid ISO-8601 datetime.",
        {
          reservationWindowStart,
        },
      );
    }
  }

  private normalizeQuotaAmountMinor(value: number | null | undefined) {
    if (value == null) {
      return 0;
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_QUOTA_AMOUNT_MINOR_INVALID",
        "estimatedAmountMinor must be a non-negative integer minor-unit amount.",
        {
          estimatedAmountMinor: value,
        },
      );
    }

    return value;
  }

  private normalizeQuotaLimit(limit: TenantQuotaLimit): TenantQuotaLimit {
    const bookingCountLimit =
      limit.bookingCountLimit == null
        ? null
        : Math.trunc(limit.bookingCountLimit);
    const amountMinorLimit =
      limit.amountMinorLimit == null
        ? null
        : Math.trunc(limit.amountMinorLimit);
    if (bookingCountLimit !== null && bookingCountLimit < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_QUOTA_BOOKING_COUNT_LIMIT_INVALID",
        "bookingCountLimit must be a non-negative integer or null.",
      );
    }
    if (amountMinorLimit !== null && amountMinorLimit < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_QUOTA_AMOUNT_LIMIT_INVALID",
        "amountMinorLimit must be a non-negative integer or null.",
      );
    }

    return {
      bookingCountLimit,
      amountMinorLimit,
      currency: this.normalizeQuotaCurrency(limit.currency),
      enforcementMode: limit.enforcementMode,
    };
  }

  private normalizeQuotaCurrency(currency: string | null | undefined) {
    const normalized = this.requireNonBlank(
      currency ?? "TWD",
      "currency",
    ).toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_QUOTA_CURRENCY_INVALID",
        "currency must be a 3-letter ISO code.",
        {
          currency,
        },
      );
    }
    return normalized;
  }

  private normalizeQuotaImpactQuery(
    tenantId: string,
    query: TenantBookingQuotaImpactQuery,
  ) {
    const reservationWindowStart = this.requireNonBlank(
      query.reservationWindowStart ?? query.tripStartsAt ?? "",
      "reservationWindowStart",
    );
    const periodKey = this.requireQuotaPeriodKey(reservationWindowStart);
    const costCenterCode =
      (query.costCenterCode ?? query.costCenter)
        ? this.normalizeCostCenterCode(
            query.costCenterCode ?? query.costCenter ?? "",
          )
        : null;
    return {
      bookingId: this.normalizeNullableText(query.bookingId),
      costCenterCode,
      estimatedAmountMinor: this.normalizeQuotaAmountMinor(
        query.estimatedAmountMinor ?? query.amountMinor,
      ),
      currency: this.normalizeQuotaCurrency(query.currency ?? "TWD"),
      reservationWindowStart,
      periodKey,
    };
  }

  private buildQuotaImpactPreview(
    tenantId: string,
    query: {
      bookingId: string | null;
      costCenterCode: string | null;
      estimatedAmountMinor: number;
      currency: string;
      reservationWindowStart: string;
      periodKey: string;
    },
  ): TenantBookingQuotaImpactPreview {
    const tenantPolicy = this.resolveQuotaPolicy(tenantId, null);
    const tenantSnapshot = this.getOrCreateQuotaSnapshot(
      tenantId,
      null,
      query.periodKey,
      tenantPolicy.limit,
    );
    const costCenterPolicy = query.costCenterCode
      ? this.resolveQuotaPolicy(tenantId, query.costCenterCode)
      : null;
    const costCenterSnapshot =
      query.costCenterCode && costCenterPolicy
        ? this.getOrCreateQuotaSnapshot(
            tenantId,
            query.costCenterCode,
            query.periodKey,
            costCenterPolicy.limit,
          )
        : null;

    return this.buildQuotaImpactPreviewFromResolvedState({
      query,
      tenantPolicy,
      tenantSnapshot,
      costCenterPolicy,
      costCenterSnapshot,
    });
  }

  private combineQuotaTriggered(
    impacts: readonly TenantBookingQuotaImpactResult[],
  ) {
    if (impacts.some((impact) => impact.triggered === "block")) {
      return "block";
    }
    if (impacts.some((impact) => impact.triggered === "approval")) {
      return "approval";
    }
    if (impacts.some((impact) => impact.triggered === "warn")) {
      return "warn";
    }
    return "none";
  }

  private reserveTenantQuotaInMemory(
    input: {
      tenantId: string;
      bookingId: string;
      evaluationId: string;
      reservationWindowStart: string;
      costCenterCode?: string | null;
      estimatedAmountMinor?: number | null;
      currency?: string;
    },
    normalized: {
      bookingId: string | null;
      costCenterCode: string | null;
      estimatedAmountMinor: number;
      currency: string;
      reservationWindowStart: string;
      periodKey: string;
    },
  ) {
    const preview = this.buildQuotaImpactPreview(input.tenantId, normalized);
    this.throwIfQuotaReservationBlocked(preview.impacts, {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      evaluationId: input.evaluationId,
    });

    const now = new Date().toISOString();
    const entries = preview.impacts
      .filter((impact) => impact.delta !== 0)
      .map((impact) =>
        this.createQuotaLedgerEntry({
          tenantId: input.tenantId,
          bookingId: input.bookingId,
          evaluationId: input.evaluationId,
          costCenterCode: impact.costCenterCode,
          periodKey: impact.periodKey,
          dimension: impact.dimension,
          amount: impact.delta,
          entryType: "reserve",
          createdAt: now,
        }),
      );

    const updatedSnapshots = this.applyQuotaLedgerEntries(
      input.tenantId,
      entries,
    );
    this.applyQuotaReservationCommit(entries, updatedSnapshots);
    this.persistChanges(
      {
        quotaLedger: entries.map((entry) => this.cloneQuotaLedgerEntry(entry)),
        quotaMonthlySnapshots: updatedSnapshots.map((snapshot) =>
          this.cloneQuotaMonthlySnapshot(snapshot),
        ),
      },
      "reserve tenant quota",
    );
    this.recordQuotaReservationAudits(
      input.tenantId,
      entries,
      updatedSnapshots,
    );

    return {
      ledgerEntries: entries.map((entry) => this.cloneQuotaLedgerEntry(entry)),
      impacts: preview.impacts.map((impact) => ({ ...impact })),
    };
  }

  private async reserveTenantQuotaWithDatabase(
    tx: TenantPartnerQueryExecutor | null,
    input: {
      tenantId: string;
      bookingId: string;
      evaluationId: string;
      reservationWindowStart: string;
      costCenterCode?: string | null;
      estimatedAmountMinor?: number | null;
      currency?: string;
    },
    normalized: {
      bookingId: string | null;
      costCenterCode: string | null;
      estimatedAmountMinor: number;
      currency: string;
      reservationWindowStart: string;
      periodKey: string;
    },
  ) {
    const work = async (executor: TenantPartnerQueryExecutor) => {
      const policyRecords =
        await this.tenantPartnerRepository!.loadQuotaPoliciesForUpdate(
          executor,
          input.tenantId,
          normalized.costCenterCode,
        );
      const { tenantPolicy, costCenterPolicy } =
        this.resolveQuotaPolicySetFromRecords(
          input.tenantId,
          normalized.costCenterCode,
          policyRecords,
        );
      const snapshotSeeds = [
        this.createQuotaSnapshotRecord(
          input.tenantId,
          null,
          normalized.periodKey,
          tenantPolicy.limit,
        ),
      ];
      if (costCenterPolicy && normalized.costCenterCode) {
        snapshotSeeds.push(
          this.createQuotaSnapshotRecord(
            input.tenantId,
            normalized.costCenterCode,
            normalized.periodKey,
            costCenterPolicy.limit,
          ),
        );
      }
      await this.tenantPartnerRepository!.ensureQuotaMonthlySnapshots(
        executor,
        snapshotSeeds,
      );

      const lockedSnapshots =
        await this.tenantPartnerRepository!.loadQuotaMonthlySnapshotsForUpdate(
          executor,
          input.tenantId,
          normalized.costCenterCode,
          normalized.periodKey,
        );
      const lockedSnapshotMap = new Map(
        lockedSnapshots.map((snapshot) => [
          this.buildQuotaSnapshotKey(
            snapshot.tenantId,
            snapshot.costCenterCode,
            snapshot.period,
            snapshot.periodKey,
          ),
          this.cloneQuotaMonthlySnapshot(snapshot),
        ]),
      );
      const tenantSnapshot = this.materializeQuotaSnapshotRecord(
        lockedSnapshotMap.get(
          this.buildQuotaSnapshotKey(
            input.tenantId,
            null,
            tenantPolicy.period,
            normalized.periodKey,
          ),
        ) ?? null,
        input.tenantId,
        null,
        normalized.periodKey,
        tenantPolicy.limit,
      );
      lockedSnapshotMap.set(
        this.buildQuotaSnapshotKey(
          tenantSnapshot.tenantId,
          tenantSnapshot.costCenterCode,
          tenantSnapshot.period,
          tenantSnapshot.periodKey,
        ),
        tenantSnapshot,
      );

      const costCenterSnapshot =
        costCenterPolicy && normalized.costCenterCode
          ? this.materializeQuotaSnapshotRecord(
              lockedSnapshotMap.get(
                this.buildQuotaSnapshotKey(
                  input.tenantId,
                  normalized.costCenterCode,
                  costCenterPolicy.period,
                  normalized.periodKey,
                ),
              ) ?? null,
              input.tenantId,
              normalized.costCenterCode,
              normalized.periodKey,
              costCenterPolicy.limit,
            )
          : null;
      if (costCenterSnapshot) {
        lockedSnapshotMap.set(
          this.buildQuotaSnapshotKey(
            costCenterSnapshot.tenantId,
            costCenterSnapshot.costCenterCode,
            costCenterSnapshot.period,
            costCenterSnapshot.periodKey,
          ),
          costCenterSnapshot,
        );
      }

      const preview = this.buildQuotaImpactPreviewFromResolvedState({
        query: normalized,
        tenantPolicy,
        tenantSnapshot,
        costCenterPolicy,
        costCenterSnapshot,
      });
      this.throwIfQuotaReservationBlocked(preview.impacts, {
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        evaluationId: input.evaluationId,
      });

      const now = new Date().toISOString();
      const entries = preview.impacts
        .filter((impact) => impact.delta !== 0)
        .map((impact) =>
          this.createQuotaLedgerEntry({
            tenantId: input.tenantId,
            bookingId: input.bookingId,
            evaluationId: input.evaluationId,
            costCenterCode: impact.costCenterCode,
            periodKey: impact.periodKey,
            dimension: impact.dimension,
            amount: impact.delta,
            entryType: "reserve",
            createdAt: now,
          }),
        );
      const updatedSnapshots = this.applyQuotaLedgerEntriesToSnapshots(
        input.tenantId,
        entries,
        [...lockedSnapshotMap.values()],
        (costCenterCode) =>
          costCenterCode === null
            ? tenantPolicy
            : this.cloneQuotaPolicy(
                costCenterPolicy ??
                  this.buildDefaultQuotaPolicy(input.tenantId, costCenterCode),
              ),
      );

      await this.tenantPartnerRepository!.persistQuotaReservation(executor, {
        quotaLedger: entries,
        quotaMonthlySnapshots: updatedSnapshots,
      });
      this.applyQuotaReservationCommit(entries, updatedSnapshots);
      this.recordQuotaReservationAudits(
        input.tenantId,
        entries,
        updatedSnapshots,
      );

      return {
        ledgerEntries: entries.map((entry) =>
          this.cloneQuotaLedgerEntry(entry),
        ),
        impacts: preview.impacts.map((impact) => ({ ...impact })),
      };
    };

    if (tx) {
      return work(tx);
    }

    return this.tenantPartnerRepository!.withTransaction(work);
  }

  private consumeTenantQuotaInMemory(input: {
    tenantId: string;
    bookingId: string;
  }) {
    const entries = this.buildQuotaConsumptionEntries(
      input.tenantId,
      input.bookingId,
      this.quotaLedger,
    );
    if (entries.length === 0) {
      return { ledgerEntries: [] };
    }

    const updatedSnapshots = this.applyQuotaLedgerEntries(
      input.tenantId,
      entries,
    );
    this.applyQuotaReservationCommit(entries, updatedSnapshots);
    this.persistChanges(
      {
        quotaLedger: entries.map((entry) => this.cloneQuotaLedgerEntry(entry)),
        quotaMonthlySnapshots: updatedSnapshots.map((snapshot) =>
          this.cloneQuotaMonthlySnapshot(snapshot),
        ),
      },
      "consume tenant quota",
    );
    this.recordQuotaReservationAudits(
      input.tenantId,
      entries,
      updatedSnapshots,
    );

    return {
      ledgerEntries: entries.map((entry) => this.cloneQuotaLedgerEntry(entry)),
    };
  }

  prepareTenantQuotaConsumption(
    tx: TenantPartnerQueryExecutor,
    input: {
      tenantId: string;
      bookingId: string;
    },
  ): Promise<TenantQuotaConsumptionCommitResult> {
    return this.prepareTenantQuotaConsumptionInTransaction(tx, input);
  }

  private async consumeTenantQuotaWithDatabase(input: {
    tenantId: string;
    bookingId: string;
  }) {
    const committed = await this.tenantPartnerRepository!.withTransaction(
      (executor) =>
        this.prepareTenantQuotaConsumptionInTransaction(executor, input),
    );
    this.applyCommittedQuotaConsumption(committed);
    this.recordQuotaAuditEntries(committed.auditEntries);

    return {
      ledgerEntries: committed.ledgerEntries.map((entry) =>
        this.cloneQuotaLedgerEntry(entry),
      ),
    };
  }

  private async prepareTenantQuotaConsumptionInTransaction(
    executor: TenantPartnerQueryExecutor,
    input: {
      tenantId: string;
      bookingId: string;
    },
  ): Promise<TenantQuotaConsumptionCommitResult> {
    const existingEntries =
      await this.tenantPartnerRepository!.loadQuotaLedgerForBookingForUpdate(
        executor,
        input.tenantId,
        input.bookingId,
      );
    const entries = this.buildQuotaConsumptionEntries(
      input.tenantId,
      input.bookingId,
      existingEntries,
    );
    if (entries.length === 0) {
      return {
        tenantId: input.tenantId,
        ledgerEntries: [],
        updatedSnapshots: [],
        auditEntries: [],
      };
    }

    const claimedEntries =
      await this.tenantPartnerRepository!.claimQuotaLedgerEntries(
        executor,
        entries,
      );
    if (claimedEntries.length === 0) {
      return {
        tenantId: input.tenantId,
        ledgerEntries: [],
        updatedSnapshots: [],
        auditEntries: [],
      };
    }
    if (claimedEntries.length !== entries.length) {
      throw new Error(
        `Quota consumption claim for booking ${input.bookingId} partially succeeded.`,
      );
    }

    const snapshotGroups = new Map<
      string,
      { costCenterCode: string | null; periodKey: string }
    >();
    for (const entry of claimedEntries) {
      const key = `${this.serializeQuotaScopePart(entry.costCenterCode)}:${entry.periodKey}`;
      snapshotGroups.set(key, {
        costCenterCode: entry.costCenterCode,
        periodKey: entry.periodKey,
      });
    }
    const lockedSnapshots = (
      await Promise.all(
        [...snapshotGroups.values()].map((group) =>
          this.tenantPartnerRepository!.loadQuotaMonthlySnapshotsForUpdate(
            executor,
            input.tenantId,
            group.costCenterCode,
            group.periodKey,
          ),
        ),
      )
    ).flat();
    const uniqueSnapshots = new Map<string, TenantQuotaMonthlySnapshotRecord>();
    for (const snapshot of lockedSnapshots) {
      uniqueSnapshots.set(
        this.buildQuotaSnapshotKey(
          snapshot.tenantId,
          snapshot.costCenterCode,
          snapshot.period,
          snapshot.periodKey,
        ),
        snapshot,
      );
    }
    const updatedSnapshots = this.applyQuotaLedgerEntriesToSnapshots(
      input.tenantId,
      claimedEntries,
      [...uniqueSnapshots.values()],
      (costCenterCode) =>
        this.resolveQuotaPolicy(input.tenantId, costCenterCode),
    );

    await this.tenantPartnerRepository!.persistQuotaReservation(executor, {
      quotaMonthlySnapshots: updatedSnapshots,
    });

    return {
      tenantId: input.tenantId,
      ledgerEntries: claimedEntries.map((entry) =>
        this.cloneQuotaLedgerEntry(entry),
      ),
      updatedSnapshots: updatedSnapshots.map((snapshot) =>
        this.cloneQuotaMonthlySnapshot(snapshot),
      ),
      auditEntries: this.buildQuotaReservationAuditEntries(
        input.tenantId,
        claimedEntries,
        updatedSnapshots,
      ),
    };
  }

  private buildQuotaConsumptionEntries(
    tenantId: string,
    bookingId: string,
    sourceEntries: readonly TenantQuotaLedgerEntry[],
  ) {
    const outstanding = new Map<
      string,
      {
        costCenterCode: string | null;
        periodKey: string;
        dimension: TenantQuotaLedgerEntry["dimension"];
        amount: number;
        evaluationId: string;
      }
    >();

    const bookingEntries = sourceEntries
      .filter(
        (entry) => entry.tenantId === tenantId && entry.bookingId === bookingId,
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.ledgerEntryId.localeCompare(right.ledgerEntryId),
      );

    for (const entry of bookingEntries) {
      const key = `${this.serializeQuotaScopePart(entry.costCenterCode)}:${entry.periodKey}:${entry.dimension}`;
      const current = outstanding.get(key) ?? {
        costCenterCode: entry.costCenterCode,
        periodKey: entry.periodKey,
        dimension: entry.dimension,
        amount: 0,
        evaluationId: entry.evaluationId,
      };
      const direction =
        entry.entryType === "reserve" || entry.entryType === "adjust" ? 1 : -1;
      current.amount += direction * entry.amount;
      current.evaluationId = entry.evaluationId;
      outstanding.set(key, current);
    }

    const now = new Date().toISOString();
    return [...outstanding.values()]
      .filter((entry) => entry.amount > 0)
      .map((entry) =>
        this.createQuotaLedgerEntry({
          ledgerEntryId: this.buildQuotaConsumptionLedgerEntryId({
            tenantId,
            bookingId,
            costCenterCode: entry.costCenterCode,
            periodKey: entry.periodKey,
            dimension: entry.dimension,
          }),
          tenantId,
          bookingId,
          evaluationId: entry.evaluationId,
          costCenterCode: entry.costCenterCode,
          periodKey: entry.periodKey,
          dimension: entry.dimension,
          amount: entry.amount,
          entryType: "consume",
          createdAt: now,
        }),
      );
  }

  private buildQuotaImpactPreviewFromResolvedState(params: {
    query: {
      bookingId: string | null;
      costCenterCode: string | null;
      estimatedAmountMinor: number;
      currency: string;
      reservationWindowStart: string;
      periodKey: string;
    };
    tenantPolicy: TenantQuotaPolicyRecord;
    tenantSnapshot: TenantQuotaMonthlySnapshotRecord;
    costCenterPolicy: TenantQuotaPolicyRecord | null;
    costCenterSnapshot: TenantQuotaMonthlySnapshotRecord | null;
  }): TenantBookingQuotaImpactPreview {
    const impacts: TenantBookingQuotaImpactResult[] = [
      buildQuotaImpact({
        scope: "tenant",
        costCenterCode: null,
        periodKey: params.query.periodKey,
        dimension: "booking_count",
        delta: 1,
        limit: params.tenantPolicy.limit,
        usage: params.tenantSnapshot.usage,
      }),
      buildQuotaImpact({
        scope: "tenant",
        costCenterCode: null,
        periodKey: params.query.periodKey,
        dimension: "amount_minor",
        delta: params.query.estimatedAmountMinor,
        limit: params.tenantPolicy.limit,
        usage: params.tenantSnapshot.usage,
      }),
    ];

    if (
      params.query.costCenterCode &&
      params.costCenterPolicy &&
      params.costCenterSnapshot
    ) {
      impacts.push(
        buildQuotaImpact({
          scope: "cost_center",
          costCenterCode: params.query.costCenterCode,
          periodKey: params.query.periodKey,
          dimension: "booking_count",
          delta: 1,
          limit: params.costCenterPolicy.limit,
          usage: params.costCenterSnapshot.usage,
        }),
        buildQuotaImpact({
          scope: "cost_center",
          costCenterCode: params.query.costCenterCode,
          periodKey: params.query.periodKey,
          dimension: "amount_minor",
          delta: params.query.estimatedAmountMinor,
          limit: params.costCenterPolicy.limit,
          usage: params.costCenterSnapshot.usage,
        }),
      );
    }

    return {
      evaluationId: `quota-preview-${randomUUID()}`,
      periodKey: params.query.periodKey,
      impacts,
      combinedTriggered: this.combineQuotaTriggered(impacts),
    };
  }

  private throwIfQuotaReservationBlocked(
    impacts: readonly TenantBookingQuotaImpactResult[],
    context?: {
      tenantId: string;
      bookingId: string;
      evaluationId: string;
    },
  ) {
    const blockingImpact = impacts.find(
      (impact) => impact.triggered === "block",
    );
    if (!blockingImpact) {
      return;
    }

    if (context) {
      this.recordTenantAudit({
        actorId: null,
        actorType: "system",
        tenantId: context.tenantId,
        moduleName: "tenant-partner",
        actionName: "tenant.quota_reservation.blocked",
        resourceType: "booking",
        resourceId: context.bookingId,
        newValuesSummary: {
          errorCode: "QUOTA_INSUFFICIENT_AT_COMMIT",
          bookingId: context.bookingId,
          evaluationId: context.evaluationId,
          periodKey: blockingImpact.periodKey,
          costCenterCode: blockingImpact.costCenterCode,
          dimension: blockingImpact.dimension,
        },
      });
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "QUOTA_INSUFFICIENT_AT_COMMIT",
      "Tenant quota exceeded at commit time.",
      {
        periodKey: blockingImpact.periodKey,
        costCenterCode: blockingImpact.costCenterCode,
        dimension: blockingImpact.dimension,
      },
    );
  }

  private resolveQuotaPolicy(
    tenantId: string,
    costCenterCode: string | null,
  ): TenantQuotaPolicyRecord {
    const exact = costCenterCode
      ? this.quotaPolicies.get(
          this.buildQuotaPolicyKey(tenantId, costCenterCode, "monthly"),
        )
      : null;
    if (exact) {
      return this.cloneQuotaPolicy(exact);
    }

    const tenantPolicy =
      this.quotaPolicies.get(
        this.buildQuotaPolicyKey(tenantId, null, "monthly"),
      ) ?? null;
    if (tenantPolicy) {
      return {
        ...this.cloneQuotaPolicy(tenantPolicy),
        costCenterCode,
        inheritedFromTenant: costCenterCode !== null,
      };
    }

    return this.buildDefaultQuotaPolicy(tenantId, costCenterCode);
  }

  private resolveQuotaPolicySetFromRecords(
    tenantId: string,
    costCenterCode: string | null,
    records: readonly TenantQuotaPolicyRecord[],
  ) {
    const hasTenantPolicy = records.some(
      (record) => record.costCenterCode === null,
    );
    const tenantPolicy =
      records.find((record) => record.costCenterCode === null) ??
      this.buildDefaultQuotaPolicy(tenantId, null);
    const exactCostCenterPolicy =
      costCenterCode === null
        ? null
        : (records.find((record) => record.costCenterCode === costCenterCode) ??
          null);

    return {
      tenantPolicy: this.cloneQuotaPolicy(tenantPolicy),
      costCenterPolicy:
        costCenterCode === null
          ? null
          : exactCostCenterPolicy
            ? this.cloneQuotaPolicy(exactCostCenterPolicy)
            : {
                ...this.cloneQuotaPolicy(tenantPolicy),
                costCenterCode,
                inheritedFromTenant: hasTenantPolicy,
              },
    };
  }

  private buildDefaultQuotaPolicy(
    tenantId: string,
    costCenterCode: string | null,
  ): TenantQuotaPolicyRecord {
    return {
      tenantId,
      costCenterCode,
      period: "monthly",
      limit: {
        bookingCountLimit: null,
        amountMinorLimit: null,
        currency: "TWD",
        enforcementMode: "warn_only",
      },
      inheritedFromTenant: false,
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    };
  }

  private getOrCreateQuotaSnapshot(
    tenantId: string,
    costCenterCode: string | null,
    periodKey: string,
    limit: TenantQuotaLimit,
  ) {
    const key = this.buildQuotaSnapshotKey(
      tenantId,
      costCenterCode,
      "monthly",
      periodKey,
    );
    const snapshot = this.materializeQuotaSnapshotRecord(
      this.quotaMonthlySnapshots.get(key) ?? null,
      tenantId,
      costCenterCode,
      periodKey,
      limit,
    );
    this.quotaMonthlySnapshots.set(key, snapshot);
    return snapshot;
  }

  private applyQuotaLedgerEntries(
    tenantId: string,
    entries: readonly TenantQuotaLedgerEntry[],
  ) {
    const updatedSnapshots = this.applyQuotaLedgerEntriesToSnapshots(
      tenantId,
      entries,
      Array.from(this.quotaMonthlySnapshots.values()),
      (costCenterCode) => this.resolveQuotaPolicy(tenantId, costCenterCode),
    );

    for (const snapshot of updatedSnapshots) {
      this.quotaMonthlySnapshots.set(
        this.buildQuotaSnapshotKey(
          snapshot.tenantId,
          snapshot.costCenterCode,
          snapshot.period,
          snapshot.periodKey,
        ),
        this.cloneQuotaMonthlySnapshot(snapshot),
      );
    }

    return updatedSnapshots;
  }

  private applyQuotaLedgerEntriesToSnapshots(
    tenantId: string,
    entries: readonly TenantQuotaLedgerEntry[],
    snapshots: readonly TenantQuotaMonthlySnapshotRecord[],
    resolvePolicy: (costCenterCode: string | null) => TenantQuotaPolicyRecord,
  ) {
    const snapshotMap = new Map(
      snapshots.map((snapshot) => [
        this.buildQuotaSnapshotKey(
          snapshot.tenantId,
          snapshot.costCenterCode,
          snapshot.period,
          snapshot.periodKey,
        ),
        this.cloneQuotaMonthlySnapshot(snapshot),
      ]),
    );
    const touched = new Map<string, TenantQuotaMonthlySnapshotRecord>();

    for (const entry of entries) {
      const policy = resolvePolicy(entry.costCenterCode);
      const key = this.buildQuotaSnapshotKey(
        tenantId,
        entry.costCenterCode,
        policy.period,
        entry.periodKey,
      );
      const snapshot = this.materializeQuotaSnapshotRecord(
        snapshotMap.get(key) ?? null,
        tenantId,
        entry.costCenterCode,
        entry.periodKey,
        policy.limit,
      );
      snapshot.usage = applyLedgerEntryToUsage(
        snapshot.usage,
        policy.limit,
        entry,
      );
      snapshot.refreshedAt = entry.createdAt;
      snapshotMap.set(key, snapshot);
      touched.set(key, snapshot);
    }

    return [...touched.values()].map((snapshot) =>
      this.cloneQuotaMonthlySnapshot(snapshot),
    );
  }

  private createQuotaLedgerEntry(input: {
    ledgerEntryId?: string;
    tenantId: string;
    costCenterCode: string | null;
    periodKey: string;
    dimension: TenantQuotaLedgerEntry["dimension"];
    amount: number;
    entryType: TenantQuotaLedgerEntry["entryType"];
    bookingId: string;
    evaluationId: string;
    createdAt: string;
  }): TenantQuotaLedgerEntry {
    return {
      ledgerEntryId: input.ledgerEntryId ?? `quota-ledger-${randomUUID()}`,
      tenantId: input.tenantId,
      costCenterCode: input.costCenterCode,
      periodKey: input.periodKey,
      dimension: input.dimension,
      amount: input.amount,
      entryType: input.entryType,
      bookingId: input.bookingId,
      evaluationId: input.evaluationId,
      createdAt: input.createdAt,
    };
  }

  private buildQuotaConsumptionLedgerEntryId(input: {
    tenantId: string;
    bookingId: string;
    costCenterCode: string | null;
    periodKey: string;
    dimension: TenantQuotaLedgerEntry["dimension"];
  }) {
    const digest = createHash("sha256")
      .update(input.tenantId)
      .update("\u0000")
      .update(input.bookingId)
      .update("\u0000")
      .update(this.serializeQuotaScopePart(input.costCenterCode))
      .update("\u0000")
      .update(input.periodKey)
      .update("\u0000")
      .update(input.dimension)
      .digest("hex");

    return `quota-ledger-consume-${digest.slice(0, 32)}`;
  }

  private buildQuotaPolicyKey(
    tenantId: string,
    costCenterCode: string | null,
    period: "monthly",
  ) {
    return `${tenantId}:${this.serializeQuotaScopePart(costCenterCode)}:${period}`;
  }

  private buildQuotaSnapshotKey(
    tenantId: string,
    costCenterCode: string | null,
    period: "monthly",
    periodKey: string,
  ) {
    return `${tenantId}:${this.serializeQuotaScopePart(costCenterCode)}:${period}:${periodKey}`;
  }

  private serializeQuotaScopePart(costCenterCode: string | null) {
    if (costCenterCode === null) {
      return "null";
    }

    return `value:${costCenterCode.length}:${costCenterCode}`;
  }

  private cloneQuotaPolicy(
    policy: TenantQuotaPolicyRecord,
  ): TenantQuotaPolicyRecord {
    return {
      ...policy,
      limit: { ...policy.limit },
    };
  }

  private cloneQuotaLedgerEntry(
    entry: TenantQuotaLedgerEntry,
  ): TenantQuotaLedgerEntry {
    return {
      ...entry,
    };
  }

  private cloneQuotaMonthlySnapshot(
    snapshot: TenantQuotaMonthlySnapshotRecord,
  ): TenantQuotaMonthlySnapshotRecord {
    return {
      ...snapshot,
      limit: { ...snapshot.limit },
      usage: { ...snapshot.usage },
    };
  }

  private materializeQuotaSnapshotRecord(
    snapshot: TenantQuotaMonthlySnapshotRecord | null,
    tenantId: string,
    costCenterCode: string | null,
    periodKey: string,
    limit: TenantQuotaLimit,
  ): TenantQuotaMonthlySnapshotRecord {
    if (!snapshot) {
      return this.createQuotaSnapshotRecord(
        tenantId,
        costCenterCode,
        periodKey,
        limit,
      );
    }

    const materialized = this.cloneQuotaMonthlySnapshot(snapshot);
    if (JSON.stringify(materialized.limit) !== JSON.stringify(limit)) {
      materialized.limit = { ...limit };
      materialized.usage = materializeUsage(limit, materialized.usage);
    }
    return materialized;
  }

  private createQuotaSnapshotRecord(
    tenantId: string,
    costCenterCode: string | null,
    periodKey: string,
    limit: TenantQuotaLimit,
  ): TenantQuotaMonthlySnapshotRecord {
    return {
      tenantId,
      costCenterCode,
      period: "monthly",
      periodKey,
      limit: { ...limit },
      usage: createEmptyTenantQuotaUsage(limit),
      refreshedAt: new Date().toISOString(),
    };
  }

  private applyQuotaReservationCommit(
    entries: readonly TenantQuotaLedgerEntry[],
    updatedSnapshots: readonly TenantQuotaMonthlySnapshotRecord[],
  ) {
    this.quotaLedger = [
      ...entries.map((entry) => this.cloneQuotaLedgerEntry(entry)),
      ...this.quotaLedger,
    ];
    for (const snapshot of updatedSnapshots) {
      this.quotaMonthlySnapshots.set(
        this.buildQuotaSnapshotKey(
          snapshot.tenantId,
          snapshot.costCenterCode,
          snapshot.period,
          snapshot.periodKey,
        ),
        this.cloneQuotaMonthlySnapshot(snapshot),
      );
    }
  }

  applyCommittedQuotaConsumption(
    committed: TenantQuotaConsumptionCommitResult,
  ) {
    if (committed.ledgerEntries.length === 0) {
      return;
    }

    this.applyQuotaReservationCommit(
      committed.ledgerEntries,
      committed.updatedSnapshots,
    );
  }

  private recordQuotaReservationAudits(
    tenantId: string,
    entries: readonly TenantQuotaLedgerEntry[],
    updatedSnapshots: readonly TenantQuotaMonthlySnapshotRecord[],
  ) {
    this.recordQuotaAuditEntries(
      this.buildQuotaReservationAuditEntries(
        tenantId,
        entries,
        updatedSnapshots,
      ),
    );
  }

  private buildQuotaReservationAuditEntries(
    tenantId: string,
    entries: readonly TenantQuotaLedgerEntry[],
    updatedSnapshots: readonly TenantQuotaMonthlySnapshotRecord[],
  ): TenantQuotaAuditEntryInput[] {
    const ledgerAudits = [...entries]
      .sort((left, right) =>
        left.ledgerEntryId.localeCompare(right.ledgerEntryId),
      )
      .map((entry) => ({
        actorId: null,
        actorType: "system" as const,
        tenantId,
        moduleName: "tenant-partner",
        actionName: "tenant.quota_ledger.entry_added",
        resourceType: "tenant_quota_ledger",
        resourceId: entry.ledgerEntryId,
        newValuesSummary: {
          bookingId: entry.bookingId,
          costCenterCode: entry.costCenterCode,
          periodKey: entry.periodKey,
          dimension: entry.dimension,
          entryType: entry.entryType,
          amount: entry.amount,
        },
      }));
    const snapshotAudits = [...updatedSnapshots]
      .sort((left, right) =>
        this.buildQuotaSnapshotKey(
          left.tenantId,
          left.costCenterCode,
          left.period,
          left.periodKey,
        ).localeCompare(
          this.buildQuotaSnapshotKey(
            right.tenantId,
            right.costCenterCode,
            right.period,
            right.periodKey,
          ),
        ),
      )
      .map((snapshot) => ({
        actorId: null,
        actorType: "system" as const,
        tenantId,
        moduleName: "tenant-partner",
        actionName: "tenant.quota_snapshot.refreshed",
        resourceType: "tenant_quota_snapshot",
        resourceId: this.buildQuotaSnapshotKey(
          snapshot.tenantId,
          snapshot.costCenterCode,
          snapshot.period,
          snapshot.periodKey,
        ),
        newValuesSummary: {
          costCenterCode: snapshot.costCenterCode,
          periodKey: snapshot.periodKey,
          usage: structuredClone(snapshot.usage),
        },
      }));

    return [...ledgerAudits, ...snapshotAudits].map((entry) => ({
      ...entry,
      newValuesSummary: structuredClone(entry.newValuesSummary),
    }));
  }

  private recordQuotaAuditEntries(
    entries: readonly TenantQuotaAuditEntryInput[],
  ) {
    for (const entry of entries) {
      this.auditNotificationService.recordAuditLog({
        ...entry,
        ...(entry.newValuesSummary
          ? { newValuesSummary: structuredClone(entry.newValuesSummary) }
          : {}),
      });
    }
  }

  private recordCostCenterValidationRejectedAudit(
    tenantId: string,
    errorCode:
      | "BOOKING_COST_CENTER_INVALID"
      | "BOOKING_COST_CENTER_UNKNOWN"
      | "BOOKING_COST_CENTER_DISABLED",
    details: Record<string, unknown>,
  ) {
    this.recordTenantAudit({
      actorId: null,
      actorType: "tenant_admin",
      tenantId,
      moduleName: "tenant-partner",
      actionName: "booking.cost_center.validation_rejected",
      resourceType: "tenant_cost_center",
      resourceId: null,
      newValuesSummary: {
        errorCode,
        ...details,
      },
    });
  }

  private buildTenantGovernanceMetricSample(
    metric: string,
    labels: Record<string, string>,
    value: number,
    unit: TenantGovernanceMetricUnit,
  ): TenantGovernanceMetricSample {
    return {
      name: `${TENANT_GOVERNANCE_METRIC_NAMESPACE}.${metric}`,
      labels,
      value: Number.isFinite(value) ? value : 0,
      unit,
    };
  }

  private readNumericSummaryValue(
    summary: Record<string, unknown> | undefined,
    key: string,
  ) {
    const value = summary?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private computePercentile(values: readonly number[], quantile: number) {
    if (values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * quantile) - 1),
    );
    return sorted[index] ?? 0;
  }

  private countAuditEventsWithinWindow(
    auditLogs: readonly AuditLogRecord[],
    actionName: string,
    windowMs: number,
    referenceTimeMs: number,
  ) {
    return auditLogs.filter((auditLog) => {
      if (auditLog.actionName !== actionName) {
        return false;
      }
      const createdAtMs = Date.parse(auditLog.createdAt);
      return (
        Number.isFinite(createdAtMs) &&
        createdAtMs >= referenceTimeMs - windowMs &&
        createdAtMs <= referenceTimeMs
      );
    }).length;
  }

  private countCostCenterValidationRejectsByCode(
    auditLogs: readonly AuditLogRecord[],
  ) {
    const counts = new Map<string, number>();
    auditLogs
      .filter(
        (auditLog) =>
          auditLog.actionName === "booking.cost_center.validation_rejected",
      )
      .forEach((auditLog) => {
        const errorCode = auditLog.newValuesSummary?.errorCode;
        if (typeof errorCode !== "string" || errorCode.length === 0) {
          return;
        }
        counts.set(errorCode, (counts.get(errorCode) ?? 0) + 1);
      });
    return counts;
  }

  private withQuotaReservationLock<T>(
    tenantId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.quotaReservationLocks.get(tenantId) ?? Promise.resolve();
    let release: (() => void) | null = null;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.quotaReservationLocks.set(
      tenantId,
      previous.then(() => current),
    );

    return previous.then(async () => {
      try {
        return await work();
      } finally {
        release?.();
        if (this.quotaReservationLocks.get(tenantId) === current) {
          this.quotaReservationLocks.delete(tenantId);
        }
      }
    });
  }

  private findCostCenterRecord(tenantId: string, code: string) {
    const normalizedCode = this.normalizeCostCenterCode(code);
    const costCenter = this.costCenters.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.code === normalizedCode,
    );

    return costCenter ? this.cloneCostCenter(costCenter) : null;
  }

  private recordCoverageSample(
    samples: Map<string, TenantCostCenterCoverageSample>,
    rawCostCenter: string,
    suggestion: string | null,
  ) {
    const existing = samples.get(rawCostCenter);
    if (existing) {
      existing.occurrences += 1;
      if (existing.suggestion === null && suggestion) {
        existing.suggestion = suggestion;
      }
      return;
    }

    samples.set(rawCostCenter, {
      rawCostCenter,
      occurrences: 1,
      suggestion,
    });
  }

  private suggestCoverageCostCenter(
    rawCostCenter: string,
    directory: TenantCostCenterRecord[],
  ) {
    const normalized = rawCostCenter.trim().toUpperCase();
    const exactCode = directory.find(
      (candidate) => candidate.code.toUpperCase() === normalized,
    );
    if (exactCode) {
      return exactCode.code;
    }

    const normalizedLabel = rawCostCenter
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!normalizedLabel) {
      return null;
    }

    const matches = directory.filter((candidate) => {
      const code = candidate.code.toLowerCase().replace(/[^a-z0-9]+/g, " ");
      const name = candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, " ");
      return code === normalizedLabel || name === normalizedLabel;
    });

    return matches.length === 1 ? matches[0]!.code : null;
  }

  private normalizePartnerCode(value: string) {
    const normalized = this.requireNonBlank(value, "partnerCode")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_CODE_INVALID",
        "partnerCode must contain letters or numbers.",
        {
          partnerCode: value,
        },
      );
    }
    return normalized;
  }

  private normalizeEntrySlug(value: string) {
    const normalized = this.requireNonBlank(value, "entrySlug")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_ENTRY_SLUG_INVALID",
        "entrySlug must contain letters or numbers.",
        {
          entrySlug: value,
        },
      );
    }
    return normalized;
  }

  private buildBrandingMetadata(
    displayName: string,
    themeAccent: string | null | undefined,
    brandingMetadata: Partial<PartnerEntryBrandingMetadata> | null | undefined,
    existingBrandingMetadata?: PartnerEntryBrandingMetadata | null,
  ): PartnerEntryBrandingMetadata {
    return {
      displayName:
        this.normalizeNullableText(brandingMetadata?.displayName) ??
        existingBrandingMetadata?.displayName ??
        displayName,
      themeAccent:
        this.normalizeNullableText(brandingMetadata?.themeAccent) ??
        existingBrandingMetadata?.themeAccent ??
        this.normalizeNullableText(themeAccent),
      supportEmail:
        brandingMetadata?.supportEmail === undefined
          ? (existingBrandingMetadata?.supportEmail ?? null)
          : this.normalizeNullableText(brandingMetadata.supportEmail),
      supportPhone:
        brandingMetadata?.supportPhone === undefined
          ? (existingBrandingMetadata?.supportPhone ?? null)
          : this.normalizeNullableText(brandingMetadata.supportPhone),
    };
  }

  private hashReferenceToken(referenceToken: string) {
    return `sha256:${createHash("sha256")
      .update(referenceToken.trim())
      .digest("hex")}`;
  }

  private requireNonBlank(value: string, fieldName: string) {
    this.assertNonBlank(value, fieldName);
    return value.trim();
  }

  private assertNonBlank(value: string, fieldName: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${fieldName} is required.`,
        {
          field: fieldName,
        },
      );
    }
  }

  private assertSupportedTenantRoleCode(roleCode: string) {
    const normalized = roleCode.trim();
    const supported = TENANT_ROLE_CATALOG.some(
      (role) => role.roleCode === normalized,
    );

    if (!supported) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "UNSUPPORTED_TENANT_ROLE",
        "The tenant role code is not supported.",
        {
          roleCode: normalized,
        },
      );
    }
  }

  private assertSupportedWebhookStatus(status: TenantWebhookEndpointStatus) {
    if (
      status === "active" ||
      status === "test_pending" ||
      status === "disabled"
    ) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "UNSUPPORTED_WEBHOOK_STATUS",
      "The webhook status is not supported.",
      {
        status,
      },
    );
  }

  private normalizeWebhookEvents(events: string[]) {
    const normalized = [...new Set(events.map((event) => event.trim()))].filter(
      Boolean,
    );

    if (normalized.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "WEBHOOK_EVENTS_REQUIRED",
        "At least one webhook event must be provided.",
        {},
      );
    }

    return normalized;
  }

  private persistChanges(
    changes: PersistTenantPartnerChanges,
    context: string,
  ) {
    if (
      !this.tenantPartnerRepository ||
      typeof (this.tenantPartnerRepository as any).persistChanges !== "function"
    ) {
      return;
    }

    void this.tenantPartnerRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        if (
          typeof (this.tenantPartnerRepository as any)
            .reportPersistenceFailure === "function"
        ) {
          (this.tenantPartnerRepository as any).reportPersistenceFailure(
            error,
            context,
          );
        }
      });
  }

  private syncIdentityTenantUserRoles(context: string) {
    for (const userRole of this.userRoles) {
      void this.syncIdentityTenantUserRole(userRole, context).catch(() => {
        // Startup backfill is best-effort; request mutations await this path.
      });
    }
  }

  private async issueTenantInvitation(
    userRole: TenantUserRoleRecord,
    membershipId: string | null,
    issuerPrincipalId: string | null,
    kind: "initial" | "resend",
  ): Promise<CanonicalIdentityInvitationRecord | null> {
    if (!this.identityRepository || !membershipId) {
      // Legacy fixture-only service construction has no canonical identity authority.
      return null;
    }

    const now = new Date().toISOString();
    const rawToken = `ti_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const invitation: CanonicalIdentityInvitationRecord = {
      invitationId: `invitation_${randomUUID()}`,
      sourceRef:
        kind === "initial"
          ? `tenant_user_role:${userRole.userId}:invitation`
          : `tenant_user_role:${userRole.userId}:invitation:resend:${randomUUID()}`,
      membershipId,
      issuerPrincipalId,
      realm: "tenant",
      scopeRef: `tenant:${userRole.tenantId}`,
      tenantId: userRole.tenantId,
      partnerId: null,
      email: userRole.email,
      roleCode: userRole.roleCode,
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      deliveryStatus: "pending_delivery",
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const stored =
      await this.identityRepository.upsertInvitationRecord(invitation);

    // The delivery adapter never throws; only its reported status may ever
    // be treated as a real, provider-acknowledged send. A failed/unavailable
    // outcome still leaves the invitation resendable, never fabricated as
    // delivered.
    const delivery = await this.tenantInvitationDelivery.send({
      invitationId: stored.invitationId,
      tenantId: userRole.tenantId,
      recipientEmail: userRole.email,
      displayName: userRole.displayName,
      expiresAt: stored.expiresAt,
      rawToken,
    });
    return await this.identityRepository.upsertInvitationRecord({
      ...stored,
      deliveryStatus:
        delivery.status === "sent" ? "delivered" : "delivery_failed",
      updatedAt: new Date().toISOString(),
    });
  }

  private toTenantInvitationView(
    invitation: CanonicalIdentityInvitationRecord,
  ): TenantInvitationView {
    return {
      invitationId: invitation.invitationId,
      deliveryStatus: invitation.deliveryStatus,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
    };
  }

  private async syncIdentityTenantUserRole(
    userRole: TenantUserRoleRecord,
    context: string,
  ) {
    const identityRepository = this.identityRepository;
    if (
      !identityRepository ||
      typeof identityRepository.syncLegacyTenantUserRole !== "function"
    ) {
      return null;
    }

    try {
      return await identityRepository.syncLegacyTenantUserRole(
        this.cloneUserRole(userRole),
      );
    } catch (error) {
      if (typeof identityRepository.reportPersistenceFailure === "function") {
        identityRepository.reportPersistenceFailure(error, context);
      }
      throw error;
    }
  }

  private assertTenantUserRoleChangeIsSafe(params: {
    tenantId: string;
    userRole: TenantUserRoleRecord;
    nextRoleCode: string;
    nextStatus: TenantUserRoleRecord["status"];
    identity: IdentityContext | null | undefined;
  }) {
    const { tenantId, userRole, nextRoleCode, nextStatus, identity } = params;
    if (
      identity?.actorId === userRole.userId &&
      (nextRoleCode !== userRole.roleCode || nextStatus !== userRole.status)
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "TENANT_SELF_ROLE_CHANGE_DENIED",
        "Tenant users cannot change their own role or account status.",
        { tenantId },
      );
    }

    const removesActiveTenantAdmin =
      Boolean(this.identityRepository) &&
      userRole.roleCode === "tenant_admin" &&
      userRole.status === "active" &&
      (nextRoleCode !== "tenant_admin" || nextStatus !== "active");
    if (!removesActiveTenantAdmin) {
      return;
    }

    const activeReplacementCount = this.userRoles.filter(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.userId !== userRole.userId &&
        candidate.roleCode === "tenant_admin" &&
        candidate.status === "active",
    ).length;
    if (activeReplacementCount > 0) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "TENANT_LAST_ADMIN_REQUIRED",
      "At least one other active tenant administrator is required.",
      { tenantId },
    );
  }

  private async revokeTenantUserSessions(
    userRole: TenantUserRoleRecord,
    canonicalPrincipalId: string | null,
    reason: string,
    revokedByPrincipalId?: string,
  ) {
    const identityRepository = this.identityRepository;
    if (!identityRepository) {
      return;
    }

    const principalIds = Array.from(
      new Set(
        [userRole.userId, canonicalPrincipalId].filter(
          (principalId): principalId is string => Boolean(principalId?.trim()),
        ),
      ),
    );
    for (const principalId of principalIds) {
      const sessions =
        await identityRepository.listSessionsByPrincipal(principalId);
      await Promise.all(
        sessions
          .filter((session) => session.status === "active")
          .map((session) =>
            identityRepository.revokeSession(
              session.sessionId,
              reason,
              revokedByPrincipalId,
            ),
          ),
      );
    }
  }

  private async persistChangesRequired(
    changes: PersistTenantPartnerChanges,
    context: string,
  ) {
    if (
      !this.tenantPartnerRepository ||
      typeof (this.tenantPartnerRepository as any).persistChanges !== "function"
    ) {
      return;
    }

    try {
      await this.tenantPartnerRepository.persistChanges(changes);
    } catch (error) {
      if (
        typeof (this.tenantPartnerRepository as any)
          .reportPersistenceFailure === "function"
      ) {
        (this.tenantPartnerRepository as any).reportPersistenceFailure(
          error,
          context,
        );
      }
      throw error;
    }
  }
}
