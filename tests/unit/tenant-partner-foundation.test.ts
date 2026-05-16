import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  type PersistTenantPartnerChanges,
  type StoredTenantApiKeyRecord,
  TenantPartnerRepository,
  type TenantPartnerState,
  type StoredWebhookEndpointRecord,
} from "../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const TENANT_ID = "tenant-demo-001";
const OTHER_TENANT_ID = "tenant-other-001";

function clonePartnerState(state: TenantPartnerState): TenantPartnerState {
  return JSON.parse(JSON.stringify(state)) as TenantPartnerState;
}

function createEmptyPartnerState(): TenantPartnerState {
  return {
    notificationPreferences: [],
    webhookEndpoints: [],
    webhookDeliveries: [],
    slaProfiles: [],
    partnerEntries: [],
    partnerIngressCredentials: [],
    partnerEligibilityVerifications: [],
    approvalRules: [],
    approvalRequests: [],
    approvalDecisions: [],
    passengers: [],
    addresses: [],
    costCenters: [],
    quotaPolicies: [],
    quotaLedger: [],
    quotaMonthlySnapshots: [],
    userRoles: [],
    apiKeys: [],
  };
}

function mergeUniqueByKey<T extends object>(
  items: readonly T[],
  key: keyof T,
  existing: T[],
) {
  const merged = new Map<string, T>();
  for (const item of existing) {
    merged.set(String(item[key]), JSON.parse(JSON.stringify(item)) as T);
  }
  for (const item of items) {
    merged.set(String(item[key]), JSON.parse(JSON.stringify(item)) as T);
  }
  return Array.from(merged.values());
}

function createMemoryTenantPartnerRepository(
  initial?: Partial<TenantPartnerState>,
) {
  const state: TenantPartnerState = {
    ...createEmptyPartnerState(),
    ...initial,
  };

  const repository: Pick<
    TenantPartnerRepository,
    "loadState" | "persistChanges" | "reportPersistenceFailure"
  > = {
    loadState: vi.fn(async () => clonePartnerState(state)),
    persistChanges: vi.fn(async (changes: PersistTenantPartnerChanges) => {
      if (changes.notificationPreferences) {
        state.notificationPreferences = mergeUniqueByKey(
          changes.notificationPreferences,
          "tenantId",
          state.notificationPreferences,
        );
      }
      if (changes.webhookEndpoints) {
        state.webhookEndpoints = mergeUniqueByKey(
          changes.webhookEndpoints,
          "webhookId",
          state.webhookEndpoints,
        );
      }
      if (changes.webhookDeliveries) {
        state.webhookDeliveries = mergeUniqueByKey(
          changes.webhookDeliveries,
          "deliveryId",
          state.webhookDeliveries,
        );
      }
      if (changes.slaProfiles) {
        state.slaProfiles = mergeUniqueByKey(
          changes.slaProfiles,
          "tenantId",
          state.slaProfiles,
        );
      }
      if (changes.partnerEntries) {
        state.partnerEntries = mergeUniqueByKey(
          changes.partnerEntries as readonly PartnerChannelEntryRecord[],
          "entrySlug",
          state.partnerEntries,
        );
      }
      if (changes.partnerEligibilityVerifications) {
        state.partnerEligibilityVerifications = mergeUniqueByKey(
          changes.partnerEligibilityVerifications as readonly PartnerEligibilityVerificationRecord[],
          "eligibilityVerificationId",
          state.partnerEligibilityVerifications,
        );
      }
      if (changes.passengers) {
        state.passengers = mergeUniqueByKey(
          changes.passengers,
          "passengerId",
          state.passengers,
        );
      }
      if (changes.addresses) {
        state.addresses = mergeUniqueByKey(
          changes.addresses,
          "addressId",
          state.addresses,
        );
      }
      if (changes.userRoles) {
        state.userRoles = mergeUniqueByKey(
          changes.userRoles,
          "userId",
          state.userRoles,
        );
      }
      if (changes.apiKeys) {
        state.apiKeys = mergeUniqueByKey(
          changes.apiKeys,
          "apiKeyId",
          state.apiKeys,
        );
      }
    }),
    reportPersistenceFailure: vi.fn(),
  };

  return {
    repository: repository as TenantPartnerRepository,
    snapshot: () => clonePartnerState(state),
  };
}

