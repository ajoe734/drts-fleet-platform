import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PassengerBookingClient } from "../../../packages/passenger-client/src/booking/client";
import { PassengerApiError } from "../../../packages/passenger-client/src/auth/errors";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";

const origin = "https://ride.example.test";
let upstream: ReturnType<
  typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>
>;
export function throughBff(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) {
  const target = new URL(url, origin);
  const method = (init?.method ?? "GET") as "GET" | "POST" | "PATCH";
  const request = new NextRequest(target, {
    ...init,
    method,
    headers: {
      ...init?.headers,
      cookie: "pax_session=synthetic-passenger-session",
      origin,
    },
  });
  return bff[method](request, {
    params: Promise.resolve({
      path: target.pathname.replace("/api/passenger-app/", "").split("/"),
    }),
  });
}
let client: PassengerBookingClient;
beforeEach(() => {
  vi.stubEnv("DRTS_API_URL", "https://api.example.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      Response.json({
        data: { minLeadTimeMinutes: 30, requireSmsVerification: false },
        meta: { traceId: "unit-trace" },
      }),
  );
  vi.stubGlobal("fetch", upstream);
  client = new PassengerBookingClient({ baseUrl: "", fetchFn: throughBff });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("real portable booking client → actual bounded Next BFF", () => {
  it("requests the delivered canonical settings without inventing a fallback", async () => {
    expect(await client.getSettings()).toEqual({
      minLeadTimeMinutes: 30,
      requireSmsVerification: false,
    });
    expect(upstream.mock.calls[0]![0]).toBe(
      "https://api.example.test/api/passenger-app/settings",
    );
  });
  it.each([0, 15, 30])("preserves configured lead %s", async (lead) => {
    upstream.mockImplementation(async () =>
      Response.json({
        data: { minLeadTimeMinutes: lead, requireSmsVerification: true },
      }),
    );
    expect((await client.getSettings()).minLeadTimeMinutes).toBe(lead);
  });
  it("blocks malformed settings", async () => {
    upstream.mockImplementation(async () => Response.json({ data: {} }));
    await expect(client.getSettings()).rejects.toThrow(
      "booking_settings_unavailable",
    );
  });
  it.each([401, 404, 500])(
    "retains settings HTTP %s instead of assuming policy",
    async (status) => {
      upstream.mockImplementation(async () =>
        Response.json(
          { error: { code: "settings_unavailable", message: "unavailable" } },
          { status },
        ),
      );
      await expect(client.getSettings()).rejects.toMatchObject({
        status,
        code: "settings_unavailable",
      });
    },
  );
  it.each(["quote_expired", "pending_payment_block"])(
    "retains nested original domain error %s",
    async (code) => {
      upstream.mockImplementation(async () =>
        Response.json(
          {
            error: {
              code,
              message: "message",
              details: { reason: "synthetic" },
              retryable: true,
            },
          },
          { status: 409 },
        ),
      );
      const command = {
        scheduledAt: "2026-10-11T12:00:00Z",
        origin: { lat: 25, lng: 121 },
        destination: { lat: 25.1, lng: 121.1 },
        paymentMethodId: "synthetic-owned-method",
        fareSnapshotId: "synthetic-owned-quote",
        passengerConfirmedAt: "2026-10-11T10:00:00Z",
      };
      await expect(client.createRide(command)).rejects.toEqual(
        new PassengerApiError(
          409,
          code,
          "message",
          { reason: "synthetic" },
          true,
        ),
      );
      const [, options] = upstream.mock.calls[0]! as unknown as [
        string,
        RequestInit,
      ];
      expect(await new Response(options.body).json()).toEqual(command);
      expect(new Headers(options.headers).get("authorization")).toBe(
        "Bearer synthetic-passenger-session",
      );
    },
  );
  it("unwraps the genuine camelCase geo envelope and retains selected candidates", async () => {
    const candidates = [
      {
        candidateId: "synthetic-candidate",
        displayName: "上車地址",
        address: "台北車站",
        location: { lat: 25, lng: 121 },
        provider: "synthetic-http",
        confidence: "exact",
      },
    ];
    upstream.mockImplementation(async () =>
      Response.json({
        data: {
          candidates,
          provider: "synthetic-http",
          generatedAt: "2026-10-11T10:00:00Z",
        },
        meta: { traceId: "unit" },
      }),
    );
    expect(
      (await client.search({ q: "台北車站", limit: 5 })).candidates,
    ).toEqual(candidates);
    const url = String(upstream.mock.calls[0]![0]);
    expect(new URL(url).pathname).toBe("/api/geo/search");
    expect(new URL(url).searchParams.get("q")).toBe("台北車站");
    expect(new URL(url).searchParams.get("surface")).toBe("passenger_entry");
    expect(upstream).toHaveBeenCalledTimes(1); // No fabricated/forbidden health probe.
  });
  it.each(["resolve", "reverse", "route"] as const)(
    "routes only formal geo %s commands",
    async (operation) => {
      if (operation === "resolve")
        await client.resolve({
          addressText: "台北車站",
          candidateId: "synthetic-candidate",
          surface: "passenger_entry",
        });
      if (operation === "reverse")
        await client.reverse({
          location: { lat: 25, lng: 121 },
          surface: "passenger_entry",
        });
      if (operation === "route")
        await client.route({
          origin: { lat: 25, lng: 121 },
          destination: { lat: 25.1, lng: 121.1 },
        });
      expect(upstream.mock.calls[0]![0]).toBe(
        `https://api.example.test/api/geo/${operation}`,
      );
    },
  );
  it.each([
    "geo/health",
    "geo/evaluate",
    "geo/admin",
    "geo/search/extra",
    "geo/%252e%252e",
    "geo/%252fresolve",
  ])(
    "denies non-booking/unsafe path %s without upstream reads",
    async (path) => {
      const response = await throughBff(`/api/passenger-app/${path}`);
      expect(response.status).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it("does not allow arbitrary method substitution", async () => {
    const response = await throughBff("/api/passenger-app/geo/search", {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
