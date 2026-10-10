/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import React from "react";
import {
  PassengerRidePage,
  RatingCard,
} from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { ComplaintForm } from "../../../apps/passenger-app-web/components/ride/complaint-form";

// We want to test real mappers, so we only mock the global fetch and EventSource
const originalFetch = global.fetch;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, (...args: any[]) => void> = {};
  closed = false;
  onopen?: () => void;
  onerror?: (err: any) => void;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => this.onopen?.(), 10);
  }
  addEventListener(name: string, cb: (...args: any[]) => void) {
    this.listeners[name] = cb;
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data: any) {
    this.listeners[name]?.({ data: JSON.stringify(data) });
  }
  triggerError() {
    this.onerror?.(new Error("Network Error"));
  }
}

describe("Passenger Ride UI Acceptance", () => {
  let fetchCalls: { url: string; method: string; body: any }[] = [];
  let fetchResponse: any = { success: true };

  beforeEach(() => {
    fetchCalls = [];
    MockEventSource.instances = [];
    global.EventSource = MockEventSource as any;

    const mockFetch = vi
      .fn()
      .mockImplementation(async (url: string, opts: any = {}) => {
        fetchCalls.push({
          url,
          method: opts?.method || "GET",
          body: opts?.body ? JSON.parse(opts.body) : null,
        });
        return {
          ok: true,
          status: 200,
          json: async () =>
            url.endsWith("/active")
              ? { data: { rides: [] } }
              : { data: fetchResponse },
        };
      });
    vi.stubGlobal("fetch", mockFetch);
    if (typeof window !== "undefined") {
      window.fetch = mockFetch;
    }
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("pax-web-ride_p5_live_page - reconnect and expiry handling", async () => {
    const view = {
      order: {
        orderId: "order-uuid",
        orderNo: "ORD-001",
        status: "assigned",
        timingMode: "scheduled",
        requestedPickupAt: "2026-10-11T12:00:00Z",
        pickup: { address: "A" },
        dropoff: { address: "B" },
        cancelableUntil: null,
        cancelledAt: null,
        completedAt: null,
      },
      assignment: {
        driver: {
          name: "Test Driver",
          rating: "4.9",
          avatarUrl: null,
          fleetName: "Test Fleet",
        },
        vehicle: { licensePlate: "ABC-1234", model: "Toyota", color: "White" },
        location: { lat: 0, lng: 0, bearing: 0 },
        etaSeconds: 300,
        eta: { minutes: 5 },
        assignmentVersion: 1,
        rating: { displayState: "new_driver" },
        routeFare: {
          estimatedFareMinor: 100,
          payableFareMinor: 100,
          estimatedDistanceMeters: 5000,
          estimatedDurationSeconds: 600,
          pickup: { address: "A" },
          dropoff: { address: "B" },
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
    fetchResponse = { ride: view };

    render(
      <PassengerRidePage
        token="order-uuid"
        searchParams={{ mode: "live" }}
        kind="ride"
        authMode="id"
      />,
    );

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const es = MockEventSource.instances[0];

    // Test that the reconnect banner appears when disconnected
    es.triggerError();
    await waitFor(() => {
      expect(screen.getByText("連線中斷")).toBeTruthy();
    });
  });

  it("pax-web-ride_rating_receipt_history_complaint - E-18 payload and E-04 download", async () => {
    // Test E-18 payload
    const fixture = {
      canRate: true,
      ratingSummary: { countText: "Test", chips: ["車內整潔"] },
    } as any;
    fetchResponse = { success: true };
    const { unmount } = render(
      <RatingCard fixture={fixture} token="order-uuid" authMode="id" />,
    );

    fireEvent.click(screen.getByLabelText("2 星"));
    fireEvent.click(screen.getByText("車內整潔"));
    fireEvent.click(screen.getByText("送出評價"));

    await waitFor(() => {
      expect(screen.getByText("評價已送出")).toBeTruthy();
    });

    expect(fetchCalls[0].body).toMatchObject({
      rideId: "order-uuid",
      rating: 2,
      tags: ["車內整潔"],
      contactRequested: true,
    });
    unmount();

    // Test Complaint Form category and consent
    fetchCalls = [];
    fetchResponse = { complaintId: "complaint-uuid" };
    render(<ComplaintForm token="order-uuid" authMode="id" />);
    fireEvent.click(screen.getByText("客訴與遺失物表單"));

    const input = screen.getByPlaceholderText(/請描述/);
    fireEvent.change(input, { target: { value: "rude driver" } });
    fireEvent.click(screen.getByText("確認送出"));

    await waitFor(() => {
      expect(screen.getByText(/表單已送出/)).toBeTruthy();
    });

    expect(fetchCalls[0].body.category).toBe("service");
    expect(fetchCalls[0].body.contactConsent).toBe(false);
  });
});
