/** @vitest-environment jsdom */
import React from "react";
import type { PassengerRideAuthorityView } from "@drts/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  PassengerRidePage,
  RatingCard,
} from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { authority, tracking } from "../pax-live-tracking-20261017/fixture";

const TIME = Date.parse("2026-10-19T15:58:00Z");
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TIME);
});

it.each(["id", "token"] as const)(
  "%s low-score contact switch starts off and only explicit opt-in sends true",
  async (authMode) => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return Response.json({ data: { score: 2 } });
      }),
    );
    const fixture = {
      canRate: true,
      ratingSummary: { countText: "Test", chips: [] },
    } as never;
    const first = render(
      <RatingCard fixture={fixture} token="owned-order" authMode={authMode} />,
    );
    fireEvent.click(screen.getByLabelText("2 星"));
    const contact = screen.getByRole("switch", {
      name: "需要客服與您聯繫嗎？",
    }) as HTMLInputElement;
    expect(contact.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "送出評價" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.contactRequested).toBe(false);
    first.unmount();
    render(
      <RatingCard fixture={fixture} token="owned-order" authMode={authMode} />,
    );
    fireEvent.click(screen.getByLabelText("1 星"));
    fireEvent.click(
      screen.getByRole("switch", { name: "需要客服與您聯繫嗎？" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "送出評價" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.contactRequested).toBe(true);
  },
);

it("a higher score suppresses contact even after an explicit low-score opt-in", async () => {
  let payload: Record<string, unknown> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({ data: { score: 5 } });
    }),
  );
  render(
    <RatingCard
      fixture={
        {
          canRate: true,
          ratingSummary: { countText: "Test", chips: [] },
        } as never
      }
      token="owned-order"
      authMode="id"
    />,
  );
  fireEvent.click(screen.getByLabelText("1 星"));
  fireEvent.click(screen.getByRole("switch", { name: "需要客服與您聯繫嗎？" }));
  fireEvent.click(screen.getByLabelText("5 星"));
  expect(screen.queryByRole("switch")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "送出評價" }));
  await waitFor(() => expect(payload?.contactRequested).toBe(false));
});

function view() {
  const result = Object.assign(authority("assigned"), { tracking: tracking() });
  result.tracking.location.recordedAt = new Date(TIME).toISOString();
  result.tracking.pickupEta = {
    minutes: 5,
    calculatedAt: new Date(TIME).toISOString(),
  };
  return result;
}
it("pickup shows minutes, update time and the server-anchored Taipei clock across midnight", () => {
  const input = view();
  const fixture = mapPassengerRideAuthorityToFixture(
    input,
    input.order.orderId,
  );
  expect(fixture.etaMain).toBe("預計 5 分鐘抵達");
  expect(fixture.etaSub).toContain("約 00:03 抵達");
  expect(fixture.etaSub).toContain("更新於");
  vi.setSystemTime(TIME + 30_000);
  expect(
    mapPassengerRideAuthorityToFixture(input, input.order.orderId).etaSub,
  ).toBe(fixture.etaSub);
});
it.each(["stale", "low_accuracy", "missing"] as const)(
  "%s tracking cannot resurrect an ETA from its old snapshot",
  (freshness) => {
    const input = view();
    Object.assign(input.tracking, { locationFreshness: freshness });
    const fixture = mapPassengerRideAuthorityToFixture(
      input,
      input.order.orderId,
    );
    expect(fixture.etaMain).toBeUndefined();
    expect(fixture.etaSub).toBeUndefined();
  },
);
it("invalid pickup timestamps do not produce a clock or crash the real mapper", () => {
  const input = view();
  input.tracking.pickupEta.calculatedAt = "invalid-time";
  const fixture = mapPassengerRideAuthorityToFixture(
    input,
    input.order.orderId,
  );
  expect(fixture.etaSub).toBeUndefined();
});

class Events {
  static current: Events;
  onopen?: () => void;
  onerror?: () => void;
  listeners = new Map<string, (event: { data: string }) => void>();
  constructor() {
    Events.current = this;
  }
  addEventListener(name: string, callback: (event: { data: string }) => void) {
    this.listeners.set(name, callback);
  }
  close() {}
  emit(data: PassengerRideAuthorityView, eventVersion: number) {
    this.listeners.get("eta_changed")?.({
      data: JSON.stringify({
        eventId: String(eventVersion),
        eventType: "eta_changed",
        eventVersion,
        assignmentVersion: 1,
        orderId: data.order.orderId,
        occurredAt: new Date(TIME + 10_000).toISOString(),
        data,
      }),
    });
  }
}
it("the actual mounted stream updates the arrival clock and rejects an older replay", async () => {
  vi.stubGlobal("EventSource", Events);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: view() })),
  );
  render(
    <PassengerRidePage token="owned-token" authMode="token" kind="ride" />,
  );
  await screen.findByText(/約 00:03 抵達/);
  await act(async () => Events.current.onopen?.());
  const next = view();
  next.tracking.location.lat += 0.01;
  next.tracking.location.recordedAt = new Date(TIME + 10_000).toISOString();
  next.tracking.pickupEta = {
    minutes: 2,
    calculatedAt: new Date(TIME + 10_000).toISOString(),
  };
  await act(async () => Events.current.emit(next, 2));
  await screen.findByText(/約 00:00 抵達/);
  await act(async () => Events.current.emit(view(), 1));
  expect(screen.queryByText(/約 00:03 抵達/)).toBeNull();
});

