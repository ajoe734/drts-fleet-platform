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

import { GET as proxyGet } from "@/app/control-plane-proxy/[...path]/route";
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
