import type { ExecutionContext } from "../../../apps/api/node_modules/@nestjs/common";
import type { ThrottlerModuleOptions } from "../../../apps/api/node_modules/@nestjs/throttler";
import type { ThrottlerStorageOptions } from "../../../apps/api/node_modules/@nestjs/throttler/dist/throttler-storage-options.interface";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequire, production } from "./production-loader";

type Guard =
  typeof import("../../../apps/api/src/common/throttling/bootstrap-throttler.guard");
type Storage =
  typeof import("../../../apps/api/src/common/throttling/key-scoped-throttler.storage");
type Policies =
  typeof import("../../../apps/api/src/common/throttling/rate-limit.constants");
const { BootstrapThrottlerGuard } = production<Guard>(
  "apps/api/src/common/throttling/bootstrap-throttler.guard.ts",
);
const { KeyScopedThrottlerStorage } = production<Storage>(
  "apps/api/src/common/throttling/key-scoped-throttler.storage.ts",
);
const policies = production<Policies>(
  "apps/api/src/common/throttling/rate-limit.constants.ts",
);
const { ThrottlerStorageService, Throttle } = apiRequire(
  "@nestjs/throttler",
) as typeof import("../../../apps/api/node_modules/@nestjs/throttler");
const { Reflector } = apiRequire(
  "@nestjs/core",
) as typeof import("../../../apps/api/node_modules/@nestjs/core");

const { OwnedMobilityController } = production<
  typeof import("../../../apps/api/src/modules/owned-mobility/owned-mobility.controller")
>("apps/api/src/modules/owned-mobility/owned-mobility.controller.ts");
const { ReportingFilingController } = production<
  typeof import("../../../apps/api/src/modules/reporting-filing/reporting-filing.controller")
>("apps/api/src/modules/reporting-filing/reporting-filing.controller.ts");

const routes = {
  booking: {
    controller: OwnedMobilityController,
    handler: OwnedMobilityController.prototype.createTenantBooking,
  },
  dispatch: {
    controller: OwnedMobilityController,
    handler: OwnedMobilityController.prototype.dispatchOrder,
  },
  report: {
    controller: ReportingFilingController,
    handler: ReportingFilingController.prototype.createReportJob,
  },
};
type Route = {
  controller: ExecutionContext["getClass"] extends () => infer C ? C : never;
  handler: ReturnType<ExecutionContext["getHandler"]>;
};
type Request = {
  identity?: {
    realm: string;
    actorType: string;
    actorId: string;
    tenantId?: string;
  };
  headers: Record<string, string | string[]>;
  ip?: string;
};
const actor = (id: string): Request => ({
  identity: { realm: "ops", actorType: "ops_user", actorId: id },
  headers: {},
});
type Result = {
  accepted: boolean;
  status?: number;
  headers: Record<string, number>;
};
type Store =
  | InstanceType<Storage["KeyScopedThrottlerStorage"]>
  | InstanceType<typeof ThrottlerStorageService>;
const stores: Store[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  stores.forEach((s) => s.onApplicationShutdown());
  stores.length = 0;
  vi.useRealTimers();
});

async function fixture(
  old = false,
  options: ThrottlerModuleOptions = [...policies.GLOBAL_RATE_LIMIT],
) {
  const storage = old
    ? new ThrottlerStorageService()
    : new KeyScopedThrottlerStorage();
  stores.push(storage);
  const guard = new BootstrapThrottlerGuard(options, storage, new Reflector());
  await guard.onModuleInit();
  const call = async (route: Route, request = actor("a")): Promise<Result> => {
    const headers: Record<string, number> = {};
    const context = {
      getClass: () => route.controller,
      getHandler: () => route.handler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({
          header: (k: string, v: number) => {
            headers[k] = v;
          },
        }),
      }),
    } as unknown as ExecutionContext;
    try {
      return { accepted: await guard.canActivate(context), headers };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("getStatus" in error) ||
        typeof error.getStatus !== "function"
      )
        throw error;
      return { accepted: false, status: error.getStatus(), headers };
    }
  };
  return { storage, call };
}

