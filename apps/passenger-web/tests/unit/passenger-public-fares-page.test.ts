/** @vitest-environment jsdom */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassengerRideAuthorityView } from "@drts/contracts";

import {
  DELETE as proxyDelete,
  GET as proxyGet,
  POST as proxyPost,
} from "@/app/control-plane-proxy/[...path]/route";
import { PassengerRidePage } from "@/components/passenger-ride-page";

const token = "L".repeat(48);
const browserOrigin = "http://legacy-passenger-web.test";
const upstreamOrigin = "http://legacy-public-fare-upstream.test";
const publicFarePath = "/control-plane-proxy/passenger-app/fares";
const upstreamFarePath = "/api/passenger-app/fares";
const ridePath = `/control-plane-proxy/passenger-rides/${token}`;

// Producer-compatible snake_case HTTP data, deliberately different from the
// legacy fixture constants. These synthetic transport values are not a claim
// about a real jurisdiction's tariff, and are never derived from a ride quote.
const publishedVersion = {
  version: "synthetic-transport-test-v2",
  effective_at: "2025-01-02T00:00:00+08:00",
  base_fare: 95,
  base_distance_meters: 1500,
  distance_rate: 7,
  distance_increment_meters: 250,
  delay_rate: 9,
  delay_increment_seconds: 90,
  night_surcharge: 30,
  night_surcharge_unit: "TWD_per_trip",
  night_application: "any_overlap",
  night_surcharge_window_start: "22:30",
  night_surcharge_window_end: "05:30",
  additional_fees: { 測試附加費: 15, access_fee: 12 },
};

function publicFareResponse() {
  return Response.json({ data: { current_version: publishedVersion } });
}

