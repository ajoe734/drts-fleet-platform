import "reflect-metadata";

import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TTL,
} from "@nestjs/throttler/dist/throttler.constants";
import { minutes, seconds } from "@nestjs/throttler";
import { describe, expect, it } from "vitest";

import { BootstrapThrottlerGuard } from "../../src/common/throttling/bootstrap-throttler.guard";
import {
  BOOKING_INTAKE_RATE_LIMIT,
  DISPATCH_RATE_LIMIT,
  OPEN_ROUTE_RATE_LIMIT,
  RATE_LIMIT_SKIP_DEFAULT,
  READ_HEAVY_RATE_LIMIT,
  REPORT_JOBS_RATE_LIMIT,
} from "../../src/common/throttling/rate-limit.constants";
import { HealthController } from "../../src/health/health.controller";
import { IdentityController } from "../../src/modules/identity/identity.controller";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { PlatformAdminController } from "../../src/modules/platform-admin/platform-admin.controller";
import { TenantsController } from "../../src/modules/platform-admin/tenants.controller";
import { PlatformTenantGovernanceController } from "../../src/modules/platform-admin/tenant-governance.controller";
import { ProductRuleController } from "../../src/modules/product-rule/product-rule.controller";
import { BillingSettlementController } from "../../src/modules/billing-settlement/billing-settlement.controller";
import { ReportingFilingController } from "../../src/modules/reporting-filing/reporting-filing.controller";

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

  it("raises the cap for the read-heavy platform-admin console controllers", () => {
    // The admin console fans out many GETs per page through one shared
    // bootstrap-actor bucket; the global 60/min + 5-min block locked it out
    // with a 429. Class-level @Throttle(READ_HEAVY_RATE_LIMIT) lifts the cap to
    // 180/min with no sticky block across every route in these controllers.
    for (const controller of [
      PlatformAdminController,
      TenantsController,
      PlatformTenantGovernanceController,
    ]) {
      expect(Reflect.getMetadata(THROTTLER_LIMIT + "default", controller)).toBe(
        READ_HEAVY_RATE_LIMIT.default.limit,
      );
      expect(Reflect.getMetadata(THROTTLER_TTL + "default", controller)).toBe(
        READ_HEAVY_RATE_LIMIT.default.ttl,
      );
    }
  });

  it("raises the cap for the other reads the pricing page loads", () => {
    // The pricing page also fans out to the product-rule catalog and the
    // driver-fee-plans read; both must escape the global 60/min + 5-min block.
    expect(
      Reflect.getMetadata(THROTTLER_LIMIT + "default", ProductRuleController),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        BillingSettlementController.prototype.listDriverFeePlans,
      ),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.limit);
  });

  it("sets dedicated baseline throttle for POST tenant/bookings (60/min, no 5min block)", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        OwnedMobilityController.prototype.createTenantBooking,
      ),
    ).toBe(BOOKING_INTAKE_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        OwnedMobilityController.prototype.createTenantBooking,
      ),
    ).toBe(BOOKING_INTAKE_RATE_LIMIT.default.ttl);
    expect(
      Reflect.getMetadata(
        THROTTLER_BLOCK_DURATION + "default",
        OwnedMobilityController.prototype.createTenantBooking,
      ),
    ).toBe(BOOKING_INTAKE_RATE_LIMIT.default.blockDuration);
  });

  it("sets dedicated baseline throttle for POST orders/:orderId/dispatch (300/min, no 5min block)", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        OwnedMobilityController.prototype.dispatchOrder,
      ),
    ).toBe(DISPATCH_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        OwnedMobilityController.prototype.dispatchOrder,
      ),
    ).toBe(DISPATCH_RATE_LIMIT.default.ttl);
    expect(
      Reflect.getMetadata(
        THROTTLER_BLOCK_DURATION + "default",
        OwnedMobilityController.prototype.dispatchOrder,
      ),
    ).toBe(DISPATCH_RATE_LIMIT.default.blockDuration);
  });

  it("sets dedicated baseline throttle for POST reports/jobs (30/min, no 5min block)", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        ReportingFilingController.prototype.createReportJob,
      ),
    ).toBe(REPORT_JOBS_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        ReportingFilingController.prototype.createReportJob,
      ),
    ).toBe(REPORT_JOBS_RATE_LIMIT.default.ttl);
    expect(
      Reflect.getMetadata(
        THROTTLER_BLOCK_DURATION + "default",
        ReportingFilingController.prototype.createReportJob,
      ),
    ).toBe(REPORT_JOBS_RATE_LIMIT.default.blockDuration);
  });
});

