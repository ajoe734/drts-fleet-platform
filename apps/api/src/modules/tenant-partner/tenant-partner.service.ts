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
  ActionableResourceRuntimeFields,
  AuditLogRecord,
  ApproveTenantBookingApprovalRequestCommand,
  CreatePartnerChannelEntryCommand,
  CreatePartnerBootstrapSessionCommand,
  PartnerEntryBrandingMetadata,
  CreateTenantUserCommand,
  EscalateTenantBookingApprovalRequestCommand,
  IdentityContext,
  CreateTenantWebhookEndpointCommand,
  IssueTenantApiKeyCommand,
  IssuePartnerIngressCredentialCommand,
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
  TenantApiKeyGovernancePolicy,
  TenantApiKeyIssued,
  OwnedOrderRecord,
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
  TenantQuotaLedgerEntry,
  TenantQuotaLimit,
  TenantQuotaPolicyRecord,
  TenantQuotaSummary,
  TenantRoleCatalogRecord,
  TenantSlaProfile,
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
  UiListResourceEnvelope,
  VerifyPartnerEligibilityCommand,
  WebhookEventPayload,
  WebhookDeliveryRecord,
  WebhookRetryPolicyRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  assertEvidenceAccess,
  buildEvidenceAccessAuditSummary,
} from "../../common/evidence-governance";
import {
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
import {
  TenantPartnerRepository,
  type PersistTenantPartnerChanges,
  type StoredPartnerIngressCredentialRecord,
  type StoredTenantApiKeyRecord,
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

const DEMO_TENANT_ID = "tenant-demo-001";

type WebhookSecretRotationRecord = TenantWebhookSecretRotationRecord;

type WebhookRuntimeMetadata = TenantWebhookRuntimeMetadata & {
  retryPolicy: WebhookRetryPolicy;
  disableReason: TenantWebhookDisableReason | null;
};

type StoredWebhookEndpoint = TenantWebhookEndpoint & {
  secretValue: string;
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
  ) {
    this.partnerIngressCredentials = this.partnerIngressCredentialSeeds.map(
      (seed) => createBootstrapPartnerIngressCredential(seed),
    );
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
      const hasPersistedState =
        notificationPreferences.length > 0 ||
        slaProfiles.length > 0 ||
        webhookEndpoints.length > 0 ||
        webhookDeliveries.length > 0 ||
        partnerEntries.length > 0 ||
        partnerIngressCredentials.length > 0 ||
        partnerEligibilityVerifications.length > 0 ||
        approvalRules.length > 0 ||
        approvalRequests.length > 0 ||
        approvalDecisions.length > 0 ||
        passengers.length > 0 ||
        addresses.length > 0 ||
        costCenters.length > 0 ||
        quotaPolicies.length > 0 ||
        quotaLedger.length > 0 ||
        quotaMonthlySnapshots.length > 0 ||
        userRoles.length > 0 ||
        apiKeys.length > 0;

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
        return;
      }

      this.notificationPreferences = new Map(
        notificationPreferences.map((preferences) => [
          preferences.tenantId,
          this.cloneNotificationPreferences(preferences),
        ]),
      );
      this.slaProfiles = new Map(
        slaProfiles.map((profile) => [
          profile.tenantId,
          this.cloneSlaProfile(profile),
        ]),
      );
      this.partnerEntries =
        partnerEntries.length > 0
          ? partnerEntries.map((entry) => this.clonePartnerEntry(entry))
          : PARTNER_ENTRY_SEED.map((entry) => this.clonePartnerEntry(entry));
      this.partnerIngressCredentials =
        partnerIngressCredentials.length > 0
          ? partnerIngressCredentials.map((credential) =>
              this.cloneStoredPartnerIngressCredential(credential),
            )
          : this.partnerIngressCredentialSeeds.map((seed) =>
              createBootstrapPartnerIngressCredential(seed),
            );
      this.normalizePartnerEntryAuthModes();
      this.partnerEligibilityVerifications = new Map(
        partnerEligibilityVerifications.map((verification) => [
          verification.eligibilityVerificationId,
          this.clonePartnerEligibilityVerification(verification),
        ]),
      );
      this.approvalRules = approvalRules.map((rule) =>
        this.cloneApprovalRule(rule),
      );
      this.approvalRuleVersions = approvalRules.reduce((versions, rule) => {
        versions.set(
          rule.tenantId,
          Math.max(versions.get(rule.tenantId) ?? 0, 1),
        );
        return versions;
      }, new Map<string, number>());
      this.approvalDecisions = approvalDecisions.map((decision) =>
        this.cloneApprovalDecision(decision),
      );
      this.approvalRequests = approvalRequests.map((request) =>
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
      this.webhookEndpoints = webhookEndpoints.map((endpoint) =>
        this.cloneStoredWebhookEndpoint(endpoint),
      );
      this.webhookDeliveries = webhookDeliveries.map((delivery) =>
        this.cloneStoredWebhookDelivery(delivery),
      );
      this.passengers = passengers.map((passenger) =>
        this.clonePassenger(passenger),
      );
      this.addresses = addresses.map((address) => this.cloneAddress(address));
      this.costCenters =
        costCenters.length > 0
          ? costCenters.map((costCenter) => this.cloneCostCenter(costCenter))
          : COST_CENTER_SEED.map((costCenter) =>
              this.cloneCostCenter(costCenter),
            );
      this.quotaPolicies = new Map(
        quotaPolicies.map((policy) => [
          this.buildQuotaPolicyKey(
            policy.tenantId,
            policy.costCenterCode,
            policy.period,
          ),
          this.cloneQuotaPolicy(policy),
        ]),
      );
      this.quotaLedger = quotaLedger.map((entry) =>
        this.cloneQuotaLedgerEntry(entry),
      );
      this.quotaMonthlySnapshots = new Map(
        quotaMonthlySnapshots.map((snapshot) => [
          this.buildQuotaSnapshotKey(
            snapshot.tenantId,
            snapshot.costCenterCode,
            snapshot.period,
            snapshot.periodKey,
          ),
          this.cloneQuotaMonthlySnapshot(snapshot),
        ]),
      );
      this.userRoles = userRoles.map((userRole) =>
        this.cloneUserRole(userRole),
      );
      this.apiKeys = apiKeys.map((apiKey) => this.cloneStoredApiKey(apiKey));
      if (partnerEntries.length === 0) {
        this.persistChanges(
          {
            partnerEntries: this.partnerEntries.map((entry) =>
              this.clonePartnerEntry(entry),
            ),
          },
          "module init partner entry bootstrap",
        );
      }
      if (partnerIngressCredentials.length === 0) {
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
      if (costCenters.length === 0) {
        this.persistChanges(
          {
            costCenters: this.costCenters.map((costCenter) =>
              this.cloneCostCenter(costCenter),
            ),
          },
          "module init tenant cost-center bootstrap",
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
  ): TenantIntegrationGovernancePackage {
    return {
      tenantId,
      generatedAt: new Date().toISOString(),
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
    const result = evaluateTenantApprovalRules({
      tenantId,
      subject: command.subject ?? {
        subjectType: "booking",
        bookingId: null,
        draftId: null,
        operation: "dry_run",
      },
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

    return report;
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

  findTenantUser(tenantId: string, userId: string) {
    const userRole = this.userRoles.find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.userId === userId,
    );
    return userRole ? this.cloneUserRole(userRole) : null;
  }

  listPartnerEntries() {
    return this.partnerEntries
      .filter((entry) => entry.activeFlag && entry.status === "active")
      .map((entry) => this.clonePartnerEntry(entry));
  }

  listPlatformPartnerEntries(
    identity?: IdentityContext | null,
  ): UiListResourceEnvelope<
    PartnerChannelEntryRecord & ActionableResourceRuntimeFields
  > {
    const refreshedAt = new Date().toISOString();
    const availableActions = this.buildPlatformPartnerListActions(identity);
    const createAction = availableActions.find(
      (action) => action.action === "create",
    );
    const items = this.partnerEntries.map((entry) =>
      this.toPlatformPartnerListItem(entry, identity),
    );

    return {
      items,
      availableActions,
      refreshTier: "medium_slow",
      refreshedAt,
      ...(items.length === 0
        ? {
            emptyState: {
              reason: "no_data" as const,
              messageCode: "platform_admin.partners.empty.no_data",
              ...(createAction ? { nextAction: createAction } : {}),
            },
          }
        : {}),
    };
  }

  listPlatformPartnerIngressCredentials(entrySlug: string) {
    this.requirePlatformPartnerEntry(entrySlug);
    return this.partnerIngressCredentials
      .filter((credential) => credential.entrySlug === entrySlug)
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

  private buildPlatformPartnerListActions(identity?: IdentityContext | null) {
    const canMutate = identity?.actorType === "platform_admin";

    return [
      {
        action: "refresh",
        enabled: true,
        riskLevel: "low" as const,
      },
      {
        action: "create",
        enabled: canMutate,
        riskLevel: "medium" as const,
        ...(!canMutate
          ? { disabledReasonCode: "PLATFORM_ADMIN_REQUIRED" }
          : {}),
      },
    ];
  }

  private buildPlatformPartnerRowActionsForActor(
    entry: PartnerChannelEntryRecord,
    canMutate: boolean,
  ) {
    if (entry.status === "active") {
      return [
        {
          action: "deactivate",
          enabled: canMutate,
          riskLevel: "medium" as const,
          ...(!canMutate
            ? { disabledReasonCode: "PLATFORM_ADMIN_REQUIRED" }
            : {}),
        },
      ];
    }

    if (entry.status === "inactive") {
      return [
        {
          action: "activate",
          enabled: canMutate,
          riskLevel: "medium" as const,
          ...(!canMutate
            ? { disabledReasonCode: "PLATFORM_ADMIN_REQUIRED" }
            : {}),
        },
      ];
    }

    return [];
  }

  private buildPlatformPartnerResourceLinks(entry: PartnerChannelEntryRecord) {
    return [
      {
        targetApp: "platform-admin" as const,
        route: `/audit?resourceType=partner_entry&resourceId=${encodeURIComponent(entry.entrySlug)}`,
        resourceType: "audit",
        resourceId: entry.entrySlug,
        openMode: "same_tab" as const,
        label: "View audit",
      },
    ];
  }

  private toPlatformPartnerListItem(
    entry: PartnerChannelEntryRecord,
    identity?: IdentityContext | null,
  ): PartnerChannelEntryRecord & ActionableResourceRuntimeFields {
    const canMutate = identity?.actorType === "platform_admin";

    return {
      ...this.clonePartnerEntry(entry),
      availableActions: this.buildPlatformPartnerRowActionsForActor(
        entry,
        canMutate,
      ),
      resourceLinks: this.buildPlatformPartnerResourceLinks(entry),
    };
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
    );
    let revokedCredentialId: string | null = null;
    this.partnerIngressCredentials = this.partnerIngressCredentials.map(
      (credential) => {
        if (
          credential.entrySlug !== entry.entrySlug ||
          credential.revokedAt !== null
        ) {
          return credential;
        }
        revokedCredentialId = credential.keyId;
        return {
          ...credential,
          revokedAt: issued.credential.createdAt,
          revokedBy: "platform_admin",
          revokeReason: command.rotationReason ?? "credential_rotated",
        };
      },
    );
    this.partnerIngressCredentials = [
      issued.storedCredential,
      ...this.partnerIngressCredentials,
    ];
    const persistedCredentials = this.partnerIngressCredentials.filter(
      (credential) =>
        credential.entrySlug === entry.entrySlug &&
        (credential.keyId === issued.storedCredential.keyId ||
          credential.keyId === revokedCredentialId),
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
    if (credential.revokedAt) {
      return this.toPartnerIngressCredentialResponse(credential);
    }

    const revokedAt = new Date().toISOString();
    credential.revokedAt = revokedAt;
    credential.revokedBy = "platform_admin";
    credential.revokeReason =
      this.normalizeNullableText(command.revokeReason) ?? "manual_revoke";

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

    const providedHash = this.hashPartnerApiKey(apiKey);
    const expectedHash = credential.keyHash;
    if (!this.hashesMatch(providedHash, expectedHash)) {
      this.recordPartnerIngressAttempt(entry, requestId, "rejected", {
        reason: "api_key_invalid",
        keyId: credential.keyId,
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

    const identity: IdentityContext = {
      actorType: "partner_api_key",
      actorId: credential.keyId,
      realm: "partner",
      authMode: "bootstrap_headers",
      roleFamilies: ["partner"],
      roles: ["partner_ingress"],
      scopes: [
        "partner:entries:read",
        "partner:eligibility:read",
        "partner:eligibility:write",
      ],
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
    });
    credential.lastUsedAt = new Date().toISOString();

    return {
      partnerEntry: this.clonePartnerEntry(entry),
      identity,
    };
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
    this.persistChanges(
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
          identity?.actorType === "partner_api_key"
            ? "partner_api_key"
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

  getPartnerEligibilityVerification(
    eligibilityVerificationId: string,
    requestId?: string,
    identity?: PartnerEligibilityIdentity | null,
  ) {
    const verification = this.partnerEligibilityVerifications.get(
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

  resolvePartnerEligibilityReview(
    command: ResolvePartnerEligibilityReviewCommand,
    requestId?: string,
    identity?: IdentityContext | null,
  ): PartnerEligibilityReviewResolution {
    const verification = this.partnerEligibilityVerifications.get(
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

    verification.verificationStatus = resolvedStatus;
    verification.verificationReasonCode = command.reasonCode;
    verification.decisionSource = "ops_manual_review";
    verification.updatedAt = now;
    verification.manualFallback = {
      ...verification.manualFallback,
      notes: command.notes,
    };
    verification.auditMetadata = {
      ...verification.auditMetadata,
      updatedBy: resolvedBy,
    };

    this.partnerEligibilityVerifications.set(
      command.eligibilityVerificationId,
      this.clonePartnerEligibilityVerification(verification),
    );
    this.persistChanges(
      {
        partnerEligibilityVerifications: [
          this.clonePartnerEligibilityVerification(verification),
        ],
      },
      "resolve_partner_eligibility_review",
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
  ) {
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
    this.persistChanges(
      {
        userRoles: [this.cloneUserRole(userRole)],
      },
      "create_tenant_user",
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
  }

  updateTenantUserRole(
    tenantId: string,
    userId: string,
    command: UpdateTenantRoleCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.roleCode, "roleCode");
    this.assertSupportedTenantRoleCode(command.roleCode);

    const userRole = this.requireTenantUser(tenantId, userId);
    userRole.roleCode = command.roleCode.trim();
    userRole.status = command.status ?? userRole.status;
    userRole.approvalNotificationOptOut =
      command.approvalNotificationOptOut ?? userRole.approvalNotificationOptOut;
    userRole.updatedAt = new Date().toISOString();

    this.persistChanges(
      {
        userRoles: [this.cloneUserRole(userRole)],
      },
      "update_tenant_role",
    );
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
  }

  listApiKeys(tenantId: string) {
    return this.apiKeys
      .filter((apiKey) => apiKey.tenantId === tenantId)
      .map((apiKey) => this.toApiKeyResponse(apiKey));
  }

  issueApiKey(
    tenantId: string,
    command: IssueTenantApiKeyCommand,
    requestId?: string,
  ): TenantApiKeyIssued {
    this.assertNonBlank(command.keyName, "keyName");

    const issued = this.buildIssuedApiKey(
      tenantId,
      {
        keyName: command.keyName,
        scopes: command.scopes,
        expiresAt: command.expiresAt ?? null,
      },
      null,
    );
    this.apiKeys = [
      this.cloneStoredApiKey(issued.storedApiKey),
      ...this.apiKeys,
    ];
    this.persistChanges(
      {
        apiKeys: [this.cloneStoredApiKey(issued.storedApiKey)],
      },
      "issue_api_key",
    );
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
    };
  }

  rotateApiKey(
    tenantId: string,
    apiKeyId: string,
    command: RotateTenantApiKeyCommand,
    requestId?: string,
  ): TenantApiKeyIssued {
    const currentApiKey = this.requireApiKey(tenantId, apiKeyId);
    const rotatedAt = new Date().toISOString();
    currentApiKey.revokedAt = rotatedAt;

    const issued = this.buildIssuedApiKey(
      tenantId,
      {
        keyName: command.keyName ?? currentApiKey.keyName,
        scopes:
          command.scopes && command.scopes.length > 0
            ? command.scopes
            : currentApiKey.scopes,
        expiresAt:
          command.expiresAt !== undefined
            ? command.expiresAt
            : currentApiKey.expiresAt,
      },
      currentApiKey.apiKeyId,
    );

    this.apiKeys = [
      this.cloneStoredApiKey(issued.storedApiKey),
      this.cloneStoredApiKey(currentApiKey),
      ...this.apiKeys.filter(
        (apiKey) => apiKey.apiKeyId !== currentApiKey.apiKeyId,
      ),
    ];
    this.persistChanges(
      {
        apiKeys: [
          this.cloneStoredApiKey(currentApiKey),
          this.cloneStoredApiKey(issued.storedApiKey),
        ],
      },
      "rotate_api_key",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId,
        moduleName: "tenant-partner",
        actionName: "rotate_api_key",
        resourceType: "tenant_api_key",
        resourceId: issued.storedApiKey.apiKeyId,
        oldValuesSummary: this.toApiKeyResponse(currentApiKey),
        newValuesSummary: this.toApiKeyResponse(issued.storedApiKey),
      },
      requestId,
    );

    return {
      apiKey: this.toApiKeyResponse(issued.storedApiKey),
      plaintextKey: issued.plaintextKey,
      revokedApiKeyId: currentApiKey.apiKeyId,
    };
  }

  listWebhookEndpoints(tenantId: string) {
    return this.webhookEndpoints
      .filter((endpoint) => endpoint.tenantId === tenantId)
      .map((endpoint) => this.toWebhookResponse(endpoint));
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
        newValuesSummary: { deleted: true },
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
    const secretPreview = this.secretPreview(command.secret);
    const webhookEndpoint: StoredWebhookEndpoint = {
      webhookId: `wh_${randomUUID()}`,
      tenantId,
      url: normalizedUrl,
      events: normalizedEvents,
      status: "test_pending",
      secretVersion: 1,
      secretPreview,
      secretValue: command.secret,
      retryPolicy: { ...DEFAULT_WEBHOOK_RETRY_POLICY },
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
        retryPolicy: { ...DEFAULT_WEBHOOK_RETRY_POLICY },
        secretRotation: {
          currentVersion: 1,
          rotatedAt: now,
          rotationCount: 1,
          history: [
            {
              secretVersion: 1,
              rotatedAt: now,
              rotationReason: "initial_secret",
              secretPreview,
            },
          ],
        },
      },
      secretHistory: [
        {
          secretVersion: 1,
          rotatedAt: now,
          rotationReason: "initial_secret",
          secretPreview,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

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
          url: webhookEndpoint.url,
          events: webhookEndpoint.events,
          secretVersion: webhookEndpoint.secretVersion,
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
      endpoint.status = "disabled";
      endpoint.runtimeMetadata.disabledAt = now;
      endpoint.runtimeMetadata.disableReason = "manual_disable";
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

    const delivery = this.enqueueWebhookDelivery(
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
      const delivery = this.enqueueWebhookDelivery(
        endpoint,
        input.eventType,
        occurredAt,
        "publish_webhook_event",
      );
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

  private enqueueWebhookDelivery(
    endpoint: StoredWebhookEndpoint,
    eventType: string,
    createdAt: string,
    context: string,
  ) {
    const delivery: StoredWebhookDelivery = {
      deliveryId: `wd_${randomUUID()}`,
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
      retryPolicySnapshot: { ...endpoint.retryPolicy },
      rawBody: {},
    };

    this.webhookDeliveries = [delivery, ...this.webhookDeliveries];
    endpoint.runtimeMetadata = {
      ...endpoint.runtimeMetadata,
      deliveryCount: endpoint.runtimeMetadata.deliveryCount + 1,
      secretRotation: {
        currentVersion: endpoint.secretVersion,
        rotatedAt: endpoint.runtimeMetadata.secretRotation.rotatedAt,
        rotationCount: endpoint.runtimeMetadata.secretRotation.rotationCount,
        history: endpoint.runtimeMetadata.secretRotation.history.map(
          (record) => ({ ...record }),
        ),
      },
      retryPolicy: { ...endpoint.retryPolicy },
    };

    this.persistChanges(
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
    const result = await this.webhookDispatchService.dispatchAttempt({
      url: endpoint.url,
      deliveryId: delivery.deliveryId,
      eventType: delivery.eventType,
      tenantId: endpoint.tenantId,
      secretValue: endpoint.secretValue,
      secretVersion: endpoint.secretVersion,
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
    delivery.retryPolicySnapshot = { ...endpoint.retryPolicy };
    delivery.rawBody = { ...result.rawBody };

    endpoint.runtimeMetadata = {
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
      lastSignaturePreview: result.signature.slice(0, 16),
      disabledAt: endpoint.runtimeMetadata.disabledAt,
      disableReason: endpoint.runtimeMetadata.disableReason,
      secretRotation: {
        currentVersion: endpoint.secretVersion,
        rotatedAt: endpoint.runtimeMetadata.secretRotation.rotatedAt,
        rotationCount: endpoint.runtimeMetadata.secretRotation.rotationCount,
        history: endpoint.runtimeMetadata.secretRotation.history.map(
          (record) => ({ ...record }),
        ),
      },
      retryPolicy: { ...endpoint.retryPolicy },
    };
    this.applyWebhookPostDispatchPolicy(
      endpoint,
      delivery,
      result,
      previousEndpointValues,
    );

    this.persistChanges(
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
      void this.retryWebhookDelivery(webhookId, deliveryId);
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

  private async retryWebhookDelivery(webhookId: string, deliveryId: string) {
    const endpoint = this.webhookEndpoints.find(
      (candidate) => candidate.webhookId === webhookId,
    );
    const delivery = this.webhookDeliveries.find(
      (candidate) => candidate.deliveryId === deliveryId,
    );

    if (!endpoint || !delivery || delivery.status !== "queued") {
      this.clearWebhookRetry(deliveryId);
      return;
    }

    await this.dispatchWebhookAttempt(endpoint, delivery, delivery.rawBody);
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
      .map((delivery) => this.toDeliveryResponse(delivery));
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
      .map((delivery) => this.toDeliveryResponse(delivery));
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
    const rotationRecord: WebhookSecretRotationRecord = {
      secretVersion: endpoint.secretVersion + 1,
      rotatedAt,
      rotationReason,
      secretPreview,
    };

    endpoint.secretVersion = rotationRecord.secretVersion;
    endpoint.secretValue = command.secret;
    endpoint.secretPreview = secretPreview;
    endpoint.secretHistory = [...endpoint.secretHistory, rotationRecord];
    endpoint.runtimeMetadata = {
      ...endpoint.runtimeMetadata,
      secretRotation: {
        currentVersion: endpoint.secretVersion,
        rotatedAt,
        rotationCount: endpoint.secretHistory.length,
        history: endpoint.secretHistory.map((record) => ({ ...record })),
      },
    };
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
    };
  }

  getSlaProfile(tenantId: string) {
    return { ...this.getOrCreateSlaProfile(tenantId) };
  }

  updateSlaProfile(
    tenantId: string,
    command: UpdateTenantSlaProfileCommand,
    requestId?: string,
  ) {
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
        actorId: null,
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
        },
      },
      requestId,
    );

    return {
      status: "updated",
    };
  }

  revokeApiKey(tenantId: string, apiKeyId: string, requestId?: string) {
    const apiKey = this.requireApiKey(tenantId, apiKeyId);
    if (!apiKey.revokedAt) {
      apiKey.revokedAt = new Date().toISOString();
      this.persistChanges(
        { apiKeys: [this.cloneStoredApiKey(apiKey)] },
        "revoke_api_key",
      );
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
      expiresAt: string | null;
    },
    revokedApiKeyId: string | null,
  ) {
    const now = new Date().toISOString();
    const plaintextKey = `tk_${randomBytes(18).toString("hex")}`;
    const normalizedScopes = this.normalizeTenantApiKeyScopes(input.scopes);
    const expiresAt = this.resolveTenantApiKeyExpiry(input.expiresAt);
    const storedApiKey: StoredTenantApiKeyRecord = {
      apiKeyId: `api_key_${randomUUID()}`,
      tenantId,
      keyName: input.keyName.trim(),
      keyPrefix: plaintextKey.slice(0, 12),
      maskedSuffix: this.maskedSuffix(plaintextKey),
      scopes: normalizedScopes,
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
      createdAt: now,
      keyHash: this.hashSecret(plaintextKey),
    };

    return {
      storedApiKey,
      plaintextKey,
      revokedApiKeyId,
    };
  }

  private buildTenantApiKeyGovernancePolicy(): TenantApiKeyGovernancePolicy {
    return {
      allowedScopes: [...CANONICAL_TENANT_API_KEY_SCOPES].sort(),
      compatibilityAliases: { ...TENANT_API_KEY_SCOPE_ALIASES },
      defaultLifetimeDays: DEFAULT_TENANT_API_KEY_LIFETIME_DAYS,
      maxLifetimeDays: MAX_TENANT_API_KEY_LIFETIME_DAYS,
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

  private toWebhookResponse(endpoint: StoredWebhookEndpoint) {
    return {
      webhookId: endpoint.webhookId,
      tenantId: endpoint.tenantId,
      url: endpoint.url,
      events: [...endpoint.events],
      status: endpoint.status,
      secretVersion: endpoint.secretVersion,
      secretPreview: endpoint.secretPreview,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
      retryPolicy: { ...endpoint.retryPolicy },
      runtimeMetadata: {
        ...endpoint.runtimeMetadata,
        retryPolicy: { ...endpoint.runtimeMetadata.retryPolicy },
        secretRotation: {
          currentVersion:
            endpoint.runtimeMetadata.secretRotation.currentVersion,
          rotatedAt: endpoint.runtimeMetadata.secretRotation.rotatedAt,
          rotationCount: endpoint.runtimeMetadata.secretRotation.rotationCount,
          history: endpoint.runtimeMetadata.secretRotation.history.map(
            (record) => ({ ...record }),
          ),
        },
      },
      secretHistory: endpoint.secretHistory.map((record) => ({ ...record })),
    };
  }

  private toDeliveryResponse(delivery: StoredWebhookDelivery) {
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
      attemptedAt: delivery.attemptedAt,
      nextAttemptAt: delivery.nextAttemptAt,
      signatureVersion: delivery.signatureVersion,
      secretVersion: delivery.secretVersion,
    };
  }

  private toApiKeyResponse(apiKey: StoredTenantApiKeyRecord) {
    return {
      apiKeyId: apiKey.apiKeyId,
      tenantId: apiKey.tenantId,
      keyName: apiKey.keyName,
      keyPrefix: apiKey.keyPrefix,
      maskedSuffix: apiKey.maskedSuffix,
      scopes: [...apiKey.scopes],
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
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
    return {
      ...credential,
    };
  }

  private toPartnerIngressCredentialResponse(
    credential: StoredPartnerIngressCredentialRecord,
  ): PartnerIngressCredentialRecord {
    return {
      keyId: credential.keyId,
      entrySlug: credential.entrySlug,
      keyPrefix: credential.keyPrefix,
      maskedSuffix: credential.maskedSuffix,
      source: credential.source,
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt,
      revokedAt: credential.revokedAt,
      issuedBy: credential.issuedBy,
      revokedBy: credential.revokedBy,
      rotationReason: credential.rotationReason,
      revokeReason: credential.revokeReason,
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

  private cloneStoredApiKey(
    apiKey: StoredTenantApiKeyRecord,
  ): StoredTenantApiKeyRecord {
    return {
      ...apiKey,
      scopes: [...apiKey.scopes],
    };
  }

  private cloneStoredWebhookEndpoint(
    endpoint: StoredWebhookEndpointRecord,
  ): StoredWebhookEndpoint {
    return {
      ...endpoint,
      events: [...endpoint.events],
      retryPolicy: { ...endpoint.retryPolicy },
      runtimeMetadata: {
        ...endpoint.runtimeMetadata,
        retryPolicy: { ...endpoint.runtimeMetadata.retryPolicy },
        secretRotation: {
          currentVersion:
            endpoint.runtimeMetadata.secretRotation.currentVersion,
          rotatedAt: endpoint.runtimeMetadata.secretRotation.rotatedAt,
          rotationCount: endpoint.runtimeMetadata.secretRotation.rotationCount,
          history: endpoint.runtimeMetadata.secretRotation.history.map(
            (record) => ({
              ...record,
            }),
          ),
        },
      },
      secretHistory: endpoint.secretHistory.map((record) => ({ ...record })),
    };
  }

  private cloneStoredWebhookDelivery(
    delivery: StoredWebhookDeliveryRecord,
  ): StoredWebhookDelivery {
    return {
      ...delivery,
      rawBody: { ...delivery.rawBody },
      retryPolicySnapshot: { ...delivery.retryPolicySnapshot },
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

  private resolvePartnerIngressCredential(entrySlug: string) {
    return this.partnerIngressCredentials.find(
      (credential) =>
        credential.entrySlug === entrySlug && credential.revokedAt === null,
    );
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
      identity.actorType !== "partner_api_key" ||
      identity.realm !== "partner" ||
      identity.tenantId !== entry.tenantId ||
      identity.partnerId !== entry.partnerId ||
      identity.partnerProgramId !== entry.programId ||
      identity.partnerEntrySlug !== entry.entrySlug;

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
      identity.actorType !== "partner_api_key" ||
      identity.realm !== "partner" ||
      identity.tenantId !== verification.tenantId ||
      identity.partnerId !== verification.partnerId ||
      identity.partnerProgramId !== verification.partnerProgramId ||
      identity.partnerEntrySlug !== verification.partnerEntrySlug;

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

  private buildIssuedPartnerIngressCredential(
    entrySlug: string,
    rotationReason: string | null,
  ) {
    const now = new Date().toISOString();
    const plaintextKey = `pk_${randomBytes(18).toString("hex")}`;
    const storedCredential: StoredPartnerIngressCredentialRecord = {
      keyId: `partner_key_${randomUUID()}`,
      entrySlug,
      keyPrefix: plaintextKey.slice(0, 12),
      maskedSuffix: this.maskedSuffix(plaintextKey),
      source: "platform_admin",
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
      issuedBy: "platform_admin",
      revokedBy: null,
      rotationReason,
      revokeReason: null,
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
    actorType: Extract<AuditLogRecord["actorType"], "ops_user" | "platform_admin">;
    actorRoleCode: string | null;
    decision: "approve" | "reject";
    reasonCode: string | null;
    reasonNote: string | null;
    requestId?: string;
  }) {
    const request = this.requirePendingApprovalRequestById(input.approvalRequestId);
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
    onSuccess: () => T,
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
      ledgerEntryId: `quota-ledger-${randomUUID()}`,
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

  private buildQuotaPolicyKey(
    tenantId: string,
    costCenterCode: string | null,
    period: "monthly",
  ) {
    return `${tenantId}:${costCenterCode ?? "~"}:${period}`;
  }

  private buildQuotaSnapshotKey(
    tenantId: string,
    costCenterCode: string | null,
    period: "monthly",
    periodKey: string,
  ) {
    return `${tenantId}:${costCenterCode ?? "~"}:${period}:${periodKey}`;
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

  private recordQuotaReservationAudits(
    tenantId: string,
    entries: readonly TenantQuotaLedgerEntry[],
    updatedSnapshots: readonly TenantQuotaMonthlySnapshotRecord[],
  ) {
    for (const entry of entries) {
      this.auditNotificationService.recordAuditLog({
        actorId: null,
        actorType: "system",
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
      });
    }
    for (const snapshot of updatedSnapshots) {
      this.auditNotificationService.recordAuditLog({
        actorId: null,
        actorType: "system",
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
          usage: snapshot.usage,
        },
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
    if (!this.tenantPartnerRepository) {
      return;
    }

    void this.tenantPartnerRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        this.tenantPartnerRepository!.reportPersistenceFailure(error, context);
      });
  }
}
