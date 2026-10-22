// @vitest-environment jsdom
type CancellationTestPorts = {
  session: () => Promise<unknown>;
  headers: (session: unknown) => Promise<Record<string, string>>;
  context: (input: unknown) => Promise<unknown>;
};
vi.mock("../../../apps/referral-embed-web/lib/embed-partner-session", () => ({
  readActiveReferralSession: () =>
    (
      globalThis as unknown as { __cancellationPorts: CancellationTestPorts }
    ).__cancellationPorts.session(),
  getReferralIdentityHeaders: (session: unknown) =>
    (
      globalThis as unknown as { __cancellationPorts: CancellationTestPorts }
    ).__cancellationPorts.headers(session),
}));
vi.mock("../../../apps/referral-embed-web/lib/embed-context", () => ({
  resolveEmbedContext: (input: unknown) =>
    (
      globalThis as unknown as { __cancellationPorts: CancellationTestPorts }
    ).__cancellationPorts.context(input),
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      children,
      href,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      prefetch?: boolean;
    }) => {
      delete props.prefetch;
      return React.createElement("a", { href, ...props }, children);
    },
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("ACTUAL_NEXT_NOT_FOUND_PORT");
  },
}));
import React from "react";
import { requireApi } from "./setup-reflection";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "./mounted-dom";
import { renderToString } from "react-dom/server";
import { scenario } from "./fixture";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import Page from "../../../apps/referral-embed-web/app/embed/[entrySlug]/page";
import { PassengerEmbed } from "../../../apps/referral-embed-web/components/passenger-embed";
import { displayOrderNo } from "../../../apps/referral-embed-web/lib/order-display";
import { GET as activeGET } from "../../../apps/referral-embed-web/app/api/referral/active/route";
import { POST as cancelPOST } from "../../../apps/referral-embed-web/app/api/referral/cancel/[orderId]/route";
const { of, lastValueFrom } = requireApi("rxjs");
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  delete (globalThis as any).__cancellationPorts;
});
async function wire() {
  const f = await scenario();
  const controller = new OwnedMobilityController(f.service, undefined as never);
  const context = {
    entry: f.entry,
    session: {
      handoffId: "controlled-session-port",
      recoveryScope: "controlled-scope",
      identityActive: true,
      partnerEntrySlug: f.entry.entrySlug,
      entryHost: f.entry.entryHost,
    },
    state: "handoff",
    screen: "trip",
    requestedScreen: "trip",
    handoff: { apiKey: null, partnerUserRef: null },
    decision: { requestedEntryHost: f.entry.entryHost, block: false },
    accent: "#123456",
    strings: {
      appName: "社區",
      displayName: "測試社區",
      supportPhone: "0800-000-000",
    },
    issues: [],
    fallbackEntry: null,
  };
  (globalThis as any).__cancellationPorts = {
    session: async () => ({ identityActive: true }),
    headers: async () => ({
      Authorization: "Bearer controlled-session-transport-only",
    }),
    context: async () => context,
  };
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  let omitMetadata = false;
  let lastWire: any;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://embed.example.test").pathname;
    calls.push({
      path,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (path === `/api/referral/cancel/${f.orderId}`)
      return cancelPOST(
        new Request(`https://embed.example.test${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: String(init?.body),
        }),
        { params: Promise.resolve({ orderId: f.orderId }) },
      );
    if (path === "/api/referral/active") return activeGET();
    try {
      let envelope;
      if (path === "/api/partner/referral/passenger/active")
        envelope = await controller.getReferralPassengerActiveTrip(
          f.identity,
          "controlled-read",
        );
      else if (
        path === `/api/partner/referral/passenger/orders/${f.orderId}/cancel`
      )
        envelope = await controller.cancelReferralPassengerTrip(
          f.orderId,
          JSON.parse(String(init?.body)),
          f.identity,
          "controlled-cancel",
        );
      else throw new Error("Unexpected transport path " + path);
      if (omitMetadata && "trip" in envelope.data && envelope.data.trip)
        delete (envelope.data.trip as any).cancellationWindow;
      // Actual serializer, no handwritten snake/camel equivalent.
      lastWire = await lastValueFrom(
        new SnakeCaseInterceptor().intercept({} as never, {
          handle: () => of(envelope),
        }),
      );
      return Response.json(lastWire);
    } catch (error) {
      if (typeof (error as any)?.getStatus !== "function") throw error;
      return Response.json((error as any).getResponse(), {
        status: (error as any).getStatus(),
      });
    }
  });
  vi.stubGlobal("fetch", fetch);
  const page = () =>
    Page({
      params: Promise.resolve({ entrySlug: f.entry.entrySlug }),
      searchParams: Promise.resolve({
        state: "handoff",
        screen: "trip",
        orderId: f.orderId,
      }),
    });
  return {
    ...f,
    context,
    page,
    calls,
    fetch,
    get wire() {
      return lastWire;
    },
    omit() {
      omitMetadata = true;
    },
  };
}
const button = () =>
  screen.getByRole("button", { name: "取消行程" }) as HTMLButtonElement;
function navigation() {
  const assign = vi.fn(),
    w = Object.create(window);
  Object.defineProperty(w, "location", {
    value: { assign },
    configurable: true,
  });
  vi.stubGlobal("window", w);
  return assign;
}

it("BEFORE_NEW real controller serializer BFF SSR and mounted UI carry the window", async () => {
  const f = await wire();
  const node = await f.page();
  expect(f.wire.data.trip.cancellation_window?.can_cancel).toBe(true);
  expect(f.wire.data.trip.cancellation_window.cancelable_until).toBeTruthy();
  expect(node.props.liveData.activeTrip.trip.cancellationWindow).toMatchObject({
    canCancel: true,
  });
  expect(renderToString(node)).toContain("可取消至");
  render(node);
  expect(screen.getByText(/可取消至/)).toBeTruthy();
  expect(button().disabled).toBe(false);
  expect(document.body.textContent).not.toContain("免費");
  expect(f.calls.map((x) => x.path)).toEqual([
    "/api/partner/referral/passenger/active",
  ]);
});
it.each(["driver_accepted", "arrived_pickup", "on_trip"])(
  "known closed %s is disabled without POST; same Passenger API still returns actual409",
  async (status) => {
    const f = await wire();
    await f.change({ status });
    const node = await f.page();
    render(node);
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/目前已無法取消/)).toBeTruthy();
    fireEvent.click(button());
    expect(f.calls.some((x) => x.method === "POST")).toBe(false);
    const before = await f.stored();
    const response = await cancelPOST(
      new Request("https://embed.example.test/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: "actual-cancel-command" }),
      }),
      { params: Promise.resolve({ orderId: f.orderId }) },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ORDER_NOT_CANCELABLE");
    expect(await f.stored()).toEqual(before);
  },
);
it("rolling absence is explicitly unknown and preserves the original user-initiated cancellation", async () => {
  const f = await wire();
  f.omit();
  render(await f.page());
  expect(screen.getByText(/未提供取消時段資訊，送出後由系統確認/)).toBeTruthy();
  expect(button().disabled).toBe(false);
  const assign = navigation();
  fireEvent.click(button());
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(
    new URL(
      assign.mock.calls[0]![0],
      "https://embed.example.test",
    ).searchParams.get("orderId"),
  ).toBe(f.orderId);
  expect(
    new URL(
      assign.mock.calls[0]![0],
      "https://embed.example.test",
    ).searchParams.get("screen"),
  ).toBe("cancelled");
  expect((await f.stored())?.status).toBe("cancelled");
  expect(
    f.calls.filter(
      (x) =>
        x.path === `/api/partner/referral/passenger/orders/${f.orderId}/cancel`,
    ),
  ).toHaveLength(1);
});
it("known available sends the original command and shows pending until its real acknowledgement", async () => {
  const f = await wire();
  render(await f.page());
  const assign = navigation();
  const transport = f.fetch.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.fetch.mockImplementation(async (...args) => {
    if (String(args[0]).startsWith("/api/referral/cancel/")) await held;
    return transport(...args);
  });
  fireEvent.click(button());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "取消中…" })).toBeTruthy(),
  );
  expect(
    (screen.getByRole("button", { name: "取消中…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  release();
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect((await f.stored())?.status).toBe("cancelled");
  const body = f.calls.find(
    (x) =>
      x.path === `/api/partner/referral/passenger/orders/${f.orderId}/cancel`,
  )?.body as any;
  expect(typeof body.idempotencyKey).toBe("string");
  expect(body.orderId).toBe(f.orderId);
});
it("a post-read state change keeps actual409 Banner, same UUID, and closes stale available UI", async () => {
  const f = await wire();
  render(await f.page());
  expect(button().disabled).toBe(false);
  await f.change({ status: "driver_accepted" });
  const before = await f.stored();
  fireEvent.click(button());
  await waitFor(() =>
    expect(
      screen.getByText("無法完成這項操作，請重試或重新驗證。"),
    ).toBeTruthy(),
  );
  await waitFor(() => expect(button().disabled).toBe(true));
  // Still the same order: riders see its short order number, not the UUID.
  expect(document.body.textContent).toContain(
    `訂單 ${displayOrderNo(before!.orderNo)}`,
  );
  expect(await f.stored()).toEqual(before);
  expect(
    f.calls.filter(
      (x) =>
        x.path === `/api/partner/referral/passenger/orders/${f.orderId}/cancel`,
    ),
  ).toHaveLength(1);
});
it("an exact deadline stays inclusive; strictly later clock closes UI without a POST", async () => {
  vi.useFakeTimers();
  const now = Date.parse("2026-10-20T06:00:00Z");
  vi.setSystemTime(now);
  const f = await wire();
  const node = await f.page();
  render(node);
  expect(button().disabled).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(120_000);
  });
  expect(button().disabled).toBe(false);
  await act(async () => {
    vi.advanceTimersByTime(1_000);
  });
  expect(button().disabled).toBe(true);
  fireEvent.click(button());
  expect(f.calls.some((x) => x.method === "POST")).toBe(false);
});
it("new authoritative props replace an old order window and malformed metadata stays unknown without blocking the old action", async () => {
  const f = await wire();
  const node = await f.page();
  const view = render(node);
  expect(button().disabled).toBe(false);
  await f.change({ status: "driver_accepted" });
  view.rerender(await f.page());
  expect(button().disabled).toBe(true);
  const props = {
    ...node.props,
    liveData: {
      ...node.props.liveData,
      activeTrip: {
        ...node.props.liveData.activeTrip,
        trip: {
          ...node.props.liveData.activeTrip.trip,
          cancellationWindow: {
            canCancel: true,
            asOf: "not-an-instant",
            cancelableUntil: "bad",
          },
        },
      },
    },
  };
  view.rerender(<PassengerEmbed {...props} />);
  expect(button().disabled).toBe(false);
  expect(screen.getByText(/未提供取消時段資訊/)).toBeTruthy();
});
it("actual upstream read failure remains SSR failure rather than a fabricated available trip", async () => {
  const f = await wire();
  f.db.failSql = /FROM ops\.phase1_owned_orders/;
  await expect(f.page()).rejects.toMatchObject({
    status: 503,
    code: "REFERRAL_UPSTREAM_UNAVAILABLE",
  });
  expect(f.calls.some((x) => x.method === "POST")).toBe(false);
});
