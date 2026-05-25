import { describe, expect, it, vi } from "vitest";

import { SearchController } from "../../src/modules/search/search.controller";

describe("SearchController", () => {
  it("wraps grouped search results in the standard success envelope", () => {
    const searchService = {
      search: vi.fn(() => ({
        tenants: [{ resourceId: "tenant-acme" }],
        partners: [],
        users: [],
        adapter_registry: [],
        audit: [],
      })),
    };
    const controller = new SearchController(searchService as never);

    const response = controller.search("acme", undefined, "req-search-001");

    expect(searchService.search).toHaveBeenCalledWith("acme");
    expect(response).toEqual({
      data: {
        tenants: [{ resourceId: "tenant-acme" }],
        partners: [],
        users: [],
        adapter_registry: [],
        audit: [],
      },
      meta: {
        requestId: "req-search-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("accepts the legacy query param alias when q is absent", () => {
    const searchService = {
      search: vi.fn(() => ({
        tenants: [],
        partners: [],
        users: [],
        adapter_registry: [],
        audit: [],
      })),
    };
    const controller = new SearchController(searchService as never);

    controller.search(undefined, "platform", "req-search-002");

    expect(searchService.search).toHaveBeenCalledWith("platform");
  });
});
