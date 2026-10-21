// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getByRole, getByText, queryByText } from "@testing-library/dom";
import { liveWire } from "./fixture";
import { referralLiveArrival } from "../../../apps/referral-embed-web/components/referral-live-tracking";
import { t } from "../../../apps/referral-embed-web/lib/translations";
import { useReferralLiveTrip } from "../../../apps/referral-embed-web/components/use-referral-live-trip";
let root: Root | undefined, host: HTMLDivElement | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(f: Awaited<ReturnType<typeof liveWire>>) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const page = await f.view();
  await act(async () => root!.render(page));
  return host;
}
async function refresh(h: HTMLElement) {
  await act(async () => {
    getByRole(h, "button", { name: "更新行程狀態" }).click();
    await Promise.resolve();
    await Promise.resolve();
  });
}
it("uses the original real controller serializer, BFF deepCamel, SSR and mounted trip for pickup ETA without a PAX disclosure", async () => {
  const f = await liveWire();
  const h = await mount(f);
  expect(getByText(h, "16:03")).toBeTruthy();
  expect(getByText(h, "3")).toBeTruthy();
  expect(f.eta).toHaveBeenCalledWith(f.driverId, 25.06, 121.52);
  const wire = f.wires.find((x: any) => x.path.endsWith("/active"));
  expect(
    wire?.body.data.trip.live_tracking.pickup_eta.estimated_arrival_at,
  ).toBe("2026-10-20T08:03:00.000Z");
  expect(f.db.table("ops.passenger_dispatch_disclosure_snapshots").size).toBe(
    0,
  );
});
it("shows actual road distance and destination arrival during the trip, never quote distance or a pickup estimate", async () => {
  const f = await liveWire("on_trip");
  const h = await mount(f);
  expect(getByText(h, "16:12")).toBeTruthy();
  expect(getByText(h, "目的地剩餘距離：4.2 公里")).toBeTruthy();
  expect(getByText(h, "12")).toBeTruthy();
  expect(f.eta).not.toHaveBeenCalled();
  expect(f.route).toHaveBeenCalledWith({
    origin: { lat: 25.061, lng: 121.521 },
    destination: { lat: 25.08, lng: 121.24 },
    travelMode: "drive",
    locale: "zh-TW",
  });
});
it.each(["stale", "low_accuracy", "missing"])(
  "%s telemetry has no fabricated pickup estimate or five-minute default",
  async (freshness) => {
    const f = await liveWire();
    f.telemetry.locationFreshness = freshness;
    const h = await mount(f);
    expect(f.eta).not.toHaveBeenCalled();
    expect(f.route).not.toHaveBeenCalled();
    expect(queryByText(h, "16:03")).toBeNull();
    expect(queryByText(h, "5")).toBeNull();
    expect(getByRole(h, "region", { name: "同單行程即時更新" })).toBeTruthy();
  },
);
it("a real route-provider rejection leaves the canonical ongoing trip readable and the distance unknown", async () => {
  const f = await liveWire("on_trip");
  f.route.mockRejectedValueOnce(new Error("controlled route unavailable"));
  const h = await mount(f);
  expect(getByText(h, "目的地剩餘距離：待更新")).toBeTruthy();
  expect(getByText(h, "前往目的地")).toBeTruthy();
  expect(queryByText(h, "16:12")).toBeNull();
});
it("rejects an old route after the actual stored assignment has changed while awaiting the provider", async () => {
  const f = await liveWire("on_trip");
  f.route.mockImplementationOnce(async () => {
    const row = f.db
      .table("ops.phase1_dispatch_assignments")
      .get(f.assignmentId);
    f.db
      .table("ops.phase1_dispatch_assignments")
      .set(f.assignmentId, { ...row, status: "cancelled" });
    return {
      distanceMeters: 4200,
      durationSeconds: 720,
      provider: "controlled-existing-route-port",
      generatedAt: new Date().toISOString(),
    };
  });
  expect(
    (await f.service.getReferralPassengerActiveTrip(f.identity)).trip
      ?.liveTracking,
  ).toBeNull();
});
it("rejects an old route after a later real GPS observation arrives", async () => {
  const f = await liveWire("on_trip");
  f.route.mockImplementationOnce(async () => {
    f.telemetry.currentLocation.lat = 25.07;
    return {
      distanceMeters: 4200,
      durationSeconds: 720,
      provider: "controlled-existing-route-port",
      generatedAt: new Date().toISOString(),
    };
  });
  expect(
    (await f.service.getReferralPassengerActiveTrip(f.identity)).trip
      ?.liveTracking,
  ).toBeNull();
});
it("does not use stale provider metrics even when the Driver location is fresh", async () => {
  const f = await liveWire("on_trip");
  f.route.mockResolvedValueOnce({
    distanceMeters: 4200,
    durationSeconds: 720,
    provider: "controlled-existing-route-port",
    generatedAt: "2026-10-20T07:00:00Z",
  });
  expect(
    (await f.service.getReferralPassengerActiveTrip(f.identity)).trip
      ?.liveTracking?.dropoffRoute,
  ).toBeNull();
});
it("an absent same-order assignment leaves tracking null without reading another Driver", async () => {
  const f = await liveWire();
  f.db.table("ops.phase1_dispatch_assignments").clear();
  expect(
    (await f.service.getReferralPassengerActiveTrip(f.identity)).trip
      ?.liveTracking,
  ).toBeNull();
  expect(f.tracking).not.toHaveBeenCalled();
});
it("a telemetry failure still returns the genuine same order rather than a fallback trip", async () => {
  const f = await liveWire();
  f.tracking.mockRejectedValueOnce(
    new Error("controlled telemetry read error"),
  );
  const result = await f.service.getReferralPassengerActiveTrip(f.identity);
  expect(result.trip?.orderId).toBe(f.orderId);
  expect(result.trip?.liveTracking).toMatchObject({
    location: null,
    pickupEta: null,
    dropoffRoute: null,
  });
});
it("an explicit refresh shows later same-order coordinates, new ETA and the real state", async () => {
  const f = await liveWire();
  const h = await mount(f);
  f.telemetry.currentLocation.lng = 121.55;
  f.eta.mockResolvedValue({
    driverId: f.driverId,
    etaMinutes: 1,
    calculatedAt: new Date().toISOString(),
    driverLocation: structuredClone(f.telemetry.currentLocation),
    destination: { lat: 25.06, lng: 121.52 },
  });
  await refresh(h);
  expect(getByText(h, "16:01")).toBeTruthy();
  expect(getByText(h, /25.06100, 121.55000/)).toBeTruthy();
  expect(queryByText(h, "16:03")).toBeNull();
});
it("failed refresh retains the last same-order snapshot, announces stale readback and supports explicit retry", async () => {
  const f = await liveWire();
  const h = await mount(f);
  const original = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (i, init) =>
      String(i) === "/api/referral/active"
        ? Response.json({ ok: false }, { status: 503 })
        : original(i, init),
    ),
  );
  await refresh(h);
  expect(getByText(h, "暫時無法更新，顯示上次資料。")).toBeTruthy();
  expect(getByText(h, "16:03")).toBeTruthy();
  vi.stubGlobal("fetch", original);
  await refresh(h);
  expect(queryByText(h, "暫時無法更新，顯示上次資料。")).toBeNull();
});
it("completion replaces the active display with its original history entry instead of displaying a different active order", async () => {
  const f = await liveWire();
  const h = await mount(f);
  await f.change({ status: "completed" });
  await refresh(h);
  expect(getByText(h, "行程已結束或更新")).toBeTruthy();
  expect(getByRole(h, "link", { name: "查看歷史行程" })).toBeTruthy();
  expect(queryByText(h, "16:03")).toBeNull();
});
it("uses the existing five-second polling interval and aborts a pending read on unmount without overlapping requests", async () => {
  const f = await liveWire();
  const h = await mount(f);
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  // Re-mount to bind the real interval to the controlled unit timer.
  await act(async () => root!.unmount());
  root = createRoot(h);
  const page = await f.view();
  await act(async () => root!.render(page));
  const original = globalThis.fetch;
  let release: (value: Response) => void = () => {};
  const signals: AbortSignal[] = [];
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (i, init) => {
      if (String(i) === "/api/referral/active") {
        signals.push(init?.signal as AbortSignal);
        return pending;
      }
      return original(i, init);
    }),
  );
  await act(async () => {
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
  });
  expect(signals).toHaveLength(1);
  await act(async () => {
    vi.advanceTimersByTime(10000);
    await Promise.resolve();
  });
  expect(signals).toHaveLength(1);
  await act(async () => root!.unmount());
  root = undefined;
  expect(signals[0]?.aborted).toBe(true);
  await act(async () => {
    release(Response.json({ ok: true, data: { active: false, trip: null } }));
    await pending;
  });
});

