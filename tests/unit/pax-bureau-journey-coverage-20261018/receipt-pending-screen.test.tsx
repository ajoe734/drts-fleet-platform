/** @vitest-environment jsdom */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RideContent } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import {
  fetchPassengerReceipt,
  mapPassengerRideAuthorityToFixture,
} from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority } from "../pax-live-tracking-20261017/fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders an owned unfinished receipt and retries real Card reads through not-ready, transport failure and recovery", async () => {
  const view = authority("on_trip");
  // The production owned authority permits receipt reads before production.
  view.actions.canReadReceipt = true;
  const original = structuredClone(view);
  const notReady = () =>
    Response.json(
      {
        error: {
          code: "PASSENGER_RECEIPT_NOT_READY",
          message: "The electronic receipt is not ready.",
        },
      },
      { status: 404 },
    );
  // Only HTTP transport is substituted. Actual mapper/Card/retry logic runs.
  const transport = vi
    .fn()
    .mockResolvedValueOnce(notReady())
    .mockRejectedValueOnce(new TypeError("synthetic network disconnect"))
    .mockResolvedValueOnce(notReady());
  vi.stubGlobal("fetch", transport);
  const fixture = mapPassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
    "receipt",
  );
  render(
    <RideContent fixture={fixture} token={view.order.orderId} authMode="id" />,
  );
  expect(screen.getByText("乘車證明準備中")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
  await waitFor(() => {
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("button", {
          name: "重新讀取乘車證明",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  expect(transport.mock.calls[0]![0]).toBe(
    "/api/passenger-app/rides/ETA-ORDER/receipt",
  );
  fireEvent.click(screen.getByRole("button", { name: "重新讀取乘車證明" }));
  await screen.findByText("無法讀取完整乘車證明");
  fireEvent.click(screen.getByRole("button", { name: "重試讀取" }));
  await screen.findByText("乘車證明準備中");
  expect(transport).toHaveBeenCalledTimes(3);
  expect(view).toEqual(original);
});

it("keeps the original receipt scope denial and offers no retry", () => {
  const view = authority("on_trip");
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const fixture = mapPassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
    "receipt",
  );
  render(
    <RideContent
      fixture={fixture}
      token={view.order.orderId}
      authMode="token"
    />,
  );
  expect(screen.getByText("無法讀取完整乘車證明")).toBeTruthy();
  expect(screen.getByText("PASSENGER_RECEIPT_SCOPE_FORBIDDEN")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /重新讀取乘車證明|重試讀取/ }),
  ).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});

it("does not add a receipt certificate to the ordinary on-trip ride screen", () => {
  const view = authority("on_trip");
  view.actions.canReadReceipt = true;
  const fixture = mapPassengerRideAuthorityToFixture(
    view,
    view.order.orderId,
    "ride",
  );
  expect(fixture.screenId).toBe("P5-07");
  expect(fixture.certificate).toBeUndefined();
});

it("preserves the real client's receipt not-ready HTTP status and code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "PASSENGER_RECEIPT_NOT_READY",
            message: "The electronic receipt is not ready.",
          },
        },
        { status: 404 },
      ),
    ),
  );
  await expect(fetchPassengerReceipt("ETA-ORDER")).rejects.toMatchObject({
    status: 404,
    code: "PASSENGER_RECEIPT_NOT_READY",
  });
});
