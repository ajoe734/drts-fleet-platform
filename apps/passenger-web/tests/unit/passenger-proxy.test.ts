import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "../../app/control-plane-proxy/[...path]/route";

const ACCESS_TOKEN = "a".repeat(43);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("passenger control-plane proxy", () => {
  it("rejects non-passenger and malformed-token paths without forwarding", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);

    const adminResponse = await GET(
      new NextRequest(
        "http://passenger.local/control-plane-proxy/platform-admin/users",
      ),
      {
        params: Promise.resolve({
          path: ["platform-admin", "users"],
        }),
      },
    );
    const malformedTokenResponse = await GET(
      new NextRequest(
        "http://passenger.local/control-plane-proxy/passenger-rides/demo-token",
      ),
      {
        params: Promise.resolve({
          path: ["passenger-rides", "demo-token"],
        }),
      },
    );

    expect(adminResponse.status).toBe(404);
    expect(malformedTokenResponse.status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("forwards only the allowed passenger action and strips identity headers", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "cancelled" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    const request = new NextRequest(
      `http://passenger.local/control-plane-proxy/passenger-rides/${ACCESS_TOKEN}/cancel`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-actor-id": "forged-actor",
          "x-realm": "platform",
        },
        body: JSON.stringify({ reason: "plans_changed" }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({
        path: ["passenger-rides", ACCESS_TOKEN, "cancel"],
      }),
    });

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    const [target, init] = upstreamFetch.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe(
      `http://localhost:3001/api/passenger-rides/${ACCESS_TOKEN}/cancel`,
    );
    expect(new Headers(init.headers).has("x-actor-id")).toBe(false);
    expect(new Headers(init.headers).has("x-realm")).toBe(false);
  });
});
