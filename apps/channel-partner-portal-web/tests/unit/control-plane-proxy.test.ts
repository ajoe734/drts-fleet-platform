import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/control-plane-proxy/[...path]/route";

function contextFor(path: string[]) {
  return {
    params: Promise.resolve({ path }),
  };
}

function requestFor(path: string[], init?: RequestInit) {
  const request = new Request(
    `http://channel.example/control-plane-proxy/${path.join("/")}`,
    {
      ...init,
      method: "GET",
    },
  );

  return new NextRequest(request);
}

describe("channel partner portal control-plane proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DRTS_API_URL;
    delete process.env.DRTS_API_AUTH_AUDIENCE;
    delete process.env.DRTS_PARTNER_ID;
    delete process.env.DRTS_TENANT_ID;
    delete process.env.DRTS_PARTNER_PROGRAM_ID;
    delete process.env.DRTS_PARTNER_ENTRY_SLUG;
  });

  it("overrides hostile auth headers with canonical partner bootstrap identity", async () => {
    process.env.DRTS_PARTNER_ID = "partner-referral-demo-001";
    process.env.DRTS_TENANT_ID = "tenant-demo-001";
    process.env.DRTS_PARTNER_PROGRAM_ID = "program-referral-community";
    process.env.DRTS_PARTNER_ENTRY_SLUG = "referral-demo-community";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      requestFor(["partner", "referral", "dashboard"], {
        headers: {
          "x-actor-type": "platform_admin",
          "x-actor-id": "spoofed-browser-actor",
          "x-partner-id": "spoofed-partner",
          "x-tenant-id": "spoofed-tenant",
          "x-partner-program-id": "spoofed-program",
          "x-partner-entry-slug": "bogus-public-entry",
          "x-scopes": "foundation:write,dispatch:write",
          "x-realm": "platform",
          "x-roles": "platform_admin",
          "x-role-families": "platform",
        },
      }),
      contextFor(["partner", "referral", "dashboard"]),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;

    expect(targetUrl.toString()).toBe(
      "http://localhost:3001/api/partner/referral/dashboard",
    );
    expect(headers.get("x-actor-type")).toBe("partner_api_key");
    expect(headers.get("x-actor-id")).toBe("partner-referral-demo-001");
    expect(headers.get("x-partner-id")).toBe("partner-referral-demo-001");
    expect(headers.get("x-tenant-id")).toBe("tenant-demo-001");
    expect(headers.get("x-partner-program-id")).toBe(
      "program-referral-community",
    );
    expect(headers.get("x-partner-entry-slug")).toBe("referral-demo-community");
    expect(headers.get("x-scopes")).toBe("billing:read");
    expect(headers.get("x-realm")).toBe("partner");
    expect(headers.get("x-roles")).toBe("partner");
    expect(headers.get("x-role-families")).toBe("partner");
  });
});
