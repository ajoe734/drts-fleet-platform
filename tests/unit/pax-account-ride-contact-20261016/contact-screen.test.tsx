/** @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";

const ride = {
  order: {
    orderId: "same-account-order",
    orderNo: "ORDER-1",
    status: "enroute_pickup",
    timingMode: "scheduled",
    requestedPickupAt: "2026-10-17T01:00:00.000Z",
    pickup: { address: "Pickup" },
    dropoff: { address: "Dropoff" },
    cancelableUntil: null,
    cancelledAt: null,
    completedAt: null,
  },
  assignment: {
    driver: {
      displayName: "Assigned Driver",
      registrationMaskedDisplay: "****0001",
      registrationEffectiveUntil: "2027-01-01",
      fleetName: "Test Fleet",
    },
    vehicle: { plateNo: "SIM-0001", model: "Test", color: "White" },
    assignmentVersion: 1,
    eta: {
      minutes: 5,
      calculatedAt: "2026-10-17T01:00:00Z",
      locationFreshness: "fresh",
    },
    rating: { displayState: "new_driver" },
    routeFare: {
      estimatedFareMinor: 8500,
      payableFareMinor: 8500,
      estimatedDistanceMeters: 3000,
      estimatedDurationSeconds: 600,
      pickup: { address: "Pickup" },
      dropoff: { address: "Dropoff" },
    },
  },
  rating: null,
  payment: null,
  receipt: null,
  actions: {
    canCancel: true,
    canContact: true,
    canRate: false,
    canReadReceipt: false,
  },
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("live account ride contact fallback", () => {
  it.each(["unavailable", "support_fallback"])(
    "explains %s after the real contact command and offers support explicitly",
    async (mode) => {
      const beforeUrl = window.location.href;
      const fetch = vi.fn(
        async (url: string, init?: RequestInit) =>
          new Response(
            JSON.stringify({
              data:
                init?.method === "POST" && url.endsWith("/contact")
                  ? {
                      mode,
                      contact_uri:
                        mode === "support_fallback" ? "tel:0000000000" : null,
                      expires_at: null,
                      unavailable_reason: "masked_call_provider_not_configured",
                    }
                  : url.endsWith("/active")
                    ? { rides: [] }
                    : { ride },
            }),
            { status: 200 },
          ),
      );
      vi.stubGlobal("fetch", fetch);
      render(
        <PassengerRidePage
          token="same-account-order"
          searchParams={{ mode: "live" }}
          kind="ride"
          authMode="id"
        />,
      );
      fireEvent.click(await screen.findByRole("button", { name: "聯絡司機" }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("目前無法直接聯絡司機");
      expect(alert.textContent).toContain("請改聯絡客服");
      expect(
        screen.getByRole("link", { name: "聯絡客服" }).getAttribute("href"),
      ).toBe(
        mode === "support_fallback" ? "tel:0000000000" : "tel:02-2944-0985",
      );
      expect(window.location.href).toBe(beforeUrl);
      expect(
        fetch.mock.calls.filter(
          ([url, init]) => url.endsWith("/contact") && init?.method === "POST",
        ),
      ).toHaveLength(1);
      expect(screen.getByRole("button", { name: "重試聯絡司機" })).toBeTruthy();
    },
  );

  it("can retry the original contact command after provider absence", async () => {
    const fetch = vi.fn(
      async (url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data:
              init?.method === "POST" && url.endsWith("/contact")
                ? {
                    mode: "unavailable",
                    contact_uri: null,
                    expires_at: null,
                    unavailable_reason: "masked_call_provider_error",
                  }
                : url.endsWith("/active")
                  ? { rides: [] }
                  : { ride },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    render(
      <PassengerRidePage
        token="same-account-order"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "聯絡司機" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "重試聯絡司機" }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(
          ([url, init]) => url.endsWith("/contact") && init?.method === "POST",
        ),
      ).toHaveLength(2),
    );
  });
});
