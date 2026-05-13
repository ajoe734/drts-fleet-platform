import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../../packages/api-client/src/index";

describe("platform tenant governance api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls the admin tenant governance summary route with pagination params", async () => {
    const payload = {
      items: [
        {
          tenantId: "tenant-demo-001",
          tenantCode: "demo",
          tenantName: "Demo Tenant",
          tenantStatus: "active",
          tenantRolloutStage: "production",
          costCenterCount: 3,
          activeRuleCount: 1,
          monthlyQuotaPercentUsed: 96,
          pendingApprovalCount: 2,
          oldestPendingApprovalAgeHours: 52,
          alertFlags: ["quota_above_95_percent"],
        },
      ],
      pageInfo: {
        page: 2,
        pageSize: 5,
        totalItems: 7,
        totalPages: 2,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: payload }),
      text: async () => "",
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(
      client.getPlatformTenantGovernanceSummary({ page: 2, pageSize: 5 }),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/admin/tenant-governance/summary?page=2&pageSize=5",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("omits pagination params when the caller uses defaults", async () => {
    const payload = {
      items: [],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: payload }),
      text: async () => "",
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(client.getPlatformTenantGovernanceSummary()).resolves.toEqual(
      payload,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/admin/tenant-governance/summary",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
