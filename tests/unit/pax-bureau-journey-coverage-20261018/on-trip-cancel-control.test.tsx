/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RideContent } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority } from "../pax-live-tracking-20261017/fixture";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ["arrived_pickup", false],
  ["on_trip", true],
] as const)(
  "renders the real %s ride cancellation control with the authoritative disabled state",
  (status, disabled) => {
    const view = authority(status);
    const original = structuredClone(view);
    const fixture = mapPassengerRideAuthorityToFixture(
      view,
      view.order.orderId,
    );
    const transport = vi.spyOn(global, "fetch");
    const confirmation = vi.spyOn(window, "confirm");
    render(
      <RideContent
        fixture={fixture}
        token={view.order.orderId}
        authMode="id"
      />,
    );

    const cancel = screen.getByRole("button", {
      name: "取消行程",
      exact: true,
    }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(disabled);
    if (disabled) {
      expect(fixture.screenId).toBe("P5-07");
      fireEvent.click(cancel);
      expect(confirmation).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    }
    expect(view).toEqual(original);
  },
);
