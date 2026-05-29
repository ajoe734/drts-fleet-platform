import { describe, expect, it } from "vitest";

import type {
  FeatureFlag,
  PartnerChannelEntryRecord,
  TenantApiKeyRecord,
  TenantIntegrationReadinessItem,
  TenantNotificationPreferences,
  TenantSlaProfile,
  TenantWebhookEndpoint,
} from "@drts/contracts";

import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";
import { TenantIntegrationService } from "../../src/modules/tenant-integration/tenant-integration.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-demo-001";
const NOW = "2026-05-29T00:00:00.000Z";
const FUTURE = "2027-01-01T00:00:00.000Z";
const PAST = "2025-01-01T00:00:00.000Z";

interface FakeSubsystemState {
  apiKeys?: TenantApiKeyRecord[];
  webhooks?: TenantWebhookEndpoint[];
  notifications?: TenantNotificationPreferences;
  sla?: TenantSlaProfile;
  partnerEntries?: PartnerChannelEntryRecord[];
  featureFlags?: FeatureFlag[];
}

function apiKey(overrides: Partial<TenantApiKeyRecord>): TenantApiKeyRecord {
  return {
    apiKeyId: "ak-1",
    tenantId: TENANT_ID,
    keyName: "default",
    keyPrefix: "drts_live_",
    maskedSuffix: "abcd",
    scopes: ["tenant:read"],
    lastUsedAt: null,
    expiresAt: FUTURE,
    revokedAt: null,
    createdAt: PAST,
    ...overrides,
  };
}

function webhook(
  overrides: Partial<TenantWebhookEndpoint>,
): TenantWebhookEndpoint {
  return {
    webhookId: "wh-1",
    tenantId: TENANT_ID,
    url: "https://example.test/hook",
    events: ["reservation.failed"],
    status: "active",
    secretVersion: 1,
    secretPreview: "whsec_***",
    createdAt: PAST,
    updatedAt: PAST,
    ...overrides,
  };
}

function partnerEntry(
  overrides: Partial<PartnerChannelEntryRecord>,
): PartnerChannelEntryRecord {
  return {
    partnerId: "pa-1",
    partnerCode: "PA",
    partnerType: "bank",
    programId: "prog-1",
    programCode: null,
    tenantId: TENANT_ID,
    bankCode: null,
    entrySlug: "pa-1",
    displayName: "Partner A",
    businessDispatchSubtype: "enterprise_dispatch",
    authMode: "partner_api_key",
    eligibilityMode: "none",
    entryHost: null,
    entryPath: null,
    themeAccent: null,
    brandingMetadata: null,
    eligibilityContract: null,
    status: "active",
    activeFlag: true,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: PAST,
    updatedAt: PAST,
    auditMetadata: {
      source: null,
      requestId: null,
      createdBy: null,
      updatedBy: null,
    },
    ...overrides,
  };
}

function buildService(state: FakeSubsystemState): TenantIntegrationService {
  const tenantPartnerService = {
    listApiKeys: () => state.apiKeys ?? [],
    listWebhookEndpoints: () => state.webhooks ?? [],
    getNotificationPreferences: (): TenantNotificationPreferences =>
      state.notifications ?? {
        tenantId: TENANT_ID,
        subscriptions: [],
        updatedAt: PAST,
      },
    getSlaProfile: (): TenantSlaProfile =>
      state.sla ?? {
        tenantId: TENANT_ID,
        waitThresholdMin: 10,
        arrivalThresholdMin: 15,
        completionThresholdMin: 90,
        updatedAt: PAST,
      },
    listPlatformPartnerEntries: () => state.partnerEntries ?? [],
  } as unknown as TenantPartnerService;

  const featureFlagsService = {
    getAll: async (): Promise<FeatureFlag[]> => state.featureFlags ?? [],
  } as unknown as FeatureFlagsService;

  return new TenantIntegrationService(
    tenantPartnerService,
    featureFlagsService,
  );
}

function itemFor(
  summary: { items: TenantIntegrationReadinessItem[] },
  subSystem: TenantIntegrationReadinessItem["subSystem"],
): TenantIntegrationReadinessItem {
  const item = summary.items.find((entry) => entry.subSystem === subSystem);
  expect(item, `expected a readiness item for ${subSystem}`).toBeDefined();
  return item as TenantIntegrationReadinessItem;
}

