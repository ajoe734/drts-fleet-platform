import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  observeCapacityThrottle,
  type CapacityThrottleObserver,
  type ThrottleRequest,
} from "../../../../tools/system-remediation/ops-capacity/throttle-observation.mjs";

const requireApi = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
type Storage = {
  storage: Map<
    string,
    {
      totalHits: Map<string, number>;
      expiresAt: number;
      blockExpiresAt: number;
      isBlocked: boolean;
    }
  >;
  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }>;
  onApplicationShutdown(): void;
};
// The installed 6.5.0 storage protocol runs unchanged, including real expiry
// callbacks and block reset. Only the clock/timer boundary is controlled. The
// hosted harness resolves its singleton token rather than this test constructor.
const { ThrottlerStorageService } = requireApi("@nestjs/throttler") as {
  ThrottlerStorageService: new () => Storage;
};
const observers: CapacityThrottleObserver[] = [];
const storages: Storage[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(0);
});
afterEach(() => {
  observers.forEach((observer) => observer.stop());
  storages.forEach((storage) => storage.onApplicationShutdown());
  observers.length = 0;
  storages.length = 0;
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
function storage() {
  const result = new ThrottlerStorageService();
  storages.push(result);
  return result;
}
function observe(value: Storage, maxEvents?: number) {
  const result = observeCapacityThrottle(value, "owned", maxEvents);
  observers.push(result);
  return result;
}
const hit = (value: Storage, key = "private-key") =>
  value.increment(key, 60000, 2, 60000, "default");
function inbound<T>(observer: CapacityThrottleObserver, action: () => T) {
  const request: ThrottleRequest = {
    headers: {
      "x-request-id": "owned-booking-req-1",
      authorization: "secret-jwt",
    },
    url: "/api/tenant/bookings?secret=query",
  };
  const response = Object.assign(new EventEmitter(), { statusCode: 429 });
  const result = observer.middleware(request, response, () => {
    // Auth attaches the real identity after middleware entry, before throttling.
    request.identity = { actorId: "private-actor", tenantId: "private-tenant" };
    return action();
  }) as T;
  return { result, response };
}

describe("bounded actual singleton throttle observation", () => {
  it("preserves actual storage results, blocks and expiry/reset protocol", async () => {
    const plain = storage();
    const observed = storage();
    const observer = observe(observed);
    for (let i = 0; i < 4; i++)
      expect(await hit(observed)).toEqual(await hit(plain));
    await vi.advanceTimersByTimeAsync(60001);
    expect(await hit(observed)).toEqual(await hit(plain));
    const trace = observer.snapshot().trace;
    expect(
      trace.filter((row) => row.kind === "capacity_throttle_result"),
    ).toHaveLength(5);
    expect(trace.some((row) => row.cause === "expiration")).toBe(true);
    // Default storage has already expired all hits before reset at this boundary;
    // reset itself remains visible as an in-increment 0 -> 0 write.
    expect(
      trace.some(
        (row) => row.kind === "capacity_throttle_hits" && row.totalHits === 0,
      ),
    ).toBe(true);
    observer.stop();
    observer.assertComplete();
  });

  it("correlates simultaneous actual increments with their own inbound and response, without secrets", async () => {
    const value = storage();
    const observer = observe(value);
    const first = inbound(observer, () => hit(value));
    const secondResponse = Object.assign(new EventEmitter(), {
      statusCode: 201,
    });
    const second = observer.middleware(
      {
        headers: { "x-request-id": "owned-dispatch-req-2" },
        url: "/api/orders/private-order/dispatch",
      },
      secondResponse,
      () => hit(value, "second-private-key"),
    );
    await Promise.all([first.result, second]);
    first.response.emit("finish");
    secondResponse.emit("finish");
    const trace = observer.snapshot().trace;
    const calls = trace.filter((row) => row.kind === "capacity_throttle_call");
    expect(calls[0]!.context).toMatchObject({
      requestId: "owned-booking-req-1",
      route: "/api/tenant/bookings",
      identityHash: expect.any(String),
    });
    expect(calls[1]!.context).toMatchObject({
      requestId: "owned-dispatch-req-2",
      route: "/api/orders/{orderId}/dispatch",
    });
    expect(calls[0]!.keyHash).not.toBe(calls[1]!.keyHash);
    expect(trace.filter((row) => row.kind === "capacity_response")).toEqual([
      expect.objectContaining({
        requestId: "owned-booking-req-1",
        httpStatus: 429,
      }),
      expect.objectContaining({
        requestId: "owned-dispatch-req-2",
        httpStatus: 201,
      }),
    ]);
    const bytes = JSON.stringify(observer.snapshot());
    for (const secret of [
      "secret-jwt",
      "private-key",
      "private-actor",
      "private-tenant",
      "private-order",
      "secret=query",
    ])
      expect(bytes).not.toContain(secret);
  });

  it("returns the original promise and preserves synchronous/asynchronous failures", async () => {
    const value = storage();
    const original = value.increment;
    const promised = Promise.resolve({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    value.increment = () => promised;
    const observer = observe(value);
    expect(hit(value)).toBe(promised);
    await promised;
    observer.stop();
    const rejection = new Error("actual storage rejection");
    value.increment = () => Promise.reject(rejection);
    const rejectedObserver = observe(value);
    await expect(hit(value)).rejects.toBe(rejection);
    expect(
      rejectedObserver
        .snapshot()
        .trace.some((row) => row.kind === "capacity_throttle_rejection"),
    ).toBe(true);
    rejectedObserver.stop();
    value.increment = () => {
      throw rejection;
    };
    const thrownObserver = observe(value);
    expect(() => hit(value)).toThrow(rejection);
    thrownObserver.stop();
    value.increment = original;
  });

  it("restores own/prototype descriptors and existing/new entry hooks, leaving expiry timers intact", async () => {
    const value = storage();
    await hit(value, "existing");
    const originalIncrement = value.increment;
    const originalEntrySet = Object.getOwnPropertyDescriptor(
      value.storage,
      "set",
    );
    const oldHits = value.storage.get("existing")!.totalHits;
    const originalHitSet = Object.getOwnPropertyDescriptor(oldHits, "set");
    const observer = observe(value);
    await hit(value, "new");
    const newHits = value.storage.get("new")!.totalHits;
    expect(vi.getTimerCount()).toBe(2);
    observer.stop();
    observer.stop();
    expect(value.increment).toBe(originalIncrement);
    expect(Object.getOwnPropertyDescriptor(value, "increment")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(value.storage, "set")).toEqual(
      originalEntrySet,
    );
    expect(Object.getOwnPropertyDescriptor(oldHits, "set")).toEqual(
      originalHitSet,
    );
    expect(Object.getOwnPropertyDescriptor(newHits, "set")).toBeUndefined();
    const count = observer.summary().events;
    await vi.advanceTimersByTimeAsync(60000);
    expect(oldHits.get("default")).toBe(0);
    expect(newHits.get("default")).toBe(0);
    expect(observer.summary().events).toBe(count);
    observer.assertComplete();
  });

  it("keeps genuine hits when trace capacity is exhausted and reports incomplete observation", async () => {
    const value = storage();
    const observer = observe(value, 2);
    expect((await hit(value)).totalHits).toBe(1);
    expect((await hit(value)).totalHits).toBe(2);
    expect((await hit(value)).isBlocked).toBe(true);
    observer.stop();
    expect(observer.snapshot().trace).toHaveLength(2);
    expect(observer.summary().dropped).toBeGreaterThan(0);
    expect(() => observer.assertComplete()).toThrow("incomplete");
  });

  it("does not mask real storage behavior when identity diagnostic access fails", async () => {
    const value = storage();
    const observer = observe(value);
    const request = { headers: { "x-request-id": "owned-bad-context" } };
    Object.defineProperty(request, "identity", {
      get() {
        throw new Error("identity observation failed");
      },
    });
    const response = Object.assign(new EventEmitter(), { statusCode: 201 });
    expect(
      await observer.middleware(request, response, () => hit(value)),
    ).toMatchObject({ totalHits: 1 });
    observer.stop();
    expect(observer.summary().recordingFailures).toBeGreaterThan(0);
    expect(() => observer.assertComplete()).toThrow("incomplete");
  });

  it("rejects unsupported storage and observer bounds before touching the original singleton", () => {
    expect(() => observeCapacityThrottle({}, "owned")).toThrow("Unsupported");
    const value = storage();
    const increment = value.increment;
    for (const bound of [0, -1, 1.5, 100001])
      expect(() => observeCapacityThrottle(value, "owned", bound)).toThrow(
        "Unsupported",
      );
    expect(value.increment).toBe(increment);
  });
});
