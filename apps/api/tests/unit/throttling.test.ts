import "reflect-metadata";

import {
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TTL,
} from "@nestjs/throttler/dist/throttler.constants";
import { minutes } from "@nestjs/throttler";
import { describe, expect, it } from "vitest";

import { BootstrapThrottlerGuard } from "../../src/common/throttling/bootstrap-throttler.guard";
import {
  OPEN_ROUTE_RATE_LIMIT,
  RATE_LIMIT_SKIP_DEFAULT,
  READ_HEAVY_RATE_LIMIT,
} from "../../src/common/throttling/rate-limit.constants";
import { HealthController } from "../../src/health/health.controller";
import { IdentityController } from "../../src/modules/identity/identity.controller";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";

class TestBootstrapThrottlerGuard extends BootstrapThrottlerGuard {
  async exposeTracker(req: Record<string, any>) {
    return this.getTracker(req);
  }
}

describe("bootstrap throttler tracker", () => {
  it("prefers authenticated actor identity over network address", async () => {
    const guard = new TestBootstrapThrottlerGuard(
      { throttlers: [] },
      {} as never,
      {} as never,
    );

    await expect(
      guard.exposeTracker({
        headers: {
          "x-forwarded-for": "198.51.100.10",
        },
        identity: {
          realm: "tenant",
          actorType: "tenant_admin",
          actorId: "tenant-admin-001",
        },
      }),
    ).resolves.toBe("actor:tenant:tenant_admin:tenant-admin-001");
  });

  it("falls back to a hashed internal key and tenant scope when no actor identity exists", async () => {
    const guard = new TestBootstrapThrottlerGuard(
      { throttlers: [] },
      {} as never,
      {} as never,
    );

    const tracker = await guard.exposeTracker({
      headers: {
        "x-drts-internal-key": "secret-key-value",
        "x-tenant-id": "tenant-acme-001",
      },
    });

    expect(tracker).toMatch(/^internal:tenant-acme-001:[a-f0-9]{16}$/);
  });

  it("uses the first forwarded IP address before req.ip", async () => {
    const guard = new TestBootstrapThrottlerGuard(
      { throttlers: [] },
      {} as never,
      {} as never,
    );

    await expect(
      guard.exposeTracker({
        headers: {
          "x-forwarded-for": "203.0.113.15, 10.0.0.2",
        },
        ip: "10.0.0.2",
      }),
    ).resolves.toBe("ip:203.0.113.15");
  });
});

describe("route throttling metadata", () => {
  it("skips health checks from the global throttler", () => {
    expect(
      Reflect.getMetadata(THROTTLER_SKIP + "default", HealthController),
    ).toBe(RATE_LIMIT_SKIP_DEFAULT.default);
  });

  it("applies a stricter limit to the public identity context endpoint", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        IdentityController.prototype.getContext,
      ),
    ).toBe(OPEN_ROUTE_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        IdentityController.prototype.getContext,
      ),
    ).toBe(minutes(1));
  });

  it("raises the cap for read-heavy dispatch and order queries", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        OwnedMobilityController.prototype.listDispatchJobs,
      ),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        OwnedMobilityController.prototype.listDispatchJobs,
      ),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.ttl);
  });
});
