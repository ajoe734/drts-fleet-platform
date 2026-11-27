import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDriverProvisioning,
  getPendingDriverTaskCompletion,
  initializeDriverIdentity,
  replayPendingDriverTaskCompletion,
  submitDriverTaskCompletion,
} from "../../lib/api-client";

const mockStore = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { driverActorId: "driver-001" },
    },
  },
}));

const command = {
  completedAt: "2026-11-25T02:00:00.000Z",
  actualDistanceKm: 1,
  actualDurationSec: 60,
};

function completedResponse() {
  return new Response(
    JSON.stringify({
      status: "success",
      data: { taskId: "task-001", status: "completed" },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("driver task completion is sent once", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearDriverProvisioning();
    mockStore.clear();
    await initializeDriverIdentity();
  });

  it("shares one request between the submit and a concurrent replay", async () => {
    let release!: (response: Response) => void;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        () => new Promise<Response>((resolve) => (release = resolve)),
      );

    const submitted = submitDriverTaskCompletion("task-001", command);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const replayed = replayPendingDriverTaskCompletion();
    await flush();
    release(completedResponse());

    expect(await submitted).toMatchObject({ taskId: "task-001" });
    expect(await replayed).toMatchObject({ taskId: "task-001" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await getPendingDriverTaskCompletion()).toBeNull();
  });

  it("sends again under the same key after a failed request", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(completedResponse());

    await expect(
      submitDriverTaskCompletion("task-001", command),
    ).rejects.toThrow();
    expect(await getPendingDriverTaskCompletion()).not.toBeNull();
    expect(await replayPendingDriverTaskCompletion()).toMatchObject({
      status: "completed",
    });

    const keys = fetchSpy.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("Idempotency-Key"),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
});