describe("tenant partner foundation service", () => {
  it("exposes active partner channel entries for bank-specific airport flows", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const entries = tenantPartnerService.listPartnerEntries();
    const alphaEntry = tenantPartnerService.getPartnerEntry(
      "bank-demo-alpha-airport",
    );

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.entrySlug)).toEqual(
      expect.arrayContaining([
        "bank-demo-alpha-airport",
        "bank-demo-beta-airport",
      ]),
    );
    expect(alphaEntry).toMatchObject({
      tenantId: TENANT_ID,
      partnerCode: "bank_demo_alpha",
      businessDispatchSubtype: "credit_card_airport_transfer",
      eligibilityMode: "bank_card_inline",
    });
  });

  it("verifies partner eligibility and stores provenance for eligible partner entries", async () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const verification = await tenantPartnerService.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-alpha-airport",
        cardLast4: "2468",
      },
      "partner-eligibility-request",
    );

    expect(verification).toMatchObject({
      tenantId: TENANT_ID,
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      verificationStatus: "eligible",
      verificationReasonCode: "CARD_PROGRAM_MATCHED",
      benefitReference: "benefit-bank_demo_alpha-2468",
      issuerAuthorizationRef: "issuer-auth-bank_demo_alpha-2468",
    });
    expect(
      tenantPartnerService.getPartnerEligibilityVerification(
        verification.eligibilityVerificationId,
      ),
    ).toMatchObject({
      eligibilityVerificationId: verification.eligibilityVerificationId,
      verificationStatus: "eligible",
    });
    const verifyAudit = tenantPartnerService
      .listTenantAudit(TENANT_ID)
      .find((entry) => entry.actionName === "verify_partner_eligibility");
    expect(verifyAudit).toBeDefined();
  });

  it("marks odd inline-card programs as ineligible and accepts reference-based entries", async () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const rejected = await tenantPartnerService.verifyPartnerEligibility({
      entrySlug: "bank-demo-alpha-airport",
      cardLast4: "1357",
    });
    const acceptedByReference =
      await tenantPartnerService.verifyPartnerEligibility({
        entrySlug: "bank-demo-beta-airport",
        referenceToken: "BETA0001",
      });

    expect(rejected).toMatchObject({
      verificationStatus: "ineligible",
      verificationReasonCode: "CARD_PROGRAM_NOT_ELIGIBLE",
      benefitReference: null,
      issuerAuthorizationRef: null,
    });
    expect(acceptedByReference).toMatchObject({
      verificationStatus: "eligible",
      verificationReasonCode: "REFERENCE_ACCEPTED",
      benefitReference: "BETA0001",
      issuerAuthorizationRef: "issuer-ref-BETA0001",
    });
    expect(acceptedByReference.referenceTokenHash).toMatch(/^sha256:/);
  });

  it("issues partner ingress identity only for the matching api key", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const session = tenantPartnerService.authenticatePartnerBootstrap(
      {
        entrySlug: "bank-demo-alpha-airport",
        apiKey: "pk_demo_alpha_airport_20260428",
      },
      "partner-bootstrap-request",
    );

    expect(session.identity).toMatchObject({
      actorType: "partner_api_key",
      actorId: "partner-key-alpha-demo",
      realm: "partner",
      tenantId: TENANT_ID,
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
    });
    expect(auditService.listAuditLogs()[0]).toMatchObject({
      actionName: "partner_ingress_authenticated",
      tenantId: TENANT_ID,
    });
  });

  it("rejects partner ingress when the api key is invalid", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    expect(() =>
      tenantPartnerService.authenticatePartnerBootstrap(
        {
          entrySlug: "bank-demo-alpha-airport",
          apiKey: "wrong-demo-key",
        },
        "partner-bootstrap-invalid-request",
      ),
    ).toThrowError(ApiRequestError);
    expect(auditService.listAuditLogs()[0]).toMatchObject({
      actionName: "partner_ingress_rejected",
      tenantId: TENANT_ID,
    });
  });

  it("rejects eligibility verification when partner identity targets another entry", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);
    const alphaIdentity = tenantPartnerService.authenticatePartnerBootstrap({
      entrySlug: "bank-demo-alpha-airport",
      apiKey: "pk_demo_alpha_airport_20260428",
    }).identity;

    expect(() =>
      tenantPartnerService.verifyPartnerEligibility(
        {
          entrySlug: "bank-demo-beta-airport",
          referenceToken: "BETA0001",
        },
        "cross-partner-verify-request",
        alphaIdentity,
      ),
    ).toThrowError(ApiRequestError);
  });

  it("persists partner entries across repository reloads", async () => {
    const store = createMemoryTenantPartnerRepository();
    const firstService = new TenantPartnerService(
      new AuditNotificationService(),
      store.repository,
    );

    await firstService.onModuleInit();
    await Promise.resolve();

    const reloadedService = new TenantPartnerService(
      new AuditNotificationService(),
      store.repository,
    );
    await reloadedService.onModuleInit();

    expect(store.snapshot().partnerEntries).toHaveLength(2);
    expect(reloadedService.listPartnerEntries()).toEqual(
      firstService.listPartnerEntries(),
    );
  });

  it("persists eligibility verifications across repository reloads", async () => {
    const store = createMemoryTenantPartnerRepository();
    const firstService = new TenantPartnerService(
      new AuditNotificationService(),
      store.repository,
    );

    await firstService.onModuleInit();
    const verification = await firstService.verifyPartnerEligibility(
      {
        entrySlug: "bank-demo-alpha-airport",
        cardLast4: "2468",
      },
      "persisted-verification-request",
    );
    await Promise.resolve();

    const reloadedService = new TenantPartnerService(
      new AuditNotificationService(),
      store.repository,
    );
    await reloadedService.onModuleInit();

    expect(store.snapshot().partnerEligibilityVerifications).toHaveLength(1);
    expect(
      reloadedService.getPartnerEligibilityVerification(
        verification.eligibilityVerificationId,
      ),
    ).toMatchObject({
      eligibilityVerificationId: verification.eligibilityVerificationId,
      verificationStatus: "eligible",
      requestMetadata: {
        cardLast4: "2468",
        requestId: "persisted-verification-request",
      },
    });
  });

  it("updates tenant notification preferences and writes tenant audit", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const result = tenantPartnerService.updateNotificationPreferences(
      TENANT_ID,
      {
        subscriptions: [
          {
            eventType: "tenant.sla.threshold_breached",
            channel: "webhook",
            enabled: true,
          },
        ],
      },
      "tenant-notification-request",
    );

    expect(result.status).toBe("updated");
    expect(
      tenantPartnerService.getNotificationPreferences(TENANT_ID).subscriptions,
    ).toHaveLength(1);
    expect(tenantPartnerService.listTenantAudit(TENANT_ID)[0]?.actionName).toBe(
      "update_notification_subscription",
    );
  });

  it("creates a webhook endpoint and dispatches a test delivery", async () => {
    const auditService = new AuditNotificationService();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 204,
    }));
    const tenantPartnerService = new TenantPartnerService(
      auditService,
      undefined,
      new WebhookDispatchService(fetchMock),
    );

    const webhook = tenantPartnerService.createWebhookEndpoint(
      TENANT_ID,
      {
        url: "https://tenant.example.com/webhooks/drts",
        secret: "local-test-secret",
        events: ["tenant.sla.threshold_breached"],
      },
      "webhook-create-request",
    );

    const delivery = await tenantPartnerService.sendTestWebhook(
      TENANT_ID,
      {
        webhookId: webhook.webhookId,
      },
      "webhook-test-request",
    );
    const dispatchedDelivery =
      tenantPartnerService.listWebhookDeliveries(TENANT_ID)[0];
    const firstRequestInit = (
      fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined
    )?.[1];

    expect(webhook.status).toBe("active");
    expect(delivery?.httpStatus).toBe(204);
    expect(delivery?.nextAttemptAt).toBeNull();
    expect(tenantPartnerService.listWebhookDeliveries(TENANT_ID)).toHaveLength(
      1,
    );
    expect(dispatchedDelivery?.status).toBe("delivered");
    expect(dispatchedDelivery?.attempt).toBe(1);
    expect(
      tenantPartnerService.listWebhookEndpoints(TENANT_ID)[0]?.runtimeMetadata
        .retryPolicy.maxAttempts,
    ).toBe(5);
    expect(
      tenantPartnerService.listWebhookEndpoints(TENANT_ID)[0]?.runtimeMetadata
        .secretRotation.currentVersion,
    ).toBe(1);
    expect(
      firstRequestInit?.headers &&
        "x-drts-webhook-signature" in firstRequestInit.headers,
    ).toBe(true);
    expect(String(firstRequestInit?.body)).toContain('"delivery_id"');
    expect(String(firstRequestInit?.body)).not.toContain('"deliveryId"');
    expect(tenantPartnerService.listTenantAudit(TENANT_ID)[0]?.actionName).toBe(
      "send_test_webhook",
    );
  });

  it("retries a failed webhook delivery with exponential backoff scheduling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));

    try {
      const auditService = new AuditNotificationService();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
        });
      const tenantPartnerService = new TenantPartnerService(
        auditService,
        undefined,
        new WebhookDispatchService(fetchMock),
      );

      const webhook = tenantPartnerService.createWebhookEndpoint(
        TENANT_ID,
        {
          url: "https://tenant.example.com/webhooks/retry",
          secret: "retry-secret",
          events: ["tenant.sla.threshold_breached"],
        },
        "webhook-create-request",
      );

      const firstAttempt = await tenantPartnerService.sendTestWebhook(
        TENANT_ID,
        {
          webhookId: webhook.webhookId,
        },
        "webhook-test-request",
      );

      expect(firstAttempt).toEqual(
        expect.objectContaining({
          attempt: 1,
          httpStatus: 503,
          nextAttemptAt: "2026-04-17T12:00:30.000Z",
        }),
      );
      expect(
        tenantPartnerService.listWebhookDeliveries(TENANT_ID)[0]?.status,
      ).toBe("queued");

      await vi.advanceTimersByTimeAsync(30_000);

      const delivery = tenantPartnerService.listWebhookDeliveries(TENANT_ID)[0];
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(delivery?.status).toBe("delivered");
      expect(delivery?.attempt).toBe(2);
      expect(delivery?.httpStatus).toBe(204);
      expect(delivery?.nextAttemptAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes subscribed order events only for the matching tenant", async () => {
    const auditService = new AuditNotificationService();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 204,
    }));
    const tenantPartnerService = new TenantPartnerService(
      auditService,
      undefined,
      new WebhookDispatchService(fetchMock),
    );

    tenantPartnerService.createWebhookEndpoint(TENANT_ID, {
      url: "https://tenant.example.com/webhooks/completed",
      secret: "tenant-secret",
      events: ["order.completed"],
    });
    tenantPartnerService.createWebhookEndpoint(OTHER_TENANT_ID, {
      url: "https://other.example.com/webhooks/orders",
      secret: "other-secret",
      events: ["order.created"],
    });

    const createdResults = await tenantPartnerService.publishWebhookEvent(
      TENANT_ID,
      {
        eventType: "order.created",
        occurredAt: "2026-04-17T12:30:00.000Z",
        data: {
          orderId: "order-001",
          orderNo: "O-001",
          orderStatus: "created",
        },
      },
    );
    const completedResults = await tenantPartnerService.publishWebhookEvent(
      TENANT_ID,
      {
        eventType: "order.completed",
        occurredAt: "2026-04-17T12:45:00.000Z",
        data: {
          orderId: "order-001",
          orderNo: "O-001",
          orderStatus: "completed",
        },
      },
    );

    expect(createdResults).toEqual([]);
    expect(completedResults).toHaveLength(1);
    expect(tenantPartnerService.listWebhookDeliveries(TENANT_ID)).toHaveLength(
      1,
    );
    expect(
      tenantPartnerService.listWebhookDeliveries(TENANT_ID)[0]?.eventType,
    ).toBe("order.completed");
    expect(tenantPartnerService.listWebhookDeliveries(OTHER_TENANT_ID)).toEqual(
      [],
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstRequestInit = (
      fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined
    )?.[1];
    expect(String(firstRequestInit?.body)).toContain('"order_id"');
    expect(String(firstRequestInit?.body)).toContain("order.completed");
  });

  it("rotates webhook secrets and records rotation history", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const webhook = tenantPartnerService.createWebhookEndpoint(
      TENANT_ID,
      {
        url: "https://tenant.example.com/webhooks/drts",
        secret: "local-test-secret",
        events: ["tenant.sla.threshold_breached"],
      },
      "webhook-create-request",
    );

    const rotated = tenantPartnerService.rotateWebhookSecret(
      TENANT_ID,
      {
        webhookId: webhook.webhookId,
        secret: "rotated-test-secret",
        rotationReason: "quarterly-rotation",
      },
      "webhook-rotate-request",
    );

    const endpoint = tenantPartnerService.listWebhookEndpoints(TENANT_ID)[0];

    expect(rotated?.secretVersion).toBe(2);
    expect(rotated?.rotationCount).toBe(2);
    expect(endpoint?.secretVersion).toBe(2);
    expect(endpoint?.runtimeMetadata.secretRotation.rotationCount).toBe(2);
    expect(
      endpoint?.runtimeMetadata.secretRotation.history[1]?.rotationReason,
    ).toBe("quarterly-rotation");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "rotate_webhook_secret",
    );
  });

  it("updates webhook metadata through a first-class tenant command path", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const webhook = tenantPartnerService.createWebhookEndpoint(
      TENANT_ID,
      {
        url: "https://tenant.example.com/webhooks/drts",
        secret: "local-test-secret",
        events: ["tenant.sla.threshold_breached"],
      },
      "webhook-create-request",
    );

    const updated = tenantPartnerService.updateWebhookEndpoint(
      TENANT_ID,
      webhook.webhookId,
      {
        url: "https://tenant.example.com/webhooks/drts-v2",
        events: [
          "tenant.sla.threshold_breached",
          "tenant.billing_profile.updated",
        ],
        status: "test_pending",
      },
      "webhook-update-request",
    );

    expect(updated.url).toBe("https://tenant.example.com/webhooks/drts-v2");
    expect(updated.events).toEqual([
      "tenant.sla.threshold_breached",
      "tenant.billing_profile.updated",
    ]);
    expect(updated.status).toBe("test_pending");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "update_webhook_endpoint",
    );
  });

  it("manages passengers, addresses, tenant roles, and API keys as tenant source-of-truth records", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const passenger = tenantPartnerService.upsertPassenger(
      TENANT_ID,
      {
        fullName: "測試乘客",
        employeeNo: "E2001",
        departmentName: "客服部",
        mobile: "0912-000-001",
        email: "passenger@example.com",
      },
      "passenger-upsert-request",
    );
    const address = tenantPartnerService.upsertAddress(
      TENANT_ID,
      {
        ownerPassengerId: passenger.passengerId,
        addressName: "客戶總部",
        addressText: "台北市信義區松高路 1 號",
        tags: ["office", "vip"],
      },
      "address-upsert-request",
    );
    const tenantUser = tenantPartnerService.createTenantUser(
      TENANT_ID,
      {
        email: "ops-admin@example.com",
        displayName: "Ops Admin",
        roleCode: "tenant_ops_admin",
      },
      "tenant-user-create-request",
    );
    const updatedUser = tenantPartnerService.updateTenantUserRole(
      TENANT_ID,
      tenantUser.userId,
      {
        roleCode: "tenant_finance_admin",
        status: "active",
      },
      "tenant-user-update-request",
    );
    const issuedApiKey = tenantPartnerService.issueApiKey(
      TENANT_ID,
      {
        keyName: "Tenant Automation Key",
        scopes: ["tenant:read", "tenant:write"],
      },
      "tenant-api-key-issue-request",
    );
    const rotatedApiKey = tenantPartnerService.rotateApiKey(
      TENANT_ID,
      issuedApiKey.apiKey.apiKeyId,
      {
        scopes: ["tenant:read"],
      },
      "tenant-api-key-rotate-request",
    );

    expect(passenger.fullName).toBe("測試乘客");
    expect(address.ownerPassengerId).toBe(passenger.passengerId);
    expect(updatedUser.roleCode).toBe("tenant_finance_admin");
    expect(updatedUser.status).toBe("active");
    expect(issuedApiKey.plaintextKey).toMatch(/^tk_/);
    expect(
      tenantPartnerService
        .listApiKeys(TENANT_ID)
        .find((apiKey) => apiKey.apiKeyId === issuedApiKey.apiKey.apiKeyId)
        ?.maskedSuffix,
    ).toMatch(/^\*\*\*\*/);
    expect(rotatedApiKey.revokedApiKeyId).toBe(issuedApiKey.apiKey.apiKeyId);
    expect(rotatedApiKey.plaintextKey).toMatch(/^tk_/);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe("rotate_api_key");
  });

  it("isolates tenant-partner state by tenant id", async () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(
      auditService,
      undefined,
      new WebhookDispatchService(
        vi.fn(async () => ({
          ok: true,
          status: 204,
        })),
      ),
    );

    tenantPartnerService.updateNotificationPreferences(OTHER_TENANT_ID, {
      subscriptions: [
        {
          eventType: "tenant.billing_profile.updated",
          channel: "email",
          enabled: true,
        },
      ],
    });
    const otherPassenger = tenantPartnerService.upsertPassenger(
      OTHER_TENANT_ID,
      {
        fullName: "Other Tenant Passenger",
      },
    );
    const otherWebhook = tenantPartnerService.createWebhookEndpoint(
      OTHER_TENANT_ID,
      {
        url: "https://other.example.com/webhooks/drts",
        secret: "other-secret",
        events: ["tenant.sla.threshold_breached"],
      },
    );

    await tenantPartnerService.sendTestWebhook(OTHER_TENANT_ID, {
      webhookId: otherWebhook.webhookId,
    });

    expect(
      tenantPartnerService.getNotificationPreferences(TENANT_ID).subscriptions,
    ).toEqual([
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
    ]);
    expect(tenantPartnerService.listPassengers(TENANT_ID)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: TENANT_ID }),
      ]),
    );
    expect(tenantPartnerService.listPassengers(OTHER_TENANT_ID)).toEqual([
      expect.objectContaining({
        passengerId: otherPassenger.passengerId,
        tenantId: OTHER_TENANT_ID,
      }),
    ]);
    expect(tenantPartnerService.listWebhookEndpoints(TENANT_ID)).toEqual([]);
    expect(tenantPartnerService.listWebhookDeliveries(TENANT_ID)).toEqual([]);
    expect(tenantPartnerService.listWebhookEndpoints(OTHER_TENANT_ID)).toEqual([
      expect.objectContaining({
        webhookId: otherWebhook.webhookId,
        tenantId: OTHER_TENANT_ID,
      }),
    ]);
    expect(
      tenantPartnerService.listWebhookDeliveries(OTHER_TENANT_ID),
    ).toHaveLength(1);
  });

  it("rejects partner verification lookup across tenant scope", async () => {
    const otherTenantEntry: PartnerChannelEntryRecord = {
      partnerId: "partner-bank-other-001",
      partnerCode: "bank_demo_other",
      partnerType: "bank_partner",
      programId: "program-other-tenant",
      programCode: "OTHER_TENANT",
      tenantId: OTHER_TENANT_ID,
      bankCode: "BANK_OTHER",
      entrySlug: "bank-demo-other-airport",
      displayName: "Other Tenant Airport Transfer",
      businessDispatchSubtype: "credit_card_airport_transfer",
      authMode: "partner_api_key",
      eligibilityMode: "reference_required",
      entryHost: null,
      entryPath: "/partner/bank-demo-other-airport",
      themeAccent: "#1c7ed6",
      brandingMetadata: {
        displayName: "Other Tenant Airport Transfer",
        themeAccent: "#1c7ed6",
        supportEmail: "other@bank-demo.example",
        supportPhone: "0800-000-333",
      },
      eligibilityContract: null,
      status: "active",
      activeFlag: true,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z",
      auditMetadata: {
        source: "test",
        requestId: null,
        createdBy: "test",
        updatedBy: "test",
      },
    };
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(
      auditService,
      undefined,
      new WebhookDispatchService(),
      [
        {
          entrySlug: "bank-demo-alpha-airport",
          keyId: "partner-key-alpha-demo",
          apiKeyHash: createHash("sha256")
            .update("pk_demo_alpha_airport_20260428")
            .digest("hex"),
        },
        {
          entrySlug: "bank-demo-beta-airport",
          keyId: "partner-key-beta-demo",
          apiKeyHash: createHash("sha256")
            .update("pk_demo_beta_airport_20260428")
            .digest("hex"),
        },
        {
          entrySlug: "bank-demo-other-airport",
          keyId: "partner-key-other-demo",
          apiKeyHash: createHash("sha256")
            .update("pk_demo_other_airport_20260428")
            .digest("hex"),
        },
      ],
    );
    (
      tenantPartnerService as unknown as {
        partnerEntries: PartnerChannelEntryRecord[];
      }
    ).partnerEntries.push(otherTenantEntry);

    const alphaIdentity = tenantPartnerService.authenticatePartnerBootstrap({
      entrySlug: "bank-demo-alpha-airport",
      apiKey: "pk_demo_alpha_airport_20260428",
    }).identity;
    const otherVerification =
      await tenantPartnerService.verifyPartnerEligibility(
        {
          entrySlug: "bank-demo-other-airport",
          referenceToken: "OTHER0001",
        },
        "other-tenant-verify-request",
      );

    expect(() =>
      tenantPartnerService.getPartnerEligibilityVerification(
        otherVerification.eligibilityVerificationId,
        undefined,
        alphaIdentity,
      ),
    ).toThrowError(ApiRequestError);
  });

  it("rejects partner bootstrap for inactive entries", async () => {
    const inactiveEntry: PartnerChannelEntryRecord = {
      partnerId: "partner-bank-inactive-001",
      partnerCode: "bank_demo_inactive",
      partnerType: "bank_partner",
      programId: "program-inactive",
      programCode: "INACTIVE",
      tenantId: TENANT_ID,
      bankCode: "BANK_INACTIVE",
      entrySlug: "bank-demo-inactive-airport",
      displayName: "Inactive Airport Transfer",
      businessDispatchSubtype: "credit_card_airport_transfer",
      authMode: "partner_api_key",
      eligibilityMode: "none",
      entryHost: null,
      entryPath: "/partner/bank-demo-inactive-airport",
      themeAccent: "#868e96",
      brandingMetadata: null,
      eligibilityContract: null,
      status: "inactive",
      activeFlag: false,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z",
      auditMetadata: {
        source: "test",
        requestId: null,
        createdBy: "test",
        updatedBy: "test",
      },
    };
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
      undefined,
      new WebhookDispatchService(),
      [
        {
          entrySlug: "bank-demo-inactive-airport",
          keyId: "partner-key-inactive-demo",
          apiKeyHash: createHash("sha256")
            .update("pk_demo_inactive_airport_20260428")
            .digest("hex"),
        },
      ],
    );
    (
      tenantPartnerService as unknown as {
        partnerEntries: PartnerChannelEntryRecord[];
      }
    ).partnerEntries.push(inactiveEntry);

    expect(() =>
      tenantPartnerService.authenticatePartnerBootstrap({
        entrySlug: "bank-demo-inactive-airport",
        apiKey: "pk_demo_inactive_airport_20260428",
      }),
    ).toThrowError(ApiRequestError);
  });

  it("rejects cross-tenant passenger and address upserts when ids belong to another tenant", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const otherPassenger = tenantPartnerService.upsertPassenger(
      OTHER_TENANT_ID,
      {
        fullName: "Other Tenant Passenger",
      },
    );
    const otherAddress = tenantPartnerService.upsertAddress(OTHER_TENANT_ID, {
      ownerPassengerId: otherPassenger.passengerId,
      addressName: "Other Tenant HQ",
      addressText: "台中市西屯區台灣大道 99 號",
    });

    let passengerError: unknown;
    try {
      tenantPartnerService.upsertPassenger(TENANT_ID, {
        passengerId: otherPassenger.passengerId,
        fullName: "Hijacked Passenger",
      });
    } catch (error) {
      passengerError = error;
    }

    let addressError: unknown;
    try {
      tenantPartnerService.upsertAddress(TENANT_ID, {
        addressId: otherAddress.addressId,
        addressName: "Hijacked Address",
        addressText: "台北市信義區松仁路 100 號",
      });
    } catch (error) {
      addressError = error;
    }

    expect(
      (
        passengerError as { getResponse?: () => { error?: { code?: string } } }
      ).getResponse?.().error?.code,
    ).toBe("PASSENGER_NOT_FOUND");
    expect(
      (
        addressError as { getResponse?: () => { error?: { code?: string } } }
      ).getResponse?.().error?.code,
    ).toBe("ADDRESS_NOT_FOUND");
    expect(
      tenantPartnerService
        .listPassengers(TENANT_ID)
        .find(
          (passenger) => passenger.passengerId === otherPassenger.passengerId,
        ),
    ).toBeUndefined();
    expect(
      tenantPartnerService
        .listAddresses(TENANT_ID)
        .find((address) => address.addressId === otherAddress.addressId),
    ).toBeUndefined();
    expect(
      tenantPartnerService
        .listPassengers(OTHER_TENANT_ID)
        .find(
          (passenger) => passenger.passengerId === otherPassenger.passengerId,
        )?.fullName,
    ).toBe("Other Tenant Passenger");
    expect(
      tenantPartnerService
        .listAddresses(OTHER_TENANT_ID)
        .find((address) => address.addressId === otherAddress.addressId)
        ?.addressName,
    ).toBe("Other Tenant HQ");
  });

  it("publishes a tenant role catalog and rejects unsupported role assignments", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    expect(
      tenantPartnerService.listTenantRoles().map((role) => role.roleCode),
    ).toEqual([
      "tenant_admin",
      "tenant_ops_admin",
      "tenant_finance_admin",
      "tenant_viewer",
    ]);

    let thrown: unknown;
    try {
      tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "unsupported@example.com",
        displayName: "Unsupported Role User",
        roleCode: "admin",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(
      (
        thrown as { getResponse?: () => { error?: { code?: string } } }
      ).getResponse?.().error?.code,
    ).toBe("UNSUPPORTED_TENANT_ROLE");
  });

  it("rehydrates persisted tenant settings and writes webhook delivery changes through the repository", async () => {
    const auditService = new AuditNotificationService();
    const persistChanges = vi.fn(async () => undefined);
    const persistedEndpoint: StoredWebhookEndpointRecord = {
      webhookId: "wh_persisted_001",
      tenantId: "tenant-demo-001",
      url: "https://tenant.example.com/webhooks/drts",
      events: ["tenant.sla.threshold_breached"],
      status: "active",
      secretVersion: 1,
      secretPreview: "sha256:deadbeefcafe",
      secretValue: "persisted-secret",
      retryPolicy: {
        maxAttempts: 5,
        initialBackoffSeconds: 30,
        backoffMultiplier: 2,
        maxBackoffSeconds: 900,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      },
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
        retryPolicy: {
          maxAttempts: 5,
          initialBackoffSeconds: 30,
          backoffMultiplier: 2,
          maxBackoffSeconds: 900,
          retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        },
        secretRotation: {
          currentVersion: 1,
          rotatedAt: "2026-04-10T00:00:00Z",
          rotationCount: 1,
          history: [
            {
              secretVersion: 1,
              rotatedAt: "2026-04-10T00:00:00Z",
              rotationReason: "initial_secret",
              secretPreview: "sha256:deadbeefcafe",
            },
          ],
        },
      },
      secretHistory: [
        {
          secretVersion: 1,
          rotatedAt: "2026-04-10T00:00:00Z",
          rotationReason: "initial_secret",
          secretPreview: "sha256:deadbeefcafe",
        },
      ],
      createdAt: "2026-04-10T00:00:00Z",
      updatedAt: "2026-04-10T00:00:00Z",
    };
    const persistedApiKey: StoredTenantApiKeyRecord = {
      apiKeyId: "tenant-api-key-persisted-001",
      tenantId: "tenant-demo-001",
      keyName: "Persisted Tenant Key",
      keyPrefix: "persisted_ke",
      maskedSuffix: "****9876",
      scopes: ["tenant:read"],
      lastUsedAt: null,
      expiresAt: "2027-04-10T00:00:00Z",
      revokedAt: null,
      createdAt: "2026-04-10T00:00:00Z",
      keyHash: "sha256:persisted-key",
    };
    const repository = {
      loadState: vi.fn(async () => ({
        notificationPreferences: [
          {
            tenantId: "tenant-demo-001",
            subscriptions: [
              {
                eventType: "tenant.sla.threshold_breached",
                channel: "webhook",
                enabled: true,
              },
            ],
            updatedAt: "2026-04-10T00:00:00Z",
          },
        ],
        webhookEndpoints: [persistedEndpoint],
        webhookDeliveries: [],
        slaProfiles: [
          {
            tenantId: "tenant-demo-001",
            waitThresholdMin: 12,
            arrivalThresholdMin: 18,
            completionThresholdMin: 95,
            updatedAt: "2026-04-10T00:00:00Z",
          },
        ],
        passengers: [
          {
            passengerId: "passenger-persisted-001",
            tenantId: "tenant-demo-001",
            fullName: "Persisted Passenger",
            employeeNo: "E3001",
            departmentName: "Admin",
            mobile: "0911-300-001",
            email: "persisted.passenger@example.com",
            activeFlag: true,
            metadata: {},
            createdAt: "2026-04-10T00:00:00Z",
            updatedAt: "2026-04-10T00:00:00Z",
          },
        ],
        addresses: [
          {
            addressId: "address-persisted-001",
            tenantId: "tenant-demo-001",
            ownerPassengerId: "passenger-persisted-001",
            addressName: "Persisted HQ",
            addressText: "台北市中山區 1 號",
            lat: null,
            lng: null,
            tags: ["office"],
            activeFlag: true,
            createdAt: "2026-04-10T00:00:00Z",
            updatedAt: "2026-04-10T00:00:00Z",
          },
        ],
        userRoles: [
          {
            userId: "tenant-user-persisted-001",
            tenantId: "tenant-demo-001",
            email: "persisted.admin@example.com",
            displayName: "Persisted Admin",
            roleCode: "tenant_admin",
            status: "active",
            invitedAt: "2026-04-10T00:00:00Z",
            updatedAt: "2026-04-10T00:00:00Z",
          },
        ],
        apiKeys: [persistedApiKey],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as TenantPartnerRepository;

    const tenantPartnerService = new TenantPartnerService(
      auditService,
      repository,
      new WebhookDispatchService(
        vi.fn(async () => ({
          ok: true,
          status: 204,
        })),
      ),
    );

    await tenantPartnerService.onModuleInit();

    expect(tenantPartnerService.getSlaProfile(TENANT_ID).waitThresholdMin).toBe(
      12,
    );
    expect(tenantPartnerService.listPassengers(TENANT_ID)[0]?.passengerId).toBe(
      "passenger-persisted-001",
    );
    expect(tenantPartnerService.listApiKeys(TENANT_ID)[0]?.apiKeyId).toBe(
      "tenant-api-key-persisted-001",
    );
    expect(
      tenantPartnerService.listWebhookEndpoints(TENANT_ID)[0]?.webhookId,
    ).toBe("wh_persisted_001");

    tenantPartnerService.updateSlaProfile(TENANT_ID, {
      waitThresholdMin: 20,
    });
    tenantPartnerService.upsertPassenger(TENANT_ID, {
      passengerId: "passenger-persisted-001",
      fullName: "Persisted Passenger Updated",
    });
    tenantPartnerService.updateTenantUserRole(
      TENANT_ID,
      "tenant-user-persisted-001",
      {
        roleCode: "tenant_finance_admin",
        status: "active",
      },
    );
    tenantPartnerService.rotateApiKey(
      TENANT_ID,
      "tenant-api-key-persisted-001",
      {
        keyName: "Persisted Tenant Key v2",
        scopes: ["tenant:read", "tenant:write"],
      },
    );
    await tenantPartnerService.sendTestWebhook(TENANT_ID, {
      webhookId: "wh_persisted_001",
    });

    await Promise.resolve();

    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        slaProfiles: [
          expect.objectContaining({
            waitThresholdMin: 20,
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookDeliveries: [
          expect.objectContaining({
            webhookId: "wh_persisted_001",
            eventType: "tenant.webhook.test",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        passengers: [
          expect.objectContaining({
            passengerId: "passenger-persisted-001",
            fullName: "Persisted Passenger Updated",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        userRoles: [
          expect.objectContaining({
            userId: "tenant-user-persisted-001",
            roleCode: "tenant_finance_admin",
          }),
        ],
      }),
    );
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeys: expect.arrayContaining([
          expect.objectContaining({
            apiKeyId: "tenant-api-key-persisted-001",
            revokedAt: expect.any(String),
          }),
          expect.objectContaining({
            keyName: "Persisted Tenant Key v2",
          }),
        ]),
      }),
    );
  });
});