describe("TenantIntegrationService.getReadinessSummary", () => {
  it("returns one item per sub-system with tenant id and computedAt", async () => {
    const service = buildService({});
    const summary = await service.getReadinessSummary(TENANT_ID);

    expect(summary.tenantId).toBe(TENANT_ID);
    expect(typeof summary.computedAt).toBe("string");
    expect(summary.items.map((item) => item.subSystem).sort()).toEqual(
      [
        "api_keys",
        "modules",
        "notifications",
        "partner_entries",
        "reports",
        "sla",
      ]
        .concat("webhooks")
        .sort(),
    );
  });

  // --- status level: ready ---
  it("marks api_keys ready when an active key exists", async () => {
    const service = buildService({
      apiKeys: [apiKey({ expiresAt: FUTURE, revokedAt: null })],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "api_keys").status).toBe("ready");
  });

  it("marks webhooks ready when an active endpoint exists", async () => {
    const service = buildService({
      webhooks: [webhook({ status: "active" })],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "webhooks").status).toBe("ready");
  });

  it("marks modules ready when every feature flag is enabled", async () => {
    const service = buildService({
      featureFlags: [
        { key: "a", enabled: true, description: "", updatedAt: PAST },
        { key: "b", enabled: true, description: "", updatedAt: PAST },
      ],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "modules").status).toBe("ready");
  });

  // --- status level: partial ---
  it("marks api_keys partial when all keys are expired", async () => {
    const service = buildService({
      apiKeys: [apiKey({ expiresAt: PAST, revokedAt: null })],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    const item = itemFor(summary, "api_keys");
    expect(item.status).toBe("partial");
    expect(item.nextAction?.action).toBe("rotate_api_key");
  });

  it("marks modules partial when only some feature flags are enabled", async () => {
    const service = buildService({
      featureFlags: [
        { key: "a", enabled: true, description: "", updatedAt: PAST },
        { key: "b", enabled: false, description: "", updatedAt: PAST },
      ],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "modules").status).toBe("partial");
  });

  it("marks reports partial when an active key has reports:read but not reports:write", async () => {
    const service = buildService({
      apiKeys: [apiKey({ scopes: ["reports:read"], expiresAt: FUTURE })],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "reports").status).toBe("partial");
  });

  // --- status level: not_provisioned ---
  it("marks api_keys not_provisioned when no keys exist", async () => {
    const service = buildService({ apiKeys: [] });
    const summary = await service.getReadinessSummary(TENANT_ID);
    const item = itemFor(summary, "api_keys");
    expect(item.status).toBe("not_provisioned");
    expect(item.nextAction?.action).toBe("issue_api_key");
  });

  it("marks notifications not_provisioned when there are no subscriptions", async () => {
    const service = buildService({
      notifications: {
        tenantId: TENANT_ID,
        subscriptions: [],
        updatedAt: PAST,
      },
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "notifications").status).toBe("not_provisioned");
  });

  it("marks reports not_provisioned when no active key grants report scope", async () => {
    const service = buildService({
      apiKeys: [apiKey({ scopes: ["tenant:read"], expiresAt: FUTURE })],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "reports").status).toBe("not_provisioned");
  });

  // --- status level: blocked ---
  it("marks api_keys blocked when all keys are revoked", async () => {
    const service = buildService({
      apiKeys: [apiKey({ revokedAt: NOW, expiresAt: FUTURE })],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "api_keys").status).toBe("blocked");
  });

  it("marks webhooks blocked when an endpoint was auto-disabled by delivery failures", async () => {
    const service = buildService({
      webhooks: [
        webhook({
          status: "disabled",
          runtimeMetadata: {
            deliveryCount: 5,
            failedDeliveryCount: 5,
            lastAttemptAt: PAST,
            lastDeliveredAt: null,
            lastValidatedAt: null,
            nextAttemptAt: null,
            lastSignaturePreview: null,
            disabledAt: PAST,
            disableReason: "delivery_failed",
            retryPolicy: {
              maxAttempts: 5,
              initialBackoffSeconds: 1,
              backoffMultiplier: 2,
              maxBackoffSeconds: 60,
              retryableStatusCodes: [500, 502, 503],
            },
            secretRotation: {
              currentVersion: 1,
              rotatedAt: PAST,
              rotationCount: 0,
              history: [],
            },
          },
        }),
      ],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "webhooks").status).toBe("blocked");
  });

  it("marks partner_entries blocked when every entry is revoked", async () => {
    const service = buildService({
      partnerEntries: [
        partnerEntry({
          status: "revoked",
          activeFlag: false,
          revokedAt: NOW,
        }),
      ],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "partner_entries").status).toBe("blocked");
  });

  it("only considers partner entries belonging to the requested tenant", async () => {
    const service = buildService({
      partnerEntries: [
        partnerEntry({ tenantId: "other-tenant", status: "active" }),
      ],
    });
    const summary = await service.getReadinessSummary(TENANT_ID);
    expect(itemFor(summary, "partner_entries").status).toBe("not_provisioned");
  });
});
