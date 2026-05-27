import { describe, expect, it, vi } from "vitest";

import { PlatformAdminHealthService } from "../../src/modules/platform-admin/platform-admin-health.service";

function createService({
  tenants,
  partnerEntries,
  credentialsByEntrySlug,
  adapters,
}: {
  tenants: any[];
  partnerEntries: any[];
  credentialsByEntrySlug: Record<string, any[]>;
  adapters: any[];
}) {
  return new PlatformAdminHealthService(
    {
      list: vi.fn(() => tenants),
    } as never,
    {
      listPlatformPartnerEntries: vi.fn(() => partnerEntries),
      listPlatformPartnerIngressCredentials: vi.fn(
        (entrySlug: string) => credentialsByEntrySlug[entrySlug] ?? [],
      ),
    } as never,
    {
      listAdapterHealth: vi.fn(() => adapters),
    } as never,
  );
}

function createTenant(overrides: Partial<any> = {}) {
  return {
    id: "tenant-demo-001",
    name: "Demo Tenant",
    rollout: {
      stage: "production",
      sandboxStatus: "approved",
      pilotStatus: "approved",
      productionStatus: "approved",
      ...overrides.rollout,
    },
    ...overrides,
  };
}

function createPartnerEntry(overrides: Partial<any> = {}) {
  return {
    entrySlug: "bank-demo-alpha-airport",
    displayName: "Bank Demo Alpha Airport Transfer",
    activeFlag: true,
    status: "active",
    ...overrides,
  };
}

function createCredential(overrides: Partial<any> = {}) {
  return {
    keyId: "partner-key-alpha-demo",
    revokedAt: null,
    ...overrides,
  };
}

function createAdapter(overrides: Partial<any> = {}) {
  return {
    platformCode: "grab_taiwan",
    status: "healthy",
    reason: "ok",
    credentialStatus: "valid",
    authStatus: "authenticated",
    webhookStatus: "healthy",
    rateLimitStatus: "ok",
    lastCheckedAt: "2026-05-27T00:00:00.000Z",
    lastError: null,
    lastWebhookReceivedAt: null,
    lastRateLimitAt: null,
    lastAuthFailureAt: null,
    capabilitySummary: {
      mode: "hybrid",
      productionStatus: "production_ready",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: [],
      notes: [],
    },
    ...overrides,
  };
}

describe("PlatformAdminHealthService", () => {
  it("returns healthy when rollout, credentials, and adapters are clear", () => {
    const service = createService({
      tenants: [createTenant()],
      partnerEntries: [createPartnerEntry()],
      credentialsByEntrySlug: {
        "bank-demo-alpha-airport": [createCredential()],
      },
      adapters: [createAdapter()],
    });

    const health = service.getUiHealth(new Date("2026-05-27T01:00:00.000Z"));

    expect(health.status).toBe("healthy");
    expect(health.summary).toBe("Platform admin health is nominal.");
    expect(health.indicators).toEqual([
      expect.objectContaining({
        key: "rollout_pending",
        status: "healthy",
        value: 0,
      }),
      expect.objectContaining({
        key: "partner_credentials_expiring",
        status: "healthy",
        value: 0,
      }),
      expect.objectContaining({
        key: "adapters_unhealthy",
        status: "healthy",
        value: 0,
      }),
    ]);
    expect(health.blockers).toEqual([]);
  });

  it("returns degraded when rollout or adapter health needs attention without blockers", () => {
    const service = createService({
      tenants: [
        createTenant({
          id: "tenant-beta",
          name: "Beta Tenant",
          rollout: {
            stage: "sandbox",
            sandboxStatus: "ready",
            pilotStatus: "pending",
            productionStatus: "pending",
          },
        }),
      ],
      partnerEntries: [createPartnerEntry()],
      credentialsByEntrySlug: {
        "bank-demo-alpha-airport": [createCredential()],
      },
      adapters: [
        createAdapter({
          status: "degraded",
          credentialStatus: "valid",
          authStatus: "reauth_required",
        }),
      ],
    });

    const health = service.getUiHealth(new Date("2026-05-27T01:00:00.000Z"));

    expect(health.status).toBe("degraded");
    expect(health.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "rollout_pending",
          status: "degraded",
          value: 1,
        }),
        expect.objectContaining({
          key: "partner_credentials_expiring",
          status: "degraded",
          value: 1,
        }),
        expect.objectContaining({
          key: "adapters_unhealthy",
          status: "degraded",
          value: 1,
        }),
      ]),
    );
    expect(health.blockers).toEqual([]);
  });

  it("returns unhealthy with blockers when rollout gates, credentials, or adapters are broken", () => {
    const service = createService({
      tenants: [
        createTenant({
          id: "tenant-risk",
          name: "Risk Tenant",
          rollout: {
            stage: "pilot",
            sandboxStatus: "approved",
            pilotStatus: "blocked",
            productionStatus: "pending",
          },
        }),
      ],
      partnerEntries: [createPartnerEntry()],
      credentialsByEntrySlug: {
        "bank-demo-alpha-airport": [],
      },
      adapters: [
        createAdapter({
          platformCode: "sandbox",
          status: "down",
          credentialStatus: "expired",
        }),
      ],
    });

    const health = service.getUiHealth(new Date("2026-05-27T01:00:00.000Z"));

    expect(health.status).toBe("unhealthy");
    expect(health.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "rollout_pending",
          status: "unhealthy",
        }),
        expect.objectContaining({
          key: "partner_credentials_expiring",
          status: "unhealthy",
          value: 2,
        }),
        expect.objectContaining({
          key: "adapters_unhealthy",
          status: "unhealthy",
        }),
      ]),
    );
    expect(health.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "tenant_rollout_blocked",
          resourceId: "tenant-risk",
        }),
        expect.objectContaining({
          code: "partner_credential_missing",
          resourceId: "bank-demo-alpha-airport",
        }),
        expect.objectContaining({
          code: "adapter_unhealthy",
          resourceId: "sandbox",
        }),
      ]),
    );
  });
});
