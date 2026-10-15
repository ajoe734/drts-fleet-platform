import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET,
  PATCH,
  POST,
  PUT,
} from "@/app/control-plane-proxy/[...path]/route";

function contextFor(path: string[]) {
  return {
    params: Promise.resolve({ path }),
  };
}

function requestFor(
  method: "GET" | "POST" | "PUT" | "PATCH",
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

function verifiedSessionResponse(
  tenantId = "verified-tenant-001",
  scopes: string[] = ["tenant:read", "tenant:write"],
) {
  return new Response(
    JSON.stringify({
      data: {
        active: true,
        identity: {
          realm: "tenant",
          tenant_id: tenantId,
          actor_id: "tenant-admin-001",
          scopes,
        },
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
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

  it("forwards booking creation through the tenant backend seam with verified cookie session and no bootstrap headers", async () => {
    process.env.DRTS_INTERNAL_KEY = "dev-internal-key";
    process.env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID =
      "fixture-must-not-authorize";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(verifiedSessionResponse("verified-tenant-001"))
      .mockResolvedValueOnce(
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
          cookie: "drts_tenant_session=verified-cookie-session-token",
          Authorization: "Bearer spoofed-browser-bearer",
          "Content-Type": "application/json",
          "x-actor-id": "spoofed-browser-actor",
          "x-actor-type": "platform_admin",
          "x-drts-internal-key": "spoofed-browser-key",
          "x-realm": "platform",
          "x-roles": "platform_admin",
          "x-tenant-id": "verified-tenant-001",
        },
      }),
      contextFor(["api", "tenant", "bookings"]),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "http://localhost:3001/api/auth/session",
    );

    const [targetUrl, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    const headers = new Headers(init.headers);

    expect(targetUrl.toString()).toBe(
      "http://localhost:3001/api/tenant/bookings",
    );
    expect(init.method).toBe("POST");
    expect(await bodyText(init.body)).toBe(requestBody);
    expect(headers.get("authorization")).toBe(
      "Bearer verified-cookie-session-token",
    );
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-tenant-id")).toBe("verified-tenant-001");
    for (const forbidden of [
      "x-drts-internal-key",
      "x-realm",
      "x-actor-type",
      "x-actor-id",
      "x-roles",
      "x-role-families",
      "x-scopes",
      "x-auth-mode",
      "cookie",
    ]) {
      expect(headers.has(forbidden)).toBe(false);
    }
  });

  it("strips Cloud Run ingress Google ID token from Authorization header and replaces with verified session token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(verifiedSessionResponse("verified-tenant-001"))
      .mockResolvedValueOnce(
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

    const googlePayload = Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        aud: "https://enterprise-dispatch-web-12345.a.run.app",
        email: "sa@project.iam.gserviceaccount.com",
      }),
    ).toString("base64url");
    const googleIdToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${googlePayload}.fakeSignature`;

    const requestBody = JSON.stringify({
      businessDispatchSubtype: "enterprise_dispatch",
      costCenter: "CC-PRD-07",
    });
    const response = await POST(
      requestFor("POST", ["api", "tenant", "bookings"], {
        body: requestBody,
        headers: {
          cookie: "drts_tenant_session=verified-cookie-session-token",
          Authorization: `Bearer ${googleIdToken}`,
          "Content-Type": "application/json",
        },
      }),
      contextFor(["api", "tenant", "bookings"]),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("authorization")).toBe(
      "Bearer verified-cookie-session-token",
    );
    expect(headers.get("x-tenant-id")).toBe("verified-tenant-001");
    expect(headers.has("x-realm")).toBe(false);
    expect(headers.has("x-actor-type")).toBe(false);
    expect(headers.has("x-actor-id")).toBe(false);
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

  it("rejects missing sessions across GET, POST, PUT, PATCH, and cancel without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const getRes = await GET(
      requestFor("GET", ["tenant", "bookings"]),
      contextFor(["tenant", "bookings"]),
    );
    const postRes = await POST(
      requestFor("POST", ["tenant", "bookings"], {
        body: JSON.stringify({}),
      }),
      contextFor(["tenant", "bookings"]),
    );
    const putRes = await PUT(
      requestFor("PUT", ["tenant", "bookings", "booking-001"], {
        body: JSON.stringify({}),
      }),
      contextFor(["tenant", "bookings", "booking-001"]),
    );
    const patchRes = await PATCH(
      requestFor("PATCH", ["tenant", "bookings", "booking-001"], {
        body: JSON.stringify({}),
      }),
      contextFor(["tenant", "bookings", "booking-001"]),
    );
    const cancelRes = await POST(
      requestFor("POST", ["tenant", "bookings", "booking-001", "cancel"], {
        body: JSON.stringify({ reason: "Cancel" }),
      }),
      contextFor(["tenant", "bookings", "booking-001", "cancel"]),
    );

    expect(getRes.status).toBe(401);
    expect(postRes.status).toBe(401);
    expect(putRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
    expect(cancelRes.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", 401, { error: "TOKEN_EXPIRED" }, 401],
    ["revoked", 401, { error: "SESSION_REVOKED" }, 401],
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
    "does not forward booking queries or mutations with %s session",
    async (_name, upstreamStatus, body, expectedStatus) => {
      const fetchMock = vi.fn().mockImplementation(
        () =>
          Promise.resolve(
            new Response(JSON.stringify(body), {
              status: Number(upstreamStatus),
            }),
          ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const getResponse = await GET(
        requestFor("GET", ["tenant", "bookings"], {
          headers: { cookie: "drts_tenant_session=token" },
        }),
        contextFor(["tenant", "bookings"]),
      );
      const postResponse = await POST(
        requestFor("POST", ["tenant", "bookings"], {
          headers: { cookie: "drts_tenant_session=token" },
          body: JSON.stringify({ costCenter: "CC-PRD-07" }),
        }),
        contextFor(["tenant", "bookings"]),
      );
      expect(getResponse.status).toBe(expectedStatus);
      expect(postResponse.status).toBe(expectedStatus);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects another tenant selector even with a valid cookie session on both GET and POST", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(verifiedSessionResponse("tenant-a")),
    );
    vi.stubGlobal("fetch", fetchMock);
    const getResponse = await GET(
      requestFor("GET", ["tenant", "bookings"], {
        headers: {
          cookie: "drts_tenant_session=token",
          "x-tenant-id": "tenant-b",
        },
      }),
      contextFor(["tenant", "bookings"]),
    );
    const postResponse = await POST(
      requestFor("POST", ["tenant", "bookings"], {
        headers: {
          cookie: "drts_tenant_session=token",
          "x-tenant-id": "tenant-b",
        },
        body: JSON.stringify({ costCenter: "CC-PRD-07" }),
      }),
      contextFor(["tenant", "bookings"]),
    );
    expect(getResponse.status).toBe(403);
    expect(await getResponse.text()).toContain("TENANT_SCOPE_MISMATCH");
    expect(postResponse.status).toBe(403);
    expect(await postResponse.text()).toContain("TENANT_SCOPE_MISMATCH");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects mutations when verified session has only tenant:read scope", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(verifiedSessionResponse("tenant-a", ["tenant:read"])),
      );
    vi.stubGlobal("fetch", fetchMock);

    const postResponse = await POST(
      requestFor("POST", ["tenant", "bookings"], {
        headers: {
          cookie: "drts_tenant_session=read-only-token",
          "x-tenant-id": "tenant-a",
        },
        body: JSON.stringify({ costCenter: "CC-PRD-07" }),
      }),
      contextFor(["tenant", "bookings"]),
    );
    expect(postResponse.status).toBe(403);
    expect(await postResponse.text()).toContain("AUTH_SCOPE_DENIED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the declared booking update and cancellation lifecycle with verified session and without bootstrap headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(verifiedSessionResponse("tenant-a"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { bookingId: "booking-001" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(verifiedSessionResponse("tenant-a"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { bookingId: "booking-001" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const updateResponse = await PUT(
      requestFor("PUT", ["tenant", "bookings", "booking-001"], {
        headers: {
          cookie: "drts_tenant_session=verified-token",
          "x-tenant-id": "tenant-a",
        },
        body: JSON.stringify({ notes: "Updated pickup instructions" }),
      }),
      contextFor(["tenant", "bookings", "booking-001"]),
    );
    const cancelResponse = await POST(
      requestFor("POST", ["tenant", "bookings", "booking-001", "cancel"], {
        headers: {
          cookie: "drts_tenant_session=verified-token",
          "x-tenant-id": "tenant-a",
        },
        body: JSON.stringify({ reason: "Cancelled from Enterprise Dispatch" }),
      }),
      contextFor(["tenant", "bookings", "booking-001", "cancel"]),
    );

    expect(updateResponse.status).toBe(200);
    expect(cancelResponse.status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:3001/api/auth/session",
      "http://localhost:3001/api/tenant/bookings/booking-001",
      "http://localhost:3001/api/auth/session",
      "http://localhost:3001/api/tenant/bookings/booking-001/cancel",
    ]);
    const updateHeaders = new Headers(
      (fetchMock.mock.calls[1]![1] as RequestInit).headers,
    );
    const cancelHeaders = new Headers(
      (fetchMock.mock.calls[3]![1] as RequestInit).headers,
    );
    expect(updateHeaders.get("authorization")).toBe("Bearer verified-token");
    expect(updateHeaders.get("x-tenant-id")).toBe("tenant-a");
    expect(updateHeaders.has("x-realm")).toBe(false);
    expect(updateHeaders.has("x-actor-type")).toBe(false);
    expect(updateHeaders.has("x-actor-id")).toBe(false);
    expect(cancelHeaders.get("authorization")).toBe("Bearer verified-token");
    expect(cancelHeaders.get("x-tenant-id")).toBe("tenant-a");
    expect(cancelHeaders.has("x-realm")).toBe(false);
    expect(cancelHeaders.has("x-actor-type")).toBe(false);
    expect(cancelHeaders.has("x-actor-id")).toBe(false);
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
