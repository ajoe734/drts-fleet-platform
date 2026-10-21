// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "../referral-cancellation-window-canonical-20261020/mounted-dom";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const orderId = "a0000000-0000-4000-8000-000000000031";

function context(demoTrip: boolean) {
  return {
    entry: {
      entrySlug: "sim-entry",
      displayName: "測試社區",
      entryHost: "partner.example.test",
      brandingMetadata: {},
    },
    session: {
      handoffId: "unit-handoff",
      recoveryScope: "unit-scope",
      identityActive: true,
      partnerEntrySlug: "sim-entry",
      entryHost: "partner.example.test",
    },
    state: "handoff",
    screen: "trip",
    requestedScreen: "trip",
    handoff: { apiKey: null, partnerUserRef: null },
    decision: { requestedEntryHost: "partner.example.test", block: false },
    accent: "#123456",
    strings: {
      appName: "社區",
      displayName: "測試社區",
      supportPhone: "0800-000-000",
    },
    issues: [],
    fallbackEntry: null,
    demoTrip,
  };
}

function trip(status: string, driverName: string | null = null) {
  return {
    orderId,
    orderNo: "N-DEMO",
    status,
    statusCode: status,
    pickupAddress: "新北市板橋區縣民大道二段7號",
    dropoffAddress: "臺北市信義區市府路1號",
    vehicleType: "comfort",
    driverName,
    plateNumber: driverName ? "TEST-B001" : null,
  };
}

function live(status: string, driverName: string | null = null) {
  return {
    activeTrip: { active: true, trip: trip(status, driverName) },
    history: null,
    receipt: null,
    selectedOrderId: orderId,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(
  onDemo: (url: string, init?: RequestInit) => Response,
  activeTrip = trip("created"),
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith("/api/referral/demo-trip/")) return onDemo(url, init);
      return Response.json({
        ok: true,
        data: { active: true, trip: activeTrip },
      });
    }),
  );
  return calls;
}

it("shows no test controls outside demo mode", () => {
  stubFetch(() => Response.json({ ok: true, data: {} }));
  render(
    <PassengerEmbed
      context={context(false) as never}
      liveData={live("created") as never}
    />,
  );
  expect(screen.queryByText("測試模式（僅供展示）")).toBeNull();
  expect(screen.queryByText("測試：指派測試司機")).toBeNull();
});

it("assigns the test driver for a trip still waiting for dispatch", async () => {
  const calls = stubFetch(() =>
    Response.json({
      ok: true,
      data: { orderId, status: "assigned", driverId: "d", simulated: true },
    }),
  );
  render(
    <PassengerEmbed
      context={context(true) as never}
      liveData={live("created") as never}
    />,
  );
  expect(screen.getByText("測試模式（僅供展示）")).toBeTruthy();
  fireEvent.click(screen.getByText("測試：指派測試司機"));
  await waitFor(() =>
    expect(
      calls.some((c) => c.url === `/api/referral/demo-trip/${orderId}/assign`),
    ).toBe(true),
  );
  const demo = calls.find((c) => c.url.includes("/demo-trip/"))!;
  expect(demo.init).toMatchObject({
    method: "POST",
    body: "{}",
    headers: { "Content-Type": "application/json" },
  });
});

it("completes an assigned trip and opens the completed screen", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  const calls = stubFetch(
    () =>
      Response.json({
        ok: true,
        data: { orderId, status: "completed", driverId: "d", simulated: true },
      }),
    trip("assigned", "商務測試司機 1（虛構）"),
  );
  render(
    <PassengerEmbed
      context={context(true) as never}
      liveData={live("assigned", "商務測試司機 1（虛構）") as never}
    />,
  );
  fireEvent.click(screen.getByText("測試：完成行程"));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(
    calls.some((c) => c.url === `/api/referral/demo-trip/${orderId}/complete`),
  ).toBe(true);
  const target = new URL(String(assign.mock.calls[0]![0]), "https://x.test");
  expect(target.searchParams.get("screen")).toBe("completed");
  expect(target.searchParams.get("orderId")).toBe(orderId);
});

it("explains a busy test driver pool without leaving the trip", async () => {
  stubFetch(() =>
    Response.json(
      { ok: false, error: { code: "REFERRAL_DEMO_TRIP_SUPPLY_BUSY" } },
      { status: 409 },
    ),
  );
  render(
    <PassengerEmbed
      context={context(true) as never}
      liveData={live("created") as never}
    />,
  );
  fireEvent.click(screen.getByText("測試：指派測試司機"));
  expect(
    await screen.findByText("測試司機都在服務其他展示行程，請稍後再試。"),
  ).toBeTruthy();
});
