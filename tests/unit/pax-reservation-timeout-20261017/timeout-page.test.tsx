/** @vitest-environment jsdom */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { authority } from "../pax-live-tracking-20261017/fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renders the real Passenger page with a timeout explanation and the original order, without the normal assignment promise", async () => {
  const view = authority("dispatch_timeout");
  view.actions = {
    canCancel: true,
    canContact: false,
    canRate: false,
    canReadReceipt: false,
  };
  const oldPlate = view.assignment!.vehicle.plateNo;
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
  expect(
    (await screen.findAllByText(/尚未有司機完成接單/)).length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText(view.order.orderNo).length).toBeGreaterThan(0);
  expect(screen.queryByText(/通常 1–3 分鐘完成指派/)).toBeNull();
  expect(screen.queryByText(oldPlate)).toBeNull();
  expect(
    screen.getByRole("button", { name: "取消行程", exact: true }),
  ).toHaveProperty("disabled", false);
});
