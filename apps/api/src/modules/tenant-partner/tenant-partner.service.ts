import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

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

const DEMO_TENANT_ID = "tenant-demo-001";

type WebhookRetryPolicy = {
  maxAttempts: number;
  initialBackoffSeconds: number;
  backoffMultiplier: number;
  maxBackoffSeconds: number;
  retryableStatusCodes: number[];
};

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
export class TenantPartnerService implements OnModuleInit {
  private notificationPreferences: TenantNotificationPreferences = {
    tenantId: DEMO_TENANT_ID,
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

  private webhookEndpoints: StoredWebhookEndpoint[] = [];

  private webhookDeliveries: StoredWebhookDelivery[] = [];

  private slaProfile: TenantSlaProfile = {
    tenantId: DEMO_TENANT_ID,
    waitThresholdMin: 10,
    arrivalThresholdMin: 15,
    completionThresholdMin: 90,
    updatedAt: "2026-04-10T00:00:00.000Z",
  };

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

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    private readonly tenantPartnerRepository?: TenantPartnerRepository,
  ) {}

  async onModuleInit() {
    if (!this.tenantPartnerRepository) {
      return;
    }

    try {
      const persistedState = await this.tenantPartnerRepository.loadState();
      const hasPersistedState =
        persistedState.notificationPreferences !== null ||
        persistedState.slaProfile !== null ||
        persistedState.webhookEndpoints.length > 0 ||
        persistedState.webhookDeliveries.length > 0 ||
        persistedState.passengers.length > 0 ||
        persistedState.addresses.length > 0 ||
        persistedState.userRoles.length > 0 ||
        persistedState.apiKeys.length > 0;

      if (!hasPersistedState) {
        this.persistChanges(
          {
            notificationPreferences: this.cloneNotificationPreferences(
              this.notificationPreferences,
            ),
            slaProfile: this.cloneSlaProfile(this.slaProfile),
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

      if (persistedState.notificationPreferences) {
        this.notificationPreferences = this.cloneNotificationPreferences(
          persistedState.notificationPreferences,
        );
      }
      if (persistedState.slaProfile) {
        this.slaProfile = this.cloneSlaProfile(persistedState.slaProfile);
      }
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
    } catch (error) {
      this.tenantPartnerRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  getNotificationPreferences() {
    return this.cloneNotificationPreferences(this.notificationPreferences);
  }

  updateNotificationPreferences(
    command: UpdateTenantNotificationsCommand,
    requestId?: string,
  ) {
    this.notificationPreferences = {
      tenantId: DEMO_TENANT_ID,
      subscriptions: command.subscriptions.map((subscription) => ({
        ...subscription,
      })),
      updatedAt: new Date().toISOString(),
    };
    this.persistChanges(
      {
        notificationPreferences: this.cloneNotificationPreferences(
          this.notificationPreferences,
        ),
      },
      "update_notification_preferences",
    );

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: DEMO_TENANT_ID,
        moduleName: "tenant-partner",
        actionName: "update_notification_subscription",
        resourceType: "tenant_notifications",
        resourceId: DEMO_TENANT_ID,
        newValuesSummary: {
          subscriptions: this.notificationPreferences.subscriptions,
        },
      },
      requestId,
    );

    return {
      status: "updated",
    };
  }

  listTenantNotifications() {
    return this.auditNotificationService
      .listNotifications()
      .filter((notification) => notification.tenantId === DEMO_TENANT_ID);
  }

  listPassengers() {
    return this.passengers.map((passenger) => this.clonePassenger(passenger));
  }

  upsertPassenger(command: UpsertTenantPassengerCommand, requestId?: string) {
    this.assertNonBlank(command.fullName, "fullName");

    const now = new Date().toISOString();
    const existing = command.passengerId
      ? (this.passengers.find(
          (passenger) => passenger.passengerId === command.passengerId,
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
          passengerId:
            command.passengerId?.trim() || `passenger_${randomUUID()}`,
          tenantId: DEMO_TENANT_ID,
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
        tenantId: DEMO_TENANT_ID,
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

  listAddresses() {
    return this.addresses.map((address) => this.cloneAddress(address));
  }

  upsertAddress(command: UpsertTenantAddressCommand, requestId?: string) {
    this.assertNonBlank(command.addressName, "addressName");
    this.assertNonBlank(command.addressText, "addressText");

    const ownerPassengerId = command.ownerPassengerId ?? null;
    if (
      ownerPassengerId !== null &&
      !this.passengers.some(
        (passenger) => passenger.passengerId === ownerPassengerId,
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
    const existing = command.addressId
      ? (this.addresses.find(
          (address) => address.addressId === command.addressId,
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
          addressId: command.addressId?.trim() || `address_${randomUUID()}`,
          tenantId: DEMO_TENANT_ID,
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
        tenantId: DEMO_TENANT_ID,
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

  listTenantUsers() {
    return this.userRoles.map((userRole) => this.cloneUserRole(userRole));
  }

  listTenantRoles() {
    return TENANT_ROLE_CATALOG.map((role) => ({ ...role }));
  }

  createTenantUser(command: CreateTenantUserCommand, requestId?: string) {
    this.assertNonBlank(command.email, "email");
    this.assertNonBlank(command.displayName, "displayName");
    this.assertNonBlank(command.roleCode, "roleCode");
    this.assertSupportedTenantRoleCode(command.roleCode);

    const normalizedEmail = command.email.trim().toLowerCase();
    if (this.userRoles.some((userRole) => userRole.email === normalizedEmail)) {
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
      tenantId: DEMO_TENANT_ID,
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
        tenantId: DEMO_TENANT_ID,
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
    userId: string,
    command: UpdateTenantRoleCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.roleCode, "roleCode");
    this.assertSupportedTenantRoleCode(command.roleCode);

    const userRole = this.requireTenantUser(userId);
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
        tenantId: DEMO_TENANT_ID,
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

  listApiKeys() {
    return this.apiKeys.map((apiKey) => this.toApiKeyResponse(apiKey));
  }

  issueApiKey(
    command: IssueTenantApiKeyCommand,
    requestId?: string,
  ): TenantApiKeyIssued {
    this.assertNonBlank(command.keyName, "keyName");

    const issued = this.buildIssuedApiKey(
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
        tenantId: DEMO_TENANT_ID,
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
    apiKeyId: string,
    command: RotateTenantApiKeyCommand,
    requestId?: string,
  ): TenantApiKeyIssued {
    const currentApiKey = this.requireApiKey(apiKeyId);
    const rotatedAt = new Date().toISOString();
    currentApiKey.revokedAt = rotatedAt;

    const issued = this.buildIssuedApiKey(
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
        tenantId: DEMO_TENANT_ID,
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

  listWebhookEndpoints() {
    return this.webhookEndpoints.map((endpoint) =>
      this.toWebhookResponse(endpoint),
    );
  }

  deleteWebhookEndpoint(webhookId: string, requestId?: string) {
    const index = this.webhookEndpoints.findIndex(
      (w) => w.webhookId === webhookId,
    );
    if (index === -1) {
      return null;
    }
    const removed = this.webhookEndpoints[index]!;
    this.webhookEndpoints.splice(index, 1);
    this.persistChanges(
      {
        webhookEndpoints: this.webhookEndpoints.map((w) =>
          this.cloneStoredWebhookEndpoint(w),
        ),
      },
      "delete_webhook_endpoint",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: DEMO_TENANT_ID,
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
      tenantId: DEMO_TENANT_ID,
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
        tenantId: DEMO_TENANT_ID,
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
    webhookId: string,
    command: UpdateTenantWebhookEndpointCommand,
    requestId?: string,
  ) {
    const endpoint = this.requireWebhookEndpoint(webhookId);
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
        tenantId: DEMO_TENANT_ID,
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

  sendTestWebhook(command: SendTestWebhookCommand, requestId?: string) {
    const endpoint = this.webhookEndpoints.find(
      (webhook) => webhook.webhookId === command.webhookId,
    );
    if (!endpoint) {
      return null;
    }

    const attemptedAt = new Date().toISOString();
    const rawBody = {
      event: "tenant.webhook.test",
      webhookId: endpoint.webhookId,
      tenantId: endpoint.tenantId,
      secretVersion: endpoint.secretVersion,
    };
    const rawBodyString = JSON.stringify(rawBody);
    const signature = createHmac("sha256", endpoint.secretValue)
      .update(`${attemptedAt}.${rawBodyString}`)
      .digest("hex");
    const nextAttemptAt = this.computeNextAttemptAt(
      attemptedAt,
      endpoint.retryPolicy,
      1,
    );

    const delivery: StoredWebhookDelivery = {
      deliveryId: `wd_${randomUUID()}`,
      webhookId: endpoint.webhookId,
      tenantId: endpoint.tenantId,
      eventType: "tenant.webhook.test",
      attempt: 1,
      status: "queued",
      httpStatus: 202,
      signature,
      createdAt: attemptedAt,
      attemptedAt,
      nextAttemptAt,
      signatureHeader: `v=${endpoint.secretVersion};t=${attemptedAt};sig=${signature}`,
      signatureVersion: endpoint.secretVersion,
      secretVersion: endpoint.secretVersion,
      retryPolicySnapshot: { ...endpoint.retryPolicy },
      rawBody,
    };

    this.webhookDeliveries = [
      this.cloneStoredWebhookDelivery(delivery),
      ...this.webhookDeliveries,
    ];
    endpoint.runtimeMetadata = {
      ...endpoint.runtimeMetadata,
      deliveryCount: endpoint.runtimeMetadata.deliveryCount + 1,
      lastAttemptAt: attemptedAt,
      nextAttemptAt,
      lastSignaturePreview: signature.slice(0, 16),
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
      "send_test_webhook",
    );
    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: DEMO_TENANT_ID,
        moduleName: "tenant-partner",
        actionName: "send_test_webhook",
        resourceType: "webhook_delivery",
        resourceId: delivery.deliveryId,
        newValuesSummary: {
          webhookId: endpoint.webhookId,
          eventType: delivery.eventType,
          attempt: delivery.attempt,
          nextAttemptAt: delivery.nextAttemptAt,
          retryPolicy: delivery.retryPolicySnapshot,
        },
      },
      requestId,
    );

    return {
      deliveryId: delivery.deliveryId,
      httpStatus: delivery.httpStatus,
      attempt: delivery.attempt,
      nextAttemptAt: delivery.nextAttemptAt,
    };
  }

  listWebhookDeliveries() {
    return this.webhookDeliveries.map((delivery) =>
      this.toDeliveryResponse(delivery),
    );
  }

  listWebhookDeliveriesByWebhook(webhookId: string) {
    return this.webhookDeliveries
      .filter((delivery) => delivery.webhookId === webhookId)
      .map((delivery) => this.toDeliveryResponse(delivery));
  }

  rotateWebhookSecret(command: RotateWebhookSecretCommand, requestId?: string) {
    this.assertNonBlank(command.secret, "secret");

    const endpoint = this.webhookEndpoints.find(
      (webhook) => webhook.webhookId === command.webhookId,
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
        tenantId: DEMO_TENANT_ID,
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

  getSlaProfile() {
    return { ...this.slaProfile };
  }

  updateSlaProfile(command: UpdateTenantSlaProfileCommand, requestId?: string) {
    this.slaProfile = {
      tenantId: DEMO_TENANT_ID,
      waitThresholdMin:
        command.waitThresholdMin ?? this.slaProfile.waitThresholdMin,
      arrivalThresholdMin:
        command.arrivalThresholdMin ?? this.slaProfile.arrivalThresholdMin,
      completionThresholdMin:
        command.completionThresholdMin ??
        this.slaProfile.completionThresholdMin,
      updatedAt: new Date().toISOString(),
    };
    this.persistChanges(
      {
        slaProfile: this.cloneSlaProfile(this.slaProfile),
      },
      "update_sla_profile",
    );

    this.recordTenantAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: DEMO_TENANT_ID,
        moduleName: "tenant-partner",
        actionName: "update_sla_profile",
        resourceType: "tenant_sla",
        resourceId: DEMO_TENANT_ID,
        newValuesSummary: {
          waitThresholdMin: this.slaProfile.waitThresholdMin,
          arrivalThresholdMin: this.slaProfile.arrivalThresholdMin,
          completionThresholdMin: this.slaProfile.completionThresholdMin,
        },
      },
      requestId,
    );

    return {
      status: "updated",
    };
  }

  revokeApiKey(apiKeyId: string, requestId?: string) {
    const apiKey = this.requireApiKey(apiKeyId);
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
          tenantId: DEMO_TENANT_ID,
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

  listTenantAudit() {
    return this.auditNotificationService
      .listAuditLogs()
      .filter((auditLog) => auditLog.tenantId === DEMO_TENANT_ID);
  }

  private buildIssuedApiKey(
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
      tenantId: DEMO_TENANT_ID,
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

  private requireTenantUser(userId: string) {
    const userRole = this.userRoles.find(
      (candidate) => candidate.userId === userId,
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

  private requireApiKey(apiKeyId: string) {
    const apiKey = this.apiKeys.find(
      (candidate) => candidate.apiKeyId === apiKeyId,
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

  private requireWebhookEndpoint(webhookId: string) {
    const endpoint = this.webhookEndpoints.find(
      (candidate) => candidate.webhookId === webhookId,
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

  private computeNextAttemptAt(
    attemptedAt: string,
    retryPolicy: WebhookRetryPolicy,
    attempt: number,
  ) {
    const retryDelaySeconds = this.computeRetryDelaySeconds(
      retryPolicy,
      attempt,
    );
    return new Date(
      new Date(attemptedAt).getTime() + retryDelaySeconds * 1000,
    ).toISOString();
  }

  private computeRetryDelaySeconds(
    retryPolicy: WebhookRetryPolicy,
    attempt: number,
  ) {
    const delay =
      retryPolicy.initialBackoffSeconds *
      retryPolicy.backoffMultiplier ** (attempt - 1);
    return Math.min(
      Math.max(1, Math.round(delay)),
      retryPolicy.maxBackoffSeconds,
    );
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