function onTripView(): PassengerRideAuthorityView {
  const result: PassengerRideAuthorityView = view();
  result.order.status = "on_trip";
  result.order.dropoff = {
    address: "Canonical destination",
    lat: 25.1,
    lng: 121.1,
  };
  result.tracking!.pickupEta = null;
  result.tracking!.dropoffRoute = {
    leg: "dropoff",
    source: "geo_route",
    provider: "existing-road-provider",
    assignmentId: result.assignment!.assignmentId,
    assignmentVersion: 1,
    taskId: "ETA-TASK",
    origin: {
      lat: result.tracking!.location!.lat,
      lng: result.tracking!.location!.lng,
    },
    destination: { lat: 25.1, lng: 121.1 },
    locationRecordedAt: result.tracking!.location!.recordedAt,
    generatedAt: new Date(TIME).toISOString(),
    remainingDistanceMeters: 1200,
    remainingDurationSeconds: 180,
  };
  return result;
}
it("live remaining road distance stays separate from the immutable quoted route", () => {
  const input = onTripView();
  const result = mapPassengerRideAuthorityToFixture(input, input.order.orderId);
  expect(result.etaMain).toBe("約 00:01 抵達目的地");
  expect(result.etaSub).toContain("剩餘 1.2 公里");
  expect(result.routeDistanceKm).toBe("約 4.0 公里");
});
it.each([
  "stale",
  "missing",
  "bad_time",
  "bad_distance",
  "foreign_assignment",
  "foreign_version",
  "foreign_driver",
  "foreign_vehicle",
  "old_gps",
  "foreign_destination",
  "completed",
  "cancelled",
] as const)("%s cannot display a remaining-route promise", (fault) => {
  const input = onTripView();
  const route = input.tracking!.dropoffRoute!;
  if (fault === "stale") input.tracking!.locationFreshness = "stale";
  if (fault === "missing") input.tracking = null;
  if (fault === "bad_time") route.generatedAt = "invalid";
  if (fault === "bad_distance") route.remainingDistanceMeters = NaN;
  if (fault === "foreign_assignment") route.assignmentId = "OTHER";
  if (fault === "foreign_version") route.assignmentVersion++;
  if (fault === "foreign_driver") input.tracking!.driverId = "OTHER";
  if (fault === "foreign_vehicle") input.tracking!.vehicleId = "OTHER";
  if (fault === "old_gps")
    input.tracking!.location!.recordedAt = new Date(
      TIME - 60_000,
    ).toISOString();
  if (fault === "foreign_destination") route.destination.lat = 24;
  if (fault === "completed" || fault === "cancelled")
    input.order.status = fault;
  const result = mapPassengerRideAuthorityToFixture(input, input.order.orderId);
  expect(result.etaMain).toBeUndefined();
  expect(result.etaSub).toBeUndefined();
});
it("the mounted on-trip page updates the clock and remaining road distance and suppresses old/offline/terminal promises", async () => {
  vi.stubGlobal("EventSource", Events);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: onTripView() })),
  );
  render(
    <PassengerRidePage token="owned-token" authMode="token" kind="ride" />,
  );
  await screen.findByText("約 00:01 抵達目的地");
  expect(screen.getByText(/剩餘 1.2 公里/)).toBeTruthy();
  await act(async () => Events.current.onopen?.());
  const next = onTripView();
  next.tracking!.location!.lat += 0.001;
  next.tracking!.location!.recordedAt = new Date(TIME + 10_000).toISOString();
  next.tracking!.dropoffRoute = {
    ...next.tracking!.dropoffRoute!,
    origin: {
      lat: next.tracking!.location!.lat,
      lng: next.tracking!.location!.lng,
    },
    locationRecordedAt: next.tracking!.location!.recordedAt,
    generatedAt: new Date(TIME + 10_000).toISOString(),
    remainingDistanceMeters: 700,
    remainingDurationSeconds: 120,
  };
  vi.setSystemTime(TIME + 10_000);
  await act(async () => Events.current.emit(next, 2));
  await screen.findByText("約 00:00 抵達目的地");
  expect(screen.getByText(/剩餘 0.7 公里/)).toBeTruthy();
  await act(async () => Events.current.emit(onTripView(), 1));
  expect(screen.queryByText(/剩餘 1.2 公里/)).toBeNull();
  await act(async () => Events.current.onerror?.());
  expect(screen.queryByText("約 00:00 抵達目的地")).toBeNull();
  expect(screen.getByText("目前無法預估抵達時間與剩餘距離")).toBeTruthy();
  await act(async () => Events.current.onopen?.());
  const completed = onTripView();
  completed.order.status = "completed";
  await act(async () => Events.current.emit(completed, 3));
  expect(screen.queryByText(/抵達目的地/)).toBeNull();
  expect(screen.queryByText(/剩餘 0.7 公里/)).toBeNull();
});
