import { afterEach, describe, expect, it, vi } from "vitest";
import { createTenantBearerClientFromToken } from "@/lib/api-client";

describe("tenant server API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DRTS_TENANT_CONSOLE_TENANT_ID;
  });

  it("adds the configured tenant ID to authenticated server requests", async () => {
    process.env.DRTS_TENANT_CONSOLE_TENANT_ID = "tenant-acceptance-001";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createTenantBearerClientFromToken(
      "tenant-session-token",
    ).listTenantBookings();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tenant-session-token");
    expect(headers["x-tenant-id"]).toBe("tenant-acceptance-001");
    expect(headers["x-realm"]).toBe("tenant");
  });

  it("uses the canonical operational tenant when no override is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createTenantBearerClientFromToken(
      "tenant-session-token",
    ).listTenantBookings();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-tenant-id"]).toBe(
      "10000000-0000-0000-0000-000000000201",
    );
  });
});
