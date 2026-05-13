import { describe, expect, it, vi } from "vitest";

import { PlatformTenantGovernanceController } from "../../apps/api/src/modules/platform-admin/tenant-governance.controller";
import { PlatformTenantGovernanceService } from "../../apps/api/src/modules/platform-admin/tenant-governance.service";

function createTenant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "tenant-demo-001",
    code: "demo",
    name: "Demo Tenant",
    status: "active",
    enabledModules: ["enterprise_dispatch"],
    quotas: {
      activeDrivers: 50,
      monthlyBookings: 1200,
      monthlyApiCalls: 80000,
    },
    bootstrapDefaults: {
      roleDefaults: [],
      billingBaseline: {
        invoiceTitle: "Demo Tenant",
        contactName: "Demo Billing",
        email: "billing@demo.example",
      },
      notificationSubscriptions: [],
      webhookEvents: [],
    },
    integrationPackage: {
      mode: "api_key_and_webhook",
      apiKeyScopes: ["tenant:write"],
      sandboxBaseUrl: "https://sandbox.demo.example",
      productionBaseUrl: "https://api.demo.example",
    },
    rollout: {
      stage: "production",
      sandboxStatus: "approved",
      pilotStatus: "approved",
      productionStatus: "approved",
      cutoverOwner: "Launch Owner",
      rollbackOwner: "Ops Owner",
      rollbackPrepared: true,
      lastPromotedAt: "2026-05-01T00:00:00.000Z",
      notes: null,
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("platform tenant governance summary", () => {
  it("rolls tenant governance metrics into alert-aware paginated rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));

    const tenantsService = {
      list: vi.fn(() => [
        createTenant({
          id: "tenant-alpha-001",
          code: "alpha",
          name: "Alpha Logistics",
        }),
        createTenant({
          id: "tenant-bravo-001",
          code: "bravo",
          name: "Bravo Mobility",
          rollout: {
            stage: "pilot",
            sandboxStatus: "approved",
            pilotStatus: "ready",
            productionStatus: "pending",
            cutoverOwner: null,
            rollbackOwner: null,
            rollbackPrepared: false,
            lastPromotedAt: null,
            notes: null,
          },
        }),
      ]),
    };

    const tenantPartnerService = {
      listCostCenters: vi.fn((tenantId: string) =>
        tenantId === "tenant-alpha-001"
          ? [
              {
                code: "CC-OPS-01",
                activeFlag: true,
                ownerUserId: "tenant-alpha-admin",
              },
              {
                code: "CC-FIN-01",
                activeFlag: true,
                ownerUserId: null,
              },
            ]
          : [
              {
                code: "CC-BRAVO-01",
                activeFlag: true,
                ownerUserId: null,
              },
            ],
      ),
      listApprovalRules: vi.fn((tenantId: string) =>
        tenantId === "tenant-alpha-001"
          ? [
              {
                action: "require_approval",
                approvers: [{ kind: "tenant_admin" }],
              },
            ]
          : [],
      ),
      getTenantQuotaSummary: vi.fn((tenantId: string) => ({
        usage: {
          remainingPercent: tenantId === "tenant-alpha-001" ? 3 : 82,
        },
      })),
      listApprovalRequests: vi.fn((tenantId: string) =>
        tenantId === "tenant-alpha-001"
          ? [
              {
                createdAt: "2026-05-10T09:00:00.000Z",
              },
              {
                createdAt: "2026-05-12T08:30:00.000Z",
              },
            ]
          : [],
      ),
      listTenantUsers: vi.fn((tenantId: string) =>
        tenantId === "tenant-alpha-001"
          ? [
              {
                userId: "tenant-alpha-admin",
                roleCode: "tenant_admin",
                status: "active",
              },
            ]
          : [
              {
                userId: "tenant-bravo-viewer",
                roleCode: "tenant_viewer",
                status: "active",
              },
            ],
      ),
    };

    const service = new PlatformTenantGovernanceService(
      tenantsService as never,
      tenantPartnerService as never,
    );

    const summary = service.listSummary({ page: 1, pageSize: 2 });

    expect(summary.pageInfo).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 2,
      totalPages: 1,
    });
    expect(summary.items).toHaveLength(2);
    expect(summary.items[0]).toEqual(
      expect.objectContaining({
        tenantId: "tenant-alpha-001",
        tenantCode: "alpha",
        tenantName: "Alpha Logistics",
        costCenterCount: 2,
        activeRuleCount: 1,
        monthlyQuotaPercentUsed: 97,
        pendingApprovalCount: 2,
        oldestPendingApprovalAgeHours: 75,
        alertFlags: ["quota_above_95_percent", "pending_approval_over_48h"],
      }),
    );
    expect(summary.items[1]).toEqual(
      expect.objectContaining({
        tenantId: "tenant-bravo-001",
        tenantCode: "bravo",
        tenantName: "Bravo Mobility",
        costCenterCount: 1,
        activeRuleCount: 0,
        monthlyQuotaPercentUsed: 18,
        pendingApprovalCount: 0,
        oldestPendingApprovalAgeHours: null,
        alertFlags: ["no_approvers_configured"],
      }),
    );

    vi.useRealTimers();
  });

  it("controller parses pagination query params and wraps the summary envelope", () => {
    const service = {
      listSummary: vi.fn(() => ({
        items: [],
        pageInfo: {
          page: 2,
          pageSize: 5,
          totalItems: 0,
          totalPages: 0,
        },
      })),
    } as unknown as PlatformTenantGovernanceService;
    const controller = new PlatformTenantGovernanceController(service);

    const response = controller.listSummary("2", "5", "req-governance-001");

    expect(service.listSummary).toHaveBeenCalledWith({
      page: 2,
      pageSize: 5,
    });
    expect(response).toEqual(
      expect.objectContaining({
        data: {
          items: [],
          pageInfo: {
            page: 2,
            pageSize: 5,
            totalItems: 0,
            totalPages: 0,
          },
        },
        meta: expect.objectContaining({
          requestId: "req-governance-001",
        }),
      }),
    );
  });
});
