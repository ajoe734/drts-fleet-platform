import { describe, expect, it, vi } from "vitest";

import { PlatformSearchController } from "../../src/modules/search/platform-search.controller";

describe("PlatformSearchController", () => {
  it("wraps grouped search results in the standard success envelope", () => {
    const platformSearchService = {
      searchPlatform: vi.fn(() => [
        {
          category: "tenants",
          items: [
            {
              category: "tenants",
              resourceType: "platform_tenant",
              resourceId: "tenant-001",
              primaryLabel: "Tenant 001",
              link: {
                targetApp: "platform-admin",
                route: "/tenants/tenant-001",
                resourceType: "platform_tenant",
                resourceId: "tenant-001",
                openMode: "same_tab",
                label: "View tenant",
              },
            },
          ],
        },
      ]),
    };
    const controller = new PlatformSearchController(
      platformSearchService as never,
    );

    const response = controller.search(
      "tenant",
      undefined,
      ["tenants", "audit"],
      "req-platform-search-001",
    );

    expect(platformSearchService.searchPlatform).toHaveBeenCalledWith(
      "tenant",
      ["tenants", "audit"],
    );
    expect(response).toEqual({
      data: {
        items: [
          {
            category: "tenants",
            items: [
              {
                category: "tenants",
                resourceType: "platform_tenant",
                resourceId: "tenant-001",
                primaryLabel: "Tenant 001",
                link: {
                  targetApp: "platform-admin",
                  route: "/tenants/tenant-001",
                  resourceType: "platform_tenant",
                  resourceId: "tenant-001",
                  openMode: "same_tab",
                  label: "View tenant",
                },
              },
            ],
          },
        ],
      },
      meta: {
        requestId: "req-platform-search-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("accepts the legacy query param alias when q is absent", () => {
    const platformSearchService = {
      searchPlatform: vi.fn(() => []),
    };
    const controller = new PlatformSearchController(
      platformSearchService as never,
    );

    controller.search(
      undefined,
      "platform",
      ["users"],
      "req-platform-search-002",
    );

    expect(platformSearchService.searchPlatform).toHaveBeenCalledWith(
      "platform",
      ["users"],
    );
  });

  it("prefers q over the legacy query alias when both are present", () => {
    const platformSearchService = {
      searchPlatform: vi.fn(() => []),
    };
    const controller = new PlatformSearchController(
      platformSearchService as never,
    );

    controller.search(
      "tenant",
      "platform",
      "tenants,users",
      "req-platform-search-003",
    );

    expect(platformSearchService.searchPlatform).toHaveBeenCalledWith(
      "tenant",
      "tenants,users",
    );
  });
});
