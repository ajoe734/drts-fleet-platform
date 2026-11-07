/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MultiTaxiElectronicReceipt,
  PassengerDispatchDisclosureSnapshot,
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";

import { PassengerRidePage } from "@/components/passenger-ride-page";

const token = "legacy-cancelled-token";
const orderId = "legacy-cancelled-order";
const rideUrl = `/control-plane-proxy/passenger-rides/${token}`;
const timestamp = "2026-11-05T00:00:00.000Z";

type Listener = (event: Event) => void;

// Substitute the external event transport, keeping the real stream parser,
// event-version guard, authority mapper and PassengerRidePage in the call path.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Listener[]>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  emit(envelope: PassengerRideSseEventEnvelope) {
    const event = new MessageEvent<string>(envelope.eventType, {
      data: JSON.stringify(envelope),
    });
    for (const listener of this.listeners.get(envelope.eventType) ?? []) {
      listener(event);
    }
  }

  close() {
    this.closed = true;
  }
}

function assignment(): PassengerDispatchDisclosureSnapshot {
  const location = (address: string) => ({
    address,
    addressName: address,
    lat: 25.0339,
    lng: 121.5645,
    coordinateSource: "provider_candidate" as const,
    geocodeConfidence: "exact" as const,
    resolvedAt: timestamp,
  });
  return {
    snapshotId: "legacy-cancelled-snapshot",
    runtimeProfileCode: "multi_taxi_direct",
    orderId,
    bookingId: null,
    dispatchJobId: "legacy-cancelled-dispatch",
    assignmentId: "legacy-cancelled-assignment",
    assignmentVersion: 1,
    vehicle: {
      vehicleId: "legacy-cancelled-vehicle",
      make: "Toyota",
      model: "Corolla Altis",
      plateNo: "TEST-1001",
      modelYear: 2024,
      doorCount: 4,
      color: "白色",
      profileVersion: 1,
    },
    driver: {
      driverId: "legacy-cancelled-driver",
      displayName: "測試駕駛",
      registrationMaskedDisplay: "測試登記第1***01號",
      registrationStatus: "verified_active",
      registrationEffectiveUntil: "2027-12-31",
      credentialVersion: 1,
    },
    rating: {
      displayState: "rated",
      averageRating: 4.9,
      ratingCount: 10,
      aggregateVersion: 1,
    },
    eta: {
      minutes: 6,
      calculatedAt: timestamp,
      locationFreshness: "fresh",
    },
    routeFare: {
      routeSnapshotId: "legacy-cancelled-route",
      quoteSnapshotId: "legacy-cancelled-quote",
      orderId,
      pickup: location("測試上車地點"),
      dropoff: location("測試下車地點"),
      estimatedDistanceMeters: 6200,
      estimatedDurationSeconds: 1080,
      encodedPolyline: null,
      chargingMode: "meter_estimate",
      estimatedFareMinor: 35500,
      payableFareMinor: null,
      currency: "TWD",
      farePolicyId: "legacy-cancelled-fare-policy",
      farePolicyVersion: "1",
      fareChangeRuleId: "legacy-cancelled-fare-rule",
      fareChangeRuleVersion: "1",
      fareChangeRuleDisplayText: "依實際行程計費",
      passengerConfirmedAt: null,
      generatedAt: timestamp,
    },
    createdAt: timestamp,
    supersededAt: null,
  };
}

function authority(
  status: PassengerRideAuthorityView["order"]["status"],
  currentAssignment: PassengerDispatchDisclosureSnapshot | null = null,
): PassengerRideAuthorityView {
  return {
    order: {
      orderId,
      orderNo: "LEGACY-CANCELLED-001",
      status,
      timingMode: "on_demand",
      requestedPickupAt: timestamp,
      pickup: { address: "測試上車地點" },
      dropoff: { address: "測試下車地點" },
      cancelableUntil: null,
      cancelledAt: status === "cancelled" ? timestamp : null,
      completedAt: null,
    },
    assignment: currentAssignment,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: status !== "cancelled",
      canRate: false,
      canContact: status !== "cancelled" && currentAssignment !== null,
      canReadReceipt: false,
    },
  };
}

function receipt(): MultiTaxiElectronicReceipt {
  // Same complete legal-field shape as the original passenger-live.test.ts
  // createReceipt fixture. Keep the actual receipt mapper in the caller path.
  return {
    receiptId: "legacy-cancelled-receipt",
    orderId,
    receiptNo: "RC-LEGACY-CANCELLED-001",
    amountMinor: 35500,
    currency: "TWD",
    issuedAt: "2026-11-05T01:05:00.000Z",
    record: {
      plateNo: "TEST-1001",
      pickupAt: "2026-11-05T00:20:00.000Z",
      dropoffAt: "2026-11-05T01:00:00.000Z",
      travelDurationSeconds: 2400,
      routeSummary: "台北車站至松山機場",
      distanceMeters: 6400,
      tollMinor: 0,
      consumerServicePhone: "0800-090-000",
      authorityComplaintPhone: "1999",
    },
  };
}

