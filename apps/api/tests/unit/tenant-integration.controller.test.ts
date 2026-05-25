import { describe, expect, it, vi } from "vitest";

import { TenantIntegrationController } from "../../src/modules/tenant-integration/tenant-integration.controller";

describe("TenantIntegrationController", () => {
  it("wraps readiness summaries in the standard success envelope", () => {
    const tenantIntegrationService = {
      getTenantIntegrationReadiness: vi.fn(() => ({
        tenantId: "tenant-demo-001",
        computedAt: "2026-05-25T00:00:00.000Z",
        items: [],
      })),
    };
    const controller = new TenantIntegrationController(
      tenantIntegrationService as never,
    );

    const response = controller.getTenantIntegrationReadiness(
      "tenant-demo-001",
      "req-tenant-readiness-001",
    );

    expect(
      tenantIntegrationService.getTenantIntegrationReadiness,
    ).toHaveBeenCalledWith("tenant-demo-001");
    expect(response).toEqual({
      data: {
        tenantId: "tenant-demo-001",
        computedAt: "2026-05-25T00:00:00.000Z",
        items: [],
      },
      meta: {
        requestId: "req-tenant-readiness-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("rejects requests that omit x-tenant-id", () => {
    const controller = new TenantIntegrationController({
      getTenantIntegrationReadiness: vi.fn(),
    } as never);

    expect(() =>
      controller.getTenantIntegrationReadiness(undefined, "req-missing-001"),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "TENANT_ID_REQUIRED",
          }),
        }),
      }),
    );
  });
});