it("a different newly active order never replaces the selected original trip during a refresh", async () => {
  const f = await liveWire();
  const h = await mount(f);
  const original = globalThis.fetch;
  const current = (await f.service.getReferralPassengerActiveTrip(f.identity))
    .trip!;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (i, init) =>
      String(i) === "/api/referral/active"
        ? Response.json({
            ok: true,
            data: {
              active: true,
              trip: {
                ...current,
                orderId: "a-different-new-order",
                orderNo: "another-order",
              },
            },
          })
        : original(i, init),
    ),
  );
  await refresh(h);
  expect(getByText(h, "行程已結束或更新")).toBeTruthy();
  expect(queryByText(h, /another-order/)).toBeNull();
});
it("client clock skew cannot change the server-calculated pickup time or actual map coordinates", async () => {
  const f = await liveWire();
  const page = await f.view();
  vi.setSystemTime(new Date("2027-04-20T19:41:00Z"));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(page));
  expect(getByText(host, "16:03")).toBeTruthy();
  const link = getByRole(host, "link", {
    name: "在地圖開啟司機位置",
  }) as HTMLAnchorElement;
  const url = new URL(link.href);
  expect(url.searchParams.get("query")).toBe("25.061,121.521");
});
it("a hidden page pauses polls and refreshes through the same actual BFF when it becomes visible", async () => {
  const f = await liveWire();
  const h = await mount(f);
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  await act(async () => root!.unmount());
  root = createRoot(h);
  const page = await f.view();
  await act(async () => root!.render(page));
  const original = globalThis.fetch;
  const browser = vi.fn(async (i: RequestInfo | URL, init?: RequestInit) =>
    original(i, init),
  );
  vi.stubGlobal("fetch", browser);
  const visible = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  await act(async () => {
    vi.advanceTimersByTime(10_000);
    await Promise.resolve();
  });
  expect(browser).not.toHaveBeenCalled();
  visible.mockReturnValue("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
  });
  expect(
    browser.mock.calls.some(([i]) => String(i) === "/api/referral/active"),
  ).toBe(true);
});
it("an inconsistent not-started Driver task cannot supply an on-trip destination route", async () => {
  const f = await liveWire("on_trip");
  const row = f.db.table("ops.phase1_driver_tasks").get(f.taskId);
  f.db
    .table("ops.phase1_driver_tasks")
    .set(f.taskId, { ...row, status: "accepted" });
  expect(
    (await f.service.getReferralPassengerActiveTrip(f.identity)).trip
      ?.liveTracking,
  ).toBeNull();
  expect(f.route).not.toHaveBeenCalled();
});

