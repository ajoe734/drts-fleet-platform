/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { ComplaintForm } from "../../../apps/passenger-app-web/components/ride/complaint-form";

const originalFetch = global.fetch;

describe("P5 and A04 Screens validation", () => {
  let fetchCalls: { url: string; method: string; body: any }[] = [];
  let fetchResponse: any = { success: true };

  beforeEach(() => {
    fetchCalls = [];
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts: any = {}) => {
      fetchCalls.push({
        url,
        method: opts?.method || "GET",
        body: opts?.body ? JSON.parse(opts.body) : null,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: fetchResponse }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  const baseView = {
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
        displayName: "Test Driver",
        rating: "4.9",
        avatarUrl: null,
        fleetName: "Test Fleet",
        registrationMaskedDisplay: "****4280",
        registrationStatus: "verified_active",
        registrationEffectiveUntil: "2027-01-01",
      },
      vehicle: { plateNo: "ABC-1234", model: "Toyota", color: "White" },
      location: { lat: 0, lng: 0, bearing: 0 },
      etaSeconds: 300,
      eta: { minutes: 5, calculatedAt: new Date().toISOString() },
      assignmentVersion: 1,
      rating: { displayState: "rated" },
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

  it("P5-01 Awaiting Assignment", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "created" }, assignment: null } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("正在為您安排合適的車輛")).toBeTruthy());
  });

  it("P5-02 Driver En Route", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "enroute_pickup" } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("司機正在前往")).toBeTruthy());
  });

  it("P5-03 Assigned New Driver", async () => {
    const v = { ...baseView, order: { ...baseView.order, status: "enroute_pickup" }, assignment: { ...baseView.assignment, rating: { displayState: "new_driver" } } };
    fetchResponse = { ride: v };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("新進駕駛")).toBeTruthy());
  });

  it("P5-04 Redispatch Required", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "redispatch_required" } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("正在為您改派")).toBeTruthy());
  });

  it("P5-05 Redispatch Complete", async () => {
    const v = { ...baseView, order: { ...baseView.order, status: "enroute_pickup" }, assignment: { ...baseView.assignment, assignmentVersion: 2 } };
    fetchResponse = { ride: v };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("司機正在前往")).toBeTruthy());
  });

  it("P5-06 Driver Arrived", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "arrived_pickup" } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("司機已抵達")).toBeTruthy());
  });

  it("P5-07 Trip In Progress", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "on_trip" } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("行程進行中")).toBeTruthy());
  });

  it("P5-08 Rate Completed Trip", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "completed" } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("請為本趟服務評分")).toBeTruthy());
  });

  it("P5-09 Rating Submitted", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "completed" }, rating: { score: 5 } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("感謝您的評價")).toBeTruthy());
  });

  it("P5-10 Electronic Ride Certificate", async () => {
    fetchResponse = { ride: { ...baseView, receipt: { receiptNo: "R001", issuedAt: "2026-01-01T00:00:00Z", amountMinor: 100, record: { htmlUrl: "https://x.com", pdfUrl: "https://x.com/pdf", fareBaseMinor: 1, fareDistanceMinor: 1, fareTimeMinor: 1, fareNightMinor: 1, distanceMeters: 10, tollMinor: 10, consumerServicePhone: "123", authorityComplaintPhone: "123", plateNo: "123", pickupAt: "2026-01-01T00:00:00Z", dropoffAt: "2026-01-01T00:00:00Z", travelDurationSeconds: 10, routeSummary: "A-B", driverRegistrationNo: "123", paymentMethod: "cash", fleetName: "test", driverName: "test" } } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="receipt" authMode="id" />);
    await waitFor(() => expect(screen.getByText("電子乘車證明")).toBeTruthy());
  });

  it("P5-11 Disclosure Unavailable", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "enroute_pickup" }, assignment: null } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("派車資訊尚未完整")).toBeTruthy());
  });

  it("A04 Exception Hold", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "exception_hold" } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("請稍後重試或聯絡客服")).toBeTruthy());
  });

  it("P5-12 Driver Contact Not Provisioned", async () => {
    fetchResponse = { ride: { ...baseView, order: { ...baseView.order, status: "enroute_pickup" }, actions: { ...baseView.actions, canContact: false } } };
    render(<PassengerRidePage token="uuid" searchParams={{ mode: "live" }} kind="ride" authMode="id" />);
    await waitFor(() => expect(screen.getByText("目前無法直接聯絡司機")).toBeTruthy());
    expect(screen.getByText("請改聯絡客服，我們會協助轉達。")).toBeTruthy();
  });
});
