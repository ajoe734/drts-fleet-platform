// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { accumulateTripDistanceKm } from "../../../apps/driver-app/lib/trip-metrics";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-location", () => ({
  hasStartedLocationUpdatesAsync: async () => false,
}));
vi.mock("expo-task-manager", () => ({ isTaskDefined: () => true }));
vi.mock("@/lib/api-client", () => ({
  formatDriverError: () => "location port error",
  sanitizeLogMessage: (value: string) => value,
}));
const queued = vi.hoisted(() => vi.fn());
vi.mock("@/lib/driver-location-offline-queue", () => ({
  enqueueDriverLocationEvent: queued,
  flushDriverLocationQueue: async () => {},
  initializeDriverLocationOfflineQueue: async () => {},
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  document.body.innerHTML = "";
});

it("the external review producer reaches actual location subscribers, trip metrics and heartbeat queue, and pause preserves a real gap", async () => {
  vi.stubEnv("EXPO_PUBLIC_REVIEW_DEMO", "true");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
  const heartbeat =
    await import("../../../apps/driver-app/lib/driver-location-heartbeat");
  let previous: { latitude: number; longitude: number } | null = null;
  let distance = 0;
  const observed: string[] = [];
  const unsubscribe = heartbeat.subscribeToDriverLocationUpdates((update) => {
    distance = accumulateTripDistanceKm(distance, previous, update);
    previous = update;
    observed.push(update.recordedAt);
  });
  heartbeat.initializeDriverLocationHeartbeat();
  expect(
    await heartbeat.syncDriverLocationHeartbeat({
      taskId: "actual-ui-task",
      driverId: "pax-review-driver-a",
      status: "on_trip",
    }),
  ).toMatchObject({ status: "active" });
  await vi.advanceTimersByTimeAsync(24_000);
  expect(distance).toBeGreaterThan(0.2);
  expect(distance).toBeLessThan(0.5);
  expect(
    queued.mock.calls.some(
      ([draft]) =>
        draft.taskId === "actual-ui-task" && draft.workState === "on_trip",
    ),
  ).toBe(true);
  const count = observed.length;
  const lastRecordedAt = observed.at(-1);
  document.querySelector<HTMLButtonElement>("#review-gps button")!.click();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(observed).toHaveLength(count);
  document.querySelector<HTMLButtonElement>("#review-gps button")!.click();
  await vi.advanceTimersByTimeAsync(3000);
  expect(Date.parse(observed.at(-1)!) - Date.parse(lastRecordedAt!)).toBe(
    123_000,
  );
  unsubscribe();
  await heartbeat.stopDriverLocationHeartbeat();
});