async function mountAuthority(view: PassengerRideAuthorityView) {
  // Only the HTTP boundary is substituted; do not replace the page, its cards,
  // live adapter, mapper or Next Link with mocks.
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    expect(input).toBe(rideUrl);
    return Response.json({ data: view });
  });
  vi.stubGlobal("fetch", transport);
  const mounted = render(
    React.createElement(PassengerRidePage, {
      token,
      kind: "ride",
      searchParams: { mode: "live" },
    }),
  );
  await waitFor(() => {
    expect(FakeEventSource.instances).toHaveLength(1);
  });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport).toHaveBeenCalledWith(rideUrl, { cache: "no-store" });
  const source = FakeEventSource.instances[0]!;
  expect(source.url).toBe(`${rideUrl}/events`);
  expect(source.listeners.get("trip_cancelled")).toHaveLength(1);
  return { ...mounted, source, transport };
}

function expectNoActiveRideContent() {
  expect(screen.queryByText("正在為您安排合適的車輛")).toBeNull();
  expect(screen.queryByText("正在為您安排另一輛車")).toBeNull();
  expect(screen.queryByText(/預約時間.*通常/)).toBeNull();
  expect(screen.queryByText(/預計\s*\d+\s*分鐘抵達/)).toBeNull();
  expect(screen.queryByText("您的車輛與駕駛")).toBeNull();
  expect(screen.queryByText("上車前請核對車牌")).toBeNull();
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeEventSource.instances = [];
});

describe("legacy passenger cancelled terminal ride", () => {
  it("renders an initially cancelled unassigned authority without promising vehicle arrangement", async () => {
    await mountAuthority(authority("cancelled"));

    expect((await screen.findAllByText("行程已取消")).length).toBeGreaterThan(
      0,
    );
    expectNoActiveRideContent();
  });

  it("removes active ETA and driver content after a valid cancellation event retains the assignment", async () => {
    const active = authority("assigned", assignment());
    const { source, transport } = await mountAuthority(active);
    expect(await screen.findByText("預計 6 分鐘抵達")).toBeTruthy();
    expect(screen.getByText("測試駕駛")).toBeTruthy();
    expect(screen.getByText("TEST-1001")).toBeTruthy();

    // Cancellation is terminal even when the immutable assignment disclosure
    // remains in the authoritative snapshot. Do not erase the input to hide it.
    const cancelled = authority("cancelled", active.assignment);
    const event: PassengerRideSseEventEnvelope = {
      eventId: "legacy-cancelled-event-2",
      eventType: "trip_cancelled",
      eventVersion: 2,
      assignmentVersion: active.assignment!.assignmentVersion,
      orderId,
      occurredAt: "2026-11-05T00:01:00.000Z",
      data: cancelled,
    };
    expect(cancelled.assignment).toBe(active.assignment);
    expect(cancelled.assignment?.eta.minutes).toBe(6);
    await act(async () => {
      source.emit(event);
    });

    expect((await screen.findAllByText("行程已取消")).length).toBeGreaterThan(
      0,
    );
    expectNoActiveRideContent();
    expect(screen.queryByText("測試駕駛")).toBeNull();
    expect(screen.queryByText("TEST-1001")).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("continues arranging a vehicle for an ordinary unassigned awaiting ride", async () => {
    await mountAuthority(authority("created"));

    expect(await screen.findByText("正在為您安排合適的車輛")).toBeTruthy();
    expect(screen.queryByText("行程已取消")).toBeNull();
    expect(screen.queryByText(/預計\s*\d+\s*分鐘抵達/)).toBeNull();
  });

  it("keeps terminal guidance and actual refund/certificate data for a cancelled ride with a receipt", async () => {
    const view = authority("cancelled", assignment());
    view.payment = {
      status: "refunded",
      amount: { amountMinor: 35500, currency: "NTD" },
    };
    view.receipt = receipt();
    view.order.cancelledAt = "2026-11-05T01:10:00.000Z";
    view.actions.canReadReceipt = true;
    const { transport } = await mountAuthority(view);

    // The ride route still needs terminal guidance when receipt presence makes
    // the real mapper choose P5-10. This does not change the direct receipt route.
    expect(await screen.findByText("已退款")).toBeTruthy();
    expect(screen.getByText("退款狀態已由付款服務確認。")).toBeTruthy();
    expect(screen.getByText("RC-LEGACY-CANCELLED-001")).toBeTruthy();
    for (const label of [
      "乘車證明編號",
      "開立時間",
      "車號",
      "上車時間",
      "下車時間",
      "行駛時間",
      "路線",
      "行駛里程",
      "車資金額",
      "通行費",
      "客服電話",
      "主管機關申訴電話",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The plate remains as historical legal certificate data, never as an
    // active vehicle promise. The receipt itself supplies this customer phone.
    expect(screen.getByText("TEST-1001")).toBeTruthy();
    expect(screen.getByText("台北車站至松山機場")).toBeTruthy();
    expect(screen.getByText("40 分鐘")).toBeTruthy();
    expect(screen.getByText("6.4 公里")).toBeTruthy();
    expect(screen.getByText("0800-090-000")).toBeTruthy();
    expect(screen.getByText("1999")).toBeTruthy();
    expect(screen.getAllByText("NT$ 355").length).toBe(2);
    expect(screen.getByText("NT$ 0")).toBeTruthy();
    expect(screen.queryByText("無法讀取完整乘車證明")).toBeNull();

    expect(screen.getByText(/原預約管道/)).toBeTruthy();
    expect(screen.queryAllByText("行程已取消").length).toBeGreaterThan(0);
    expectNoActiveRideContent();
    expect(screen.queryByText("測試駕駛")).toBeNull();
    for (const name of ["聯絡司機", "聯絡客服", "取消行程"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
