import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/control-plane-proxy/[...path]/route";

function contextFor(path: string[]) {
  return {
    params: Promise.resolve({ path }),
  };
}

function requestFor(
  method: "GET" | "POST",
  path: string[],
  init?: RequestInit,
) {
  const request = new Request(
    `http://enterprise.example/control-plane-proxy/${path.join("/")}`,
    {
      ...init,
      method,
    },
  );

  return new NextRequest(request);
}

async function bodyText(body: BodyInit | null | undefined) {
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  return String(body ?? "");
}

describe("enterprise-dispatch control-plane proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DRTS_API_URL;
    delete process.env.DRTS_API_AUTH_AUDIENCE;
    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID;
    delete process.env.DRTS_ENTERPRISE_DISPATCH_ACTOR_ID;
  });

  it("forwards booking creation through the tenant backend seam with body and controlled identity", async () => {
    process.env.DRTS_INTERNAL_KEY = "dev-internal-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            bookingId: "booking-001",
            orderId: "order-001",
            status: "approval_required",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const requestBody = JSON.stringify({
      businessDispatchSubtype: "enterprise_dispatch",
      costCenter: "CC-PRD-07",
    });
    const response = await POST(
      requestFor("POST", ["api", "tenant", "bookings"], {
        body: requestBody,
        headers: {
          Authorization: "Bearer enterprise-session-token",
          "Content-Type": "application/json",
          "x-actor-id": "spoofed-browser-actor",
          "x-actor-type": "platform_admin",
          "x-drts-internal-key": "spoofed-browser-key",
          "x-realm": "platform",
          "x-roles": "platform_admin",
          "x-tenant-id": "spoofed-tenant",
        },
      }),
      contextFor(["api", "tenant", "bookings"]),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;

    expect(targetUrl.toString()).toBe(
      "http://localhost:3001/api/tenant/bookings",
    );
    expect(init.method).toBe("POST");
    expect(await bodyText(init.body)).toBe(requestBody);
    expect(headers.get("authorization")).toBe(
      "Bearer enterprise-session-token",
    );
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-drts-internal-key")).toBe("dev-internal-key");
    expect(headers.get("x-realm")).toBe("tenant");
    expect(headers.get("x-actor-type")).toBe("tenant_admin");
    expect(headers.get("x-actor-id")).toBe("enterprise-dispatch-web");
    expect(headers.get("x-tenant-id")).toBe(
      "10000000-0000-0000-0000-000000000201",
    );
    expect(headers.get("x-roles")).toBeNull();
  });

  it("reads created booking records back through the same tenant seam", async () => {
    process.env.DRTS_API_URL = "https://api.dev.example";
    process.env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID = "tenant-e2e-001";
    process.env.DRTS_ENTERPRISE_DISPATCH_ACTOR_ID = "enterprise-e2e";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { bookingId: "booking-001" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      requestFor("GET", ["tenant", "bookings", "booking-001"]),
      contextFor(["tenant", "bookings", "booking-001"]),
    );

    expect(response.status).toBe(200);
    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;

    expect(targetUrl.toString()).toBe(
      "https://api.dev.example/api/tenant/bookings/booking-001",
    );
    expect(init.method).toBe("GET");
    expect(headers.get("x-realm")).toBe("tenant");
    expect(headers.get("x-actor-id")).toBe("enterprise-e2e");
    expect(headers.get("x-tenant-id")).toBe("tenant-e2e-001");
  });

  it("blocks silent mutation seams before they reach the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const cancelResponse = await POST(
      requestFor("POST", ["tenant", "bookings", "booking-001", "cancel"]),
      contextFor(["tenant", "bookings", "booking-001", "cancel"]),
    );
    const traversalResponse = await GET(
      requestFor("GET", ["api", "tenant", "bookings", "..", "ops"]),
      contextFor(["api", "tenant", "bookings", "..", "ops"]),
    );

    expect(cancelResponse.status).toBe(404);
    expect(traversalResponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
