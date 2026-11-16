/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

const ORDER = "17171717-1717-4171-8171-171717171717";
const OWNED = `/api/passenger-app/rides/${ORDER}`;
const external = vi.hoisted(() => ({
  pathname: "/rides/17171717-1717-4171-8171-171717171717",
}));

// Next navigation/link are browser framework boundaries. No product Page,
// context, trial store, client, mapper, stream adapter or auto driver is mocked.
vi.mock("next/navigation", () => ({
  usePathname: () => external.pathname,
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("unexpected_missing_order");
  },
}));
vi.mock("../../../apps/passenger-app-web/node_modules/next/navigation", () => ({
  usePathname: () => external.pathname,
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("unexpected_missing_order");
  },
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import RideDetailPage from "../../../apps/passenger-app-web/app/rides/[id]/page";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import { setTrialMode } from "../../../apps/passenger-app-web/lib/trial/store";
import { authority } from "../pax-live-tracking-20261017/fixture";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";

const CANCELLED = "此行程已取消。如需乘車請重新預約，或聯絡客服協助。";

class BrowserAuthorityEvents {
  static instances: BrowserAuthorityEvents[] = [];
  readonly listeners = new Map<string, (event: { data: string }) => void>();
  onopen: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    BrowserAuthorityEvents.instances.push(this);
  }
  addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.closed = true;
  }
  emit(event: PassengerRideSseEventEnvelope) {
    if (this.closed) throw new Error("unexpected_closed_stream");
    this.listeners.get(event.eventType)?.({
      data: JSON.stringify(deepToSnakeCase(event)),
    });
  }
}

function view(
  status: "ready_for_dispatch" | "cancelled" | "enroute_pickup",
): PassengerRideAuthorityView {
  const value = authority(status);
  value.order.orderId = ORDER;
  value.order.orderNo = "SIM-TRIAL-CANCEL";
  value.order.requestedPickupAt = "2026-11-09T02:00:00Z";
  value.order.cancelledAt =
    status === "cancelled" ? "2026-11-07T12:00:00Z" : null;
  if (status === "enroute_pickup") value.assignment!.orderId = ORDER;
  else value.assignment = null;
  value.tracking = null;
  value.actions = {
    canCancel: status !== "cancelled",
    canRate: false,
    canContact: false,
    canReadReceipt: false,
  };
  return value;
}

function serverBoundary(
  initial: "ready_for_dispatch" | "cancelled",
  slowAssignment = false,
) {
  let latest = view(initial);
  const calls: Array<{ url: string; method: string }> = [];
  let resolveAssignment: ((response: Response) => void) | null = null;
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (
        slowAssignment &&
        method === "POST" &&
        url === `/api/passenger-app/review-demo/rides/${ORDER}/trial/assign`
      )
        return new Promise<Response>((resolve) => {
          resolveAssignment = resolve;
        });
      if (
        slowAssignment &&
        method === "POST" &&
        url === `/api/passenger-app/review-demo/rides/${ORDER}/trial/heartbeat`
      )
        return apiWireResponse({ status: "enroute_pickup" });
      if (method !== "GET")
        throw new Error(`unexpected_write:${method}:${url}`);
      if (url === "/api/passenger-app/review-demo/config")
        return apiWireResponse({ enabled: true });
      if (
        url === OWNED ||
        url === `/api/passenger-app/review-demo/rides/${ORDER}/record`
      )
        return apiWireResponse({ ride: structuredClone(latest) });
      throw new Error(`unexpected_HTTP:${method}:${url}`);
    },
  );
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("EventSource", BrowserAuthorityEvents);
  return {
    calls,
    ownedReads: () => calls.filter((row) => row.url === OWNED).length,
    finishAssignment() {
      expect(resolveAssignment).not.toBeNull();
      latest = view("enroute_pickup");
      resolveAssignment!(apiWireResponse({ status: "enroute_pickup" }));
    },
    cancelInAnotherWindow() {
      // External same-order authority changes, not this Page's cancel button:
      // the current Page therefore must not be made to reload for the test.
      latest = view("cancelled");
      const source = BrowserAuthorityEvents.instances.find(
        (item) => !item.closed,
      );
      expect(source).toBeDefined();
      source!.emit({
        eventId: "SIM-external-trip-cancelled",
        eventType: "trip_cancelled",
        eventVersion: 1,
        assignmentVersion: null,
        orderId: ORDER,
        occurredAt: "2026-11-07T12:00:00Z",
        data: structuredClone(latest),
      });
    },
  };
}

