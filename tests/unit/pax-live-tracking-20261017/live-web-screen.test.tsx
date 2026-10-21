/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PassengerRidePage } from "../../../apps/passenger-app-web/components/ride/passenger-ride-page";
import { authority, NOW, tracking } from "./fixture";

// Only HTTP/EventSource transport boundaries are synthetic. The actual mounted
// Web page, production event reducer, mapper and position diagram run together.
class TestEventSource {
  static current: TestEventSource;
  onopen?: () => void;
  onerror?: () => void;
  listeners = new Map<string, (event: { data: string }) => void>();
  constructor() {
    TestEventSource.current = this;
  }
  addEventListener(name: string, handler: (event: { data: string }) => void) {
    this.listeners.set(name, handler);
  }
  close() {}
  emit(
    data: ReturnType<typeof authority> & {
      tracking: ReturnType<typeof tracking>;
    },
    eventVersion: number,
  ) {
    this.listeners.get("driver_location_updated")?.({
      data: JSON.stringify({
        eventId: `gps-${eventVersion}`,
        eventType: "driver_location_updated",
        assignmentVersion: 1,
        eventVersion,
        orderId: "ETA-ORDER",
        occurredAt: new Date(NOW).toISOString(),
        data,
      }),
    });
  }
}
const view = () => {
  const result = Object.assign(authority("assigned"), { tracking: tracking() });
  result.tracking.location.lat = 25.025;
  result.tracking.location.lng = 121.025;
  return result;
};
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.stubGlobal("EventSource", TestEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: view() }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("the mounted Passenger page moves the actual GPS marker on a named event and ages observation time", async () => {
  render(<PassengerRidePage token="ETA-TOKEN" authMode="token" kind="ride" />);
  await screen.findByText("預計 3 分鐘抵達");
  await act(async () => TestEventSource.current.onopen?.());
  await screen.findByText("位置更新於 5 秒前");
  const marker = screen.getByTestId("passenger-live-driver-position");
  const initialLeft = marker.style.left;
  const next = view();
  next.tracking.location.lat = 25.075;
  next.tracking.location.lng = 121.075;
  await act(async () => TestEventSource.current.emit(next, 1));
  await waitFor(() => expect(marker.style.left).not.toBe(initialLeft));
  expect(screen.getByText("位置更新於 5 秒前")).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61000);
  });
  expect(screen.getByText("司機位置更新稍有延遲")).toBeTruthy();
});

it("a new stream event cannot make an old GPS observation appear fresh", async () => {
  render(<PassengerRidePage token="ETA-TOKEN" authMode="token" kind="ride" />);
  await screen.findByText("預計 3 分鐘抵達");
  const next = view();
  next.tracking.location.recordedAt = new Date(NOW - 120000).toISOString();
  await act(async () => {
    TestEventSource.current.onopen?.();
    TestEventSource.current.emit(next, 1);
  });
  expect(screen.getByText("司機位置更新稍有延遲")).toBeTruthy();
  expect(screen.queryByText(/^位置更新於 \d+ 秒前$/)).toBeNull();
});

it("a completed ride does not promise to fetch or display the Driver current position", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { ...authority("completed"), tracking: null },
      }),
    })),
  );
  render(<PassengerRidePage token="ETA-TOKEN" authMode="token" kind="ride" />);
  await screen.findByText("行程已完成");
  expect(screen.queryByText("正在取得司機位置")).toBeNull();
  expect(screen.queryByTestId("passenger-live-driver-position")).toBeNull();
});
