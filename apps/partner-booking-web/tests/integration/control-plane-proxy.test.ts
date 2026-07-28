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
    `http://partner.example/control-plane-proxy/${path.join("/")}`,
    {
      ...init,
      method,
    },
  );

  return new NextRequest(request);
}

describe("partner-booking control-plane proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.DRTS_API_URL;
    delete process.env.DRTS_API_AUTH_AUDIENCE;
    delete process.env.DRTS_INTERNAL_KEY;
  });

  it("forwards only partner booking calls with partner realm headers", async () => {
    process.env.DRTS_INTERNAL_KEY = "dev-internal-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { bookingId: "booking-001" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      requestFor("GET", ["tenant", "bookings", "booking-001"], {
        headers: {
          Authorization: "Bearer partner-session-token",
          "x-drts-internal-key": "spoofed-browser-key",
          "x-realm": "platform",
          "x-roles": "platform_admin",
          "x-tenant-id": "tenant-001",
        },
      }),
      contextFor(["tenant", "bookings", "booking-001"]),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [targetUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Headers;

    expect(targetUrl.toString()).toBe(
      "http://localhost:3001/api/tenant/bookings/booking-001",
    );
    expect(headers.get("authorization")).toBe("Bearer partner-session-token");
    expect(headers.get("x-drts-internal-key")).toBe("dev-internal-key");
    expect(headers.get("x-realm")).toBe("partner");
    expect(headers.get("x-roles")).toBeNull();
    expect(headers.get("x-tenant-id")).toBe("tenant-001");
  });

  it("blocks management endpoints before they reach the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      requestFor("GET", ["ops", "partner", "eligibility", "reviews"]),
      contextFor(["ops", "partner", "eligibility", "reviews"]),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects path traversal before target URL construction", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      requestFor("GET", ["tenant", "bookings", "..", "ops"]),
      contextFor(["tenant", "bookings", "..", "ops"]),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows booking creation but not mutation routes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { bookingId: "booking-001" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const createResponse = await POST(
      requestFor("POST", ["partner", "bookings"], {
        body: JSON.stringify({ passenger: { name: "Test Rider" } }),
      }),
      contextFor(["partner", "bookings"]),
    );
    const mutationResponse = await POST(
      requestFor("POST", ["partner", "bookings", "booking-001", "cancel"]),
      contextFor(["partner", "bookings", "booking-001", "cancel"]),
    );

    expect(createResponse.status).toBe(200);
    expect(mutationResponse.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards partner order queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { orderId: "ord-001" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const orderResponse = await GET(
      requestFor("GET", ["partner", "orders", "ord-001"]),
      contextFor(["partner", "orders", "ord-001"]),
    );

    expect(orderResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks partner ingress handoff before it reaches the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      requestFor("POST", ["partner", "ingress", "handoff"], {
        body: JSON.stringify({
          entrySlug: "ctbc",
          apiKey: "pk_test",
          partnerUserRef: "user-001",
        }),
      }),
      contextFor(["partner", "ingress", "handoff"]),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
