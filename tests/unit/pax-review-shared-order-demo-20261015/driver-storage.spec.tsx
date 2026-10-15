// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({
  platform: { OS: "web" },
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: external.platform }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: external.get,
  setItemAsync: external.set,
  deleteItemAsync: external.remove,
}));
vi.mock("@drts/api-client", () => ({
  createPublicClient: () => ({}),
  createDriverBearerClient: () => ({}),
  createDriverClient: () => ({}),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  external.platform.OS = "web";
});

it("the actual Web marker store persists and reports an honest restart gap using the shared storage adapter", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
  const recovery =
    await import("../../../apps/driver-app/lib/driver-tracking-recovery");
  const marker = await recovery.recordTrackingHeartbeat({
    taskId: "review-task",
    driverId: "review-driver",
    vehicleId: null,
    workState: "on_trip",
    recordedAt: "2026-10-15T06:00:00Z",
    sequenceNo: 7,
  });
  expect(window.sessionStorage.length).toBe(1);
  expect(
    Object.values(window.sessionStorage).some(
      (raw) => JSON.parse(raw).lastSequenceNo === marker.lastSequenceNo,
    ),
  ).toBe(true);
  vi.setSystemTime(new Date("2026-10-15T06:10:00Z"));
  const result = await recovery.evaluateTrackingRecovery({
    activeAssignment: { taskId: "review-task", driverId: "review-driver" },
  });
  expect(result).toMatchObject({
    marker: { lastSequenceNo: 7 },
    gap: { gapDurationMs: 600000 },
    diagnostic: { status: "gap_detected", activeTaskId: "review-task" },
  });
  expect(external.get).not.toHaveBeenCalled();
  expect(external.set).not.toHaveBeenCalled();
  await recovery.clearTrackingSession();
  expect(window.sessionStorage.length).toBe(0);
});

it("native storage selection retains the original SecureStore operations", async () => {
  const { driverStorage } =
    await import("../../../apps/driver-app/lib/api-client");
  external.platform.OS = "ios";
  const browserStore = window.sessionStorage;
  vi.stubGlobal("document", undefined);
  external.get.mockResolvedValue("native-value");
  await driverStorage.setItemAsync("native-key", "native-value");
  expect(await driverStorage.getItemAsync("native-key")).toBe("native-value");
  await driverStorage.deleteItemAsync("native-key");
  expect(external.set).toHaveBeenCalledWith("native-key", "native-value");
  expect(external.remove).toHaveBeenCalledWith("native-key");
  expect(browserStore.length).toBe(0);
});
