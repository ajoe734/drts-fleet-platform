import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  type StoredTenantApiKeyRecord,
  TenantPartnerRepository,
  type StoredWebhookEndpointRecord,
} from "../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

describe("tenant partner foundation service", () => {
  it("updates tenant notification preferences and writes tenant audit", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const result = tenantPartnerService.updateNotificationPreferences(
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
      tenantPartnerService.getNotificationPreferences().subscriptions,
    ).toHaveLength(1);
    expect(tenantPartnerService.listTenantAudit()[0]?.actionName).toBe(
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
      {
        url: "https://tenant.example.com/webhooks/drts",
        secret: "local-test-secret",
        events: ["tenant.sla.threshold_breached"],
      },
      "webhook-create-request",
    );

    const delivery = await tenantPartnerService.sendTestWebhook(
      {
        webhookId: webhook.webhookId,
      },
      "webhook-test-request",
    );
    const dispatchedDelivery = tenantPartnerService.listWebhookDeliveries()[0];
    const firstRequestInit = fetchMock.mock.calls[0]?.[1];

    expect(webhook.status).toBe("active");
    expect(delivery?.httpStatus).toBe(204);
    expect(delivery?.nextAttemptAt).toBeNull();
    expect(tenantPartnerService.listWebhookDeliveries()).toHaveLength(1);
    expect(dispatchedDelivery?.status).toBe("delivered");
    expect(dispatchedDelivery?.attempt).toBe(1);
    expect(
      tenantPartnerService.listWebhookEndpoints()[0]?.runtimeMetadata
        .retryPolicy.maxAttempts,
    ).toBe(5);
    expect(
      tenantPartnerService.listWebhookEndpoints()[0]?.runtimeMetadata
        .secretRotation.currentVersion,
    ).toBe(1);
    expect(
      firstRequestInit?.headers &&
        "x-drts-webhook-signature" in firstRequestInit.headers,
    ).toBe(true);
    expect(firstRequestInit?.body).toContain('"delivery_id"');
    expect(firstRequestInit?.body).not.toContain('"deliveryId"');
    expect(tenantPartnerService.listTenantAudit()[0]?.actionName).toBe(
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
        {
          url: "https://tenant.example.com/webhooks/retry",
          secret: "retry-secret",
          events: ["tenant.sla.threshold_breached"],
        },
        "webhook-create-request",
      );

      const firstAttempt = await tenantPartnerService.sendTestWebhook(
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
      expect(tenantPartnerService.listWebhookDeliveries()[0]?.status).toBe(
        "queued",
      );

      await vi.advanceTimersByTimeAsync(30_000);

      const delivery = tenantPartnerService.listWebhookDeliveries()[0];
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(delivery?.status).toBe("delivered");
      expect(delivery?.attempt).toBe(2);
      expect(delivery?.httpStatus).toBe(204);
      expect(delivery?.nextAttemptAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rotates webhook secrets and records rotation history", () => {
    const auditService = new AuditNotificationService();
    const tenantPartnerService = new TenantPartnerService(auditService);

    const webhook = tenantPartnerService.createWebhookEndpoint(
      {
        url: "https://tenant.example.com/webhooks/drts",
        secret: "local-test-secret",
        events: ["tenant.sla.threshold_breached"],
      },
      "webhook-create-request",
    );

    const rotated = tenantPartnerService.rotateWebhookSecret(
      {
        webhookId: webhook.webhookId,
        secret: "rotated-test-secret",
        rotationReason: "quarterly-rotation",
      },
      "webhook-rotate-request",
    );

    const endpoint = tenantPartnerService.listWebhookEndpoints()[0];

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
      {
        url: "https://tenant.example.com/webhooks/drts",
        secret: "local-test-secret",
        events: ["tenant.sla.threshold_breached"],
      },
      "webhook-create-request",
    );

    const updated = tenantPartnerService.updateWebhookEndpoint(
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
      {
        ownerPassengerId: passenger.passengerId,
        addressName: "客戶總部",
        addressText: "台北市信義區松高路 1 號",
        tags: ["office", "vip"],
      },
      "address-upsert-request",
    );
    const tenantUser = tenantPartnerService.createTenantUser(
      {
        email: "ops-admin@example.com",
        displayName: "Ops Admin",
        roleCode: "tenant_ops_admin",
      },
      "tenant-user-create-request",
    );
    const updatedUser = tenantPartnerService.updateTenantUserRole(
      tenantUser.userId,
      {
        roleCode: "tenant_finance_admin",
        status: "active",
      },
      "tenant-user-update-request",
    );
    const issuedApiKey = tenantPartnerService.issueApiKey(
      {
        keyName: "Tenant Automation Key",
        scopes: ["tenant:read", "tenant:write"],
      },
      "tenant-api-key-issue-request",
    );
    const rotatedApiKey = tenantPartnerService.rotateApiKey(
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
        .listApiKeys()
        .find((apiKey) => apiKey.apiKeyId === issuedApiKey.apiKey.apiKeyId)
        ?.maskedSuffix,
    ).toMatch(/^\*\*\*\*/);
    expect(rotatedApiKey.revokedApiKeyId).toBe(issuedApiKey.apiKey.apiKeyId);
    expect(rotatedApiKey.plaintextKey).toMatch(/^tk_/);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe("rotate_api_key");
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
      tenantPartnerService.createTenantUser({
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
        nextAttemptAt: null,
        lastSignaturePreview: null,
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
        notificationPreferences: {
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
        webhookEndpoints: [persistedEndpoint],
        webhookDeliveries: [],
        slaProfile: {
          tenantId: "tenant-demo-001",
          waitThresholdMin: 12,
          arrivalThresholdMin: 18,
          completionThresholdMin: 95,
          updatedAt: "2026-04-10T00:00:00Z",
        },
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

    expect(tenantPartnerService.getSlaProfile().waitThresholdMin).toBe(12);
    expect(tenantPartnerService.listPassengers()[0]?.passengerId).toBe(
      "passenger-persisted-001",
    );
    expect(tenantPartnerService.listApiKeys()[0]?.apiKeyId).toBe(
      "tenant-api-key-persisted-001",
    );
    expect(tenantPartnerService.listWebhookEndpoints()[0]?.webhookId).toBe(
      "wh_persisted_001",
    );

    tenantPartnerService.updateSlaProfile({
      waitThresholdMin: 20,
    });
    tenantPartnerService.upsertPassenger({
      passengerId: "passenger-persisted-001",
      fullName: "Persisted Passenger Updated",
    });
    tenantPartnerService.updateTenantUserRole("tenant-user-persisted-001", {
      roleCode: "tenant_finance_admin",
      status: "active",
    });
    tenantPartnerService.rotateApiKey("tenant-api-key-persisted-001", {
      keyName: "Persisted Tenant Key v2",
      scopes: ["tenant:read", "tenant:write"],
    });
    await tenantPartnerService.sendTestWebhook({
      webhookId: "wh_persisted_001",
    });

    await Promise.resolve();

    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        slaProfile: expect.objectContaining({
          waitThresholdMin: 20,
        }),
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
