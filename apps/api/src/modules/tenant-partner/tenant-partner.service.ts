import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
  AuditLogRecord,
  CreateTenantUserCommand,
  CreateTenantWebhookEndpointCommand,
  IssueTenantApiKeyCommand,
  RotateTenantApiKeyCommand,
  SendTestWebhookCommand,
  TenantAddressRecord,
  TenantApiKeyIssued,
  TenantNotificationPreferences,
  TenantPassengerRecord,
  TenantRoleCatalogRecord,
  TenantSlaProfile,
  TenantUserRoleRecord,
  TenantWebhookEndpoint,
  TenantWebhookEndpointStatus,
  UpdateTenantWebhookEndpointCommand,
  UpdateTenantNotificationsCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpsertTenantAddressCommand,
  UpsertTenantPassengerCommand,
  WebhookEventPayload,
  WebhookDeliveryRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
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

type WebhookSecretRotationRecord = {
  secretVersion: number;
  rotatedAt: string;
  rotationReason: string | null;
  secretPreview: string;
};

type WebhookRuntimeMetadata = {
  deliveryCount: number;
  failedDeliveryCount: number;
  lastAttemptAt: string | null;
  lastDeliveredAt: string | null;
  nextAttemptAt: string | null;
  lastSignaturePreview: string | null;
  retryPolicy: WebhookRetryPolicy;
  secretRotation: {
    currentVersion: number;
    rotatedAt: string;
    rotationCount: number;
    history: WebhookSecretRotationRecord[];
  };
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

const DEFAULT_WEBHOOK_RETRY_POLICY: WebhookRetryPolicy = {
  maxAttempts: 5,
  initialBackoffSeconds: 30,
  backoffMultiplier: 2,
  maxBackoffSeconds: 900,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

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
    scopes: ["tenant:bookings:write", "tenant:reports:read"],
    lastUsedAt: null,
    expiresAt: "2027-04-10T00:00:00.000Z",
    revokedAt: null,
    createdAt: "2026-04-10T00:00:00.000Z",
    keyHash: "sha256:demo-acme-key",
  },
];

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
  ) {}

  async onModuleInit() {
    if (!this.tenantPartnerRepository) {
      return;
    }

    try {
      const persistedState = await this.tenantPartnerRepository.loadState();
      const hasPersistedState =
        persistedState.notificationPreferences.length > 0 ||
        persistedState.slaProfiles.length > 0 ||
        persistedState.webhookEndpoints.length > 0 ||
        persistedState.webhookDeliveries.length > 0 ||
        persistedState.passengers.length > 0 ||
        persistedState.addresses.length > 0 ||
        persistedState.userRoles.length > 0 ||
        persistedState.apiKeys.length > 0;

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
        persistedState.notificationPreferences.map((preferences) => [
          preferences.tenantId,
          this.cloneNotificationPreferences(preferences),
        ]),
      );
      this.slaProfiles = new Map(
        persistedState.slaProfiles.map((profile) => [
          profile.tenantId,
          this.cloneSlaProfile(profile),
        ]),
      );
      this.webhookEndpoints = persistedState.webhookEndpoints.map((endpoint) =>
        this.cloneStoredWebhookEndpoint(endpoint),
      );
      this.webhookDeliveries = persistedState.webhookDeliveries.map(
        (delivery) => this.cloneStoredWebhookDelivery(delivery),
      );
      this.passengers = persistedState.passengers.map((passenger) =>
        this.clonePassenger(passenger),
      );
      this.addresses = persistedState.addresses.map((address) =>
        this.cloneAddress(address),
      );
      this.userRoles = persistedState.userRoles.map((userRole) =>
        this.cloneUserRole(userRole),
      );
      this.apiKeys = persistedState.apiKeys.map((apiKey) =>
        this.cloneStoredApiKey(apiKey),
      );
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
          activeFlag: command.activeFlag ?? true,
          metadata: {
            ...(command.metadata ?? {}),
          },
          createdAt: now,
          updatedAt: now,
        };

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
        newValuesSummary: {
          ...this.clonePassenger(passenger),
        },
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

    const address: TenantAddressRecord = existing
      ? {
          ...existing,
          ownerPassengerId,
          addressName: command.addressName.trim(),
          addressText: command.addressText.trim(),
          lat: command.lat ?? existing.lat,
          lng: command.lng ?? existing.lng,
          tags: [...(command.tags ?? existing.tags)],
          activeFlag: command.activeFlag ?? existing.activeFlag,
          updatedAt: now,
        }
      : {
          addressId: addressId || `address_${randomUUID()}`,
          tenantId,
          ownerPassengerId,
          addressName: command.addressName.trim(),
          addressText: command.addressText.trim(),
          lat: command.lat ?? null,
          lng: command.lng ?? null,
          tags: [...(command.tags ?? [])],
          activeFlag: command.activeFlag ?? true,
          createdAt: now,
          updatedAt: now,
        };

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
        newValuesSummary: {
          ...this.cloneAddress(address),
        },
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
        newValuesSummary: {
          ...this.cloneUserRole(userRole),
        },
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
        newValuesSummary: {
          ...this.cloneUserRole(userRole),
        },
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
      status: "active",
      secretVersion: 1,
      secretPreview,
      secretValue: command.secret,
      retryPolicy: { ...DEFAULT_WEBHOOK_RETRY_POLICY },
      runtimeMetadata: {
        deliveryCount: 0,
        failedDeliveryCount: 0,
        lastAttemptAt: null,
        lastDeliveredAt: null,
        nextAttemptAt: null,
        lastSignaturePreview: null,
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

    let changed = false;

    if (command.url !== undefined) {
      this.assertNonBlank(command.url, "url");
      endpoint.url = command.url.trim();
      changed = true;
    }

    if (command.events !== undefined) {
      endpoint.events = this.normalizeWebhookEvents(command.events);
      changed = true;
    }

    if (command.status !== undefined) {
      this.assertSupportedWebhookStatus(command.status);
      endpoint.status = command.status;
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

    endpoint.updatedAt = new Date().toISOString();
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
    const endpoint = this.webhookEndpoints.find(
      (webhook) =>
        webhook.tenantId === tenantId &&
        webhook.webhookId === command.webhookId,
    );
    if (!endpoint) {
      return null;
    }

    const createdAt = new Date().toISOString();
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

  listWebhookDeliveries(tenantId: string) {
    return this.webhookDeliveries
      .filter((delivery) => delivery.tenantId === tenantId)
      .map((delivery) => this.toDeliveryResponse(delivery));
  }

  listWebhookDeliveriesByWebhook(tenantId: string, webhookId: string) {
    return this.webhookDeliveries
      .filter(
        (delivery) =>
          delivery.tenantId === tenantId && delivery.webhookId === webhookId,
      )
      .map((delivery) => this.toDeliveryResponse(delivery));
  }

  rotateWebhookSecret(
    tenantId: string,
    command: RotateWebhookSecretCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.secret, "secret");

    const endpoint = this.webhookEndpoints.find(
      (webhook) =>
        webhook.tenantId === tenantId &&
        webhook.webhookId === command.webhookId,
    );
    if (!endpoint) {
      return null;
    }

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
    endpoint.updatedAt = rotatedAt;
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
        newValuesSummary: {
          secretVersion: endpoint.secretVersion,
          rotationCount: endpoint.secretHistory.length,
          rotationReason,
          secretPreview: endpoint.secretPreview,
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

  listTenantAudit(tenantId: string) {
    return this.auditNotificationService
      .listAuditLogs()
      .filter((auditLog) => auditLog.tenantId === tenantId);
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
    const storedApiKey: StoredTenantApiKeyRecord = {
      apiKeyId: `api_key_${randomUUID()}`,
      tenantId,
      keyName: input.keyName.trim(),
      keyPrefix: plaintextKey.slice(0, 12),
      maskedSuffix: this.maskedSuffix(plaintextKey),
      scopes: [...input.scopes],
      lastUsedAt: null,
      expiresAt: input.expiresAt,
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
      ...delivery,
      rawBody: { ...delivery.rawBody },
      retryPolicySnapshot: { ...delivery.retryPolicySnapshot },
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
      metadata: { ...passenger.metadata },
    };
  }

  private cloneAddress(address: TenantAddressRecord): TenantAddressRecord {
    return {
      ...address,
      tags: [...address.tags],
    };
  }

  private cloneUserRole(userRole: TenantUserRoleRecord): TenantUserRoleRecord {
    return {
      ...userRole,
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
    if (status === "active" || status === "test_pending") {
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