it.each([
  "another-driver",
  "newer-GPS-observation",
  "different-pickup",
] as const)(
  "rejects a pickup estimate bound to %s instead of the observed own Driver/point/pickup",
  async (mismatch) => {
    const f = await liveWire();
    const point = structuredClone(f.telemetry.currentLocation);
    const response = {
      driverId: f.driverId,
      etaMinutes: 3,
      calculatedAt: new Date().toISOString(),
      driverLocation: structuredClone(point),
      destination: { lat: 25.06, lng: 121.52 },
    };
    if (mismatch === "another-driver") {
      response.driverId = "unit-other-live-driver";
      response.driverLocation.driverId = response.driverId;
    } else if (mismatch === "newer-GPS-observation") {
      // Even a new observation at identical coordinates is not the point read
      // for this response's original same-order tracking snapshot.
      const newer = new Date(Date.parse(point.recordedAt) + 1000).toISOString();
      response.driverLocation.recordedAt = newer;
      response.driverLocation.updatedAt = newer;
    } else {
      response.destination.lng = 121.53;
    }
    f.eta.mockResolvedValueOnce(response);
    const active = await f.service.getReferralPassengerActiveTrip(f.identity);
    expect(active.trip?.orderId).toBe(f.orderId);
    expect(active.trip?.liveTracking?.location).toMatchObject({
      lat: point.lat,
      lng: point.lng,
      recordedAt: point.recordedAt,
    });
    expect(active.trip?.liveTracking?.pickupEta).toBeNull();
    expect(f.eta).toHaveBeenCalledWith(f.driverId, 25.06, 121.52);
  },
);

