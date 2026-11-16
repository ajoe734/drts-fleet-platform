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
import type { PassengerRideContactOption } from "@drts/contracts";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { toApiErrorEnvelope } from "../../../apps/api/src/common/api-envelope";
import { authority } from "../pax-live-tracking-20261017/fixture";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";

type AuthMode = "id" | "token";
type Action = "contact" | "cancel";
const ORDER_A = "11111111-1111-4111-8111-111111111111";
const ORDER_B = "22222222-2222-4222-8222-222222222222";
const UNAVAILABLE: PassengerRideContactOption = {
  mode: "unavailable",
  contactUri: null,
  expiresAt: null,
  unavailableReason: "masked_call_provider_not_configured",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Only the external browser stream is substituted; the real Page and stream
// adapter still create and dispose their normal subscriptions.
class Events {
  static instances: Events[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  constructor(readonly url: string) {
    Events.instances.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

function identifier(mode: AuthMode, orderId: string) {
  return mode === "id"
    ? orderId
    : orderId === ORDER_A
      ? "contact-owner-a"
      : "contact-owner-b";
}
function endpoint(mode: AuthMode, orderId: string) {
  return (
    (mode === "id" ? "/api/passenger-app/rides/" : "/api/passenger-rides/") +
    identifier(mode, orderId)
  );
}
function view(orderId: string) {
  const value = authority("enroute_pickup");
  value.order.orderId = orderId;
  value.order.orderNo = orderId === ORDER_A ? "CONTACT-A" : "CONTACT-B";
  value.assignment!.orderId = orderId;
  value.assignment!.routeFare.orderId = orderId;
  value.assignment!.vehicle.plateNo = orderId === ORDER_A ? "CAR-A" : "CAR-B";
  // These actions match the producer for a nonterminal assigned ride.
  value.actions.canCancel = true;
  value.actions.canContact = true;
  return value;
}
function page(mode: AuthMode, orderId = ORDER_A) {
  return React.createElement(PassengerRidePage, {
    token: identifier(mode, orderId),
    authMode: mode,
    kind: "ride",
  });
}
function installPorts(mode: AuthMode) {
  const posts: {
    url: string;
    action: Action;
    body: unknown;
    response: ReturnType<typeof deferred<Response>>;
  }[] = [];
  vi.stubGlobal("EventSource", Events);
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
        const method = init?.method ?? "GET";
        for (const orderId of [ORDER_A, ORDER_B]) {
          const base = endpoint(mode, orderId);
          if (method === "GET" && url === base)
            return apiWireResponse({ ride: view(orderId) });
          for (const action of ["contact", "cancel"] as const) {
            if (method === "POST" && url === `${base}/${action}`) {
              const response = deferred<Response>();
              posts.push({
                url,
                action,
                body: JSON.parse(String(init?.body)),
                response,
              });
              return response.promise;
            }
          }
        }
        throw new Error(`Unexpected external HTTP request: ${method} ${url}`);
      },
    ),
  );
  return { posts };
}
function contact() {
  return screen.getByRole("button", {
    name: /^(聯絡司機|重試聯絡司機)$/,
  }) as HTMLButtonElement;
}
function cancel() {
  return screen.getByRole("button", { name: "取消行程" }) as HTMLButtonElement;
}
function error(action: Action) {
  // Existing producer errors: the state may change while an HTTP request is
  // outstanding. HTTP responses are SIM; Page/SDK/mapper execute unchanged.
  return Response.json(
    toApiErrorEnvelope(
      action === "contact"
        ? "PASSENGER_CONTACT_NOT_AVAILABLE"
        : "ORDER_NOT_CANCELABLE",
      action === "contact"
        ? "Contact is no longer available."
        : "Order is no longer cancelable.",
    ),
    { status: 409 },
  );
}
async function settle(
  post: ReturnType<typeof installPorts>["posts"][number],
  response: Response,
) {
  // Observe the real fetch/JSON/SDK callback after settlement, not just while
  // the request is unresolved.
  await act(async () => {
    post.response.resolve(response);
  });
}
async function start(mode: AuthMode, action: Action = "contact") {
  const ports = installPorts(mode);
  const mounted = render(page(mode));
  await screen.findByText("CAR-A");
  await waitFor(() => expect(contact().disabled).toBe(false));
  fireEvent.click(action === "contact" ? contact() : cancel());
  await waitFor(() => expect(ports.posts).toHaveLength(1));
  expect(ports.posts[0]!.url).toBe(`${endpoint(mode, ORDER_A)}/${action}`);
  expect(ports.posts[0]!.body).toEqual(
    action === "cancel" && mode === "id" ? { rideId: ORDER_A } : {},
  );
  expect(contact().disabled).toBe(true);
  return { ...ports, mounted };
}
async function switchToPendingB(
  mode: AuthMode,
  h: Awaited<ReturnType<typeof start>>,
) {
  h.mounted.rerender(page(mode, ORDER_B));
  await screen.findByText("CAR-B");
  await waitFor(() => expect(contact().disabled).toBe(false));
  fireEvent.click(contact());
  await waitFor(() => expect(h.posts).toHaveLength(2));
  expect(h.posts[1]!.url).toBe(`${endpoint(mode, ORDER_B)}/contact`);
  expect(contact().disabled).toBe(true);
}
async function finishCurrentB(h: Awaited<ReturnType<typeof start>>) {
  await settle(h.posts[1]!, apiWireResponse(UNAVAILABLE));
  expect(screen.getByRole("alert").textContent).toContain(
    "目前無法直接聯絡司機",
  );
  expect(
    screen.getByRole("link", { name: "聯絡客服" }).getAttribute("href"),
  ).toBe("tel:02-2944-0985");
  expect(contact().disabled).toBe(false);
}

beforeEach(() => {
  window.localStorage.clear();
  Events.instances = [];
  // Native jsdom window stays intact. These are external blocking UI ports;
  // browser navigation/location is neither replaced nor exercised here.
  vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  for (const event of Events.instances) event.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(["id", "token"] as const)(
  "Live passenger contact/cancel request context: %s",
  (mode) => {
    it("keeps the new ride contact pending when an old unavailable result arrives, then allows the current fallback", async () => {
      const h = await start(mode);
      await switchToPendingB(mode, h);
      await settle(h.posts[0]!, apiWireResponse(UNAVAILABLE));
      expect(screen.getByText("CAR-B")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(window.alert).not.toHaveBeenCalled();
      expect(contact().disabled).toBe(true);
      fireEvent.click(contact());
      expect(h.posts).toHaveLength(2);
      await finishCurrentB(h);
    });

    it("does not show the old contact failure over a different ride with its own contact pending", async () => {
      const h = await start(mode);
      await switchToPendingB(mode, h);
      await settle(h.posts[0]!, error("contact"));
      expect(screen.getByText("CAR-B")).toBeTruthy();
      expect(window.alert).not.toHaveBeenCalled();
      expect(contact().disabled).toBe(true);
      await finishCurrentB(h);
    });

    it("does not show the old cancellation failure over a different ride or disturb its pending contact", async () => {
      const h = await start(mode, "cancel");
      expect(window.confirm).toHaveBeenCalledTimes(1);
      await switchToPendingB(mode, h);
      await settle(h.posts[0]!, error("cancel"));
      expect(screen.getByText("CAR-B")).toBeTruthy();
      expect(window.alert).not.toHaveBeenCalled();
      expect(contact().disabled).toBe(true);
      await finishCurrentB(h);
    });

    it("does not interrupt the browser with a late contact failure after leaving the ride page", async () => {
      const h = await start(mode);
      h.mounted.unmount();
      expect(Events.instances.every((event) => event.closed)).toBe(true);
      await settle(h.posts[0]!, error("contact"));
      expect(window.alert).not.toHaveBeenCalled();
    });

    it("still reports current contact and cancellation failures and allows a real contact retry", async () => {
      const h = await start(mode);
      await settle(h.posts[0]!, error("contact"));
      expect(window.alert).toHaveBeenCalledTimes(1);
      expect(window.alert).toHaveBeenLastCalledWith(
        mode === "id"
          ? "Contact is no longer available."
          : "PASSENGER_ACTION_FAILED",
      );
      expect(contact().disabled).toBe(false);
      fireEvent.click(cancel());
      await waitFor(() => expect(h.posts).toHaveLength(2));
      await settle(h.posts[1]!, error("cancel"));
      expect(window.alert).toHaveBeenCalledTimes(2);
      expect(window.alert).toHaveBeenLastCalledWith(
        mode === "id"
          ? "Order is no longer cancelable."
          : "PASSENGER_ACTION_FAILED",
      );
      expect(contact().disabled).toBe(false);
      fireEvent.click(contact());
      await waitFor(() => expect(h.posts).toHaveLength(3));
      await settle(h.posts[2]!, apiWireResponse(UNAVAILABLE));
      expect(screen.getByRole("alert").textContent).toContain(
        "目前無法直接聯絡司機",
      );
      expect(contact().disabled).toBe(false);
      expect(window.alert).toHaveBeenCalledTimes(2);
    });
  },
);