async function exhaust(
  call: Awaited<ReturnType<typeof fixture>>["call"],
  route: Route,
  limit: number,
  request = actor("a"),
) {
  for (let i = 0; i < limit; i++)
    expect((await call(route, request)).accepted).toBe(true);
  const rejected = await call(route, request);
  expect(rejected).toMatchObject({ accepted: false, status: 429 });
  return rejected;
}

describe("actual BootstrapThrottlerGuard / locked 6.5.0 protocol", () => {
  it.each([
    { name: "default", ttl: 60000, limit: 2, block: 1000 },
    { name: "burst", ttl: 1000, limit: 2, block: 5000 },
  ])(
    "single-key return records match upstream through expiry and reblocking ($name)",
    async ({ name, ttl, limit, block }) => {
      const old = (await fixture(true)).storage;
      const repaired = (await fixture()).storage;
      for (const elapsed of [
        0,
        100,
        0,
        0,
        block - 1,
        1,
        0,
        0,
        block,
        ttl,
        ttl,
      ]) {
        await vi.advanceTimersByTimeAsync(elapsed);
        const oldRecord = await old.increment(
          "parity",
          ttl,
          limit,
          block,
          name,
        );
        const newRecord = await repaired.increment(
          "parity",
          ttl,
          limit,
          block,
          name,
        );
        expect(newRecord).toEqual(oldRecord);
      }
    },
  );

  it("multiple configured names keep their original guard ordering and headers", async () => {
    class MultipleController {
      route() {}
    }
    const route = {
      controller: MultipleController,
      handler: MultipleController.prototype.route,
    };
    const { call } = await fixture(false, [
      { name: "default", ttl: 1000, limit: 3, blockDuration: 1000 },
      { name: "burst", ttl: 2000, limit: 2, blockDuration: 1000 },
    ]);
    expect((await call(route)).headers).toEqual({
      "X-RateLimit-Limit": 3,
      "X-RateLimit-Remaining": 2,
      "X-RateLimit-Reset": 1,
      "X-RateLimit-Limit-burst": 2,
      "X-RateLimit-Remaining-burst": 1,
      "X-RateLimit-Reset-burst": 2,
    });
    expect((await call(route)).accepted).toBe(true);
    expect((await call(route)).headers["Retry-After-burst"]).toBe(1);
    expect((await call(route, actor("other"))).accepted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await call(route)).accepted).toBe(true);
  });

  it.each([true, false])(
    "legal report expiry control (old=%s)",
    async (old) => {
      const { call } = await fixture(old);
      for (let i = 0; i < 30; i++)
        expect((await call(routes.report)).accepted).toBe(true);
      await vi.advanceTimersByTimeAsync(60001);
      expect(await call(routes.report)).toEqual({
        accepted: true,
        headers: {
          "X-RateLimit-Limit": 30,
          "X-RateLimit-Remaining": 29,
          "X-RateLimit-Reset": 60,
        },
      });
    },
  );

  it("foreign booking reset preserves report expiry isolation", async () => {
    const { call } = await fixture(process.env.THROTTLE_STORAGE === "old");
    for (let i = 0; i < 30; i++)
      expect((await call(routes.report)).accepted).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(await exhaust(call, routes.booking, 60)).toEqual({
      accepted: false,
      status: 429,
      headers: { "Retry-After": 1 },
    });
    await vi.advanceTimersByTimeAsync(1001);
    expect((await call(routes.booking)).accepted).toBe(true);
    await vi.advanceTimersByTimeAsync(58900);
    expect(await call(routes.report)).toEqual({
      accepted: true,
      headers: {
        "X-RateLimit-Limit": 30,
        "X-RateLimit-Remaining": 29,
        "X-RateLimit-Reset": 60,
      },
    });
  });

  it.each([true, false])(
    "enforces all route limits and block lifecycle (old=%s)",
    async (old) => {
      const { call } = await fixture(old);
      for (const [route, limit] of [
        [routes.booking, 60],
        [routes.dispatch, 300],
        [routes.report, 30],
      ] as const) {
        expect(await exhaust(call, route, limit)).toMatchObject({
          headers: { "Retry-After": 1 },
        });
        expect(await call(route)).toMatchObject({
          accepted: false,
          status: 429,
        });
      }
      await vi.advanceTimersByTimeAsync(999);
      for (const route of Object.values(routes))
        expect((await call(route)).status).toBe(429);
      await vi.advanceTimersByTimeAsync(1);
      for (const [route, limit] of [
        [routes.booking, 60],
        [routes.dispatch, 300],
        [routes.report, 30],
      ] as const) {
        expect(await call(route)).toEqual({
          accepted: true,
          headers: {
            "X-RateLimit-Limit": limit,
            "X-RateLimit-Remaining": limit - 1,
            "X-RateLimit-Reset": 59,
          },
        });
        for (let i = 1; i < limit; i++)
          expect((await call(route)).accepted).toBe(true);
        expect((await call(route)).status).toBe(429);
      }
    },
  );

  it("foreign reset leaves multiple actor and route groups independent", async () => {
    const { call } = await fixture();
    for (const request of [actor("a"), actor("b")]) {
      for (let i = 0; i < 30; i++)
        expect((await call(routes.report, request)).accepted).toBe(true);
      for (let i = 0; i < 300; i++)
        expect((await call(routes.dispatch, request)).accepted).toBe(true);
    }
    await exhaust(call, routes.booking, 60, actor("c"));
    await vi.advanceTimersByTimeAsync(1001);
    expect((await call(routes.booking, actor("c"))).accepted).toBe(true);
    await vi.advanceTimersByTimeAsync(59000);
    for (const request of [actor("a"), actor("b")]) {
      expect(
        (await call(routes.report, request)).headers["X-RateLimit-Remaining"],
      ).toBe(29);
      expect(
        (await call(routes.dispatch, request)).headers["X-RateLimit-Remaining"],
      ).toBe(299);
    }
  });

  it.each([true, false])(
    "successive expiries, TTL rollover, key reuse and shutdown (old=%s)",
    async (old) => {
      const { storage } = await fixture(old);
      expect(
        await storage.increment("k", 2000, 3, 1000, "default"),
      ).toMatchObject({ totalHits: 1, timeToExpire: 2 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(
        await storage.increment("k", 2000, 3, 1000, "default"),
      ).toMatchObject({ totalHits: 2, timeToExpire: 1 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(storage.storage.get("k")?.totalHits.get("default")).toBe(1);
      expect(
        await storage.increment("k", 2000, 3, 1000, "default"),
      ).toMatchObject({ totalHits: 2, timeToExpire: 2 });
      await vi.advanceTimersByTimeAsync(2000);
      expect(storage.storage.get("k")?.totalHits.get("default")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(
        await storage.increment("k", 2000, 3, 1000, "default"),
      ).toMatchObject({ totalHits: 1, timeToExpire: 2 });
      storage.onApplicationShutdown();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([true, false])(
    "default global limit and five-minute block survive expired hits (old=%s)",
    async (old) => {
      class DefaultController {
        route() {}
      }
      const route = {
        controller: DefaultController,
        handler: DefaultController.prototype.route,
      };
      const { call } = await fixture(old);
      expect(await exhaust(call, route, 60)).toMatchObject({
        headers: { "Retry-After": 300 },
      });
      await vi.advanceTimersByTimeAsync(60000);
      expect(await call(route)).toMatchObject({
        status: 429,
        headers: { "Retry-After": 240 },
      });
      await vi.advanceTimersByTimeAsync(239999);
      expect(await call(route)).toMatchObject({
        status: 429,
        headers: { "Retry-After": 1 },
      });
      await vi.advanceTimersByTimeAsync(1);
      expect(await call(route)).toEqual({
        accepted: true,
        headers: {
          "X-RateLimit-Limit": 60,
          "X-RateLimit-Remaining": 59,
          "X-RateLimit-Reset": 60,
        },
      });
    },
  );

  it("named policy and route override keep suffix headers and key isolation", async () => {
    class NamedController {
      first() {}
      second() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      NamedController.prototype,
      "first",
    );
    if (!descriptor) throw new Error("Missing route");
    Throttle({ burst: { limit: 2, ttl: 2000, blockDuration: 1000 } })(
      NamedController.prototype,
      "first",
      descriptor,
    );
    const first = {
      controller: NamedController,
      handler: NamedController.prototype.first,
    };
    const second = {
      controller: NamedController,
      handler: NamedController.prototype.second,
    };
    const { call } = await fixture(false, [
      { name: "burst", ttl: 2000, limit: 3, blockDuration: 1000 },
    ]);
    expect((await call(second)).headers).toEqual({
      "X-RateLimit-Limit-burst": 3,
      "X-RateLimit-Remaining-burst": 2,
      "X-RateLimit-Reset-burst": 2,
    });
    expect(await exhaust(call, first, 2)).toMatchObject({
      headers: { "Retry-After-burst": 1 },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect((await call(first)).accepted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await call(second)).headers["X-RateLimit-Remaining-burst"]).toBe(2);
  });

  it("identity cannot evade exhaustion by changing fallback headers or IP", async () => {
    const { call } = await fixture();
    await exhaust(call, routes.report, 30);
    expect(
      (
        await call(routes.report, {
          ...actor("a"),
          headers: {
            "x-drts-internal-key": "another",
            "x-tenant-id": "other",
            "x-forwarded-for": "10.0.0.2",
          },
          ip: "10.0.0.3",
        })
      ).status,
    ).toBe(429);
    expect((await call(routes.report, actor("b"))).accepted).toBe(true);
    expect(
      (
        await call(routes.report, {
          identity: { realm: "partner", actorType: "ops_user", actorId: "a" },
          headers: {},
        })
      ).accepted,
    ).toBe(true);
  });

  it("internal and IP fallback trackers retain exhaustion and isolation", async () => {
    const { call } = await fixture();
    const internal = {
      headers: { "x-drts-internal-key": "fixture", "x-tenant-id": "tenant-a" },
    };
    await exhaust(call, routes.report, 30, internal);
    expect(
      (
        await call(routes.report, {
          headers: {
            "x-drts-internal-key": " fixture ",
            "x-tenant-id": " tenant-a ",
            "x-forwarded-for": "10.0.0.3",
          },
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await call(routes.report, {
          headers: { ...internal.headers, "x-tenant-id": "tenant-b" },
        })
      ).accepted,
    ).toBe(true);
    await exhaust(call, routes.report, 30, {
      headers: { "x-forwarded-for": "10.0.0.4, 10.0.0.5" },
    });
    expect(
      (await call(routes.report, { headers: {}, ip: "10.0.0.4" })).status,
    ).toBe(429);
    await exhaust(call, routes.report, 30, { headers: {} });
    expect(
      (
        await call(routes.report, {
          headers: { "x-forwarded-for": " " },
          ip: " ",
        })
      ).status,
    ).toBe(429);
  });

  it.each([NaN, -1, Infinity])(
    "malformed internal count %s fails closed",
    async (bad) => {
      const { storage } = await fixture();
      await storage.increment("bad", 1000, 1, 1000, "default");
      const entry = storage.storage.get("bad");
      if (!entry) throw new Error("Missing entry");
      entry.totalHits.set("default", bad);
      await expect(
        storage.increment("bad", 1000, 1, 1000, "default"),
      ).rejects.toThrow("Invalid throttle storage state");
      await vi.advanceTimersByTimeAsync(1000);
      entry.totalHits.set("default", 0);
      await expect(
        storage.increment("bad", 1000, 1, 1000, "default"),
      ).rejects.toThrow("Invalid throttle storage state");
    },
  );

  it("missing counter and incompatible policy on one generated key fail closed", async () => {
    const { storage } = await fixture();
    await storage.increment("bad", 1000, 1, 1000, "default");
    await expect(
      storage.increment("bad", 1000, 1, 1000, "other"),
    ).rejects.toThrow();
    (storage.storage.get("bad") as ThrottlerStorageOptions).totalHits.delete(
      "default",
    );
    await expect(
      storage.increment("bad", 1000, 1, 1000, "default"),
    ).rejects.toThrow();
  });
});