function authority(): PassengerRideAuthorityView {
  return {
    order: {
      orderId: "legacy-public-fare-order",
      orderNo: "LEGACY-PUBLIC-FARE-001",
      status: "created",
      timingMode: "on_demand",
      requestedPickupAt: "2026-11-05T00:00:00.000Z",
      pickup: { address: "測試上車地點" },
      dropoff: { address: "測試下車地點" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: null,
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: false,
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}

type Listener = (event: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Listener[]>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  close() {
    this.closed = true;
  }
}

type ResponseFactory = () => Response | Promise<Response>;

function installTransport(publicResponses: ResponseFactory[]) {
  const browserPaths: string[] = [];
  const upstreamReads: Array<{
    path: string;
    method: string;
    cache: RequestCache | undefined;
  }> = [];
  const pendingResponses = [...publicResponses];
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const address =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(address, browserOrigin);
      if (url.origin === browserOrigin) {
        browserPaths.push(url.pathname);
        // Use the actual Next proxy without opening a server. The only
        // supplied HTTP response is its upstream network boundary below.
        const request = new NextRequest(url.href, {
          method: init?.method ?? "GET",
          headers: init?.headers ?? {},
        });
        const path = url.pathname
          .replace(/^\/control-plane-proxy\//, "")
          .split("/");
        return proxyGet(request, { params: Promise.resolve({ path }) });
      }
      if (url.origin === upstreamOrigin) {
        upstreamReads.push({
          path: url.pathname,
          method: init?.method ?? "GET",
          cache: init?.cache,
        });
        if (url.pathname === upstreamFarePath) {
          const response = pendingResponses.shift();
          if (!response) throw new Error("Unexpected extra public fare read");
          return response();
        }
        // Let the current incorrect fare route finish its real legacy ride
        // read so RED exposes that dependency, rather than a mock-path error.
        if (url.pathname === `/api/passenger-rides/${token}`) {
          return Response.json({ data: authority() });
        }
      }
      throw new Error(`Unexpected HTTP boundary: ${url.origin}${url.pathname}`);
    },
  );
  vi.stubGlobal("fetch", transport);
  return { browserPaths, upstreamReads, transport };
}

function mountFares() {
  return render(
    React.createElement(PassengerRidePage, {
      token,
      kind: "fares",
      searchParams: { mode: "live" },
    }),
  );
}

function expectRow(label: string, value: string) {
  const row = screen.getByText(label).parentElement!;
  expect(within(row).getByText(value)).toBeTruthy();
}

function expectNoRidePresentation() {
  expect(screen.queryByText("正在為您安排合適的車輛")).toBeNull();
  expect(screen.queryByText("您的車輛與駕駛")).toBeNull();
  expect(screen.queryByText("預估路線與車資")).toBeNull();
  expect(screen.queryByText(/預計\s*\d+\s*分鐘抵達/)).toBeNull();
  for (const name of ["聯絡司機", "聯絡客服", "取消行程"]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  expect(FakeEventSource.instances).toHaveLength(0);
}

function expectOnlyPublicReads(
  io: ReturnType<typeof installTransport>,
  count: number,
) {
  expect(io.browserPaths).toEqual(Array(count).fill(publicFarePath));
  expect(io.upstreamReads).toEqual(
    Array.from({ length: count }, () => ({
      path: upstreamFarePath,
      method: "GET",
      cache: "no-store",
    })),
  );
  expect(io.browserPaths).not.toContain(ridePath);
  expect(FakeEventSource.instances).toHaveLength(0);
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubEnv("DRTS_API_URL", upstreamOrigin);
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  FakeEventSource.instances = [];
});

describe("legacy public fares through the actual Page and proxy", () => {
  it("forwards the exact public fare GET to the existing upstream endpoint", async () => {
    const io = installTransport([publicFareResponse]);
    const response = await proxyGet(
      new NextRequest(`${browserOrigin}${publicFarePath}`),
      { params: Promise.resolve({ path: ["passenger-app", "fares"] }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { current_version: publishedVersion },
    });
    expect(io.upstreamReads).toEqual([
      { path: upstreamFarePath, method: "GET", cache: "no-store" },
    ]);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("renders returned public tariff data without private ride reads, SSE or fixture rates", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const io = installTransport([() => pending]);
    mountFares();
    try {
      await waitFor(() => {
        expect(io.browserPaths.length).toBeGreaterThan(0);
      });
      expect(io.browserPaths).toEqual([publicFarePath]);
      expect(screen.getByText(/正在.*公開費率/)).toBeTruthy();
      expect(screen.queryAllByText(/NT\$/)).toHaveLength(0);
    } finally {
      await act(async () => {
        release(publicFareResponse());
      });
    }

    await screen.findByText("起程運價（1.5 公里）");
    expectRow("起程運價（1.5 公里）", "NT$ 95");
    expectRow("續程運價（每 250 公尺）", "NT$ 7");
    expectRow("延滯計時（每 90 秒）", "NT$ 9");
    expectRow("夜間加成（22:30–05:30）", "每趟加 NT$ 30");
    expectRow("測試附加費", "NT$ 15");
    expectRow("access_fee", "NT$ 12");
    expect(screen.getByText("行程與夜間時段重疊時適用")).toBeTruthy();
    expect(screen.getByText(/synthetic-transport-test-v2/)).toBeTruthy();
    const effective = document.querySelector("time[datetime]");
    expect(effective?.getAttribute("datetime")).toBe(
      publishedVersion.effective_at,
    );
    expect(effective?.textContent).toMatch(/2025|114/);
    expect(screen.queryByText(/F-2026-03|1130042|\+20%/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "返回行程" }).getAttribute("href"),
    ).toBe(`/ride/${token}`);
    expectNoRidePresentation();
    expectOnlyPublicReads(io, 1);
  });

  it("shows an ordinary unavailable read then retries the real public GET successfully", async () => {
    const io = installTransport([
      () =>
        Response.json(
          {
            error: {
              code: "unavailable",
              message: "No approved effective fare version is available.",
            },
          },
          { status: 503 },
        ),
      publicFareResponse,
    ]);
    mountFares();
    await waitFor(() => {
      expect(io.browserPaths.length).toBeGreaterThan(0);
    });
    expect(io.browserPaths).toEqual([publicFarePath]);
    expect(
      await screen.findByText("目前無法取得公開費率，請稍後重試。"),
    ).toBeTruthy();
    expect(screen.queryAllByText(/NT\$/)).toHaveLength(0);
    expect(screen.queryByText("已生效")).toBeNull();
    expectNoRidePresentation();

    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    await screen.findByText("起程運價（1.5 公里）");
    expectRow("起程運價（1.5 公里）", "NT$ 95");
    expect(screen.queryByText("目前無法取得公開費率，請稍後重試。")).toBeNull();
    expectNoRidePresentation();
    expectOnlyPublicReads(io, 2);
  });
});

describe("public fare proxy request boundaries", () => {
  it.each([
    ["POST", proxyPost],
    ["DELETE", proxyDelete],
  ] as const)(
    "rejects the exact fare path for %s without HTTP calls",
    async (method, handler) => {
      const transport = vi.fn();
      vi.stubGlobal("fetch", transport);
      // Even a configured upstream identity must not be minted for a denied path.
      vi.stubEnv(
        "DRTS_API_AUTH_AUDIENCE",
        "https://synthetic-api-audience.test",
      );

      const response = await handler(
        new NextRequest(`${browserOrigin}${publicFarePath}`, { method }),
        { params: Promise.resolve({ path: ["passenger-app", "fares"] }) },
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "PASSENGER_PROXY_PATH_NOT_ALLOWED",
      });
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing fare segment", ["passenger-app"]],
    ["singular fare lookalike", ["passenger-app", "fare"]],
    ["fare-prefix lookalike", ["passenger-app", "fares-preview"]],
    ["extra fare child", ["passenger-app", "fares", "current"]],
    ["empty segment", ["passenger-app", ""]],
    ["current-directory segment", ["passenger-app", "."]],
    ["parent-directory segment", ["passenger-app", ".."]],
    ["slash-bearing segment", ["passenger-app", "fares/current"]],
    ["backslash-bearing segment", ["passenger-app", "fares\\current"]],
  ])("rejects %s without HTTP calls", async (_label, path) => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://synthetic-api-audience.test");

    const response = await proxyGet(
      new NextRequest(`${browserOrigin}${publicFarePath}`),
      // Supply decoded catch-all params directly so URL normalization cannot
      // erase the unsafe segment before the actual route inspects it.
      { params: Promise.resolve({ path: path as string[] }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "PASSENGER_PROXY_PATH_NOT_ALLOWED",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("strips browser identity and private headers from the exact public GET while retaining ordinary headers and query", async () => {
    const forgedHeaders = {
      cookie: "synthetic-session=browser-only",
      "x-drts-internal-key": "synthetic-browser-internal-key",
      "x-drts-google-id-token": "synthetic-browser-google-token",
      "x-serverless-authorization": "Bearer synthetic-browser-invoker",
      "x-actor-id": "synthetic-forged-actor",
      "x-actor-type": "system",
      "x-auth-mode": "internal",
      "x-realm": "platform",
      "x-role-families": "platform",
      "x-roles": "admin",
      "x-scopes": "*",
      "x-forwarded-for": "192.0.2.9",
      "x-forwarded-host": "synthetic-forged-host.test",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
    };
    const transport = vi.fn().mockResolvedValue(publicFareResponse());
    vi.stubGlobal("fetch", transport);

    const response = await proxyGet(
      new NextRequest(
        `${browserOrigin}${publicFarePath}?locale=zh-TW&version=approved`,
        {
          headers: {
            ...forgedHeaders,
            accept: "application/json",
            "accept-language": "zh-TW",
            "x-request-id": "synthetic-public-fare-read",
          },
        },
      ),
      { params: Promise.resolve({ path: ["passenger-app", "fares"] }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { current_version: publishedVersion },
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [target, init] = transport.mock.calls[0] as [URL, RequestInit];
    expect(target.href).toBe(
      `${upstreamOrigin}${upstreamFarePath}?locale=zh-TW&version=approved`,
    );
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("manual");
    const headers = new Headers(init.headers);
    for (const name of Object.keys(forgedHeaders)) {
      expect(headers.has(name), name).toBe(false);
    }
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("accept-language")).toBe("zh-TW");
    expect(headers.get("x-request-id")).toBe("synthetic-public-fare-read");
  });

  it.each([
    {
      label: "configured audience",
      origin: upstreamOrigin,
      configuredAudience: "https://synthetic-api-audience.test",
    },
    {
      label: "Cloud Run origin audience",
      origin: "https://synthetic-passenger-api.a.run.app",
      configuredAudience: "",
    },
  ])(
    "uses server-minted upstream identity for the public GET with $label",
    async ({ origin, configuredAudience }) => {
      vi.stubEnv("DRTS_API_URL", origin);
      vi.stubEnv("DRTS_API_AUTH_AUDIENCE", configuredAudience);
      const identityToken = "synthetic-metadata-identity-token";
      const transport = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          );
          if (url.hostname === "metadata.google.internal") {
            expect(url.pathname).toBe(
              "/computeMetadata/v1/instance/service-accounts/default/identity",
            );
            expect(url.searchParams.get("audience")).toBe(
              configuredAudience || origin,
            );
            expect(url.searchParams.get("format")).toBe("full");
            expect(new Headers(init?.headers).get("Metadata-Flavor")).toBe(
              "Google",
            );
            expect(init?.cache).toBe("no-store");
            return new Response(identityToken);
          }
          if (url.origin === origin && url.pathname === upstreamFarePath) {
            return publicFareResponse();
          }
          throw new Error(
            `Unexpected HTTP boundary: ${url.origin}${url.pathname}`,
          );
        },
      );
      vi.stubGlobal("fetch", transport);

      const response = await proxyGet(
        new NextRequest(`${browserOrigin}${publicFarePath}`, {
          headers: {
            "x-drts-google-id-token": "synthetic-browser-google-token",
            "x-serverless-authorization": "Bearer synthetic-browser-invoker",
          },
        }),
        { params: Promise.resolve({ path: ["passenger-app", "fares"] }) },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: { current_version: publishedVersion },
      });
      expect(transport).toHaveBeenCalledTimes(2);
      const [target, init] = transport.mock.calls[1]!;
      expect(String(target)).toBe(`${origin}${upstreamFarePath}`);
      expect(init?.method).toBe("GET");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-drts-google-id-token")).toBe(identityToken);
      expect(headers.get("x-serverless-authorization")).toBe(
        `Bearer ${identityToken}`,
      );
    },
  );
});
