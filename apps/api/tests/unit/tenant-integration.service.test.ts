import { describe, expect, it } from "vitest";

import type {
  PlatformAdminTenantRecord,
  TenantIntegrationReadinessItem,
} from "@drts/contracts";

import type { TenantReportReadinessSnapshot } from "../../src/modules/reporting-filing/reporting-filing.service";
import { TenantIntegrationService } from "../../src/modules/tenant-integration/tenant-integration.service";
import type { TenantPartnerIntegrationReadinessSnapshot } from "../../src/modules/tenant-partner/tenant-partner.service";

function createTenantPartnerSnapshot(
  overrides: Partial<TenantPartnerIntegrationReadinessSnapshot> = {},
): TenantPartnerIntegrationReadinessSnapshot {
  return {
    hasNotificationPreferences: true,
    notificationPreferences: {
      tenantId: "tenant-demo-001",
      subscriptions: [
        {
          eventType: "reservation.failed",
          channel: "email",
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
      updatedAt: "2026-05-25T00:00:00.000Z",
    },
    hasSlaProfile: true,
    slaProfile: {
      tenantId: "tenant-demo-001",
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 90,
      updatedAt: "2026-05-25T00:00:00.000Z",
    },
    apiKeys: [
      {
        apiKeyId: "key-001",
        tenantId: "tenant-demo-001",
        keyName: "Tenant Integration",
        keyPrefix: "tenant_live_",
        maskedSuffix: "****0001",
        scopes: ["tenant:write", "reports:read", "tenant:webhooks:write"],
        lastUsedAt: "2026-05-24T00:00:00.000Z",
        expiresAt: "2026-08-01T00:00:00.000Z",
        revokedAt: null,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ],
    webhookEndpoints: [
      {
        webhookId: "wh-001",
        tenantId: "tenant-demo-001",
        url: "https://tenant.example/webhooks/drts",
        events: [
          "booking.created",
          "booking.updated",
          "dispatch.assigned",
          "invoice.issued",
        ],
        status: "active",
        secretVersion: 1,
        secretPreview: "wsec_****",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        runtimeMetadata: {
          deliveryCount: 8,
          failedDeliveryCount: 0,
          lastAttemptAt: "2026-05-24T23:00:00.000Z",
          lastDeliveredAt: "2026-05-24T23:00:00.000Z",
          lastValidatedAt: "2026-05-24T23:00:00.000Z",
          nextAttemptAt: null,
          lastSignaturePreview: "sha256=***",
          disabledAt: null,
          disableReason: null,
          retryPolicy: {
            maxAttempts: 3,
            initialBackoffSeconds: 30,
            backoffMultiplier: 2,
            maxBackoffSeconds: 900,
            retryableStatusCodes: [408, 429, 500],
          },
          secretRotation: {
            currentVersion: 1,
            rotatedAt: "2026-05-01T00:00:00.000Z",
            rotationCount: 1,
            history: [],
          },
        },
        retryPolicy: {
          maxAttempts: 3,
          initialBackoffSeconds: 30,
          backoffMultiplier: 2,
          maxBackoffSeconds: 900,
          retryableStatusCodes: [408, 429, 500],
        },
        secretHistory: [],
      },
    ],
    partnerEntries: [],
    activePartnerCredentialCounts: {},
    ...overrides,
  };
}

function createReportSnapshot(
  overrides: Partial<TenantReportReadinessSnapshot> = {},
): TenantReportReadinessSnapshot {
  return {
    availableJobTypes: ["dispatch_recording_index", "revenue_summary"],
    jobCount: 1,
    activeArtifactCount: 1,
    failedJobCount: 0,
    runningJobCount: 0,
    ...overrides,
  };
}

function createTenant(
  overrides: Partial<PlatformAdminTenantRecord> = {},
): PlatformAdminTenantRecord {
  return {
    id: "tenant-demo-001",
    code: "demo",
    name: "Demo Tenant",
    status: "active",
    enabledModules: [
      "enterprise_dispatch",
      "billing",
      "reporting",
      "webhooks",
    ],
    quotas: {
      activeDrivers: 50,
      monthlyBookings: 1000,
      monthlyApiCalls: 80000,
    },
    bootstrapDefaults: {
      roleDefaults: [],
      billingBaseline: {
        invoiceTitle: "Demo Tenant",
        contactName: "Tenant Admin",
        email: "admin@demo.example",
      },
      notificationSubscriptions: [],
      webhookEvents: [],
    },
    integrationPackage: {
      mode: "api_key_and_webhook",
      apiKeyScopes: ["tenant:write", "reports:read"],
      sandboxBaseUrl: "https://sandbox.demo.drts.example",
      productionBaseUrl: "https://demo.drts.example",
    },
    rollout: {
      stage: "production",
      sandboxStatus: "approved",
      pilotStatus: "approved",
      productionStatus: "approved",
      cutoverOwner: null,
      rollbackOwner: null,
      rollbackPrepared: true,
      lastPromotedAt: "2026-05-01T00:00:00.000Z",
      notes: null,
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...overrides,
  };
}

function createService(options?: {
  partnerSnapshot?: TenantPartnerIntegrationReadinessSnapshot;
  reportSnapshot?: TenantReportReadinessSnapshot;
  tenant?: PlatformAdminTenantRecord | null;
}) {
  const partnerSnapshot =
    options?.partnerSnapshot ?? createTenantPartnerSnapshot();
  const reportSnapshot = options?.reportSnapshot ?? createReportSnapshot();
  const tenant = Object.prototype.hasOwnProperty.call(options ?? {}, "tenant")
    ? (options?.tenant ?? null)
    : createTenant();

  return new TenantIntegrationService(
    {
      getTenantIntegrationReadinessSnapshot: () => partnerSnapshot,
      getIntegrationGovernancePackage: () => ({
        tenantId: "tenant-demo-001",
        generatedAt: "2026-05-25T00:00:00.000Z",
        apiKeyPolicy: {
          allowedScopes: [],
          compatibilityAliases: {},
          defaultLifetimeDays: 60,
          maxLifetimeDays: 90,
          requireExpiry: true,
          breakGlassRequiresPlatformApproval: true,
          revokeEffect: "immediate",
        },
        webhookPolicy: {
          testEventType: "tenant.webhook.test",
          autoDisableAfterConsecutiveFailures: 3,
          revalidationRequiredOnCreate: true,
          revalidationRequiredOnEndpointMutation: true,
          revalidationRequiredOnSecretRotation: true,
          deliveryFailureNotificationChannel: "ops_notice",
          retryPolicy: {
            maxAttempts: 3,
            initialBackoffSeconds: 30,
            backoffMultiplier: 2,
            maxBackoffSeconds: 900,
            retryableStatusCodes: [408, 429, 500],
          },
        },
        baselineWebhookEvents: [
          "booking.created",
          "booking.updated",
          "dispatch.assigned",
          "invoice.issued",
        ],
        baselineNotificationSubscriptions: [],
        onboardingChecklist: [],
      }),
    } as never,
    {
      getTenantReportReadinessSnapshot: () => reportSnapshot,
    } as never,
    {
      find: () => tenant,
    } as never,
  );
}

function statusMap(items: TenantIntegrationReadinessItem[]) {
  return Object.fromEntries(
    items.map((item) => [item.subSystem, item.status] as const),
  );
}

describe("TenantIntegrationService", () => {
  it("aggregates readiness states across all seven tenant integration subsystems", () => {
    const service = createService({
      partnerSnapshot: createTenantPartnerSnapshot({
        notificationPreferences: {
          tenantId: "tenant-demo-001",
          subscriptions: [
            {
              eventType: "reservation.failed",
              channel: "webhook",
              enabled: true,
            },
            {
              eventType: "tenant.webhook.delivery_failed",
              channel: "ops_console",
              enabled: true,
            },
          ],
          updatedAt: "2026-05-25T00:00:00.000Z",
        },
        webhookEndpoints: [],
        partnerEntries: [
          {
            partnerId: "partner-bank-001",
            partnerCode: "bank_demo",
            partnerType: "bank_partner",
            programId: "program-demo",
            programCode: "DEMO",
            tenantId: "tenant-demo-001",
            bankCode: "BANK",
            entrySlug: "bank-demo",
            displayName: "Bank Demo",
            businessDispatchSubtype: "credit_card_airport_transfer",
            authMode: "partner_api_key",
            eligibilityMode: "bank_card_inline",
            entryHost: null,
            entryPath: "/partner/bank-demo",
            themeAccent: "#0b7285",
            brandingMetadata: {
              displayName: "Bank Demo",
              themeAccent: "#0b7285",
              supportEmail: "help@bank-demo.example",
              supportPhone: "0800-000-111",
            },
            eligibilityContract: null,
            status: "inactive",
            activeFlag: false,
            revokedAt: null,
            revokedBy: null,
            revokeReason: null,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
            auditMetadata: {
              source: "seed_bootstrap",
              requestId: null,
              createdBy: "system:seed",
              updatedBy: "system:seed",
            },
          },
        ],
      }),
      reportSnapshot: createReportSnapshot({
        jobCount: 2,
        activeArtifactCount: 0,
        failedJobCount: 2,
        runningJobCount: 0,
      }),
      tenant: createTenant({
        enabledModules: ["enterprise_dispatch", "reporting"],
      }),
    });

    const summary = service.getTenantIntegrationReadiness("tenant-demo-001");

    expect(summary.tenantId).toBe("tenant-demo-001");
    expect(statusMap(summary.items)).toEqual({
      api_keys: "ready",
      webhooks: "not_provisioned",
      notifications: "partial",
      sla: "ready",
      reports: "blocked",
      modules: "partial",
      partner_entries: "blocked",
    });
    expect(summary.items.find((item) => item.subSystem === "webhooks"))
      .toMatchObject({
        nextAction: {
          action: "set_up_webhook",
          enabled: true,
          riskLevel: "low",
        },
      });
  });

  it("reports a first-time tenant as not provisioned when no source systems are configured", () => {
    const service = createService({
      partnerSnapshot: createTenantPartnerSnapshot({
        hasNotificationPreferences: false,
        notificationPreferences: null,
        hasSlaProfile: false,
        slaProfile: null,
        apiKeys: [],
        webhookEndpoints: [],
        partnerEntries: [],
      }),
      reportSnapshot: createReportSnapshot({
        jobCount: 0,
        activeArtifactCount: 0,
        failedJobCount: 0,
        runningJobCount: 0,
      }),
      tenant: null,
    });

    const summary = service.getTenantIntegrationReadiness("tenant-new-001");

    expect(statusMap(summary.items)).toEqual({
      api_keys: "not_provisioned",
      webhooks: "not_provisioned",
      notifications: "not_provisioned",
      sla: "not_provisioned",
      reports: "not_provisioned",
      modules: "not_provisioned",
      partner_entries: "not_provisioned",
    });
  });
});