async function flush() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
async function mountActualPage() {
  // The actual existing server Page composes TrialAutoDriver and P5. The old
  // manual test-driver panel stays retired; this exercises no replacement UI.
  const page = await RideDetailPage({
    params: Promise.resolve({ id: ORDER }),
    searchParams: Promise.resolve({}),
  });
  await act(async () => {
    render(<ReviewDemoProvider>{page}</ReviewDemoProvider>);
    await flush();
  });
  expect(screen.queryByRole("region", { name: "測試司機" })).toBeNull();
  expect(screen.queryByRole("button", { name: "派一台測試車" })).toBeNull();
}
async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await flush();
  });
}

beforeEach(() => {
  window.localStorage.clear();
  BrowserAuthorityEvents.instances = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  setTrialMode(true);
});
afterEach(() => {
  cleanup();
  for (const source of BrowserAuthorityEvents.instances) source.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("actual owned trial Page follows external same-order cancellation", () => {
  it("stops automatic dispatch and reads after another window cancels the waiting ride", async () => {
    const server = serverBoundary("ready_for_dispatch");
    await mountActualPage();
    expect(server.ownedReads()).toBeGreaterThanOrEqual(2);
    expect(BrowserAuthorityEvents.instances).toHaveLength(1);
    expect(BrowserAuthorityEvents.instances[0]!.url).toBe(`${OWNED}/events`);
    await act(async () => {
      BrowserAuthorityEvents.instances[0]!.onopen?.();
      server.cancelInAnotherWindow();
      await flush();
    });
    // The P5 stream sees the external cancellation immediately. Its automatic
    // driver independently rereads the same authority on the next 5s tick.
    expect(screen.getByText(CANCELLED)).toBeTruthy();
    const beforeTerminalRead = server.ownedReads();
    await elapse(4_999);
    expect(server.ownedReads()).toBe(beforeTerminalRead);
    await elapse(1);
    expect(server.ownedReads()).toBe(beforeTerminalRead + 1);
    const terminalReads = server.ownedReads();
    await elapse(30_000);
    expect(server.ownedReads()).toBe(terminalReads);
    expect(server.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("keeps an already cancelled Page terminal without dispatch, heartbeat, or repeated authority reads", async () => {
    const server = serverBoundary("cancelled");
    await mountActualPage();
    expect(screen.getByText(CANCELLED)).toBeTruthy();
    const terminalReads = server.ownedReads();
    await elapse(30_000);
    expect(server.ownedReads()).toBe(terminalReads);
    expect(server.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("keeps a slow assign action authoritative across the background read cadence", async () => {
    const server = serverBoundary("ready_for_dispatch", true);
    await mountActualPage();
    expect(
      server.calls.filter((call) => call.url.endsWith("/trial/assign")),
    ).toHaveLength(0);
    // The existing automatic driver waits 5s before dispatching. No manual
    // action is reintroduced to start the pending request.
    await elapse(5_000);
    const beforeActionReads = server.ownedReads();
    expect(
      server.calls.filter((call) => call.url.endsWith("/trial/assign")),
    ).toHaveLength(1);
    await elapse(10_000);
    expect(
      server.ownedReads(),
      "a background authority read must not overtake the pending assign response",
    ).toBe(beforeActionReads);
    expect(
      server.calls.filter((call) => call.url.endsWith("/trial/assign")),
    ).toHaveLength(1);
    expect(
      server.calls.filter((call) => call.url.endsWith("/trial/heartbeat")),
    ).toHaveLength(0);
    await act(async () => {
      server.finishAssignment();
      await flush();
    });
    await elapse(5_000);
    expect(
      server.calls.filter((call) => call.url.endsWith("/trial/heartbeat")),
    ).toHaveLength(1);
    const servingReads = server.ownedReads();
    await elapse(10_000);
    expect(server.ownedReads()).toBe(servingReads + 2);
    expect(
      server.calls.filter((call) => call.url.endsWith("/trial/heartbeat")),
    ).toHaveLength(2);
    expect(
      server.calls
        .filter((call) => call.method === "POST")
        .map((call) => call.url.split("/").at(-1)),
    ).toEqual(["assign", "heartbeat", "heartbeat"]);
  });
});
