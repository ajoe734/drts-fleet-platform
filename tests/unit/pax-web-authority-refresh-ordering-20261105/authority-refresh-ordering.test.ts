/** @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { authority, tracking } from "../pax-live-tracking-20261017/fixture";
import {
  apiWireResponse,
  fares,
} from "../pax-web-shell-20261009/api-wire-fixtures";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";

type AuthMode = "id" | "token";
const MODES: AuthMode[] = ["id", "token"];
const ORDER_A = "11111111-1111-4111-8111-111111111111";
const ORDER_B = "22222222-2222-4222-8222-222222222222";
const CANCELLED = "此行程已取消。如需乘車請重新預約，或聯絡客服協助。";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Only the browser EventSource port is substituted. The real stream adapter
// validates finite eventVersion and sends the snapshot to the real Page/mapper.
class AuthorityEvents {
  static instances: AuthorityEvents[] = [];
  readonly listeners = new Map<string, (event: { data: string }) => void>();
  closed = false;
  onopen: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  constructor(readonly url: string) {
    AuthorityEvents.instances.push(this);
  }
  addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  emit(event: PassengerRideSseEventEnvelope) {
    if (this.closed)
      throw new Error("Cannot deliver on a closed browser stream");
    this.listeners.get(event.eventType)?.({
      data: JSON.stringify(deepToSnakeCase(event)),
    });
  }
}

function view(
  status: PassengerRideAuthorityView["order"]["status"],
  orderId = ORDER_A,
): PassengerRideAuthorityView {
  const result = authority(status);
  result.order.orderId = orderId;
  result.order.orderNo = orderId === ORDER_A ? "ORDER-A" : "ORDER-B";
  if (status === "exception_hold" || status === "cancelled")
    result.assignment = null;
  if (result.assignment) {
    result.assignment.orderId = orderId;
    result.assignment.routeFare.orderId = orderId;
    result.assignment.vehicle.plateNo = orderId === ORDER_A ? "CAR-A" : "CAR-B";
  }
  result.tracking = null;
  result.actions = {
    canCancel: status === "exception_hold" || status === "assigned",
    canRate: false,
    canContact: result.assignment !== null && status !== "completed",
    canReadReceipt: true,
  };
  return result;
}

function identifier(mode: AuthMode, orderId: string) {
  return mode === "token"
    ? orderId === ORDER_A
      ? "opaque-refresh-a"
      : "opaque-refresh-b"
    : orderId;
}

function endpoint(mode: AuthMode, orderId: string) {
  return (
    (mode === "token" ? "/api/passenger-rides/" : "/api/passenger-app/rides/") +
    identifier(mode, orderId)
  );
}

function installPorts(mode: AuthMode) {
  const delayed = deferred<Response>();
  const calls: string[] = [];
  let readsA = 0;
  let latestA = view("exception_hold");
  const latestB = view("assigned", ORDER_B);
  vi.stubGlobal("EventSource", AuthorityEvents);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if ((init?.method ?? "GET") !== "GET")
          throw new Error("Unexpected non-GET browser request: " + url);
        calls.push(url);
        if (url === endpoint(mode, ORDER_A)) {
          ++readsA;
          if (readsA === 2) return delayed.promise;
          // A fresh read after an overlapping SSE sees controlled current authority.
          // GET has no revision comparable with eventVersion; no status/timestamp
          // comparator or blanket preference for one transport is prescribed here.
          return apiWireResponse({ ride: latestA });
        }
        if (url === endpoint(mode, ORDER_B))
          return apiWireResponse({ ride: latestB });
        throw new Error("Unexpected external browser fetch: " + url);
      },
    ),
  );
  return {
    delayed,
    calls,
    setLatest: (next: PassengerRideAuthorityView) => {
      latestA = next;
    },
  };
}

function page(mode: AuthMode, orderId = ORDER_A) {
  return React.createElement(PassengerRidePage, {
    token: identifier(mode, orderId),
    authMode: mode,
    kind: "ride",
  });
}

async function mountAndRefresh(mode: AuthMode) {
  const ports = installPorts(mode);
  const mounted = render(page(mode));
  const refresh = await screen.findByRole("button", { name: "重新整理" });
  await waitFor(() => expect(AuthorityEvents.instances).toHaveLength(1));
  act(() => AuthorityEvents.instances[0]!.open());
  fireEvent.click(refresh);
  await waitFor(() =>
    expect(ports.calls).toEqual([
      endpoint(mode, ORDER_A),
      endpoint(mode, ORDER_A),
    ]),
  );
  return { ...ports, mounted };
}

async function send(
  view: PassengerRideAuthorityView,
  eventType: PassengerRideSseEventEnvelope["eventType"],
  eventVersion: number,
) {
  const source = AuthorityEvents.instances
    .filter((item) => !item.closed)
    .at(-1);
  expect(source).toBeDefined();
  await act(async () => {
    source!.emit({
      eventId: "authority-refresh-event-" + eventVersion,
      eventType,
      eventVersion,
      assignmentVersion: view.assignment?.assignmentVersion ?? null,
      orderId: view.order.orderId,
      occurredAt: "2026-11-05T12:00:00.000Z",
      data: view,
    });
  });
}

async function settle(
  ports: ReturnType<typeof installPorts>,
  response: Response,
) {
  // act drains the real SDK/json/mapper promise chain and resulting transitions;
  // asserting only before the delayed read settles would miss this regression.
  await act(async () => {
    ports.delayed.resolve(response);
  });
}

beforeEach(() => {
  localStorage.clear();
  AuthorityEvents.instances = [];
});
afterEach(() => {
  cleanup();
  for (const source of AuthorityEvents.instances) source.close();
  vi.unstubAllGlobals();
});

describe.each(MODES)("Passenger authority refresh coordination: %s", (mode) => {
  it("keeps cancellation after a captured older successful GET is delivered after the newer SSE", async () => {
    const h = await mountAndRefresh(mode);
    // The server snapshot is explicitly captured BEFORE the newer event, then
    // only its network delivery is delayed. Arrival order alone proves nothing.
    const capturedOldSnapshot = apiWireResponse({
      ride: view("exception_hold"),
    });
    const cancelled = view("cancelled");
    h.setLatest(cancelled);
    await send(cancelled, "trip_cancelled", 11);
    expect(screen.getByText(CANCELLED)).toBeTruthy();
    await settle(h, capturedOldSnapshot);
    expect(screen.getByText(CANCELLED)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重新整理" })).toBeNull();
  });

  it("keeps newer assignment and live updates after a delayed supported quote-error response", async () => {
    const h = await mountAndRefresh(mode);
    const assigned = view("assigned");
    h.setLatest(assigned);
    await send(assigned, "assignment_disclosure_ready", 11);
    expect(screen.getByText("CAR-A")).toBeTruthy();
    // Consumer error-path SIM: existing UI supports this P5 error on refresh.
    // Canonical GET does not ordinarily invoke the assignment quote producer;
    // this test does not claim that the current GET routinely emits that code.
    await settle(
      h,
      Response.json(
        { error: { code: "P5_QUOTE_PROVIDER_UNAVAILABLE" } },
        { status: 409 },
      ),
    );
    expect(screen.getByText("CAR-A")).toBeTruthy();
    expect(screen.queryByText("目前無法取得正式報價")).toBeNull();
    const cancelled = view("cancelled");
    h.setLatest(cancelled);
    await send(cancelled, "trip_cancelled", 12);
    expect(screen.getByText(CANCELLED)).toBeTruthy();
  });

  it("eventually shows a completed GET snapshot newer than the overlapping assignment SSE", async () => {
    const h = await mountAndRefresh(mode);
    await send(view("assigned"), "assignment_disclosure_ready", 11);
    expect(screen.getByText("CAR-A")).toBeTruthy();
    // This GET's server read occurs AFTER the SSE snapshot: the trip has since
    // completed. A fresh follow-up read also returns completed. Silently dropping
    // every overlapping GET without revalidation would strand the assigned UI.
    const completed = view("completed");
    h.setLatest(completed);
    await settle(h, apiWireResponse({ ride: completed }));
    expect(screen.getByText("行程已完成")).toBeTruthy();
    // Accepted E18 keeps the completed trip summary and routes to E04 instead
    // of embedding its pending-certificate state in the ride page.
    expect(screen.getByText("本次行程")).toBeTruthy();
    expect(screen.getByText("CAR-A")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "查看電子乘車證明" })
        .getAttribute("href"),
    ).toBe(
      mode === "token"
        ? `/r/${identifier(mode, ORDER_A)}/receipt`
        : `/rides/${ORDER_A}/receipt`,
    );
  });

  it("applies a current successful refresh without overlapping SSE and keeps the live stream", async () => {
    const h = await mountAndRefresh(mode);
    const assigned = view("assigned");
    h.setLatest(assigned);
    await settle(h, apiWireResponse({ ride: assigned }));
    expect(screen.getByText("CAR-A")).toBeTruthy();
    expect(h.calls).toEqual([endpoint(mode, ORDER_A), endpoint(mode, ORDER_A)]);
    const cancelled = view("cancelled");
    h.setLatest(cancelled);
    await send(cancelled, "trip_cancelled", 11);
    expect(screen.getByText(CANCELLED)).toBeTruthy();
  });

  it("does not replace another ride after the public token prop changes while the old refresh is pending", async () => {
    const h = await mountAndRefresh(mode);
    const capturedOldSnapshot = apiWireResponse({
      ride: view("exception_hold"),
    });
    h.mounted.rerender(page(mode, ORDER_B));
    await screen.findByText("CAR-B");
    await waitFor(() =>
      expect(
        AuthorityEvents.instances.some(
          (item) =>
            item.url === endpoint(mode, ORDER_B) + "/events" && !item.closed,
        ),
      ).toBe(true),
    );
    await settle(h, capturedOldSnapshot);
    expect(screen.getByText("CAR-B")).toBeTruthy();
    expect(screen.queryByText("ORDER-A")).toBeNull();
  });

  it("does not recreate a live subscription when a pending refresh settles after Page unmount", async () => {
    const h = await mountAndRefresh(mode);
    h.mounted.unmount();
    expect(AuthorityEvents.instances.every((item) => item.closed)).toBe(true);
    await settle(h, apiWireResponse({ ride: view("assigned") }));
    expect(AuthorityEvents.instances).toHaveLength(1);
    expect(AuthorityEvents.instances.every((item) => item.closed)).toBe(true);
    expect(h.calls).toEqual([endpoint(mode, ORDER_A), endpoint(mode, ORDER_A)]);
  });
});

type ActionOutcome =
  | "masked contact"
  | "contact fallback"
  | "contact error"
  | "cancel success"
  | "cancel error";
const ACTION_OUTCOMES: ActionOutcome[] = [
  "masked contact",
  "contact fallback",
  "contact error",
  "cancel success",
  "cancel error",
];
const ACTION_CHANGES = [
  "token",
  "auth mode",
  "page navigation",
  "assignment",
  "unmount",
] as const;
const MASKED_URI = "tel:+886000000001";
const FALLBACK_URI = "tel:+886000000002";

function installActionPorts() {
  const browserWindow = window;
  const navigations: string[] = [];
  const reload = vi.fn();
  const alert = vi.fn();
  const confirm = vi.fn(() => true);
  let observedHref = browserWindow.location.href;
  // jsdom's own Location members are non-configurable. Substitute only the
  // browser navigation boundary through the global window port; retain the
  // actual document, React tree, SDK, mapper and application action callbacks.
  const navigationPort = new Proxy({} as Location, {
    get(_target, key) {
      if (key === "reload") return reload;
      if (key === "href") return observedHref;
      return Reflect.get(browserWindow.location, key, browserWindow.location);
    },
    set(_target, key, value: unknown) {
      if (key !== "href")
        throw new Error("Unexpected navigation member: " + String(key));
      observedHref = String(value);
      navigations.push(observedHref);
      return true;
    },
  });
  vi.stubGlobal(
    "window",
    new Proxy(browserWindow, {
      get(target, key) {
        if (key === "location") return navigationPort;
        if (key === "alert") return alert;
        if (key === "confirm") return confirm;
        return Reflect.get(target, key, target);
      },
    }),
  );
  vi.stubGlobal("EventSource", AuthorityEvents);
  const delayed = deferred<Response>();
  const calls: { url: string; method: string; body: string | null }[] = [];
  const latestA = view("assigned");
  // Start on the reassigned screen so v2→v3 retains the real Actions instance.
  latestA.assignment!.assignmentVersion = 2;
  const latestB = view("assigned", ORDER_B);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: typeof init?.body === "string" ? init.body : null,
      });
      if (
        method === "POST" &&
        [endpoint("id", ORDER_A), endpoint("token", ORDER_A)].some(
          (base) => url === base + "/contact" || url === base + "/cancel",
        )
      )
        return delayed.promise;
      if (method === "GET" && url === "/api/passenger-app/fares")
        return apiWireResponse(fares);
      if (method === "GET") {
        if (
          url === endpoint("id", ORDER_A) ||
          url === endpoint("token", ORDER_A) ||
          url === "/api/passenger-rides/" + ORDER_A ||
          url === "/api/passenger-app/rides/opaque-refresh-a"
        )
          return apiWireResponse({ ride: latestA });
        if (
          url === endpoint("id", ORDER_B) ||
          url === endpoint("token", ORDER_B)
        )
          return apiWireResponse({ ride: latestB });
      }
      throw new Error(
        "Unexpected action browser request: " + method + " " + url,
      );
    }),
  );
  return { delayed, calls, navigations, reload, alert, confirm };
}

function actionResponse(outcome: ActionOutcome) {
  if (outcome.endsWith("error"))
    return Response.json(
      {
        error: {
          code: "HELD_ACTION_REJECTED",
          message: "HELD_ACTION_REJECTED",
        },
      },
      { status: 409 },
    );
  if (outcome === "cancel success")
    return apiWireResponse({ rideId: ORDER_A, status: "cancelled" });
  return apiWireResponse({
    mode: outcome === "masked contact" ? "masked_call" : "support_fallback",
    contactUri: outcome === "masked contact" ? MASKED_URI : FALLBACK_URI,
    expiresAt: null,
    unavailableReason:
      outcome === "masked contact"
        ? null
        : "masked_call_provider_not_configured",
  });
}

async function mountAndStartAction(mode: AuthMode, outcome: ActionOutcome) {
  const ports = installActionPorts();
  const mounted = render(page(mode));
  await screen.findByText("CAR-A");
  await waitFor(() => expect(AuthorityEvents.instances).toHaveLength(1));
  const action = outcome.startsWith("cancel") ? "cancel" : "contact";
  const button = screen.getByRole("button", {
    name: action === "cancel" ? "取消行程" : "聯絡司機",
  });
  const response = actionResponse(outcome); // Capture before authority changes.
  fireEvent.click(button);
  await waitFor(() =>
    expect(ports.calls.filter((call) => call.method === "POST")).toEqual([
      {
        url: endpoint(mode, ORDER_A) + "/" + action,
        method: "POST",
        body: JSON.stringify(
          action === "cancel" && mode === "id" ? { rideId: ORDER_A } : {},
        ),
      },
    ]),
  );
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(ports.confirm).toHaveBeenCalledTimes(action === "cancel" ? 1 : 0);
  expect(ports.navigations).toEqual([]);
  expect(ports.reload).not.toHaveBeenCalled();
  expect(ports.alert).not.toHaveBeenCalled();
  return { ...ports, mounted, response, button };
}

describe.each(MODES)("Passenger live action authority: %s", (mode) => {
  describe.each(ACTION_CHANGES)("after %s changes", (change) => {
    it.each(ACTION_OUTCOMES)(
      "does not apply a captured older %s response",
      async (outcome) => {
        const h = await mountAndStartAction(mode, outcome);
        if (change === "token") {
          h.mounted.rerender(page(mode, ORDER_B));
          await screen.findByText("CAR-B");
        } else if (change === "auth mode") {
          // Deliberately retain the exact same token while changing its
          // authority namespace; a token-only fence would miss this case.
          const nextMode = mode === "id" ? "token" : "id";
          h.mounted.rerender(
            React.createElement(PassengerRidePage, {
              token: identifier(mode, ORDER_A),
              authMode: nextMode,
              kind: "ride",
            }),
          );
          const nextEndpoint =
            (nextMode === "token"
              ? "/api/passenger-rides/"
              : "/api/passenger-app/rides/") + identifier(mode, ORDER_A);
          await waitFor(() =>
            expect(
              h.calls.some(
                (call) => call.method === "GET" && call.url === nextEndpoint,
              ),
            ).toBe(true),
          );
          await screen.findByText("CAR-A");
        } else if (change === "page navigation") {
          h.mounted.rerender(
            React.createElement(PassengerRidePage, {
              token: identifier(mode, ORDER_A),
              authMode: mode,
              kind: "fares",
            }),
          );
          await screen.findByText("公開資訊");
          await waitFor(() =>
            expect(
              h.calls.some((call) => call.url === "/api/passenger-app/fares"),
            ).toBe(true),
          );
        } else if (change === "assignment") {
          const replacement = view("assigned");
          replacement.assignment!.assignmentId = "ETA-REPLACEMENT";
          replacement.assignment!.assignmentVersion = 3;
          replacement.assignment!.vehicle.plateNo = "CAR-REPLACEMENT";
          replacement.assignment!.driver.driverId = "REPLACEMENT-DRIVER";
          await send(replacement, "assignment_replaced", 11);
          await screen.findByText("CAR-REPLACEMENT");
          expect(
            screen.getByRole("button", {
              name: outcome.startsWith("cancel") ? "取消行程" : "聯絡司機",
            }),
          ).toBe(h.button);
        } else {
          h.mounted.unmount();
          expect(
            AuthorityEvents.instances.every((source) => source.closed),
          ).toBe(true);
        }
        await act(async () => h.delayed.resolve(h.response));
        expect(h.navigations).toEqual([]);
        expect(h.reload).not.toHaveBeenCalled();
        expect(h.alert).not.toHaveBeenCalled();
        expect(screen.queryByText("目前無法直接聯絡司機")).toBeNull();
        expect(
          screen.queryByRole("button", { name: "重試聯絡司機" }),
        ).toBeNull();
        expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(
          1,
        );
      },
    );
  });

  it.each(ACTION_OUTCOMES)(
    "keeps the current %s response across an ETA event for the same assignment",
    async (outcome) => {
      const h = await mountAndStartAction(mode, outcome);
      const etaOnly = view("assigned");
      etaOnly.assignment!.assignmentVersion = 2;
      const etaTracking = tracking();
      etaTracking.pickupEta.minutes = 7;
      etaTracking.location.recordedAt = new Date().toISOString();
      etaOnly.tracking = etaTracking;
      await send(etaOnly, "eta_changed", 11);
      expect(screen.getByText("預計 7 分鐘抵達")).toBeTruthy();
      expect(etaOnly.assignment!.assignmentId).toBe("ETA-ASSIGNMENT");
      expect(etaOnly.assignment!.assignmentVersion).toBe(2);
      await act(async () => h.delayed.resolve(h.response));
      expect(h.navigations).toEqual(
        outcome === "masked contact" ? [MASKED_URI] : [],
      );
      expect(h.reload).toHaveBeenCalledTimes(
        outcome === "cancel success" ? 1 : 0,
      );
      expect(h.alert).toHaveBeenCalledTimes(outcome.endsWith("error") ? 1 : 0);
      if (outcome.endsWith("error"))
        expect(["HELD_ACTION_REJECTED", "PASSENGER_ACTION_FAILED"]).toContain(
          h.alert.mock.calls[0]?.[0],
        );
      if (outcome === "contact fallback") {
        expect(screen.getByRole("alert").textContent).toContain(
          "目前無法直接聯絡司機",
        );
        expect(
          screen.getByRole("link", { name: "聯絡客服" }).getAttribute("href"),
        ).toBe(FALLBACK_URI);
        expect(
          screen.getByRole("button", { name: "重試聯絡司機" }),
        ).toBeTruthy();
      } else {
        expect(screen.queryByText("目前無法直接聯絡司機")).toBeNull();
      }
      if (!outcome.startsWith("cancel") || outcome.endsWith("error"))
        expect(
          (
            screen.getByRole("button", {
              name: outcome.startsWith("cancel")
                ? "取消行程"
                : outcome === "contact fallback"
                  ? "重試聯絡司機"
                  : "聯絡司機",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false);
      expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(1);
    },
  );
});
