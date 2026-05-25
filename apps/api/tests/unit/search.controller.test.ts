import { describe, expect, it, vi } from "vitest";

import { TenantSearchController } from "../../src/modules/search/tenant-search.controller";

describe("TenantSearchController", () => {
  it("wraps tenant search results in the standard success envelope", () => {
    const tenantSearchService = {
      searchTenant: vi.fn(() => ({
        query: "Acme",
        groups: [
          {
            category: "passengers",
            items: [
              {
                category: "passengers",
                resourceType: "passenger",
                resourceId: "passenger-acme-001",
                primaryLabel: "Alice Example",
                link: {
                  targetApp: "tenant-console",
                  route: "/passengers?passengerId=passenger-acme-001",
                  resourceType: "passenger",
                  resourceId: "passenger-acme-001",
                  openMode: "same_tab",
                  label: "Open passenger directory",
                },
                matchedFields: ["employeeNo"],
              },
            ],
          },
        ],
      })),
    };
    const controller = new TenantSearchController(tenantSearchService as never);

    const response = controller.searchTenant(
      "Acme",
      "passengers,cost_centers,passengers",
      " tenant-demo-001 ",
      "req-tenant-search-001",
    );

    expect(tenantSearchService.searchTenant).toHaveBeenCalledWith(
      "tenant-demo-001",
      {
        q: "Acme",
        types: ["passengers", "cost-centers"],
      },
    );
    expect(response).toEqual({
      data: {
        query: "Acme",
        groups: [
          {
            category: "passengers",
            items: [
              {
                category: "passengers",
                resourceType: "passenger",
                resourceId: "passenger-acme-001",
                primaryLabel: "Alice Example",
                link: {
                  targetApp: "tenant-console",
                  route: "/passengers?passengerId=passenger-acme-001",
                  resourceType: "passenger",
                  resourceId: "passenger-acme-001",
                  openMode: "same_tab",
                  label: "Open passenger directory",
                },
                matchedFields: ["employeeNo"],
              },
            ],
          },
        ],
      },
      meta: {
        requestId: "req-tenant-search-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("rejects requests without the tenant header", () => {
    const tenantSearchService = {
      searchTenant: vi.fn(),
    };
    const controller = new TenantSearchController(tenantSearchService as never);

    expect(() =>
      controller.searchTenant("Acme", undefined, "   ", "req-missing-tenant"),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "TENANT_ID_REQUIRED",
          }),
        }),
      }),
    );
    expect(tenantSearchService.searchTenant).not.toHaveBeenCalled();
  });

  it("rejects unsupported search categories before calling the service", () => {
    const tenantSearchService = {
      searchTenant: vi.fn(),
    };
    const controller = new TenantSearchController(tenantSearchService as never);

    expect(() =>
      controller.searchTenant(
        "Acme",
        "passengers,unknown-type",
        "tenant-demo-001",
        "req-invalid-type-001",
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({
            code: "SEARCH_TYPE_INVALID",
          }),
        }),
      }),
    );
    expect(tenantSearchService.searchTenant).not.toHaveBeenCalled();
  });
});
