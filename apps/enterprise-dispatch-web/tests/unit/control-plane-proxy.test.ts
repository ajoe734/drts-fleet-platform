import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST, PUT } from "@/app/control-plane-proxy/[...path]/route";

function contextFor(path: string[]) {
  return {
    params: Promise.resolve({ path }),
  };
}

function requestFor(
  method: "GET" | "POST" | "PUT",
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

  it("reads bookings using the cookie session's verified tenant, without bootstrap identity", async () => {
    process.env.DRTS_API_URL = "https://api.dev.example";
    process.env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID =
      "fixture-must-not-authorize";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              active: true,
              identity: { realm: "tenant", tenant_id: "verified-tenant" },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { bookingId: "booking-001" } }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(
      requestFor("GET", ["tenant", "bookings", "booking-001"], {
        headers: {
          cookie: "drts_tenant_session=real-cookie-token",
          "x-tenant-id": "verified-tenant",
          "x-actor-id": "spoof",
          "x-realm": "platform",
          "x-drts-authorization": "Bearer spoof",
        },
      }),
      contextFor(["tenant", "bookings", "booking-001"]),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.dev.example/api/auth/session",
    );
    expect(
      new Headers(fetchMock.mock.calls[0]![1].headers).get("authorization"),
    ).toBe("Bearer real-cookie-token");
    const [targetUrl, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(targetUrl.toString()).toBe(
      "https://api.dev.example/api/tenant/bookings/booking-001",
    );
    expect(headers.get("authorization")).toBe("Bearer real-cookie-token");
    expect(headers.get("x-tenant-id")).toBe("verified-tenant");
    for (const name of [
      "x-realm",
      "x-actor-type",
      "x-actor-id",
      "x-drts-authorization",
      "cookie",
    ])
      expect(headers.has(name)).toBe(false);
  });

  it("rejects a missing session without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(
      requestFor("GET", ["tenant", "bookings"]),
      contextFor(["tenant", "bookings"]),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", 401, { error: "TOKEN_EXPIRED" }, 401],
    [
      "wrong realm",
      200,
      {
        data: {
          active: true,
          identity: { realm: "ops", tenant_id: "tenant-a" },
        },
      },
      403,
    ],
    [
      "inactive",
      200,
      {
        data: {
          active: false,
          identity: { realm: "tenant", tenant_id: "tenant-a" },
        },
      },
      403,
    ],
    [
      "missing tenant",
      200,
      { data: { active: true, identity: { realm: "tenant" } } },
      403,
    ],
    ["auth outage", 503, { error: "DOWN" }, 503],
  ])(
    "does not forward a booking query with %s session",
    async (_name, upstreamStatus, body, expectedStatus) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(body), {
            status: Number(upstreamStatus),
          }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const response = await GET(
        requestFor("GET", ["tenant", "bookings"], {
          headers: { cookie: "drts_tenant_session=token" },
        }),
        contextFor(["tenant", "bookings"]),
      );
      expect(response.status).toBe(expectedStatus);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects another tenant selector even with a valid cookie session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              active: true,
              identity: { realm: "tenant", tenant_id: "tenant-a" },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(
      requestFor("GET", ["tenant", "bookings"], {
        headers: {
          cookie: "drts_tenant_session=token",
          "x-tenant-id": "tenant-b",
        },
      }),
      contextFor(["tenant", "bookings"]),
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("TENANT_SCOPE_MISMATCH");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the declared booking update and cancellation lifecycle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { bookingId: "booking-001" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const updateResponse = await PUT(
      requestFor("PUT", ["tenant", "bookings", "booking-001"], {
        body: JSON.stringify({ notes: "Updated pickup instructions" }),
      }),
      contextFor(["tenant", "bookings", "booking-001"]),
    );
    const cancelResponse = await POST(
      requestFor("POST", ["tenant", "bookings", "booking-001", "cancel"], {
        body: JSON.stringify({ reason: "Cancelled from Enterprise Dispatch" }),
      }),
      contextFor(["tenant", "bookings", "booking-001", "cancel"]),
    );

    expect(updateResponse.status).toBe(200);
    expect(cancelResponse.status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:3001/api/tenant/bookings/booking-001",
      "http://localhost:3001/api/tenant/bookings/booking-001/cancel",
    ]);
    expect(
      fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method),
    ).toEqual(["PUT", "POST"]);
  });

  it("blocks paths outside the declared booking lifecycle before they reach the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const invalidActionResponse = await POST(
      requestFor("POST", ["tenant", "bookings", "booking-001", "escalate"]),
      contextFor(["tenant", "bookings", "booking-001", "escalate"]),
    );
    const traversalResponse = await GET(
      requestFor("GET", ["api", "tenant", "bookings", "..", "ops"]),
      contextFor(["api", "tenant", "bookings", "..", "ops"]),
    );

    expect(invalidActionResponse.status).toBe(404);
    expect(traversalResponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
