/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RidesListPage from "../../../apps/passenger-app-web/app/rides/page";
import { authority } from "../pax-live-tracking-20261017/fixture";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";

beforeEach(() => {
  window.localStorage.removeItem("drts.passenger.functional-demo.v1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("completed ride history fare through the real passenger client", () => {
  it.each([
    {
      name: "shows the issued metered fare instead of the booking estimate",
      chargingMode: "meter_estimate" as const,
      payableMinor: null,
      receiptMinor: 24500,
      expected: "車資 NT$ 245",
    },
    {
      name: "retains a zero-amount receipt instead of replacing it with an estimate",
      chargingMode: "meter_estimate" as const,
      payableMinor: null,
      receiptMinor: 0,
      expected: "車資 NT$ 0",
    },
    {
      name: "retains the estimate while the completed ride awaits its receipt",
      chargingMode: "meter_estimate" as const,
      payableMinor: null,
      receiptMinor: null,
      expected: "車資 NT$ 185",
    },
    {
      name: "retains the agreed fixed fare when the receipt matches the quote",
      chargingMode: "fixed_quote" as const,
      payableMinor: 21000,
      receiptMinor: 21000,
      expected: "車資 NT$ 210",
    },
  ])(
    "$name",
    async ({ chargingMode, payableMinor, receiptMinor, expected }) => {
      const ride = authority("completed");
      const orderId = "6d7a991d-39f0-47a0-a4d5-d80dbab0b515";
      ride.order = { ...ride.order, orderId };
      ride.assignment = {
        ...ride.assignment!,
        orderId,
        routeFare: {
          ...ride.assignment!.routeFare,
          orderId,
          chargingMode,
          estimatedFareMinor: 18500,
          payableFareMinor: payableMinor,
        },
      };
      ride.receipt =
        receiptMinor === null
          ? null
          : {
              receiptId: "HISTORY-ISSUED-RECEIPT",
              orderId: ride.order.orderId,
              receiptNo: "HISTORY-RECEIPT-001",
              amountMinor: receiptMinor,
              currency: "TWD",
              issuedAt: "2026-10-17T05:16:00Z",
              record: {},
            };
      const original = structuredClone(ride);
      // Only HTTP transport is simulated. The real page, runtime fetch,
      // PassengerClient envelope handling and history rendering all execute.
      const transport = vi.fn(async (url: string | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET") !== "GET") {
          throw new Error(`Unexpected history method: ${init?.method}`);
        }
        if (String(url) === "/api/passenger-app/rides/active") {
          return apiWireResponse({ rides: [], nextCursor: null });
        }
        if (String(url) === "/api/passenger-app/rides?limit=20") {
          return apiWireResponse({ rides: [ride], nextCursor: null });
        }
        throw new Error(`Unexpected history URL: ${String(url)}`);
      });
      vi.stubGlobal("fetch", transport);

      render(<RidesListPage />);

      // Wait for the real completed row, then compare the settled fare
      // synchronously so a wrong amount cannot masquerade as pending loading.
      const pickup = await screen.findByText(ride.order.pickup.address);
      expect(screen.getByText("已完成")).toBeTruthy();
      const historyLink = pickup.closest("a");
      expect(historyLink?.getAttribute("href")).toBe(`/rides/${orderId}`);
      expect(transport).toHaveBeenCalledTimes(2);
      expect(transport.mock.calls.map(([url]) => String(url))).toEqual(
        expect.arrayContaining([
          "/api/passenger-app/rides/active",
          "/api/passenger-app/rides?limit=20",
        ]),
      );
      expect(ride).toEqual(original);
      const fare = screen.getByText(expected);
      expect(fare.closest("a")).toBe(historyLink);
    },
  );
});
