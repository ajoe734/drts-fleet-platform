import { afterEach, describe, expect, it, vi } from "vitest";
import { createTenantBearerClientFromSession } from "@/lib/api-client";

describe("tenant server API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the tenant ID from the verified session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            items: [],
            pagination: {
              page: 1,
              page_size: 100,
              total_items: 0,
              total_pages: 1,
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createTenantBearerClientFromSession({
      accessToken: "tenant-session-token",
      tenantId: "tenant-acceptance-001",
    }).listTenantBookings();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tenant-session-token");
    expect(headers["x-tenant-id"]).toBe("tenant-acceptance-001");
    expect(headers["x-realm"]).toBe("tenant");
  });

  it("does not replace a verified tenant with a configured default", async () => {
    vi.stubEnv("DRTS_TENANT_CONSOLE_TENANT_ID", "spoofed-config-tenant");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            items: [],
            pagination: {
              page: 1,
              page_size: 100,
              total_items: 0,
              total_pages: 1,
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createTenantBearerClientFromSession({
      accessToken: "tenant-session-token",
      tenantId: "verified-tenant-201",
    }).listTenantBookings();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-tenant-id"]).toBe(
      "verified-tenant-201",
    );
  });
});
