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
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  AuditLogRecord,
  CreatePartnerChannelEntryCommand,
  CreatePartnerBootstrapSessionCommand,
  PartnerEntryBrandingMetadata,
  CreateTenantUserCommand,
  IdentityContext,
  CreateTenantWebhookEndpointCommand,
  IssueTenantApiKeyCommand,
  PartnerEligibilityAdapterAttemptRecord,
  PartnerChannelEntryRecord,
  PartnerEligibilityDecisionSource,
  PartnerEligibilityIntegrationContractRecord,
  PartnerEligibilityManualFallbackPolicy,
  PartnerEligibilityManualFallbackRecord,
  PartnerEligibilityRetryPolicyRecord,
  PartnerEligibilitySensitiveDataPolicy,
  PartnerEligibilityVerificationRecord,
  RotateTenantApiKeyCommand,
  SendTestWebhookCommand,
  TenantAddressExportViewRecord,
  TenantAddressGeocodeSource,
  TenantAddressQualityIssue,
  TenantAddressRecord,
  TenantApiKeyGovernancePolicy,
  TenantApiKeyIssued,
  TenantNotificationPreferences,
  TenantPassengerMasterRole,
  TenantPassengerQualityIssue,
  TenantPassengerRecord,
  TenantIntegrationGovernancePackage,
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
  UpsertTenantPassengerCommand,
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
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
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
  type StoredTenantApiKeyRecord,
  type StoredWebhookDeliveryRecord,
  type StoredWebhookEndpointRecord,
} from "./tenant-partner.repository";
import {
  WebhookDispatchService,
  type WebhookRetryPolicy,
} from "./webhook-dispatch.service";

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

const DEFAULT_WEBHOOK_RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 5,
  initialBackoffSeconds: 30,
  backoffMultiplier: 2,
  maxBackoffSeconds: 900,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

const PARTNER_ELIGIBILITY_DECISION_TTL_SECONDS = 30 * 60;

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

const USER_ROLE_SEED: TenantUserRoleRecord[] = [
  {
    userId: "tenant-user-demo-001",
    tenantId: DEMO_TENANT_ID,
    email: "admin@acme.example",
    displayName: "Acme Tenant Admin",
    roleCode: "tenant_admin",
    status: "active",
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

function resolvePartnerIngressCredentialsFromEnv(): readonly PartnerIngressCredentialSeed[] {
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

@Injectable()
export class TenantPartnerService implements OnModuleInit, OnModuleDestroy {
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

  private userRoles = USER_ROLE_SEED.map((userRole) =>
    this.cloneUserRole(userRole),
  );

  private apiKeys = API_KEY_SEED.map((apiKey) =>
    this.cloneStoredApiKey(apiKey),
  );

  private partnerEntries = PARTNER_ENTRY_SEED.map((entry) =>
    this.clonePartnerEntry(entry),
  );

  private partnerEligibilityVerifications = new Map<
    string,
    PartnerEligibilityVerificationRecord
  >();

  private readonly retryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly tenantPartnerRepository?: TenantPartnerRepository,
    @Optional()
    private readonly webhookDispatchService: WebhookDispatchService = new WebhookDispatchService(),
    private readonly partnerIngressCredentials: readonly PartnerIngressCredentialSeed[] = resolvePartnerIngressCredentialsFromEnv(),
    @Optional()
    @Inject(PARTNER_ELIGIBILITY_ADAPTERS)
    private readonly eligibilityAdapters: readonly PartnerEligibilityAdapterInterface[] = [
      new BankCardInlineEligibilityAdapter(),
      new ReferenceTokenEligibilityAdapter(),
    ],
  ) {}

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
      const partnerEligibilityVerifications =
        persistedState.partnerEligibilityVerifications ?? [];
      const passengers = persistedState.passengers ?? [];
      const addresses = persistedState.addresses ?? [];
      const userRoles = persistedState.userRoles ?? [];
      const apiKeys = persistedState.apiKeys ?? [];
      const hasPersistedState =
        notificationPreferences.length > 0 ||
        slaProfiles.length > 0 ||
        webhookEndpoints.length > 0 ||
        webhookDeliveries.length > 0 ||
        partnerEntries.length > 0 ||
        partnerEligibilityVerifications.length > 0 ||
        passengers.length > 0 ||
        addresses.length > 0 ||
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
            passengers: this.passengers.map((passenger) =>
              this.clonePassenger(passenger),
            ),
            addresses: this.addresses.map((address) =>
              this.cloneAddress(address),
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
      this.normalizePartnerEntryAuthModes();
      this.partnerEligibilityVerifications = new Map(
        partnerEligibilityVerifications.map((verification) => [
          verification.eligibilityVerificationId,
          this.clonePartnerEligibilityVerification(verification),
        ]),
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
      this.schedulePersistedWebhookRetries();
    } catch (error) {
      this.tenantPartnerRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  onModuleDestroy() {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
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

  listPartnerEntries() {
    return this.partnerEntries
      .filter((entry) => entry.activeFlag && entry.status === "active")
      .map((entry) => this.clonePartnerEntry(entry));
  }

  listPlatformPartnerEntries() {
    return this.partnerEntries.map((entry) => this.clonePartnerEntry(entry));
  }

  getPartnerEntry(entrySlug: string) {
    return this.clonePartnerEntry(this.requirePartnerEntry(entrySlug));
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
    if (command.status) {
      entry.status = command.status;
      entry.activeFlag = command.status === "active";
    }
    if (command.activeFlag !== undefined) {
      entry.activeFlag = command.activeFlag;
      entry.status = command.activeFlag ? "active" : "inactive";
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

  authenticatePartnerBootstrap(
    command: CreatePartnerBootstrapSessionCommand,
    requestId?: string,
  ): PartnerIngressResolution {
    const entry = this.requirePartnerEntry(command.entrySlug);
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
    const expectedHash = credential.apiKeyHash;
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
    const entry = this.requirePartnerEntry(command.entrySlug);
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

  private buildTenantUserAuditSummary(userRole: TenantUserRoleRecord) {
    return {
      userId: userRole.userId,
      tenantId: userRole.tenantId,
      email: maskEmail(userRole.email),
      displayName: maskName(userRole.displayName),
      roleCode: userRole.roleCode,
      status: userRole.status,
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
      (credential) => credential.entrySlug === entrySlug,
    );
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
