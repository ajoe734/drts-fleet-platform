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

// Typed authority/order payload is the HTTP boundary. Keep the real normal
// Passenger SDK, mapper and page consumer; no entitlement/equipment claim.
it.each([true, false])(
  "normal same-order status shows only its actual wheelchair requirement (%s)",
  async (accessible) => {
    const view = authority("dispatch_timeout");
    view.bookingQuote = bookedQuote;
    if (accessible) view.order.serviceSelection = { accessible: true };
    const paths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          "https://passenger-UI-SIM.example.invalid",
        );
        paths.push(url.pathname);
        expect(url.pathname).toBe(
          `/api/passenger-app/rides/${view.order.orderId}`,
        );
        return Response.json({ data: { ride: view } });
      }),
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
        authMode="id"
        kind="ride"
      />,
    );
    expect((await screen.findAllByText("派車逾時")).length).toBeGreaterThan(0);
    expect(paths).toContain(`/api/passenger-app/rides/${view.order.orderId}`);
    if (accessible)
      expect(
        screen.getByTestId("passenger-wheelchair-requirement").textContent,
      ).toBe("輪椅需求");
    else
      expect(
        screen.queryByTestId("passenger-wheelchair-requirement"),
      ).toBeNull();
    expect(await screen.findByText("預估 NT$ 85–NT$ 125")).toBeTruthy();
  },
);
