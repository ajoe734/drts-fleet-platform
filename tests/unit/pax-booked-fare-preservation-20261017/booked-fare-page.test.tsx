/** @vitest-environment jsdom */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { authority } from "../pax-live-tracking-20261017/fixture";
import { bookedQuote } from "./fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders the saved booking estimate alongside timeout guidance and the original cancellation action", async () => {
  const view = authority("dispatch_timeout");
  view.bookingQuote = bookedQuote;
  view.actions = {
    canCancel: true,
    canContact: false,
    canRate: false,
    canReadReceipt: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: view }),
    })),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
  render(
    <PassengerRidePage
      token={view.order.orderId}
      authMode="token"
      kind="ride"
    />,
  );
  expect((await screen.findAllByText("派車逾時")).length).toBeGreaterThan(0);
  expect(await screen.findByText("預估 NT$ 85–NT$ 125")).toBeTruthy();
  expect(screen.getByText(/約 4\.2 公里/)).toBeTruthy();
  expect(screen.getByText(/約 14 分鐘/)).toBeTruthy();
  expect(screen.queryByText("依計費表實際金額收費")).toBeNull();
  expect(screen.queryByText("TEST-ETA")).toBeNull();
  expect(
    screen.getByRole("button", { name: "取消行程", exact: true }),
  ).toHaveProperty("disabled", false);
});