it("uses the existing English pending copy for an unknown pickup arrival", async () => {
  const f = await liveWire();
  f.eta.mockRejectedValueOnce(
    new Error("controlled pickup estimate unavailable"),
  );
  const active = await f.service.getReferralPassengerActiveTrip(f.identity);
  expect(active.trip?.orderId).toBe(f.orderId);
  expect(active.trip?.liveTracking?.pickupEta).toBeNull();
  const pending = t("referralLive.pending", undefined, "en");
  expect(pending).toBe("Awaiting update");
  expect(referralLiveArrival(active.trip!, pending)).toBe(pending);
});

it("an unknown poll keeps its established same-order server-time floor for the next older valid snapshot", async () => {
  const f = await liveWire();
  const initial = (await f.service.getReferralPassengerActiveTrip(f.identity))
    .trip!;
  const established = Date.parse(initial.cancellationWindow!.asOf);
  let monotonic = 0;
  vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  function ClockProbe() {
    const live = useReferralLiveTrip(initial, "unit-original-live-scope");
    return (
      <>
        <output
          aria-label="observed cancellation time"
          data-order={live.trip?.orderId}
        >
          {Number.isFinite(live.cancellationServerNow)
            ? live.cancellationServerNow
            : "unknown"}
        </output>
        <button onClick={live.refresh}>Read original active trip</button>
      </>
    );
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<ClockProbe />));
  const observed = () =>
    getByRole(host!, "status", { name: "observed cancellation time" });
  expect(observed().textContent).toBe(String(established));
  const original = globalThis.fetch;
  let polls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const response = await original(input, init);
      if (String(input) !== "/api/referral/active") return response;
      const body = await response.json();
      body.data.trip.cancellationWindow.asOf =
        ++polls === 1
          ? "not-an-instant"
          : new Date(established - 60_000).toISOString();
      return Response.json(body, {
        status: response.status,
        headers: response.headers,
      });
    }),
  );
  const poll = () =>
    act(async () => {
      getByRole(host!, "button", { name: "Read original active trip" }).click();
      await Promise.resolve();
      await Promise.resolve();
    });
  monotonic = 10_000;
  await poll();
  expect(observed().textContent).toBe("unknown");
  monotonic = 20_000;
  await poll();
  expect(observed().textContent).toBe(String(established + 20_000));
  expect(observed().getAttribute("data-order")).toBe(f.orderId);
  expect(polls).toBe(2);
});
