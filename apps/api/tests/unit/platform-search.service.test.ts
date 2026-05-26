import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { PlatformSearchService } from "../../src/modules/search/platform-search.service";

function createService() {
  return new PlatformSearchService(
    {
      list: () => [
        {
          id: "tenant-alpha-001",
          code: "alpha",
          name: "Alpha Mobility",
          status: "active",
          enabledModules: ["dispatch"],
          quotas: {
            activeDrivers: 12,
            monthlyBookings: 120,
            monthlyApiCalls: 1200,
          },
          bootstrapDefaults: {
            tenantDisplayName: "Alpha Mobility",
            bootstrapAdminEmail: "admin@alpha.example",
            roleDefaults: [],
            notificationSubscriptions: [],
            defaultWebhookEvents: [],
            defaultApiKeyScopes: [],
          },
          integrationPackage: {
            mode: "sandbox",
            sandboxBaseUrl: "https://alpha-sandbox.example",
            productionBaseUrl: null,
          },
          rollout: {
            stage: "sandbox",
            sandboxStatus: "ready",
            pilotStatus: "pending",
            productionStatus: "pending",
            cutoverOwner: null,
            rollbackOwner: null,
            rollbackPrepared: false,
            lastPromotedAt: null,
            notes: null,
          },
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    } as never,
    {
      listPlatformAdminUsers: () => [
        {
          userId: "platform-user-001",
          email: "alpha.admin@platform.example",
          displayName: "Alpha Platform Admin",
          roleCode: "superadmin",
          status: "active",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    } as never,
    {
      listPlatformPartnerEntries: () => [
        {
          partnerId: "partner-001",
          partnerCode: "alpha-bank",
          partnerType: "issuer",
          programId: "alpha-program",
          programCode: "alpha-program-code",
          tenantId: "tenant-alpha-001",
          bankCode: "004",
          entrySlug: "alpha-bank-airport",
          displayName: "Alpha Bank Airport",
          businessDispatchSubtype: "airport_transfer",
          authMode: "api_key",
          eligibilityMode: "inline",
          entryHost: null,
          entryPath: "/partner/alpha-bank-airport",
          themeAccent: null,
          brandingMetadata: null,
          eligibilityContract: null,
          status: "active",
          activeFlag: true,
          revokedAt: null,
          revokedBy: null,
          revokeReason: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          auditMetadata: {
            source: "seed",
            lastVerifiedAt: null,
            lastVerifiedBy: null,
          },
        },
      ],
      listTenantUsers: () => [
        {
          userId: "tenant-user-001",
          tenantId: "tenant-alpha-001",
          email: "ops@alpha.example",
          displayName: "Alpha Tenant Ops",
          roleCode: "tenant_ops_admin",
          status: "active",
          approvalNotificationOptOut: false,
          invitedAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    } as never,
    {
      listAdapterHealth: () => [
        {
          platformCode: "grab_taiwan",
          status: "degraded",
          reason: "stub",
          capabilitySummary: {
            supportsOutboundDispatch: true,
            supportsInboundWebhook: true,
            supportsEarningsPull: false,
            supportsDriverStatusPush: false,
            notes: ["stub adapter"],
          },
          credentialStatus: "pending",
          authStatus: "not_started",
          webhookStatus: "inactive",
          rateLimitStatus: "healthy",
          lastCheckedAt: "2026-05-01T00:00:00.000Z",
          lastError: null,
          lastWebhookReceivedAt: null,
          lastRateLimitAt: null,
          lastAuthFailureAt: null,
        },
      ],
    } as never,
    {
      getAuditLogsSnapshot: () => [
        {
          auditId: "audit-001",
          actorId: "platform-user-001",
          actorType: "platform_admin",
          tenantId: null,
          moduleName: "tenant-partner",
          actionName: "create_partner_entry",
          resourceType: "partner_entry",
          resourceId: "alpha-bank-airport",
          requestId: "req-alpha-001",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    } as never,
  );
}

describe("PlatformSearchService", () => {
  it("groups platform search results by category and preserves matched fields", () => {
    const service = createService();

    const response = service.searchPlatform("alpha");

    expect(response.map((group) => group.category)).toEqual([
      "tenants",
      "partners",
      "users",
      "audit",
    ]);
    expect(response[0].items[0]).toEqual(
      expect.objectContaining({
        category: "tenants",
        resourceId: "tenant-alpha-001",
        primaryLabel: "Alpha Mobility",
        matchedFields: expect.arrayContaining(["code", "name"]),
        link: expect.objectContaining({
          route: "/tenants/tenant-alpha-001",
        }),
      }),
    );
    expect(response[2].items).toHaveLength(2);
    expect(response[3].items[0]).toEqual(
      expect.objectContaining({
        category: "audit",
        resourceId: "audit-001",
        matchedFields: expect.arrayContaining(["resourceId", "requestId"]),
      }),
    );
  });

  it("filters to requested categories", () => {
    const service = createService();

    const response = service.searchPlatform("alpha", "users,audit");

    expect(response.map((group) => group.category)).toEqual(["users", "audit"]);
    expect(response[0].items.every((item) => item.category === "users")).toBe(
      true,
    );
  });

  it("matches adapter registry aliases in the types filter", () => {
    const service = createService();

    const response = service.searchPlatform("grab", ["adapter-registry"]);

    expect(response).toEqual([
      {
        category: "adapter_registry",
        items: [
          expect.objectContaining({
            resourceId: "grab_taiwan",
            primaryLabel: "Grab Taiwan",
            matchedFields: expect.arrayContaining([
              "platformCode",
              "displayName",
            ]),
          }),
        ],
      },
    ]);
  });

  it("rejects invalid search types", () => {
    const service = createService();

    expect(() => service.searchPlatform("alpha", "bogus")).toThrowError(
      ApiRequestError,
    );
  });
});
